// heygen-auto-edit engine, part 5: the timeline. Edit rules are enforced here, whatever the plan says:
//   - the presenter is never on screen for a flash between two full-screen beats (a gap < MIN_SHOT is closed: the
//     first beat runs on and the two hand over card to card);
//   - every change between the presenter and a full-screen beat is a transition, never a hard cut;
//   - framing cuts that would land right next to a beat are dropped;
//   - after the last word the presenter holds a beat, then the end screen runs.
// The renderer (scripts/render.mjs) waits for window.__ready, then calls `await window.seek(t)` for every frame.
'use strict';

const MIN_SHOT = 1.6;                                  // shortest time the presenter may be on screen between beats
const TR = { cut: 0, whip: .36, zoom: .4, leak: .7, flash: .3, fade: .45, slide: .5, push3d: .6, self: 0 };
const SELF = new Set(['split']);
let BEATS = [], FULL;

function buildBeats() {
  FULL = new Set(Object.keys(SCENES));
  let beats = (PLAN.beats || []).map((b, i) => ({ ...b, i })).filter(b => b.end > b.start).sort((a, b) => a.start - b.start);
  const full = beats.filter(b => FULL.has(b.type));
  // close short gaps and overlaps between full-screen beats
  for (let i = 0; i + 1 < full.length; i++) { const a = full[i], n = full[i + 1]; if (n.start - a.end < MIN_SHOT) a.end = n.start; }
  if (full[0] && full[0].start < 1) full[0].start = 0;
  // the end screen
  if (PLAN.endscreen !== false && !full.some(b => b.type === 'endscreen')) {
    const es = { type: 'endscreen', ...(PLAN.endscreen || {}), i: 999 };
    es.start = SPEECH_END + (es.hold ?? .5); es.end = es.start + (es.dur || 4.5);
    const last = full[full.length - 1]; if (last && last.end > es.start - MIN_SHOT) { last.end = Math.min(last.end, es.start); if (es.start - last.end < MIN_SHOT) last.end = es.start; }
    full.push(es); beats.push(es);
  }
  DUR = Math.max(PLAN.duration || 0, INFO.duration, ...full.map(b => b.end));
  // transitions: presenter <-> beat always moves; card -> card hands over
  const cyc = (list, i) => list[i % list.length];
  full.forEach((b, i) => {
    const prev = full[i - 1], next = full[i + 1];
    const touchPrev = prev && Math.abs(prev.end - b.start) < .05, touchNext = next && Math.abs(next.start - b.end) < .05;
    b._full = true;
    if (SELF.has(b.type)) { b.in = touchPrev ? (b.in && b.in !== 'self' ? b.in : 'push3d') : 'self'; b.out = touchNext ? 'cut' : 'self'; return; }
    if (touchPrev) b.in = b.in && b.in !== 'cut' ? b.in : cyc(['push3d', 'slide', 'whip'], i);
    else b.in = b.in && b.in !== 'cut' ? b.in : (b.type === 'endscreen' ? 'leak' : cyc(['whip', 'zoom', 'push3d', 'whip', 'slide'], i));
    if (touchNext) b.out = 'cut';                                         // the next beat's entrance takes over
    else b.out = b.out && b.out !== 'cut' ? b.out : cyc(['zoom', 'slide', 'whip'], i);
  });
  // overlays never run under a full-screen beat
  beats = beats.filter(b => {
    if (b._full) return true;
    for (const f of full) { if (b.start < f.end && b.end > f.start) { if (b.start >= f.start) b.start = f.end; else b.end = Math.min(b.end, f.start); } }
    return b.end - b.start > .4;
  });
  BEATS = beats.sort((a, b) => a.start - b.start);
  // framing cuts right before / after a beat read as a stutter
  TALK = TALK.filter((k, i) => i === 0 || !full.some(f => (k.t > f.end - .05 && k.t - f.end < 1.2) || (k.t < f.start && f.start - k.t < 1.2) || (k.t >= f.start && k.t < f.end)));
}
function fullAt(t) { return BEATS.filter(b => b._full && t >= b.start - (TR[b.in] || 0) / 2 && t < b.end + (TR[b.out] || 0) / 2); }

async function drawState(g, t, beat) {   // beat null = presenter + overlays
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  if (beat) await SCENES[beat.type](g, t, beat);
  else {
    const xf = await drawPresenter(g, Math.min(t, SPEECH_END + 1));
    for (const b of BEATS) if (!b._full && t >= b.start && t < b.end && OVER[b.type]) await OVER[b.type](g, t, b, xf);
    if (BRAND.logo && BRAND.watermark) { g.save(); g.globalAlpha = .85; const lw = 120 * U, lh = lw * BRAND.logo.height / BRAND.logo.width; g.drawImage(BRAND.logo, W - lw - 40 * U, 36 * U, lw, lh); g.restore(); }
  }
  g.restore();
}

// one transition between state A (at time t) and state B
async function transition(kind, k, t, A, B) {
  const a = clear(L.a), b = clear(L.b);
  await drawState(a, t, A); await drawState(b, t, B);
  const out = ctx; out.save();
  if (kind === 'whip') {
    const p = eIO(k), off = p * W, tmp = clear(L.tmp);
    tmp.drawImage(L.a, -off, 0); tmp.drawImage(L.b, W - off, 0);
    hblur(out, L.tmp, Math.sin(Math.PI * k));
  } else if (kind === 'zoom') {
    if (k < .5) { const kk = eIn(k * 2); zoomBlur(out, L.a, 1 + kk * .5, .12 * kk); }
    else { const kk = eOut((k - .5) * 2); zoomBlur(out, L.b, 1.35 - .35 * kk, .1 * (1 - kk)); }
  } else if (kind === 'leak') {
    out.drawImage(L.a, 0, 0); out.globalAlpha = eIO(k); out.drawImage(L.b, 0, 0); out.globalAlpha = 1; lightLeak(out, k);
  } else if (kind === 'flash') {
    out.drawImage(k < .5 ? L.a : L.b, 0, 0); flash(out, Math.sin(Math.PI * k) * .95);
  } else if (kind === 'slide') {
    // B rises over A like a new sheet; A sinks back and darkens
    const p = eIO(k), sp = Math.sin(Math.PI * k);
    out.fillStyle = '#0c0c0e'; out.fillRect(0, 0, W, H);
    out.save(); const s = 1 - .08 * p; out.translate(W / 2, H / 2); out.scale(s, s); out.translate(-W / 2, -H / 2); out.filter = `brightness(${1 - .5 * p}) blur(${(sp * 4 * U).toFixed(1)}px)`; out.drawImage(L.a, 0, 0); out.restore();
    out.save(); shadow(out, 60 * U, -10 * U, .45 * sp); out.filter = sp > .1 ? `blur(${(sp * 7 * U).toFixed(1)}px)` : 'none'; out.drawImage(L.b, 0, (1 - p) * H); out.restore();
  } else if (kind === 'push3d') {
    // A swings away into depth, B swings in from the other side
    out.fillStyle = '#0c0c0e'; out.fillRect(0, 0, W, H);
    const pa = eIn(clamp(k / .6)), pb = eOut(clamp((k - .4) / .6));
    gl3d(out, G => {
      if (pa < 1) G.plane(L.a, { w: W, h: H, ry: -38 * pa, z: 900 * pa, x: W / 2 - 300 * U * pa, alpha: 1 - pa * .9 });
      if (pb > 0) G.plane(L.b, { w: W, h: H, ry: 38 * (1 - pb), z: 900 * (1 - pb), x: W / 2 + 300 * U * (1 - pb), alpha: .1 + pb * .9 });
    });
  } else { out.drawImage(L.a, 0, 0); out.globalAlpha = eIO(k); out.drawImage(L.b, 0, 0); }
  out.restore();
}
function hblur(g, src, amount) {
  if (amount < .04) { g.drawImage(src, 0, 0); return; }
  const n = Math.max(8, Math.round(W / (1 + amount * 90))), x = clear(L.tmp2); x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, W, H, 0, 0, n, H);
  g.save(); g.imageSmoothingQuality = 'high'; g.drawImage(L.tmp2, 0, 0, n, H, 0, 0, W, H);
  g.globalAlpha = 1 - amount; g.drawImage(src, 0, 0); g.restore();
}
function zoomBlur(g, src, scale, amount, cx = W / 2, cy = H / 2, n = 9) {
  g.save();
  for (let i = 0; i < n; i++) { const s = scale * (1 + amount * i / n); g.globalAlpha = 1 / (i + 1); g.setTransform(s, 0, 0, s, cx - cx * s, cy - cy * s); g.drawImage(src, 0, 0); }
  g.restore();
}
function lightLeak(g, k) {
  if (k <= 0) return;
  g.save(); g.globalCompositeOperation = 'screen';
  [[.15 + .7 * k, .3, '255,150,60'], [.9 - .6 * k, .75, '255,70,120'], [.5, .5, '255,220,170']].forEach(([bx, by, col], i) => {
    const a = Math.sin(Math.PI * clamp(k)) * (i === 2 ? .55 : .85), r = g.createRadialGradient(bx * W, by * H, 0, bx * W, by * H, Math.max(W, H) * (.45 + .1 * i));
    r.addColorStop(0, `rgba(${col},${a})`); r.addColorStop(1, `rgba(${col},0)`); g.fillStyle = r; g.fillRect(0, 0, W, H);
  });
  g.restore();
}
function flash(g, k) { if (k > 0) { g.save(); g.globalAlpha = k; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.restore(); } }
function grain(g, t, amount) {
  if (!amount) return;
  const f = Math.round(t * FPS), lk = SPR.grain[f % SPR.grain.length], ox = Math.floor(hash(f * 3) * 256 * U), oy = Math.floor(hash(f * 5) * 256 * U);
  g.save(); g.globalAlpha = amount; g.globalCompositeOperation = 'overlay';
  g.drawImage(lk, ox, oy, W - ox, H - oy, 0, 0, W - ox, H - oy);
  if (ox) g.drawImage(lk, 0, oy, ox, H - oy, W - ox, 0, ox, H - oy);
  if (oy) g.drawImage(lk, ox, 0, W - ox, oy, 0, H - oy, W - ox, oy);
  if (ox && oy) g.drawImage(lk, 0, 0, ox, oy, W - ox, H - oy, ox, oy);
  g.restore();
}

// ------------------------------------------------------------------ captions (9:16 only by default)
let CHUNKS = [];
function buildCaptions() {
  const max = PLAN.captions?.words || 3; let cur = [];
  const flush = () => { if (cur.length) CHUNKS.push({ s: cur[0].s, e: cur[cur.length - 1].e, words: cur }); cur = []; };
  WORDS.forEach((w, i) => { const prev = WORDS[i - 1]; if (cur.length && (cur.length >= max || w.s - prev.e > .3 || /[.!?,;:]$/.test(prev.w))) flush(); cur.push(w); });
  flush();
  CHUNKS.forEach((c, i) => { const n = CHUNKS[i + 1]; c.until = n ? Math.min(n.s, c.e + .35) : c.e + .4; });
}
const clean = w => (PLAN.captions?.upper ? w.toUpperCase() : w).replace(/[.,;:!?]+$/, m => m.includes('?') || m.includes('!') ? m : '');
function captions(g, t, hide) {
  const c = CHUNKS.find(c => t >= c.s - .02 && t < c.until); if (!c || hide) return;
  const size = (PLAN.captions?.size || 84) * U, y = H * (PLAN.captions?.y || .7), pop = 1 + .07 * (1 - eOut(prog(t, c.s, .14)));
  g.save(); g.translate(W / 2, y); g.scale(pop, pop); g.font = font(size, 800); g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const text = c.words.map(w => clean(w.w)), sp = g.measureText(' ').width, widths = text.map(x => g.measureText(x).width);
  const total = widths.reduce((a, b) => a + b, 0) + sp * (text.length - 1), scale = Math.min(1, W * .88 / total); g.scale(scale, scale);
  let x = -total / 2;
  text.forEach((w, i) => {
    const active = t >= c.words[i].s && t < (c.words[i + 1]?.s ?? c.until);
    g.lineWidth = 14 * U; g.strokeStyle = 'rgba(0,0,0,.92)'; g.strokeText(w, x, 0);
    g.fillStyle = active && PLAN.captions?.highlight !== false ? (PLAN.captions?.color || '#FFE14D') : '#fff'; txt(g, w, x, 0); x += widths[i] + sp;
  });
  g.restore();
}

// ------------------------------------------------------------------ one frame
async function seek(t) {
  t = clamp(t, 0, DUR - 1e-3);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.setLineDash([]); ctx.canvas.__boxes = [];
  const active = fullAt(t);
  let drawn = false, inTransition = false;
  for (const b of active) {
    const din = TR[b.in] || 0, dout = TR[b.out] || 0;
    if (din && t < b.start + din / 2) {
      const prev = BEATS.filter(x => x._full && x !== b && Math.abs(x.end - b.start) < .05).pop() || null;
      await transition(b.in, (t - (b.start - din / 2)) / din, t, prev, b); drawn = inTransition = true; break;
    }
    if (dout && t >= b.end - dout / 2) {
      const next = BEATS.find(x => x._full && x !== b && Math.abs(x.start - b.end) < .05);
      if (next && (TR[next.in] || 0)) continue;
      await transition(b.out, (t - (b.end - dout / 2)) / dout, t, b, next || null); drawn = inTransition = true; break;
    }
  }
  if (!drawn) { const b = active.find(x => t >= x.start && t < x.end) || null; await drawState(ctx, t, b); }
  for (const a of PLAN.accents || []) { if (t >= a.t && t < a.t + (a.d || .6)) { const k = (t - a.t) / (a.d || .6); if (a.type === 'leak') lightLeak(ctx, k); if (a.type === 'flash') flash(ctx, Math.sin(Math.PI * k) * .9); } }
  if (PLAN.captions?.enabled ?? V) { const cur = active.find(x => t >= x.start && t < x.end); captions(ctx, t, cur && !['photo', 'video', 'image'].includes(cur.type)); }
  grain(ctx, t, PLAN.vfx?.grain ?? .06);
  if (CHECK) {   // text that leaves the frame (or sits within 12 px of its edge) while it is readable
    const m = 12 * U; window.BAD = inTransition ? [] : (ctx.canvas.__boxes || []).filter(b => b.a > .35).filter(b => b.pts.some(([x, y]) => x < m || x > W - m || y < m || y > H - m)).map(b => { const xs = b.pts.map(p => p[0]), ys = b.pts.map(p => p[1]); return [b.s, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(v => Math.round(v)).join(',')]; });
  }
}

// ------------------------------------------------------------------ sound cues for real-sfx
function buildCues() {
  const cues = [], add = (t, type, extra = {}) => { if (t >= 0 && t < DUR) cues.push({ t: +t.toFixed(3), type, ...extra }); };
  for (const b of BEATS) {
    const din = TR[b.in] || 0;
    if (b._full) {
      if (['whip', 'zoom', 'push3d', 'slide'].includes(b.in)) add(b.start - din / 2, 'whoosh', { len: din + .15 });
      if (b.in === 'leak') add(b.start - .3, 'whoosh', { len: .8, g: .6 });
      if (b.in === 'flash') add(b.start, 'hit', { g: .6 });
      if (b.in === 'self') add(b.start, 'whoosh', { len: .7, g: .6 });
      if (['whip', 'zoom', 'slide'].includes(b.out)) add(b.end - TR[b.out] / 2, 'whoosh', { len: TR[b.out] + .15, g: .8 });
      if (b.out === 'self') add(b.end - .7, 'whoosh', { len: .7, g: .55 });
    }
    const at = (x, i, d, s = .6) => x?.at ?? (b.start + d + i * s);
    if (b.type === 'title') add(b.start - .1, 'key', { len: (b.text || '').length / (b.cps || 24), n: (b.text || '').length });
    if (b.type === 'search') { const q = b.query || ''; add(b.start + .3, 'key', { len: q.length / (b.cps || 16), n: q.length }); }
    if (b.type === 'list') (b.items || []).forEach((it, i) => add(at(it, i, .6, .9), 'pop', { g: .8 }));
    if (b.type === 'compare') [b.left, b.right].forEach((c, ci) => { add(b.start + ci * .45, 'pop', { g: .7 }); (c?.items || []).forEach((it, i) => add(at(it, i, .8 + ci * 1.6, .7), 'tick', { g: .5 })); });
    if (b.type === 'mindmap') { add(b.start + .05, 'pop'); (b.nodes || []).forEach((n, i) => add(at(n, i, .5, .8) + .2, 'pop', { g: .8 })); }
    if (b.type === 'stat') { add(b.start + .3, 'tick', { g: .5 }); add(b.start + .3 + (b.count ?? 1.4), 'chime', { g: .6 }); }
    if (b.type === 'bars') (b.bars || []).forEach((x, i) => add(at(x, i, .4, .35), 'pop', { g: .6 }));
    if (b.type === 'donut') (b.parts || []).forEach((x, i) => add(at(x, i, .3, .4), 'pop', { g: .6 }));
    if (b.type === 'table') (b.rows || []).forEach((r, i) => add((Array.isArray(r) ? null : r.at) ?? (b.start + .5 + i * .5), 'tick', { g: .5 }));
    if (b.type === 'roadmap') (b.steps || []).forEach((s, i) => add(at(s, i, .5, 1), 'pop', { g: .8 }));
    if (b.type === 'split') (b.items || []).forEach((it, i) => add(at(it, i, .9, .6), 'pop', { g: .6 }));
    if (b.type === 'photo' || b.type === 'video' || b.type === 'image') add(b.start + .05, 'whoosh', { len: .5, g: .45 });
    if (b.type === 'quote') add(b.start + .1, 'whoosh', { len: .6, g: .5 });
    if (b.type === 'words') (b.items || []).forEach((it, i) => add(at(it, i, 0, .6), 'whoosh', { len: .35, g: .45 }));
    if (b.type === 'callout') add(b.start, 'pop', { g: .6 });
    if (b.type === 'endscreen') { add(b.start + .8, 'pop'); add(b.start + 1.7, 'click'); }
  }
  for (const k of TALK) if (k.snap) add(k.t, 'whoosh', { len: .25, g: .3 });
  for (const a of PLAN.accents || []) add(a.t, a.type === 'flash' ? 'hit' : 'whoosh', { len: a.d || .6, g: .5 });
  return cues.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ brand kit (optional): colours, fonts, logo
let BRAND = {};
async function loadBrand() {
  if (!PLAN.brand) return;
  const br = typeof PLAN.brand === 'string' ? await loadJSON('/assets/' + PLAN.brand, {}) : PLAN.brand;
  const base = typeof PLAN.brand === 'string' ? PLAN.brand.replace(/[^/]*$/, '') : '';
  BRAND = br;
  if (br.colors) C = { ...C, ...br.colors };
  const face = async (fam, file, weights) => { for (const w of weights) { const f = new FontFace(fam, `url(/assets/${base}${file})`, { weight: String(w) }); await f.load(); document.fonts.add(f); } };
  if (br.fonts?.head) { await face('BrandHead', br.fonts.head, [800]); HEAD = 'BrandHead, ' + HEAD; }
  if (br.fonts?.body) { await face('BrandBody', br.fonts.body, [500, 600, 700]); SANS = 'BrandBody, ' + SANS; }
  if (br.fonts?.words) { await face('BrandWords', br.fonts.words, [900]); ROOM = 'BrandWords, ' + ROOM; }
  if (br.fonts?.serif) { await face('BrandSerif', br.fonts.serif, [700]); SERIF = 'BrandSerif, ' + SERIF; }
  if (br.logo) BRAND.logo = await loadImage(`/assets/${base}${br.logo}`);
}

// ------------------------------------------------------------------ boot
(async () => {
  try {
    if (!GL) throw new Error('WebGL2 is not available in this browser');
    [PLAN, WORDS, FACE, INFO, TRACK] = await Promise.all([loadJSON('/data/plan.json', {}), loadJSON('/data/words.json', []), loadJSON('/data/face.json', { cx: .5, cy: .38, w: .16, h: .3 }), loadJSON('/data/info.json', null), loadJSON('/data/track.json', null)]);
    if (!INFO) throw new Error('no /data/info.json: run prepare.py first');
    FPS = INFO.fps; SPEECH_END = WORDS.length ? WORDS[WORDS.length - 1].e : INFO.duration; DUR = INFO.duration;
    await loadBrand();
    for (const b of PLAN.beats || []) {
      for (const s of [b.src, ...(b.srcs || [])]) if (s && ['image', 'photo'].includes(b.type) && !IMG[s]) IMG[s] = await loadImage('/assets/' + s);
      if (b.type === 'video' && b.src && !SEQ[b.src]) SEQ[b.src] = await loadJSON(`/assets/${b.src}/seq.json`, null);
    }
    for (const [w, fam] of [[800, SANS], [700, SANS], [600, SANS], [500, SANS], [700, SERIF], [900, ROOM]]) await document.fonts.load(font(40, w, fam));
    makeSprites(); buildTalk(); buildBeats(); buildCaptions();
    window.DURATION = DUR; window.FPS = FPS; window.CUES = buildCues(); window.seek = seek; window.ASPECT = ASPECT;
    window.BEATS_INFO = BEATS.filter(b => b._full || b.type === 'words').map(b => ({ type: b.type, start: b.start, end: b.end, in: b.in, out: b.out }));
    await seek(0);
    window.__ready = true;
  } catch (e) { console.error(e); window.__failed = String(e && e.stack || e); }
})();
