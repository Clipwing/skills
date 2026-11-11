// talking-head-auto-edit engine, part 5: the timeline. Edit rules are enforced here, whatever the plan says:
//   - the presenter is never on screen for a moment between two full-screen beats (a gap < GAP_CLOSE is closed: the
//     first beat runs on and the two hand over card to card);
//   - every change between the presenter and a full-screen beat is a transition, never a hard cut. Transitions keep
//     the whole frame (no shrunken or cropped screens, no dark gaps): a soft blur dissolve or a push-in zoom;
//   - framing cuts that would land right next to a beat are dropped;
//   - after the last word the presenter holds a beat, then the end screen runs.
// The renderer (scripts/render.mjs) waits for window.__ready, then calls `await window.seek(t)` for every frame.
'use strict';

const MIN_SHOT = 1.6;                                  // shortest time the presenter may be on screen before the end screen
const GAP_CLOSE = 3.4;                                 // a presenter shot shorter than this between two beats is cut out
const TR = { cut: 0, blur: .5, zoom: .45, leak: .7, flash: .3, fade: .45, self: 0 };
const TR_ALIAS = { whip: 'blur', slide: 'blur', push3d: 'blur' };   // older plans: the editors read these as cheap
const SELF = new Set(['split']);
let BEATS = [], FULL;

function buildBeats() {
  FULL = new Set(Object.keys(SCENES));
  let beats = (PLAN.beats || []).map((b, i) => ({ ...b, i })).filter(b => b.end > b.start).sort((a, b) => a.start - b.start);
  const full = beats.filter(b => FULL.has(b.type));
  // the last thing a card says must stay readable: at least READ s after it lands (+ a little per character)
  const READ = 1.6;
  full.forEach(b => { if (TR_ALIAS[b.in]) b.in = TR_ALIAS[b.in]; if (TR_ALIAS[b.out]) b.out = TR_ALIAS[b.out]; });
  full.forEach((b, i) => {
    // a quote stays until its last word has been said and read (never into the next card). A title is not stretched
    // here: it must not hang while the presenter talks on; scripts/hold.py gives it a pause in the voice instead
    if (b.type === 'quote') {
      // ...but no longer: it leaves soon after the sentence is said, the presenter carries on
      const sp = spokenTimes(b.text || '', b.start - .3, b.end + 2).filter(x => x != null), lastW = sp.length ? WORDS.find(w => w.s === sp[sp.length - 1]) : null;
      const need = Math.max(b.start + 1.6, (lastW ? lastW.e : b.start + 1) + .5), next = full[i + 1];
      b.end = next ? Math.min(need, next.start) : need;
    }
    const its = [...(b.items || []), ...(b.steps || []), ...(b.bars || []), ...(b.parts || []), ...(b.rows || []), ...(b.nodes || []), ...(b.left?.items || []), ...(b.right?.items || [])].filter(x => x.at != null);
    if (!its.length) return;
    const last = its.reduce((a, x) => x.at > a.at ? x : a), len = String(last.text || (last.cells || []).join(' ') || last.label || '').length;
    const need2 = last.at + READ + Math.min(1.2, len * .03), next = full[i + 1];
    if (b.end < need2) b.end = next ? Math.min(need2, next.start) : need2;
  });
  // close short gaps and overlaps between full-screen beats
  // (a gap that holds words beside the presenter is meant to be on the presenter: it stays)
  const holdsWords = (a, n) => beats.some(w => !FULL.has(w.type) && w.type === 'words' && w.end > a.end + .3 && w.start < n.start - .3);
  for (let i = 0; i + 1 < full.length; i++) { const a = full[i], n = full[i + 1]; if (n.start - a.end < (holdsWords(a, n) ? MIN_SHOT : GAP_CLOSE)) a.end = n.start; }
  if (full[0] && full[0].start < 1) full[0].start = 0;
  // the end screen
  if (PLAN.endscreen !== false && !full.some(b => b.type === 'endscreen')) {
    const es = { type: 'endscreen', ...(PLAN.endscreen || {}), i: 999, out: 'end' };   // the film ends on it: no way out
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
    if (SELF.has(b.type)) { b.in = touchPrev ? (b.in && b.in !== 'self' ? b.in : 'blur') : 'self'; b.out = touchNext ? 'cut' : 'self'; return; }
    if (touchPrev) b.in = b.in && b.in !== 'cut' ? b.in : 'blur';                       // card to card: a soft hand-over
    else b.in = b.in && b.in !== 'cut' ? b.in : (b.type === 'endscreen' ? 'blur' : cyc(['blur', 'zoom'], i));
    if (touchNext) b.out = 'cut';                                         // the next beat's entrance takes over
    else b.out = b.out && b.out !== 'cut' ? b.out : cyc(['blur', 'zoom'], i + 1);
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
function firstAt(b) {
  const its = [...(b.items || []), ...(b.steps || []), ...(b.bars || []), ...(b.parts || []), ...(b.rows || []), ...(b.nodes || []), ...(b.left?.items || []), ...(b.right?.items || [])].map(x => x && x.at).filter(x => x != null);
  return its.length ? Math.min(...its) : null;
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
  if (kind === 'blur') {
    // A goes soft and drifts a little closer, B comes out of the same softness and settles; they cross in the middle
    out.fillStyle = C.paper; out.fillRect(0, 0, W, H);
    const bl = Math.sin(Math.PI * k) * 24 * U, mix = eIO(clamp((k - .3) / .4));
    const draw = (src, s2, alpha) => { if (alpha <= 0) return; out.save(); out.globalAlpha = alpha; out.translate(W / 2, H / 2); out.scale(s2, s2); out.translate(-W / 2, -H / 2); if (bl > .3) out.filter = `blur(${bl.toFixed(1)}px)`; out.drawImage(src, 0, 0); out.restore(); };
    draw(L.a, 1 + .04 * eIO(k), 1); draw(L.b, 1.04 - .04 * eIO(k), mix);
  } else if (kind === 'zoom') {
    if (k < .5) { const kk = eIn(k * 2); zoomBlur(out, L.a, 1 + kk * .5, .12 * kk); }
    else { const kk = eOut((k - .5) * 2); zoomBlur(out, L.b, 1.35 - .35 * kk, .1 * (1 - kk)); }
  } else if (kind === 'leak') {
    out.drawImage(L.a, 0, 0); out.globalAlpha = eIO(k); out.drawImage(L.b, 0, 0); out.globalAlpha = 1; lightLeak(out, k);
  } else if (kind === 'flash') {
    out.drawImage(k < .5 ? L.a : L.b, 0, 0); flash(out, Math.sin(Math.PI * k) * .95);
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
  grain(ctx, t, PLAN.vfx?.grain ?? .03);
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
      if (['blur', 'zoom'].includes(b.in)) add(b.start - din / 2, 'whoosh', { len: din + .15 });
      if (b.in === 'leak') add(b.start - .3, 'whoosh', { len: .8, g: .6 });
      if (b.in === 'flash') add(b.start, 'hit', { g: .6 });
      if (b.in === 'self') add(b.start, 'whoosh', { len: .7, g: .6 });
      if (['blur', 'zoom'].includes(b.out)) add(b.end - TR[b.out] / 2, 'whoosh', { len: TR[b.out] + .15, g: .8 });
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
    for (const [w, fam] of [[800, SANS], [700, SANS], [600, SANS], [500, SANS], [700, SERIF]]) await document.fonts.load(font(40, w, fam));
    makeSprites(); buildTalk(); buildBeats(); buildCaptions();
    window.DURATION = DUR; window.FPS = FPS; window.CUES = buildCues(); window.seek = seek; window.ASPECT = ASPECT;
    window.TIMELINE = { duration: DUR, fps: FPS, beats: BEATS.map(b => ({ i: b.i, type: b.type, start: b.start, end: b.end, in: b.in, out: b.out, full: !!b._full })), talk: TALK };
    window.BEATS_INFO = BEATS.filter(b => b._full || b.type === 'words').map(b => ({ type: b.type, start: b.start, end: b.end, in: b.in, out: b.out }));
    await seek(0);
    window.__ready = true;
  } catch (e) { console.error(e); window.__failed = String(e && e.stack || e); }
})();
