// heygen-auto-edit engine: the whole edited film as a function of time, drawn on one canvas.
// The renderer (scripts/render.mjs) opens index.html?aspect=16:9|9:16, waits for window.__ready, then for every frame
// calls `await window.seek(t)` and screenshots the canvas. Inputs are served under /data (plan.json, words.json,
// face.json, info.json, frames/000001.jpg ...) and the plan's own images under /assets.
// Nothing here is random at render time: noise is seeded by frame, so any frame can be drawn in any order.
'use strict';

const Q = new URLSearchParams(location.search);
const ASPECT = Q.get('aspect') === '9:16' ? '9:16' : '16:9';
const V = ASPECT === '9:16';
const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
const U = Math.min(W, H) / 1080;          // 1 unit = 1 px of a 1080-short-side frame
const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');

// ------------------------------------------------------------------ style
const C = {
  paper: '#F4F2EE', ink: '#121212', mute: '#8B8782', line: '#DCD8D1',
  green: '#2DB24A', red: '#E5484D', accent: '#FF3B30',
  pills: ['#FF3EA5', '#FFC928', '#FF7A1A', '#7B61FF', '#22C55E', '#14B8E6'],
  hub: '#29B6F6', chart: '#2AA6A0',
};
const SANS = 'Inter, Helvetica, Arial, sans-serif', SERIF = 'Caslon, Georgia, serif';

// ------------------------------------------------------------------ math
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, d) => clamp((t - a) / d);
const eOut = k => 1 - Math.pow(1 - k, 3);
const eIn = k => k * k * k;
const eIO = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const eBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
function noise1(x, seed = 0) { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return lerp(hash(i * 7919 + seed), hash((i + 1) * 7919 + seed), s) * 2 - 1; }

// ------------------------------------------------------------------ data
let PLAN, WORDS, FACE, INFO, FPS, DUR;
const IMG = {};                      // plan images by src
const frameCache = new Map();        // frame index -> ImageBitmap (small LRU)

async function loadJSON(u, dflt) { try { const r = await fetch(u); if (!r.ok) throw 0; return await r.json(); } catch { return dflt; } }
function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image ' + src)); im.src = src; }); }

async function frame(i) {
  i = clamp(Math.round(i), 1, INFO.frames);
  if (frameCache.has(i)) return frameCache.get(i);
  const im = await loadImage(`/data/frames/${String(i).padStart(6, '0')}.jpg`);
  const bm = await createImageBitmap(im);
  frameCache.set(i, bm);
  if (frameCache.size > 6) { const k = frameCache.keys().next().value; frameCache.get(k).close?.(); frameCache.delete(k); }
  return bm;
}

// ------------------------------------------------------------------ canvases
function layer() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
const L = { a: layer(), b: layer(), tmp: layer(), tmp2: layer() };
const grainTiles = [];
// full-frame grain layers, made once: one overlay draw per frame instead of dozens of tiles
function makeGrain() {
  const tile = document.createElement('canvas'); tile.width = tile.height = 256; const tg = tile.getContext('2d');
  for (let k = 0; k < 6; k++) {
    const d = tg.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (hash(i * 13 + k * 99991) - .5) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    tg.putImageData(d, 0, 0);
    const c = layer(), g = c.getContext('2d'), sc = 2 * U;
    g.imageSmoothingEnabled = true; g.scale(sc, sc);
    for (let x = 0; x < W / sc; x += 256) for (let y = 0; y < H / sc; y += 256) g.drawImage(tile, x, y);
    grainTiles.push(c);
  }
}

// ------------------------------------------------------------------ text helpers
function font(size, weight = 700, fam = SANS) { return `${weight} ${Math.round(size)}px ${fam}`; }
function wrap(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out;
}
function fitFont(g, text, maxW, size, weight, fam, min = 20) {
  let s = size; g.font = font(s, weight, fam);
  while (s > min && Math.max(...String(text).split('\n').map(l => g.measureText(l).width)) > maxW) { s -= 2; g.font = font(s, weight, fam); }
  return s;
}
// blur-to-sharp reveal used by cards and words (k: 0 hidden .. 1 sharp)
function withReveal(g, k, fn, blurPx = 14 * U, alphaFrom = 0) {
  g.save(); g.globalAlpha *= lerp(alphaFrom, 1, clamp(k * 1.4)); const b = (1 - eOut(k)) * blurPx;
  if (b > .3) g.filter = `blur(${b.toFixed(1)}px)`; fn(); g.restore();
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function shadow(g, blur, oy, a = .18) { g.shadowColor = `rgba(20,16,10,${a})`; g.shadowBlur = blur; g.shadowOffsetY = oy; }
function noShadow(g) { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; }

// ------------------------------------------------------------------ camera on the presenter
// talk keyframes: [{t, zoom, x?, y?, snap?}]; between them a slow push (+2.5 %) and a handheld drift.
let TALK = [];
function buildTalk() {
  const kf = (PLAN.talk && PLAN.talk.length) ? PLAN.talk.slice() : autoTalk();
  kf.sort((a, b) => a.t - b.t);
  if (!kf.length || kf[0].t > 0) kf.unshift({ t: 0, zoom: 1 });
  TALK = kf;
}
function autoTalk() {   // no framing in the plan: alternate wide / close on every sentence start
  const out = [{ t: 0, zoom: 1 }]; let last = 0, close = false;
  WORDS.forEach((w, i) => { const prev = WORDS[i - 1]; if (prev && /[.!?]$/.test(prev.w) && w.s - last > 2.5) { close = !close; out.push({ t: w.s - .05, zoom: close ? 1.32 : 1, snap: close }); last = w.s; } });
  return out;
}
function talkAt(t) {
  let i = 0; while (i + 1 < TALK.length && TALK[i + 1].t <= t) i++;
  const k = TALK[i], next = TALK[i + 1], end = next ? next.t : DUR;
  const span = Math.max(.5, end - k.t), p = clamp((t - k.t) / span);
  let zoom = (k.zoom || 1) * (1 + (k.push ?? .025) * eIO(p));
  if (k.snap) zoom *= 1 + .05 * (1 - eOut(prog(t, k.t, .28)));                    // punch-in lands with a tiny settle
  if (k.ease && i > 0) zoom = lerp(TALK[i - 1].zoom || 1, zoom, eIO(prog(t, k.t, k.ease)));
  return { zoom, fx: k.x, fy: k.y, idx: i, since: t - k.t };
}

async function drawPresenter(g, t, opt = {}) {
  const img = await frame(t * FPS + 1);
  const sw = img.width, sh = img.height;
  const cam = talkAt(t);
  const zoom = cam.zoom * (opt.zoomMul || 1);
  const s0 = Math.max(W / sw, H / sh), s = s0 * zoom;
  const fx = (cam.fx ?? FACE.cx) * sw, fy = (cam.fy ?? FACE.cy) * sh;
  // where the face sits on screen: natural "cover" position at zoom 1, pulled to a 0.5 / 0.4 anchor as we push in
  const natX = W / 2 + (fx - sw / 2) * s0, natY = H / 2 + (fy - sh / 2) * s0;
  const kz = clamp((zoom - 1) / .45);
  let px = V ? W / 2 : lerp(natX, W / 2, kz), py = lerp(natY, H * (V ? .36 : .42), kz);
  // handheld: slow drift in x/y/rotation, seeded per take
  const amp = (PLAN.vfx?.handheld ?? 1) * U;
  px += noise1(t * .55, 11) * 6 * amp; py += noise1(t * .5, 23) * 5 * amp;
  const rot = noise1(t * .4, 37) * .0016 * (PLAN.vfx?.handheld ?? 1);
  let x = px - fx * s, y = py - fy * s;
  const dw = sw * s, dh = sh * s;
  x = clamp(x, W - dw - 4, 4) ; y = clamp(y, H - dh - 4, 4);      // never show an edge
  g.save();
  g.translate(W / 2, H / 2); g.rotate(rot); g.translate(-W / 2, -H / 2);
  // prepare.py bakes the default grade into the frames; a plan's own grade (or old frames) still goes through the filter
  const grade = PLAN.vfx?.grade ?? (INFO.graded ? '' : 'contrast(1.06) saturate(1.08) brightness(1.01)');
  g.filter = ((opt.blur ? `blur(${opt.blur}px) ` : '') + (opt.dim ? `brightness(${1 - opt.dim}) ` : '') + (grade === 'none' ? '' : grade)).trim() || 'none';
  g.drawImage(img, x - 2, y - 2, dw + 4, dh + 4);
  g.restore();
  if (!opt.noVignette && (PLAN.vfx?.vignette ?? true)) vignette(g, .28);
}
function vignette(g, a) {
  const r = g.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .62);
  r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = r; g.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ VFX
function grain(g, t, amount) {
  if (!amount) return;
  const f = Math.round(t * FPS), layerK = grainTiles[f % grainTiles.length];
  const ox = Math.floor(hash(f * 3) * 256 * U), oy = Math.floor(hash(f * 5) * 256 * U);   // wraps around the frame
  g.save(); g.globalAlpha = amount; g.globalCompositeOperation = 'overlay';
  g.drawImage(layerK, ox, oy, W - ox, H - oy, 0, 0, W - ox, H - oy);
  if (ox) g.drawImage(layerK, 0, oy, ox, H - oy, W - ox, 0, ox, H - oy);
  if (oy) g.drawImage(layerK, ox, 0, W - ox, oy, 0, H - oy, W - ox, oy);
  if (ox && oy) g.drawImage(layerK, 0, 0, ox, oy, W - ox, H - oy, ox, oy);
  g.restore();
}
// horizontal smear: squeeze the layer to a narrow strip and stretch it back (smooth, cheap); amount 0..1
function hblur(g, src, amount) {
  if (amount < .04) { g.drawImage(src, 0, 0); return; }
  const n = Math.max(8, Math.round(W / (1 + amount * 90))), c = L.tmp2, x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, W, H, 0, 0, n, H);
  g.save(); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n, H, 0, 0, W, H);
  g.globalAlpha = 1 - amount; g.drawImage(src, 0, 0); g.restore();
}
function zoomBlur(g, src, scale, amount, cx = W / 2, cy = H / 2, n = 9) {
  g.save();
  for (let i = 0; i < n; i++) { const s = scale * (1 + amount * i / n); g.globalAlpha = 1 / (i + 1);
    g.setTransform(s, 0, 0, s, cx - cx * s, cy - cy * s); g.drawImage(src, 0, 0); }
  g.restore();
}
// warm light leak: two soft blobs drifting across, added with 'screen'
function lightLeak(g, k, seed = 1) {
  if (k <= 0) return;
  g.save(); g.globalCompositeOperation = 'screen';
  const blobs = [[.15 + .7 * k, .3, '255,150,60'], [.9 - .6 * k, .75, '255,70,120'], [.5, .5, '255,220,170']];
  blobs.forEach(([bx, by, col], i) => {
    const a = Math.sin(Math.PI * clamp(k)) * (i === 2 ? .55 : .85);
    const r = g.createRadialGradient(bx * W, by * H, 0, bx * W, by * H, Math.max(W, H) * (.45 + .1 * i));
    r.addColorStop(0, `rgba(${col},${a})`); r.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = r; g.fillRect(0, 0, W, H);
  });
  g.restore();
}
function flash(g, k) { if (k > 0) { g.save(); g.globalAlpha = k; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.restore(); } }

// ------------------------------------------------------------------ scenes (full screen)
function paper(g, t, b) {
  g.fillStyle = b.bg || C.paper; g.fillRect(0, 0, W, H);
  // soft top light like the reference cards
  const r = g.createRadialGradient(W * .5, -H * .2, 0, W * .5, -H * .2, Math.max(W, H));
  r.addColorStop(0, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, W, H);
}
// slow push on every card: the camera never stands still
function cardCamera(g, t, b, fn) {
  const p = prog(t, b.start, b.end - b.start), s = 1 + (b.push ?? .045) * eIO(p);
  g.save(); g.translate(W / 2, H / 2); g.scale(s, s); g.rotate((b.tilt || 0) * Math.PI / 180); g.translate(-W / 2, -H / 2); fn(); g.restore();
}
function typeText(t, start, text, cps = 26) { const n = Math.floor(clamp((t - start) * cps, 0, text.length)); return { s: text.slice(0, n), done: n >= text.length, caret: n < text.length }; }

const SCENES = {
  // big serif words typed on paper ("SIMPLE WORDS", "How would you search for it?")
  title(g, t, b) {
    paper(g, t, b);
    cardCamera(g, t, b, () => {
      const text = b.text || '', size0 = (b.size || (text.length < 16 ? 150 : text.length < 34 ? 104 : 78)) * U;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const size = fitFont(g, text, W * .84, size0, 700, SERIF);
      g.font = font(size, 700, SERIF);
      const lines = wrap(g, text, W * .84);
      const typed = typeText(t, b.start - .12, text, b.cps || 22);
      let left = typed.s.length, y0 = H / 2 - (lines.length - 1) * size * .58 - (b.sub ? size * .35 : 0);
      g.fillStyle = b.color || C.ink;
      lines.forEach((ln, i) => { const part = ln.slice(0, Math.max(0, left)); left -= ln.length + 1; g.fillText(part, W / 2 - (g.measureText(ln).width - g.measureText(part).width) / 2, y0 + i * size * 1.16); });
      if (b.sub) {
        const k = prog(t, b.start + text.length / (b.cps || 22), .45);
        withReveal(g, k, () => { g.font = font(Math.max(size * .32, (V ? 40 : 36) * U), 500); g.fillStyle = C.mute; g.fillText(b.sub, W / 2, y0 + lines.length * size * 1.16 + size * .1); });
      }
    });
  },

  // checklist card: title, then items that sit blurred until spoken, a green tick pops on each
  list(g, t, b) {
    paper(g, t, b);
    cardCamera(g, t, b, () => {
      const items = b.items || [], pad = V ? 80 * U : 250 * U, maxW = W - pad * 2;
      const tSize = (V ? 84 : 80) * U, iSize = (V ? 56 : 50) * U, gap = iSize * 2.0;
      const total = tSize * 1.6 + items.length * gap;
      let y = H / 2 - total / 2;
      g.textBaseline = 'middle'; g.textAlign = 'left';
      const tk = prog(t, b.start + .05, .4);
      withReveal(g, tk, () => {
        if (b.icon) { g.font = font(tSize * .9, 700); g.fillText(b.icon, pad, y + tSize * .5); }
        const ts = fitFont(g, b.title || '', maxW - (b.icon ? tSize * 1.25 : 0), tSize, 800); g.font = font(ts, 800); g.fillStyle = C.ink; g.fillText(b.title || '', pad + (b.icon ? tSize * 1.25 : 0), y + tSize * .5);
        if (b.highlight) { g.font = font(ts, 800); const w = g.measureText(b.title || '').width; g.globalCompositeOperation = 'multiply'; g.fillStyle = '#FFD43B'; g.fillRect(pad - 10 * U + (b.icon ? tSize * 1.25 : 0), y + tSize * .5 - ts * .62, (w + 20 * U) * eOut(tk), ts * 1.24); }
      }, 10 * U);
      y += tSize * 1.6;
      items.forEach((it, i) => {
        const at = it.at ?? (b.start + .6 + i * .9), k = prog(t, at, .45), yy = y + i * gap + gap / 2;
        // the future item: present but unreadable, like the reference
        g.save(); g.globalAlpha = lerp(.42, 1, eOut(k)); const bl = (1 - eOut(k)) * 7 * U; if (bl > .3) g.filter = `blur(${bl.toFixed(1)}px)`;
        g.font = font(iSize, 700); g.fillStyle = C.ink;
        const lines = wrap(g, it.text, maxW - iSize * 1.6);
        g.fillText(lines[0] + (lines.length > 1 ? '…' : ''), pad + iSize * 1.5, yy);
        g.restore();
        drawTick(g, pad + iSize * .5, yy, iSize * .62, prog(t, at, .3), it.bad ? C.red : C.green, it.bad);
      });
    });
  },

  // A vs B: two columns (good / bad)
  compare(g, t, b) {
    paper(g, t, b);
    cardCamera(g, t, b, () => {
      const cols = [b.left || {}, b.right || {}], iSize = (V ? 50 : 46) * U, gap = iSize * 1.9;
      const colW = V ? W * .82 : W * .36, x0 = V ? W * .09 : W * .5 - colW - 40 * U;
      cols.forEach((col, ci) => {
        const bad = ci === 1 && b.right_bad !== false;
        const cx = V ? x0 : x0 + ci * (colW + 80 * U);
        const n = (col.items || []).length;
        const blockH = iSize * 3.6 + n * gap;
        const cy0 = V ? (ci === 0 ? H * .26 - blockH / 2 + 60 * U : H * .66 - blockH / 2) : H / 2 - blockH / 2;
        const hk = prog(t, (col.at ?? b.start + ci * .4) + .05, .4);
        withReveal(g, hk, () => {
          g.fillStyle = bad ? C.red : C.green; roundRect(g, cx, cy0, iSize * 1.2, iSize * 1.2, 8 * U); g.globalAlpha *= .14; g.fill(); g.globalAlpha /= .14;
          g.strokeStyle = bad ? C.red : C.green; g.lineWidth = 3 * U; g.stroke();
          drawTick(g, cx + iSize * .6, cy0 + iSize * .6, iSize * .5, 1, bad ? C.red : C.green, bad);
          g.font = font(iSize * 1.25, 800); g.fillStyle = C.ink; g.textBaseline = 'middle'; g.textAlign = 'left';
          g.fillText(col.title || '', cx, cy0 + iSize * 2.5);
        }, 10 * U);
        (col.items || []).forEach((it, i) => {
          const at = it.at ?? (b.start + .8 + i * .7 + ci * 2), k = prog(t, at, .4), yy = cy0 + iSize * 4.3 + i * gap;
          g.save(); g.globalAlpha = lerp(.4, 1, eOut(k)); const bl = (1 - eOut(k)) * 6 * U; if (bl > .3) g.filter = `blur(${bl.toFixed(1)}px)`;
          g.font = font(iSize, 500); g.fillStyle = C.ink; g.fillText(it.text, cx + iSize * 1.4, yy); g.restore();
          drawTick(g, cx + iSize * .45, yy, iSize * .5, prog(t, at, .28), bad ? C.red : C.green, bad);
        });
      });
    });
  },

  // search bar with typing and a suggestion list over a soft grid of thumbnails
  search(g, t, b) {
    g.fillStyle = '#EDEDED'; g.fillRect(0, 0, W, H);
    cardCamera(g, t, { ...b, push: b.push ?? .07, tilt: b.tilt ?? -1.2 }, () => {
      thumbGrid(g, t, b);
      const top = g.createLinearGradient(0, 0, 0, H * .62); top.addColorStop(0, 'rgba(245,245,245,1)'); top.addColorStop(.55, 'rgba(245,245,245,.92)'); top.addColorStop(1, 'rgba(245,245,245,0)');
      g.fillStyle = top; g.fillRect(-W * .1, -H * .1, W * 1.2, H * .75);
      const bw = V ? W * .86 : W * .62, bh = (V ? 96 : 84) * U, bx = (W - bw) / 2, by = V ? H * .28 : H * .2;
      g.save(); shadow(g, 30 * U, 8 * U, .12); g.fillStyle = '#fff'; roundRect(g, bx, by, bw, bh, bh / 2); g.fill(); g.restore();
      g.strokeStyle = '#D0D0D0'; g.lineWidth = 2 * U; roundRect(g, bx, by, bw, bh, bh / 2); g.stroke();
      // magnifier
      const mx = bx + bh * .55, my = by + bh / 2; g.strokeStyle = '#555'; g.lineWidth = 3.2 * U;
      g.beginPath(); g.arc(mx, my - 3 * U, bh * .16, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(mx + bh * .12, my + bh * .1); g.lineTo(mx + bh * .24, my + bh * .22); g.stroke();
      const q = b.query || '', typed = typeText(t, b.start + .25, q, b.cps || 16);
      const fs = fitFont(g, q, bw - bh * 1.6, (V ? 40 : 36) * U, 500);
      g.font = font(fs, 500); g.fillStyle = typed.s ? '#111' : '#9a9a9a'; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillText(typed.s || 'Search', bx + bh, my);
      if (Math.floor(t * 2.2) % 2 === 0 || typed.caret) { const cw = g.measureText(typed.s).width; g.fillStyle = '#111'; g.fillRect(bx + bh + cw + 3 * U, my - fs * .6, 2.5 * U, fs * 1.2); }
      // suggestions follow the typing
      const sugg = b.suggestions || [];
      if (typed.s.length > 2 && sugg.length) {
        const k = eOut(prog(t, b.start + .25 + 3 / (b.cps || 16), .3)), rowH = (V ? 62 : 52) * U;
        const dh = (sugg.length * rowH + 24 * U) * k;
        g.save(); shadow(g, 24 * U, 6 * U, .1); g.fillStyle = '#fff'; roundRect(g, bx, by + bh + 10 * U, bw, dh, 18 * U); g.fill(); g.restore();
        g.save(); g.beginPath(); g.rect(bx, by + bh + 10 * U, bw, dh); g.clip();
        sugg.forEach((s, i) => {
          const yy = by + bh + 22 * U + i * rowH + rowH / 2; g.font = font(fs * .86, 500);
          const pre = s.toLowerCase().startsWith(typed.s.toLowerCase()) ? typed.s : '';
          g.fillStyle = '#111'; g.fillText(pre, bx + bh, yy); g.fillStyle = '#6b6b6b'; g.fillText(s.slice(pre.length), bx + bh + g.measureText(pre).width, yy);
          g.strokeStyle = '#999'; g.lineWidth = 2 * U; g.beginPath(); g.arc(bx + bh * .5, yy - 2 * U, 9 * U, 0, Math.PI * 2); g.stroke();
        });
        g.restore();
      }
    });
  },

  // a number that counts up, a sentence, and a line chart drawing itself
  stat(g, t, b) {
    paper(g, t, { bg: '#F7F7F7' });
    cardCamera(g, t, { ...b, push: b.push ?? .06 }, () => {
      const cw = V ? W * .86 : W * .66, ch = V ? H * .5 : H * .66, cx = (W - cw) / 2, cy = (H - ch) / 2;
      g.save(); shadow(g, 40 * U, 14 * U, .1); g.fillStyle = '#fff'; roundRect(g, cx, cy, cw, ch, 26 * U); g.fill(); g.restore();
      const k0 = prog(t, b.start + .1, .5);
      withReveal(g, k0, () => {
        g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = C.ink;
        const ls = fitFont(g, b.label || '', cw - 100 * U, (V ? 36 : 34) * U, 700, SANS, 22 * U); g.font = font(ls, 700); g.fillText(b.label || '', cx + 50 * U, cy + 80 * U);
      }, 8 * U);
      const v = Number(b.value) || 0, kc = eOut(prog(t, b.start + .3, b.count ?? 1.4));
      const shown = (b.prefix || '') + fmtNum(v * kc, b.decimals || 0) + (b.suffix || '');
      g.font = font((V ? 120 : 110) * U, 800); g.fillStyle = C.ink; g.fillText(shown, cx + 50 * U, cy + 210 * U);
      if (b.delta) { g.font = font(34 * U, 700); g.fillStyle = C.green; g.fillText(b.delta, cx + 60 * U + g.measureText(shown).width * 0 + (V ? 120 : 110) * U * shown.length * .58, cy + 200 * U); }
      // chart
      const gx = cx + 50 * U, gy = cy + 260 * U, gw = cw - 100 * U, gh = ch - 320 * U;
      g.strokeStyle = C.line; g.lineWidth = 2 * U; for (let i = 0; i <= 3; i++) { g.beginPath(); g.moveTo(gx, gy + gh * i / 3); g.lineTo(gx + gw, gy + gh * i / 3); g.stroke(); }
      const pts = chartPoints(b.trend || 'up', 48), kd = eIO(prog(t, b.start + .35, b.draw ?? 1.6)), n = Math.max(2, Math.floor(pts.length * kd));
      g.beginPath(); pts.slice(0, n).forEach(([px, py], i) => { const X = gx + px * gw, Y = gy + gh - py * gh; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.strokeStyle = b.color || C.chart; g.lineWidth = 5 * U; g.lineJoin = 'round'; g.stroke();
      g.lineTo(gx + pts[n - 1][0] * gw, gy + gh); g.lineTo(gx, gy + gh); g.closePath();
      const fill = g.createLinearGradient(0, gy, 0, gy + gh); fill.addColorStop(0, hexA(b.color || C.chart, .22)); fill.addColorStop(1, hexA(b.color || C.chart, 0)); g.fillStyle = fill; g.fill();
      const [lx, ly] = pts[n - 1]; g.save(); g.shadowColor = b.color || C.chart; g.shadowBlur = 18 * U; g.fillStyle = b.color || C.chart; g.beginPath(); g.arc(gx + lx * gw, gy + gh - ly * gh, 9 * U, 0, Math.PI * 2); g.fill(); g.restore();
    });
  },

  // hub + coloured pills that branch off as they are named
  mindmap(g, t, b) {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    cardCamera(g, t, { ...b, push: b.push ?? .06 }, () => {
      const nodes = b.nodes || [], R = (V ? 330 : 360) * U, hubR = (V ? 150 : 130) * U, cx = W / 2, cy = H / 2;
      nodes.forEach((n, i) => {
        const at = n.at ?? (b.start + .5 + i * .8), k = prog(t, at, .45);
        if (k <= 0) return;
        const ang = (n.angle ?? (-90 + 360 * i / nodes.length + (nodes.length % 2 ? 0 : 30))) * Math.PI / 180;
        const nx = cx + Math.cos(ang) * R * (V ? .8 : 1.35), ny = cy + Math.sin(ang) * R * (V ? 1.35 : .78);
        const lk = eOut(clamp(k * 1.6));
        g.strokeStyle = '#E2453C'; g.lineWidth = 3 * U; g.beginPath(); g.moveTo(cx, cy); g.lineTo(lerp(cx, nx, lk), lerp(cy, ny, lk)); g.stroke();
        const pk = eBack(prog(t, at + .15, .35)); if (pk <= 0) return;
        g.font = font((V ? 42 : 40) * U, 700); const tw = g.measureText(n.text).width, ph = 74 * U, pw = tw + 60 * U;
        g.save(); g.translate(nx, ny); g.scale(pk, pk); shadow(g, 16 * U, 6 * U, .12);
        g.fillStyle = n.color || C.pills[i % C.pills.length]; roundRect(g, -pw / 2, -ph / 2, pw, ph, ph / 2); g.fill(); noShadow(g);
        g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.text, 0, 2 * U); g.restore();
      });
      const hk = eBack(prog(t, b.start + .05, .4));
      g.save(); g.translate(cx, cy); g.scale(hk, hk); shadow(g, 30 * U, 10 * U, .15); g.fillStyle = b.hubColor || C.hub; g.beginPath(); g.arc(0, 0, hubR, 0, Math.PI * 2); g.fill(); noShadow(g);
      g.fillStyle = '#0b2533'; g.textAlign = 'center'; g.textBaseline = 'middle'; let fs = 46 * U; g.font = font(fs, 800); while (fs > 20 * U && (wrap(g, b.center || '', hubR * 1.5).length > 3 || Math.max(...wrap(g, b.center || '', hubR * 1.5).map(l => g.measureText(l).width)) > hubR * 1.6)) { fs -= 2 * U; g.font = font(fs, 800); }
      wrap(g, b.center || '', hubR * 1.5).forEach((ln, i, a) => g.fillText(ln, 0, (i - (a.length - 1) / 2) * fs * 1.1)); g.restore();
    });
  },

  // the presenter blurred and dimmed behind one strong sentence ("Rhythm = engagement")
  async quote(g, t, b) {
    await drawPresenter(g, t, { blur: 22 * U, dim: .45, zoomMul: 1.08, noVignette: true });
    const k = prog(t, b.start + .1, .5);
    withReveal(g, k, () => {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      const fs = fitFont(g, b.text || '', W * .8, (b.size || (V ? 84 : 80)) * U, 700);
      g.font = font(fs, 700); const lines = wrap(g, b.text || '', W * .8);
      g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 30 * U;
      lines.forEach((ln, i) => g.fillText(ln, W / 2, H / 2 + (i - (lines.length - 1) / 2) * fs * 1.15));
    }, 18 * U);
  },

  // a user's screenshot / photo as b-roll: rounded, shadowed, pushing in with a slight 3D tilt
  async image(g, t, b) {
    if (b.backdrop === 'presenter') await drawPresenter(g, t, { blur: 26 * U, dim: .25, zoomMul: 1.1, noVignette: true }); else paper(g, t, b);
    const im = IMG[b.src]; if (!im) return;
    const p = prog(t, b.start, b.end - b.start), k = eOut(prog(t, b.start, .55));
    const maxW = (b.full ? W : W * (V ? .88 : .72)), maxH = b.full ? H : H * (V ? .62 : (b.caption ? .66 : .78));
    const s = Math.min(maxW / im.width, maxH / im.height) * lerp(.9, 1, k) * (1 + .05 * eIO(p));
    const w = im.width * s, h = im.height * s;
    g.save(); g.translate(W / 2, H / 2 + (b.caption ? -40 * U : 0) + (1 - k) * 60 * U);
    g.transform(1, lerp(-.03, -.01, k) * (b.tilt ?? 1), 0, 1, 0, 0);
    g.globalAlpha = clamp(k * 1.5);
    if (!b.full) { shadow(g, 50 * U, 22 * U, .22); g.fillStyle = '#fff'; roundRect(g, -w / 2, -h / 2, w, h, 18 * U); g.fill(); noShadow(g); g.save(); roundRect(g, -w / 2, -h / 2, w, h, 18 * U); g.clip(); }
    g.drawImage(im, -w / 2, -h / 2, w, h); if (!b.full) g.restore(); g.restore();
    if (b.caption) withReveal(g, prog(t, b.start + .35, .4), () => { g.font = font((V ? 46 : 42) * U, 700); g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.caption, W / 2, H / 2 + h / 2 + 40 * U); });
  },
};
SCENES.quote.async = SCENES.image.async = true;
const FULL = new Set(Object.keys(SCENES));

function drawTick(g, x, y, r, k, col, cross) {
  if (k <= 0) return; const s = eBack(clamp(k)); g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = col; g.lineWidth = r * .32; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  if (cross) { g.moveTo(-r * .55, -r * .55); g.lineTo(r * .55, r * .55); g.moveTo(r * .55, -r * .55); g.lineTo(-r * .55, r * .55); }
  else { g.moveTo(-r * .7, 0); g.lineTo(-r * .2, r * .5); g.lineTo(r * .75, -r * .6); }
  g.stroke(); g.restore();
}
function fmtNum(v, d) { return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function chartPoints(kind, n) {
  const pts = [];
  for (let i = 0; i < n; i++) { const x = i / (n - 1); let y;
    if (kind === 'up') y = .08 + .82 * Math.pow(x, 1.6) + noise1(i * .9, 5) * .03;
    else if (kind === 'down') y = .9 - .78 * Math.pow(x, .8) + noise1(i * .9, 5) * .03;
    else if (kind === 'spike') y = .12 + .05 * noise1(i * 1.3, 9) + .75 * Math.exp(-Math.pow((x - .62) * 9, 2));
    else y = .35 + .04 * noise1(i * 1.1, 3);
    pts.push([x, clamp(y)]); }
  return pts;
}
// abstract thumbnails behind the search bar (no real people, no real brands)
let THUMBS = null;
function thumbGrid(g, t, b) {
  if (!THUMBS) { THUMBS = layer(); drawThumbs(THUMBS.getContext('2d')); }
  g.drawImage(THUMBS, 0, 0);
}
function drawThumbs(g) {
  const cols = V ? 2 : 4, tw = (V ? W * .44 : W * .23), th = tw * 9 / 16, gap = 28 * U, x0 = (W - (cols * tw + (cols - 1) * gap)) / 2;
  for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, x = x0 + c * (tw + gap), y = H * (V ? .5 : .45) + r * (th + 70 * U) - 40 * U;
    const h1 = Math.floor(hash(i * 31 + 7) * 360), h2 = (h1 + 40 + Math.floor(hash(i * 17) * 80)) % 360;
    const gr = g.createLinearGradient(x, y, x + tw, y + th); gr.addColorStop(0, `hsl(${h1},70%,60%)`); gr.addColorStop(1, `hsl(${h2},75%,42%)`);
    g.save(); g.filter = `blur(${1.5 * U}px)`; g.fillStyle = gr; roundRect(g, x, y, tw, th, 14 * U); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = font(th * .2, 800); g.textBaseline = 'top'; g.fillText(['IDEA', 'HOW TO', '10X', 'WHY?', 'NEW', 'TOP 5', 'DON\'T', '$1M'][i % 8], x + 18 * U, y + th * .55);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(x + tw * .75, y + th * .52, th * .32, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9c9c9'; roundRect(g, x, y + th + 14 * U, tw * .8, 14 * U, 7 * U); g.fill(); roundRect(g, x, y + th + 36 * U, tw * .5, 12 * U, 6 * U); g.fill();
    g.restore();
  }
}

// ------------------------------------------------------------------ overlays on the presenter
const OVER = {
  // big words around the head ("Unlock / your potential")
  words(g, t, b) {
    const items = b.items || [];
    const out = clamp((b.end - t) / .18);
    items.forEach((it, i) => {
      const at = it.at ?? (b.start + i * .6), k = prog(t, at, .3); if (k <= 0) return;
      const [main, sub] = String(it.text).split('\n');
      const pos = wordPos(it.pos || ['right', 'left', 'top-right', 'bottom-left'][i % 4], i);
      let size = (it.size || (V ? 92 : 104)) * U;
      // keep the whole word inside the frame: shrink a long one, then slide it in from the edge
      const m = 56 * U; g.font = font(size, 800);
      let tw = Math.max(g.measureText(main).width, sub ? (g.font = font(size * .42, 700), g.measureText(sub).width) : 0);
      const room = pos.align === 'center' ? W - 2 * m : pos.align === 'right' ? pos.x - m : W - m - pos.x;
      if (tw > Math.max(room, W * .3)) { size *= Math.max(room, W * .3) / tw; tw = Math.max(room, W * .3); }
      let x0 = pos.align === 'right' ? pos.x - tw : pos.align === 'center' ? pos.x - tw / 2 : pos.x;
      const shift = Math.max(0, m - x0) - Math.max(0, x0 + tw - (W - m));
      g.save(); g.globalAlpha = out * clamp(k * 2);
      const s = lerp(1.25, 1, eOut(k)); g.translate(pos.x + shift, pos.y); g.scale(s, s); g.rotate((it.rot || 0) * Math.PI / 180);
      const bl = (1 - eOut(k)) * 12 * U; if (bl > .3) g.filter = `blur(${bl.toFixed(1)}px)`;
      g.textAlign = pos.align; g.textBaseline = 'alphabetic';
      g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 24 * U; g.shadowOffsetY = 4 * U;
      g.fillStyle = it.color || '#fff'; g.font = font(size, 800); g.fillText(main, 0, 0);
      if (sub) { g.font = font(size * .42, 700); g.fillText(sub, pos.align === 'right' ? 0 : pos.align === 'center' ? 0 : size * .04, size * .5); }
      g.restore();
    });
  },
  // "Subscribe" pill pressed by a cursor, end of the film
  subscribe(g, t, b) {
    const k = eBack(prog(t, b.start, .4)), out = clamp((b.end - t) / .25); if (k <= 0) return;
    const press = b.start + .9, done = t >= press;
    const label = done ? 'SUBSCRIBED' : 'SUBSCRIBE';
    g.save(); g.globalAlpha = out; g.font = font(44 * U, 800);
    const pw = g.measureText('SUBSCRIBED').width + 150 * U, ph = 96 * U, x = W / 2, y = H * (V ? .8 : .84);
    const pk = t >= press && t < press + .18 ? .94 : 1;
    g.translate(x, y); g.scale(k * pk, k * pk);
    shadow(g, 30 * U, 10 * U, .3); g.fillStyle = done ? '#E9E9E9' : '#FF0033'; roundRect(g, -pw / 2, -ph / 2, pw, ph, ph / 2); g.fill(); noShadow(g);
    g.fillStyle = done ? '#333' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 18 * U, 3 * U);
    // bell
    g.strokeStyle = done ? '#333' : '#fff'; g.lineWidth = 4 * U; g.beginPath(); g.arc(-pw / 2 + 52 * U, -2 * U, 14 * U, Math.PI, 0); g.lineTo(-pw / 2 + 70 * U, 14 * U); g.lineTo(-pw / 2 + 34 * U, 14 * U); g.closePath(); g.stroke();
    g.restore();
    // cursor glides in and clicks
    const ck = eIO(prog(t, b.start + .2, .65)); if (ck > 0 && t < b.end - .1) {
      const cx = lerp(x + 380 * U, x + pw * .15, ck), cy = lerp(y + 260 * U, y + 10 * U, ck);
      g.save(); g.globalAlpha = out; g.translate(cx, cy); g.scale(1.5 * U * pk, 1.5 * U * pk); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 34); g.lineTo(9, 26); g.lineTo(15, 40); g.lineTo(21, 37); g.lineTo(15, 24); g.lineTo(27, 24); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  },
  // a short label with an arrow pointing at the presenter ("Important thing creators keep ignoring")
  callout(g, t, b) {
    const k = prog(t, b.start, .35), out = clamp((b.end - t) / .2); if (k <= 0) return;
    const left = (b.side || 'left') === 'left';
    const fx = W * (V ? .5 : (left ? .3 : .7)), fy = H * (V ? .2 : .42);
    g.save(); g.globalAlpha = out * clamp(k * 2); g.font = font((V ? 50 : 52) * U, 800); g.textAlign = left ? 'right' : 'left'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 20 * U; g.fillStyle = '#fff';
    const lines = wrap(g, b.text || '', W * (V ? .8 : .3)); lines.forEach((ln, i) => g.fillText(ln, fx, fy + i * 60 * U));
    g.restore();
  },
};
function wordPos(pos, i) {
  // around the face: never on it. 16:9 uses the empty sides; 9:16 stacks above the head.
  const fx = W / 2, fw = (FACE.w || .18) * W;
  if (V) {
    const rows = { 'top': [W / 2, H * .17, 'center'], 'top-left': [W * .08, H * .14, 'left'], 'top-right': [W * .92, H * .2, 'right'],
      'left': [W * .08, H * .14, 'left'], 'right': [W * .92, H * .21, 'right'], 'bottom-left': [W * .08, H * .5, 'left'], 'bottom-right': [W * .92, H * .5, 'right'], 'center': [W / 2, H * .5, 'center'] };
    const r = rows[pos] || rows.top; return { x: r[0], y: r[1], align: r[2] };
  }
  const sideL = Math.min(fx - fw * 1.1, W * .32), sideR = Math.max(fx + fw * 1.1, W * .68);
  const map = { 'left': [sideL, H * .42, 'right'], 'right': [sideR, H * .38, 'left'], 'top-left': [sideL, H * .22, 'right'], 'top-right': [sideR, H * .2, 'left'],
    'bottom-left': [sideL, H * .72, 'right'], 'bottom-right': [sideR, H * .7, 'left'], 'top': [W / 2, H * .16, 'center'], 'center': [W / 2, H * .5, 'center'] };
  const r = map[pos] || map.right; return { x: r[0], y: r[1], align: r[2] };
}

// ------------------------------------------------------------------ captions (9:16 only by default)
let CHUNKS = [];
function buildCaptions() {
  const max = PLAN.captions?.words || 3; let cur = [];
  const flush = () => { if (cur.length) CHUNKS.push({ s: cur[0].s, e: cur[cur.length - 1].e, words: cur }); cur = []; };
  WORDS.forEach((w, i) => {
    const prev = WORDS[i - 1];
    if (cur.length && (cur.length >= max || w.s - prev.e > .3 || /[.!?,;:]$/.test(prev.w))) flush();
    cur.push(w);
  });
  flush();
  CHUNKS.forEach((c, i) => { const n = CHUNKS[i + 1]; c.until = n ? Math.min(n.s, c.e + .35) : c.e + .4; });
}
function captions(g, t, hideFor) {
  const c = CHUNKS.find(c => t >= c.s - .02 && t < c.until); if (!c || hideFor) return;
  const size = (PLAN.captions?.size || 84) * U, y = H * (PLAN.captions?.y || .7);
  const pop = 1 + .07 * (1 - eOut(prog(t, c.s, .14)));
  g.save(); g.translate(W / 2, y); g.scale(pop, pop);
  g.font = font(size, 800); g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const text = c.words.map(w => clean(w.w)); const sp = g.measureText(' ').width;
  const widths = text.map(x => g.measureText(x).width); let total = widths.reduce((a, b) => a + b, 0) + sp * (text.length - 1);
  let scale = Math.min(1, W * .88 / total); g.scale(scale, scale); total *= 1;
  let x = -total / 2;
  text.forEach((w, i) => {
    const active = t >= c.words[i].s && t < (c.words[i + 1]?.s ?? c.until);
    g.lineWidth = 14 * U; g.strokeStyle = 'rgba(0,0,0,.92)'; g.strokeText(w, x, 0);
    g.fillStyle = active && PLAN.captions?.highlight !== false ? (PLAN.captions?.color || '#FFE14D') : '#fff'; g.fillText(w, x, 0);
    x += widths[i] + sp;
  });
  g.restore();
}
const clean = w => (PLAN.captions?.upper ? w.toUpperCase() : w).replace(/[.,;:!?]+$/, m => m.includes('?') || m.includes('!') ? m : '');

// ------------------------------------------------------------------ timeline
let BEATS = [];
const TR = { cut: 0, whip: .34, zoom: .36, leak: .6, flash: .3, fade: .4 };
function buildBeats() {
  BEATS = (PLAN.beats || []).map((b, i) => ({ ...b, i, _full: FULL.has(b.type), in: b.in || (FULL.has(b.type) ? (PLAN.transition || 'whip') : 'cut'), out: b.out || (FULL.has(b.type) ? (PLAN.transition_out || 'cut') : 'cut') }))
    .filter(b => b.end > b.start).sort((a, b) => a.start - b.start);
}
function fullAt(t) { return BEATS.filter(b => b._full && t >= b.start - (TR[b.in] || 0) / 2 && t < b.end + (TR[b.out] || 0) / 2); }

async function drawState(g, t, beat) {   // beat null = presenter + overlays
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  if (beat) await SCENES[beat.type](g, t, beat);
  else {
    await drawPresenter(g, t);
    for (const b of BEATS) if (!b._full && t >= b.start && t < b.end && OVER[b.type]) OVER[b.type](g, t, b);
  }
  g.restore();
}

// one transition between state A (at time t) and state B
async function transition(kind, k, t, A, B) {
  const a = L.a.getContext('2d'), b = L.b.getContext('2d');
  await drawState(a, t, A); await drawState(b, t, B);
  const out = ctx; out.save();
  if (kind === 'whip') {
    // a camera pan: A leaves left, B follows right behind it, smeared by a horizontal blur that peaks mid-move
    const p = eIO(k), off = p * W, tmp = L.tmp.getContext('2d');
    tmp.setTransform(1, 0, 0, 1, 0, 0); tmp.globalAlpha = 1; tmp.filter = 'none';
    tmp.drawImage(L.a, -off, 0); tmp.drawImage(L.b, W - off, 0);
    hblur(out, L.tmp, Math.sin(Math.PI * k));
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

async function seek(t) {
  t = clamp(t, 0, DUR - 1e-3);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1;
  const active = fullAt(t);
  let drawn = false;
  for (const b of active) {
    const din = TR[b.in] || 0, dout = TR[b.out] || 0;
    if (din && t < b.start + din / 2) {
      const prev = BEATS.filter(x => x._full && x !== b && x.end <= b.start + .01 && x.end > b.start - .05).pop() || null;
      await transition(b.in, (t - (b.start - din / 2)) / din, t, prev, b); drawn = true; break;
    }
    if (dout && t >= b.end - dout / 2) {
      const next = BEATS.find(x => x._full && x !== b && x.start >= b.end - .01 && x.start < b.end + .05);
      if (next && (TR[next.in] || 0)) continue;     // the next beat's own entrance takes over
      await transition(b.out, (t - (b.end - dout / 2)) / dout, t, b, next || null); drawn = true; break;
    }
  }
  if (!drawn) {
    const b = active.find(x => t >= x.start && t < x.end) || null;
    await drawState(ctx, t, b);
  }
  // talk-cut accents: a light leak or flash placed on a presenter cut
  for (const k of TALK) if (k.fx === undefined && k.leak && t >= k.t - .3 && t < k.t + .3) lightLeak(ctx, (t - k.t + .3) / .6);
  for (const a of PLAN.accents || []) { if (t >= a.t && t < a.t + (a.d || .6)) { const k = (t - a.t) / (a.d || .6); if (a.type === 'leak') lightLeak(ctx, k); if (a.type === 'flash') flash(ctx, Math.sin(Math.PI * k) * .9); } }
  // captions: 9:16 by default, never over a text card
  const capOn = PLAN.captions?.enabled ?? V;
  if (capOn) { const cur = active.find(x => t >= x.start && t < x.end); captions(ctx, t, cur && !['image'].includes(cur.type)); }
  grain(ctx, t, PLAN.vfx?.grain ?? .07);
}

// ------------------------------------------------------------------ sound cues for real-sfx (typed cue list)
function buildCues() {
  const cues = [], add = (t, type, extra = {}) => { if (t >= 0 && t < DUR) cues.push({ t: +t.toFixed(3), type, ...extra }); };
  for (const b of BEATS) {
    const din = TR[b.in] || 0;
    if (b._full) {
      if (b.in === 'whip' || b.in === 'zoom') add(b.start - din / 2, 'whoosh', { len: din + .15 });
      if (b.in === 'leak') add(b.start - .25, 'whoosh', { len: .7, g: .6 });
      if (b.in === 'flash') add(b.start, 'hit', { g: .6 });
      const prevEnd = BEATS.some(x => x._full && x !== b && Math.abs(x.start - b.end) < .05);
      if (!prevEnd && (b.out === 'whip' || b.out === 'zoom')) add(b.end - TR[b.out] / 2, 'whoosh', { len: TR[b.out] + .15, g: .8 });
    }
    if (b.type === 'title') add(b.start - .12, 'key', { len: (b.text || '').length / (b.cps || 22), n: (b.text || '').length });
    if (b.type === 'search') { const q = b.query || ''; add(b.start + .25, 'key', { len: q.length / (b.cps || 16), n: q.length }); }
    if (b.type === 'list') (b.items || []).forEach((it, i) => add(it.at ?? (b.start + .6 + i * .9), 'pop', { g: .8 }));
    if (b.type === 'compare') [b.left, b.right].forEach((c, ci) => (c?.items || []).forEach((it, i) => add(it.at ?? (b.start + .8 + i * .7 + ci * 2), 'pop', { g: .7 })));
    if (b.type === 'mindmap') { add(b.start + .05, 'pop'); (b.nodes || []).forEach((n, i) => add((n.at ?? (b.start + .5 + i * .8)) + .15, 'pop', { g: .8 })); }
    if (b.type === 'stat') { add(b.start + .3, 'tick', { g: .5 }); add(b.start + .3 + (b.count ?? 1.4), 'chime', { g: .6 }); }
    if (b.type === 'image') add(b.start, 'whoosh', { len: .5, g: .5 });
    if (b.type === 'quote') add(b.start + .1, 'whoosh', { len: .6, g: .5 });
    if (b.type === 'words') (b.items || []).forEach((it, i) => add(it.at ?? (b.start + i * .6), 'pop', { g: .7 }));
    if (b.type === 'subscribe') { add(b.start, 'pop'); add(b.start + .9, 'click'); }
    if (b.type === 'callout') add(b.start, 'pop', { g: .6 });
  }
  for (const k of TALK) if (k.snap) add(k.t, 'whoosh', { len: .25, g: .35 });
  for (const a of PLAN.accents || []) add(a.t, a.type === 'flash' ? 'hit' : 'whoosh', { len: a.d || .6, g: .5 });
  return cues.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ boot
(async () => {
  try {
    [PLAN, WORDS, FACE, INFO] = await Promise.all([loadJSON('/data/plan.json', {}), loadJSON('/data/words.json', []), loadJSON('/data/face.json', { cx: .5, cy: .38, w: .18, h: .32 }), loadJSON('/data/info.json', null)]);
    if (!INFO) throw new Error('no /data/info.json: run prepare.py first');
    FPS = INFO.fps; DUR = PLAN.duration || INFO.duration;
    for (const b of PLAN.beats || []) if (b.type === 'image' && b.src && !IMG[b.src]) IMG[b.src] = await loadImage('/assets/' + b.src);
    await document.fonts.load(font(40, 800)); await document.fonts.load(font(40, 700)); await document.fonts.load(font(40, 500)); await document.fonts.load(font(40, 700, SERIF));
    makeGrain(); buildTalk(); buildBeats(); buildCaptions();
    window.DURATION = DUR; window.FPS = FPS; window.CUES = buildCues(); window.seek = seek; window.ASPECT = ASPECT;
    await seek(0);
    window.__ready = true;
  } catch (e) { console.error(e); window.__failed = String(e && e.stack || e); }
})();
