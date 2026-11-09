// heygen-auto-edit engine, part 3: full-screen scenes. Every card is drawn flat into a layer, then placed in 3D
// (WebGL) on a stage with depth: paper texture, a soft light, out-of-focus shapes behind and in front, a shadow.
// Cards enter with a 3D settle, the camera drifts and dollies in while they hold, and they lean away as they leave.
'use strict';

// ------------------------------------------------------------------ stage
const tinted = new Map();
function tintSprite(spr, col) {
  const k = col + spr.width; if (tinted.has(k)) return tinted.get(k);
  const c = layer(spr.width, spr.height), g = c.getContext('2d'); g.drawImage(spr, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  tinted.set(k, c); return c;
}
const PALETTES = {
  warm: ['#FFB38A', '#FFD98A', '#F7A8C4', '#B8D8FF'], cool: ['#9CC8FF', '#B9A8FF', '#8FE3D2', '#FFD3A8'],
  dark: ['#FF8A3D', '#FF4F7B', '#6E7BFF', '#FFC44D'],
};
// paper stage: base colour, fibre texture, top light, a dot grid, blurred colour discs drifting at two depths
function stage(g, t, b, opt = {}) {
  const bg = opt.bg || b.bg || C.paper;
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.save(); g.globalAlpha = opt.texture ?? .22; g.globalCompositeOperation = 'multiply'; g.fillStyle = g.createPattern(SPR.paper, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
  const cam = (t - b.start);
  if (opt.grid !== false) {   // dot grid with a little parallax
    g.save(); g.fillStyle = opt.dark ? 'rgba(255,255,255,.07)' : 'rgba(40,30,20,.075)'; const sp = 46 * U, ox = (cam * 6 * U) % sp, oy = (cam * 3 * U) % sp;
    for (let x = -sp + ox; x < W + sp; x += sp) for (let y = -sp + oy; y < H + sp; y += sp) { g.beginPath(); g.arc(x, y, 2.1 * U, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  const pal = PALETTES[opt.palette || b.palette || (opt.dark ? 'dark' : 'warm')];
  g.save(); g.globalCompositeOperation = opt.dark ? 'screen' : 'multiply';
  for (let i = 0; i < 4; i++) {
    const sz = (520 + 300 * hash(b.i * 31 + i)) * U, x = W * (i % 2 ? .82 : .14) + noise1(cam * .18 + i * 3, b.i + i) * 120 * U, y = H * (i < 2 ? .16 : .86) + noise1(cam * .15 + i * 5, b.i * 3 + i) * 80 * U;
    g.globalAlpha = opt.dark ? .22 : .32; g.drawImage(tintSprite(SPR.bokeh, pal[i % pal.length]), x - sz / 2, y - sz / 2, sz, sz);
  }
  g.restore();
  const r = g.createRadialGradient(W * .4, -H * .25, 0, W * .4, -H * .25, Math.max(W, H) * 1.1);
  r.addColorStop(0, opt.dark ? 'rgba(255,240,220,.10)' : 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, W, H);
  vignette(g, opt.dark ? .45 : .12);
}
// out-of-focus shapes crossing in front of the card: depth
function foreground(g, t, b, opt = {}) {
  const pal = PALETTES[opt.palette || b.palette || 'warm'], cam = t - b.start;
  g.save(); g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 2; i++) {
    const sz = (300 + 160 * hash(b.i * 17 + i)) * U, side = (b.i + i) % 2;
    const x = side ? W + sz * .05 - cam * 40 * U : -sz * .05 + cam * 40 * U, y = H * (i ? .9 : .08) + noise1(cam * .3, i + b.i) * 30 * U;
    g.globalAlpha = .18; g.drawImage(tintSprite(SPR.bokeh, pal[(i + 1) % pal.length]), x - sz / 2, y - sz / 2, sz, sz);
  }
  g.restore();
}
// how a card stands in 3D at time t: settles in, drifts, dollies in, leans away at the end
function pose(t, b, o = {}) {
  const ki = eOut5(prog(t, b.start - .12, o.inDur ?? .95)), ko = eIn(prog(t, b.end - .5, .5)), held = prog(t, b.start, b.end - b.start);
  const seed = b.i * 13 + (o.seed || 0);
  return {
    ...o,
    ry: lerp(o.ryFrom ?? -18, o.ry ?? -3, ki) + ko * (o.ryOut ?? 8) + noise1(t * .25, seed) * 1.4,
    rx: lerp(o.rxFrom ?? 10, o.rx ?? 3, ki) + noise1(t * .22, seed + 5) * 1,
    rz: (o.rz ?? 0) + noise1(t * .2, seed + 9) * .3,
    z: lerp(o.zFrom ?? 380, o.z ?? 0, ki) - eIO(held) * (o.dolly ?? 110) + ko * 90,
    x: (o.x ?? W / 2) + noise1(t * .3, seed + 2) * 6 * U, y: (o.y ?? H / 2) + noise1(t * .28, seed + 3) * 5 * U,
    alpha: (o.alpha ?? 1) * clamp(ki * 4),
  };
}
let SHADOW = null;
function shadowSprite() {
  if (SHADOW) return SHADOW;
  SHADOW = layer(640, 440); const g = SHADOW.getContext('2d'); g.filter = 'blur(34px)'; g.fillStyle = '#000'; roundRect(g, 90, 90, 460, 260, 40); g.fill();
  return SHADOW;
}
// a card layer (w x h at the top-left of `src`) in 3D with its shadow
function drawCard(G, src, w, h, p) {
  const sp = shadowSprite();
  G.plane(sp, { ...p, w: w * 1.39, h: h * 1.69, y: p.y + 34 * U, z: p.z + 30, alpha: (p.alpha ?? 1) * (p.shadow ?? .3), static: true, tint: undefined });
  return G.plane(src, { ...p, w, h, src: [0, 0, w / src.width, h / src.height] });
}
function cardBase(g, w, h, opt = {}) {
  g.save(); g.fillStyle = opt.fill || '#FFFFFF'; roundRect(g, 0, 0, w, h, opt.r ?? 28 * U); g.fill(); g.clip();
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(240,236,230,.55)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.globalAlpha = .1; g.globalCompositeOperation = 'multiply'; g.fillStyle = g.createPattern(SPR.paper, 'repeat'); g.fillRect(0, 0, w, h);
  g.restore();
  g.save(); g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 2 * U; roundRect(g, 1, 1, w - 2, h - 2, opt.r ?? 28 * U); g.stroke(); g.restore();
}
function chip(g, x, y, text, col, opt = {}) {   // small label pill; returns its width
  const fs = opt.size || 24 * U; g.save(); g.font = font(fs, 800); const w = g.measureText(text).width + fs * 1.4, h = fs * 1.7;
  g.fillStyle = opt.fill || hexA(col, .14); roundRect(g, x, y - h / 2, w, h, h / 2); g.fill();
  g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'middle'; txt(g, text, x + fs * .7, y + fs * .05); g.restore(); return w;
}
function typeText(t, start, text, cps = 26) { const n = Math.floor(clamp((t - start) * cps, 0, text.length)); return { s: text.slice(0, n), done: n >= text.length, caret: n < text.length }; }

// ------------------------------------------------------------------ scenes
const SCENES = {
  // big serif words typed on paper; a marker sweeps under the key word; the sub line fades in
  title(g, t, b) {
    stage(g, t, b);
    const c = clear(L.card), text = b.text || '', maxW = W * (V ? .84 : .78);
    const f = fitWrap(c, text, maxW, (b.size || (text.length < 16 ? 220 : text.length < 34 ? 168 : 124)) * U, 700, SERIF, V ? 4 : 3);
    const lh = f.size * 1.14, kick = b.kicker ? 90 * U : 0, subH = b.sub ? f.size * .5 + 40 * U : 0;
    let y0 = H / 2 - (f.lines.length * lh + subH + kick) / 2 + kick + lh / 2;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (b.kicker) { c.font = font(36 * U, 800); const kw = c.measureText(b.kicker.toUpperCase()).width + 50 * U; withReveal(c, prog(t, b.start - .1, .4), () => chip(c, W / 2 - kw / 2, y0 - lh / 2 - 40 * U, b.kicker.toUpperCase(), b.color || C.accent, { size: 36 * U })); }
    const typed = typeText(t, b.start - .1, text, b.cps || 24);
    let left = typed.s.length; c.font = font(f.size, 700, SERIF);
    f.lines.forEach((ln, i) => {
      const part = ln.slice(0, Math.max(0, left)), lw = c.measureText(ln).width, x0 = W / 2 - lw / 2, y = y0 + i * lh;
      if (b.mark && ln.includes(b.mark)) {      // marker sweep under the key word once it is typed
        const at = ln.indexOf(b.mark), mx = x0 + c.measureText(ln.slice(0, at)).width, mw = c.measureText(b.mark).width;
        const mk = eOut(prog(t, b.start - .1 + (text.indexOf(b.mark) + b.mark.length) / (b.cps || 24), .35));
        if (mk > 0) { c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = C.yellow; c.beginPath(); c.roundRect(mx - 10 * U, y + f.size * .02, (mw + 20 * U) * mk, f.size * .42, 8 * U); c.fill(); c.restore(); }
      }
      c.fillStyle = b.color2 || C.ink; c.textAlign = 'left'; txt(c, part, x0, y);
      if (typed.caret && left >= 0 && left <= ln.length && Math.floor(t * 2.4) % 2 === 0) { c.fillStyle = C.accent; c.fillRect(x0 + c.measureText(part).width + 4 * U, y - f.size * .42, 5 * U, f.size * .84); }
      left -= ln.length + 1;
    });
    if (b.sub) {
      const k = prog(t, b.start + text.length / (b.cps || 24), .5);
      withReveal(c, k, () => { const s = fitFont(c, b.sub, maxW, Math.max(f.size * .34, 40 * U), 500); c.font = font(s, 500); c.fillStyle = C.mute; c.textAlign = 'center'; txt(c, b.sub, W / 2, y0 + f.lines.length * lh + 6 * U); });
    }
    gl3d(g, G => G.plane(L.card, pose(t, b, { w: W, h: H, ryFrom: -8, ry: -1.5, rxFrom: 4, rx: 1, zFrom: 220, dolly: 80 })));
    foreground(g, t, b);
  },

  // the presenter blurred behind a frosted-glass panel; the sentence comes in word by word and leaves the same way
  async quote(g, t, b) {
    const xf = presenterXf(t, { zoomMul: 1.1 + .04 * prog(t, b.start, b.end - b.start) });
    await drawPresenter(g, t, { xf, blur: 26 * U, dim: .42, noVignette: true });
    vignette(g, .35);
    const c = clear(L.card), text = b.text || '', maxW = W * (V ? .78 : .62);
    const f = fitWrap(c, text, maxW, (b.size || (V ? 92 : 88)) * U, 800, SANS, V ? 4 : 3);
    const lh = f.size * 1.16, padX = 70 * U, padY = 64 * U, kick = b.kicker ? 64 * U : 0;
    c.font = font(f.size, 800); const tw = Math.max(...f.lines.map(l => c.measureText(l).width));
    const pw = tw + padX * 2, ph = f.lines.length * lh + padY * 2 + kick;
    // glass: a brighter, more blurred cut of what is behind, a hairline edge and a sheen
    const gx = (W - pw) / 2, gy = (H - ph) / 2;
    c.save(); roundRect(c, gx, gy, pw, ph, 34 * U); c.clip();
    c.filter = `blur(${18 * U}px) brightness(1.25) saturate(1.2)`; c.drawImage(g.canvas, 0, 0); c.filter = 'none';
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(gx, gy, pw, ph);
    const sh = c.createLinearGradient(gx, gy, gx + pw, gy + ph), sk = prog(t, b.start + .2, 1.4);
    sh.addColorStop(clamp(sk - .2), 'rgba(255,255,255,0)'); sh.addColorStop(clamp(sk), 'rgba(255,255,255,.16)'); sh.addColorStop(clamp(sk + .2), 'rgba(255,255,255,0)'); c.fillStyle = sh; c.fillRect(gx, gy, pw, ph);
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2 * U; roundRect(c, gx + 1, gy + 1, pw - 2, ph - 2, 34 * U); c.stroke();
    if (b.kicker) chip(c, gx + padX, gy + padY + 10 * U, b.kicker.toUpperCase(), '#FFFFFF', { fill: hexA(b.color || C.accent, .9) });
    // words: rise and sharpen one after another; on the way out they drop away in reverse
    const words = text.split(/\s+/), per = Math.min(.09, .9 / words.length); let wi = 0;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    f.lines.forEach((ln, li) => {
      c.font = font(f.size, 800); let x = W / 2 - c.measureText(ln).width / 2; const y = gy + padY + kick + lh * (li + .5);
      for (const w of ln.split(' ')) {
        const ki = eOut(prog(t, b.start + .12 + wi * per, .45)), ko = eIn(prog(t, b.end - .45 + (words.length - wi) * .015, .35));
        const ww = c.measureText(w).width, isMark = b.mark && b.mark.split(' ').includes(w.replace(/[^\w'-]/g, ''));
        if (isMark && ki > .5) { c.save(); c.fillStyle = hexA(C.yellow, .95); roundRect(c, x - 8 * U, y - f.size * .58, (ww + 16 * U) * eOut(prog(t, b.start + .12 + wi * per + .25, .3)), f.size * 1.16, 10 * U); c.fill(); c.restore(); }
        c.save(); c.globalAlpha = clamp(ki * 1.6) * (1 - ko); const bl = (1 - ki) * 10 * U + ko * 8 * U; if (bl > .3) c.filter = `blur(${bl.toFixed(1)}px)`;
        c.translate(0, (1 - ki) * 34 * U + ko * 24 * U); c.fillStyle = isMark ? C.ink : '#FFFFFF';
        if (!isMark) { c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 16 * U; }
        txt(c, w, x, y); c.restore();
        x += ww + c.measureText(' ').width; wi++;
      }
    });
    const ko = eIn(prog(t, b.end - .35, .35));
    gl3d(g, G => G.plane(L.card, pose(t, b, { w: W, h: H, ryFrom: 10, ry: 0, rxFrom: -6, rx: 0, zFrom: 160, dolly: 50, alpha: 1 - ko * .9 })));
  },

  // checklist card: numbered rows; the spoken row lights up, its number turns into a tick; future rows wait blurred
  list(g, t, b) {
    stage(g, t, b);
    const items = b.items || [], cw = V ? W * .9 : Math.min(W * .74, 1420 * U), iSize = (V ? 56 : 54) * U, rowH = iSize * 2.05;
    const head = 170 * U, ch = head + items.length * rowH + 90 * U, c = clear(L.card); cardBase(c, cw, ch);
    const pad = 64 * U, tk = prog(t, b.start - .05, .5);
    // header: badge, title, counter
    const done = items.filter((it, i) => t >= (it.at ?? (b.start + .6 + i * .9))).length;
    if (b.icon) badge(c, pad + 38 * U, head / 2 + 8 * U, 38 * U, b.icon, '#FFF3D6');
    const tx = pad + (b.icon ? 100 * U : 0), cnt = `${done}/${items.length}`;
    c.font = font(30 * U, 800); const cntW = c.measureText(cnt).width + 44 * U;
    withReveal(c, tk, () => {
      const f = fitWrap(c, b.title || '', cw - tx - pad - cntW - 30 * U, 72 * U, 800, SANS, 1); c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle';
      txt(c, f.lines[0], tx, head / 2 + 8 * U);
      if (b.highlight) { const w = c.measureText(f.lines[0]).width; c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = C.yellow; c.fillRect(tx - 8 * U, head / 2 + 8 * U + f.size * .05, (w + 16 * U) * eOut(prog(t, b.start + .3, .4)), f.size * .45); c.restore(); }
    }, 10 * U);
    chip(c, cw - pad - cntW, head / 2 + 8 * U, cnt, C.green, { size: 30 * U });
    c.fillStyle = C.line; c.fillRect(pad, head, cw - pad * 2, 2 * U);
    items.forEach((it, i) => {
      const at = it.at ?? (b.start + .6 + i * .9), k = prog(t, at, .45), y = head + 30 * U + i * rowH + rowH / 2;
      const next = items[i + 1]?.at ?? b.end, active = t >= at && t < next;
      if (active || k > 0) { const ak = active ? eOut(prog(t, at, .35)) : clamp(1 - prog(t, next, .3)); if (ak > 0) { c.save(); c.globalAlpha = ak; c.fillStyle = hexA(it.bad ? C.red : C.yellow, it.bad ? .1 : .22); roundRect(c, pad - 16 * U, y - rowH * .42, (cw - pad * 2 + 32 * U) * eOut(ak), rowH * .84, 16 * U); c.fill(); c.restore(); } }
      const bx = pad + iSize * .55;
      c.save(); c.beginPath(); c.arc(bx, y, iSize * .55, 0, Math.PI * 2);
      if (k > 0) { c.fillStyle = it.bad ? C.red : C.green; c.globalAlpha = eOut(k); c.fill(); c.globalAlpha = 1; drawTick(c, bx, y, iSize * .42, prog(t, at + .05, .3), '#fff', it.bad); }
      else { c.strokeStyle = '#CFCAC2'; c.lineWidth = 3 * U; c.stroke(); c.fillStyle = C.mute; c.font = font(iSize * .55, 800); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), bx, y + 1 * U); }
      c.restore();
      c.save(); c.globalAlpha = lerp(.38, 1, eOut(k)); const bl = (1 - eOut(k)) * 7 * U; if (bl > .3) c.filter = `blur(${bl.toFixed(1)}px)`;
      const f = fitWrap(c, it.text, cw - pad * 2 - iSize * 1.9, iSize, 700, SANS, 1); c.font = font(f.size, 700); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle';
      txt(c, f.lines[0], pad + iSize * 1.6, y); c.restore();
      if (it.note && k > 0) { c.save(); c.globalAlpha = eOut(prog(t, at + .25, .4)); c.font = font(iSize * .58, 700); const nw = c.measureText(it.note).width; chip(c, cw - pad - nw - 30 * U, y, it.note, it.bad ? C.red : C.green, { size: iSize * .5 }); c.restore(); }
    });
    // progress bar along the bottom
    const pk = items.length ? done / items.length : 0; c.fillStyle = '#EEEAE3'; roundRect(c, pad, ch - 52 * U, cw - pad * 2, 12 * U, 6 * U); c.fill();
    c.fillStyle = C.green; roundRect(c, pad, ch - 52 * U, Math.max(12 * U, (cw - pad * 2) * pk), 12 * U, 6 * U); c.fill();
    gl3d(g, G => drawCard(G, L.card, cw, ch, pose(t, b, { ry: -4, rx: 4 })));
    foreground(g, t, b);
  },

  // two cards facing each other. Tone per side: good / bad / neutral (a neutral pair has no ticks or crosses).
  // A column can show a small mock instead of bare lines (mock: short | long | thread | video | carousel | chart).
  compare(g, t, b) {
    stage(g, t, b, { palette: 'cool' });
    const cols = [b.left || {}, b.right || {}], cw = V ? W * .86 : W * .4, iSize = (V ? 50 : 48) * U;
    const tone = ci => cols[ci].tone || (b.right_bad === false || b.neutral ? 'neutral' : ci === 1 ? 'bad' : 'good');
    const col = ci => ({ good: C.green, bad: C.red, neutral: [C.blue, C.chart2][ci] })[tone(ci)];
    const canv = [L.card, L.card2];
    const sizes = cols.map((cc, ci) => {
      const n = (cc.items || []).length, mockH = cc.mock ? 340 * U : 0, ch = 190 * U + mockH + n * iSize * 1.9 + 60 * U;
      const c = clear(canv[ci]); cardBase(c, cw, ch);
      const pad = 54 * U, hk = prog(t, (cc.at ?? b.start + ci * .45), .45);
      c.save(); roundRect(c, 0, 0, cw, ch, 28 * U); c.clip(); c.fillStyle = hexA(col(ci), .12); c.fillRect(0, 0, cw, 150 * U); c.fillStyle = col(ci); c.fillRect(0, 0, cw, 8 * U); c.restore();
      withReveal(c, hk, () => {
        const glyph = cc.icon || (tone(ci) === 'good' ? '✓' : tone(ci) === 'bad' ? '✕' : null);
        if (glyph) { c.save(); c.fillStyle = cc.icon ? '#fff' : col(ci); c.beginPath(); c.arc(pad + 34 * U, 82 * U, 34 * U, 0, Math.PI * 2); c.fill();
          if (cc.icon) { c.fillStyle = C.ink; c.font = font(36 * U, 800); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(cc.icon, pad + 34 * U, 84 * U); } else drawTick(c, pad + 34 * U, 82 * U, 22 * U, 1, '#fff', tone(ci) === 'bad'); c.restore(); }
        const tx = pad + (glyph ? 90 * U : 0), f = fitWrap(c, cc.title || '', cw - tx - pad, 64 * U, 800, SANS, 1);
        c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle'; txt(c, f.lines[0], tx, 84 * U);
      }, 8 * U);
      let y = 190 * U;
      if (cc.mock) { const mk = eOut(prog(t, (cc.at ?? b.start + ci * .45) + .2, .6)); c.save(); c.globalAlpha = mk; mock(c, cc.mock, pad, y - 10 * U, cw - pad * 2, mockH - 30 * U, col(ci), t, mk); c.restore(); y += mockH; }
      (cc.items || []).forEach((it, i) => {
        const at = it.at ?? (b.start + .8 + i * .7 + ci * 1.6), k = prog(t, at, .4), yy = y + i * iSize * 1.9 + iSize * .5;
        c.save(); c.globalAlpha = lerp(.35, 1, eOut(k)); const bl = (1 - eOut(k)) * 6 * U; if (bl > .3) c.filter = `blur(${bl.toFixed(1)}px)`;
        c.fillStyle = col(ci); c.beginPath(); c.arc(pad + 8 * U, yy, 8 * U, 0, Math.PI * 2); c.fill();
        const f = fitWrap(c, it.text, cw - pad * 2 - 34 * U, iSize, 600, SANS, 1); c.font = font(f.size, 600); c.fillStyle = C.ink2; c.textAlign = 'left'; c.textBaseline = 'middle'; txt(c, f.lines[0], pad + 34 * U, yy); c.restore();
      });
      return ch;
    });
    gl3d(g, G => {
      if (V) { drawCard(G, canv[0], cw, sizes[0], pose(t, b, { y: H * .29, ry: -2, rx: 6, seed: 1 })); drawCard(G, canv[1], cw, sizes[1], pose({ ...t } && t, { ...b, start: b.start + .3 }, { y: H * .71, ry: 2, rx: -4, seed: 2 })); }
      else { drawCard(G, canv[0], cw, sizes[0], pose(t, b, { x: W * .29, ryFrom: 30, ry: 9, seed: 1 })); drawCard(G, canv[1], cw, sizes[1], pose(t, { ...b, start: b.start + .3 }, { x: W * .71, ryFrom: -30, ry: -9, seed: 2 })); }
    });
    // VS badge
    const vk = eBack(prog(t, b.start + .5, .4));
    if (vk > 0 && b.vs !== false) { g.save(); g.translate(W / 2, V ? H / 2 : H * .5); g.scale(vk, vk); shadow(g, 30 * U, 10 * U, .25); g.fillStyle = C.ink; g.beginPath(); g.arc(0, 0, 52 * U, 0, Math.PI * 2); g.fill(); noShadow(g);
      g.fillStyle = '#fff'; g.font = font(40 * U, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; txt(g, 'VS', 0, 2 * U); g.restore(); }
    foreground(g, t, b, { palette: 'cool' });
  },

  // a search bar typing over a grid of thumbnails, filmed off a real monitor: perspective, bezel, glare, depth of field
  search(g, t, b) {
    const ui = clear(L.ui);
    ui.fillStyle = '#F4F4F4'; ui.fillRect(0, 0, W, H);
    thumbGrid(ui, t, b);
    const top = ui.createLinearGradient(0, 0, 0, H * .62); top.addColorStop(0, 'rgba(244,244,244,1)'); top.addColorStop(.6, 'rgba(244,244,244,.9)'); top.addColorStop(1, 'rgba(244,244,244,0)');
    ui.fillStyle = top; ui.fillRect(0, 0, W, H * .7);
    // a browser chrome strip
    ui.fillStyle = '#E6E6E6'; ui.fillRect(0, 0, W, 64 * U); ['#FF5F57', '#FEBC2E', '#28C840'].forEach((cc, i) => { ui.fillStyle = cc; ui.beginPath(); ui.arc(36 * U + i * 30 * U, 32 * U, 9 * U, 0, Math.PI * 2); ui.fill(); });
    ui.fillStyle = '#fff'; roundRect(ui, 160 * U, 14 * U, W * .45, 36 * U, 18 * U); ui.fill();
    const bw = V ? W * .86 : W * .62, bh = (V ? 96 : 88) * U, bx = (W - bw) / 2, by = V ? H * .28 : H * .2;
    ui.save(); shadow(ui, 30 * U, 8 * U, .12); ui.fillStyle = '#fff'; roundRect(ui, bx, by, bw, bh, bh / 2); ui.fill(); ui.restore();
    ui.strokeStyle = '#CFCFCF'; ui.lineWidth = 2 * U; roundRect(ui, bx, by, bw, bh, bh / 2); ui.stroke();
    const mx = bx + bh * .55, my = by + bh / 2; ui.strokeStyle = '#555'; ui.lineWidth = 3.4 * U;
    ui.beginPath(); ui.arc(mx, my - 3 * U, bh * .16, 0, Math.PI * 2); ui.stroke(); ui.beginPath(); ui.moveTo(mx + bh * .12, my + bh * .1); ui.lineTo(mx + bh * .24, my + bh * .22); ui.stroke();
    const q = b.query || '', typed = typeText(t, b.start + .3, q, b.cps || 16);
    const fs = fitFont(ui, q, bw - bh * 1.7, (V ? 40 : 38) * U, 500);
    ui.font = font(fs, 500); ui.fillStyle = typed.s ? '#111' : '#9a9a9a'; ui.textBaseline = 'middle'; ui.textAlign = 'left';
    txt(ui, typed.s || 'Search', bx + bh, my);
    if (Math.floor(t * 2.2) % 2 === 0 || typed.caret) { const cw = ui.measureText(typed.s).width; ui.fillStyle = '#111'; ui.fillRect(bx + bh + cw + 3 * U, my - fs * .6, 2.5 * U, fs * 1.2); }
    const sugg = b.suggestions || [];
    if (typed.s.length > 2 && sugg.length) {
      const k = eOut(prog(t, b.start + .3 + 3 / (b.cps || 16), .3)), rowH = (V ? 62 : 56) * U, dh = (sugg.length * rowH + 24 * U) * k;
      ui.save(); shadow(ui, 24 * U, 6 * U, .1); ui.fillStyle = '#fff'; roundRect(ui, bx, by + bh + 10 * U, bw, dh, 18 * U); ui.fill(); ui.restore();
      ui.save(); ui.beginPath(); ui.rect(bx, by + bh + 10 * U, bw, dh); ui.clip();
      sugg.forEach((s, i) => {
        const yy = by + bh + 22 * U + i * rowH + rowH / 2, sf = fitFont(ui, s, bw - bh * 1.4, fs * .88, 500); ui.font = font(sf, 500);
        const pre = s.toLowerCase().startsWith(typed.s.toLowerCase()) ? s.slice(0, typed.s.length) : '';
        ui.fillStyle = '#111'; txt(ui, pre, bx + bh, yy); ui.fillStyle = '#6b6b6b'; txt(ui, s.slice(pre.length), bx + bh + ui.measureText(pre).width, yy);
        ui.strokeStyle = '#999'; ui.lineWidth = 2 * U; ui.beginPath(); ui.arc(bx + bh * .5, yy - 2 * U, 9 * U, 0, Math.PI * 2); ui.stroke();
      });
      ui.restore();
    }
    // the screen itself: subpixel rows, glare
    ui.save(); ui.globalAlpha = .05; for (let y = 0; y < H; y += 3) { ui.fillStyle = '#000'; ui.fillRect(0, y, W, 1); } ui.restore();
    const gl = ui.createLinearGradient(0, 0, W, H); gl.addColorStop(0, 'rgba(255,255,255,.18)'); gl.addColorStop(.35, 'rgba(255,255,255,0)'); gl.addColorStop(.7, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,.08)'); ui.fillStyle = gl; ui.fillRect(0, 0, W, H);
    // a dark room, the monitor in it
    g.fillStyle = '#121214'; g.fillRect(0, 0, W, H);
    const room = g.createRadialGradient(W * .5, H * .45, 0, W * .5, H * .5, W * .8); room.addColorStop(0, 'rgba(90,110,140,.35)'); room.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = room; g.fillRect(0, 0, W, H);
    g.save(); g.globalCompositeOperation = 'screen'; for (let i = 0; i < 6; i++) { const sz = (90 + 120 * hash(i * 7)) * U; g.globalAlpha = .18; g.drawImage(tintSprite(SPR.bokeh, ['#FFB060', '#6FA8FF', '#FF7090'][i % 3]), W * hash(i * 13 + 2) - sz / 2, H * (.1 + .8 * hash(i * 29)) - sz / 2, sz, sz); } g.restore();
    const ki = eOut5(prog(t, b.start - .1, 1.1)), held = prog(t, b.start, b.end - b.start);
    const ry = lerp(-26, b.tilt ?? -13, ki) + noise1(t * .35, 4) * 1.2, rx = lerp(12, 5, ki) + noise1(t * .3, 8) * .8, z = lerp(700, 260, ki) - eIO(held) * 300;
    const sc = .9, mw = W * sc, mh = H * sc;
    gl3d(g, G => {
      const bez = scratch('bezel', 64, 64); { const bg = bez.getContext('2d'); bg.fillStyle = '#1b1c1f'; bg.fillRect(0, 0, 64, 64); }
      G.plane(bez, { w: mw * 1.04, h: mh * 1.06, x: W / 2, y: H / 2, z: z + 8, ry, rx, static: true });
      G.plane(L.ui, { w: mw, h: mh, x: W / 2, y: H / 2, z, ry, rx });
    });
    // screen glow onto the room, then depth of field: the far side of the screen goes soft
    dof(g, b.tilt ?? -13 < 0 ? 'right' : 'left', 6 * U + (1 - ki) * 10 * U);
    vignette(g, .4);
  },

  // analytics: a KPI card (the number counts, the chart draws, a note pins the moment) and small tiles at other depths
  stat(g, t, b) {
    stage(g, t, b, { bg: '#F2F3F5', palette: 'cool', texture: .12 });
    const cw = V ? W * .88 : W * .6, ch = V ? H * .44 : H * .66, c = clear(L.card); cardBase(c, cw, ch, { r: 30 * U });
    const pad = 56 * U, k0 = prog(t, b.start + .05, .5), col = b.color || C.chart;
    withReveal(c, k0, () => { const f = fitWrap(c, b.label || '', cw - pad * 2, 36 * U, 700, SANS, 1); c.font = font(f.size, 700); c.fillStyle = C.mute; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; txt(c, f.lines[0], pad, pad + 30 * U); }, 8 * U);
    const v = Number(b.value) || 0, kc = eOut(prog(t, b.start + .3, b.count ?? 1.4));
    const shown = (b.prefix || '') + fmtNum(v * kc, b.decimals || 0) + (b.suffix || '');
    const ns = fitFont(c, (b.prefix || '') + fmtNum(v, b.decimals || 0) + (b.suffix || ''), cw * .62, (V ? 128 : 124) * U, 800); c.font = font(ns, 800); c.fillStyle = C.ink; txt(c, shown, pad, pad + 40 * U + ns * .95);
    if (b.delta) { const dk = eBack(prog(t, b.start + .3 + (b.count ?? 1.4) * .7, .35)); if (dk > 0) { c.save(); const nw = c.measureText((b.prefix || '') + fmtNum(v, b.decimals || 0) + (b.suffix || '')).width; c.translate(pad + nw + 30 * U, pad + 40 * U + ns * .55); c.scale(dk, dk); chip(c, 0, 0, b.delta, String(b.delta).trim().startsWith('-') ? C.red : C.green, { size: 30 * U }); c.restore(); } }
    // chart with axis labels
    const gx = pad + 50 * U, gy = pad + 80 * U + ns, gw = cw - pad * 2 - 50 * U, gh = ch - gy - pad - 40 * U;
    c.strokeStyle = '#E8E6E2'; c.lineWidth = 2 * U; c.font = font(20 * U, 600); c.fillStyle = '#A9A49C'; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) { const yy = gy + gh * i / 3; c.beginPath(); c.moveTo(gx, yy); c.lineTo(gx + gw, yy); c.stroke(); }
    c.textAlign = 'center'; (b.xlabels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).forEach((l, i, a) => txt(c, l, gx + gw * i / (a.length - 1), gy + gh + 26 * U));
    const pts = chartPoints(b.trend || 'up', 56), kd = eIO(prog(t, b.start + .35, b.draw ?? 1.6)), n = Math.max(2, Math.floor(pts.length * kd));
    c.beginPath(); pts.slice(0, n).forEach(([px, py], i) => { const X = gx + px * gw, Y = gy + gh - py * gh; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.strokeStyle = col; c.lineWidth = 5 * U; c.lineJoin = 'round'; c.stroke();
    c.lineTo(gx + pts[n - 1][0] * gw, gy + gh); c.lineTo(gx, gy + gh); c.closePath();
    const fill = c.createLinearGradient(0, gy, 0, gy + gh); fill.addColorStop(0, hexA(col, .25)); fill.addColorStop(1, hexA(col, 0)); c.fillStyle = fill; c.fill();
    const [lx, ly] = pts[n - 1]; c.save(); c.shadowColor = col; c.shadowBlur = 18 * U; c.fillStyle = col; c.beginPath(); c.arc(gx + lx * gw, gy + gh - ly * gh, 9 * U, 0, Math.PI * 2); c.fill(); c.restore();
    if (b.note) {   // a pin on the chart's peak
      let pi = 0; pts.forEach((p, i) => { if (p[1] > pts[pi][1]) pi = i; });
      const nk = eBack(prog(t, b.start + .35 + (b.draw ?? 1.6) * (pi / pts.length) + .1, .4));
      if (nk > 0 && n > pi) { const X = gx + pts[pi][0] * gw, Y = gy + gh - pts[pi][1] * gh; c.save(); c.translate(X, Y - 24 * U); c.scale(nk, nk);
        c.font = font(26 * U, 800); const nw = c.measureText(b.note).width + 40 * U, nx = clamp(-nw / 2, -X + gx, gx + gw - X - nw);
        shadow(c, 16 * U, 6 * U, .15); c.fillStyle = C.ink; roundRect(c, nx, -64 * U, nw, 50 * U, 14 * U); c.fill(); noShadow(c);
        c.beginPath(); c.moveTo(-10 * U, -15 * U); c.lineTo(10 * U, -15 * U); c.lineTo(0, -2 * U); c.fill();
        c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; txt(c, b.note, nx + 20 * U, -38 * U); c.restore(); }
    }
    const tiles = (b.tiles || []).slice(0, 2), tw = 360 * U, th = 170 * U;
    tiles.forEach((tl, i) => { const tc = clear([L.card2, L.card3][i]); cardBase(tc, tw, th, { r: 24 * U });
      tc.textAlign = 'left'; tc.textBaseline = 'alphabetic'; tc.font = font(24 * U, 700); tc.fillStyle = C.mute; txt(tc, tl.label, 32 * U, 54 * U);
      const vs = fitFont(tc, tl.value, tw - 64 * U, 60 * U, 800); tc.font = font(vs, 800); tc.fillStyle = C.ink; txt(tc, tl.value, 32 * U, 128 * U);
      if (tl.delta) { tc.font = font(24 * U, 800); tc.fillStyle = String(tl.delta).startsWith('-') ? C.red : C.green; tc.textAlign = 'right'; txt(tc, tl.delta, tw - 30 * U, 54 * U); } });
    gl3d(g, G => {
      const main = pose(t, b, { ry: V ? 0 : -6, rx: 4, x: V ? W / 2 : W * .44 });
      tiles.forEach((tl, i) => drawCard(G, [L.card2, L.card3][i], tw, th, pose(t, { ...b, start: b.start + .5 + i * .25 }, V ? { x: W * (i ? .7 : .3), y: H * .82, z: -60, ry: 0, rx: 5, seed: 3 + i } : { x: W * .83, y: H * (i ? .66 : .34), z: -140 + i * 40, ry: -14, rx: 3, seed: 3 + i, zFrom: 600 })));
      drawCard(G, L.card, cw, ch, main);
    });
    foreground(g, t, b, { palette: 'cool' });
  },

  // a whiteboard in perspective: hub with a pulse, curved branches drawing out to coloured pills (icon, small sub line)
  mindmap(g, t, b) {
    stage(g, t, b, { palette: 'cool', bg: '#EEF0F4', texture: .1 });
    const bw = W * 1.0, bh = H * 1.0, c = clear(L.card); cardBase(c, bw, bh, { r: 36 * U, fill: '#FFFFFF' });
    c.save(); c.fillStyle = 'rgba(30,40,60,.08)'; const sp = 40 * U; for (let x = sp; x < bw; x += sp) for (let y = sp; y < bh; y += sp) { c.beginPath(); c.arc(x, y, 2 * U, 0, Math.PI * 2); c.fill(); } c.restore();
    const nodes = b.nodes || [], cx = bw / 2, cy = bh / 2, hubR = (V ? 170 : 160) * U;
    const fs = (V ? 50 : 48) * U, pos = nodes.map((n, i) => {
      const ang = (n.angle ?? (-90 + 360 * i / nodes.length + (nodes.length % 2 ? 0 : 45))) * DEG;
      return [cx + Math.cos(ang) * bw * (V ? .3 : .33), cy + Math.sin(ang) * bh * (V ? .32 : .31)];
    });
    nodes.forEach((n, i) => {
      const at = n.at ?? (b.start + .5 + i * .8), k = prog(t, at, .5); if (k <= 0) return;
      const [nx, ny] = pos[i], lk = eOut(clamp(k * 1.5)), mx = (cx + nx) / 2 + (ny - cy) * .18, my = (cy + ny) / 2 - (nx - cx) * .18;
      const bez = u => [(1 - u) * (1 - u) * cx + 2 * (1 - u) * u * mx + u * u * nx, (1 - u) * (1 - u) * cy + 2 * (1 - u) * u * my + u * u * ny];
      c.strokeStyle = hexA(n.color || C.pills[i % C.pills.length], .9); c.lineWidth = 4 * U; c.lineCap = 'round'; c.beginPath();
      for (let s = 0; s <= 24; s++) { const [x, y] = bez(s / 24 * lk); s ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      const dk = (t * .6 + i * .37) % 1; if (lk >= 1) { const [x, y] = bez(dk); c.fillStyle = n.color || C.pills[i % C.pills.length]; c.beginPath(); c.arc(x, y, 6 * U, 0, Math.PI * 2); c.fill(); }
      const pk = eBack(prog(t, at + .2, .4)); if (pk <= 0) return;
      const f = fitWrap(c, n.text, (V ? bw * .5 : bw * .26), fs, 800, SANS, 2), lines = f.lines;
      c.font = font(f.size, 800); const iw = n.icon ? f.size * 1.5 : 0, tw = Math.max(...lines.map(l => c.measureText(l).width)) + iw, ph = (lines.length * f.size * 1.15) + 44 * U + (n.sub ? 34 * U : 0), pw = tw + 64 * U;
      const px = clamp(nx, pw / 2 + 30 * U, bw - pw / 2 - 30 * U), py = clamp(ny, ph / 2 + 30 * U, bh - ph / 2 - 30 * U);
      c.save(); c.translate(px, py); c.scale(pk, pk); shadow(c, 22 * U, 8 * U, .14);
      c.fillStyle = n.color || C.pills[i % C.pills.length]; roundRect(c, -pw / 2, -ph / 2, pw, ph, Math.min(ph / 2, 40 * U)); c.fill(); noShadow(c);
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; let ty = -ph / 2 + 22 * U + f.size * .58;
      if (n.icon) { c.font = font(f.size * 1.05, 700); c.fillText(n.icon, -pw / 2 + 30 * U, ty); }
      c.font = font(f.size, 800); lines.forEach((l, li) => txt(c, l, -pw / 2 + 32 * U + iw, ty + li * f.size * 1.15));
      if (n.sub) { c.font = font(24 * U, 600); c.fillStyle = 'rgba(255,255,255,.85)'; txt(c, n.sub, -pw / 2 + 32 * U + iw, ph / 2 - 30 * U); }
      c.restore();
    });
    const hk = eBack(prog(t, b.start + .05, .45)), pulse = (t - b.start) % 1.6 / 1.6;
    c.save(); c.translate(cx, cy); c.scale(hk, hk);
    c.strokeStyle = hexA(b.hubColor || C.hub, .35 * (1 - pulse)); c.lineWidth = 6 * U; c.beginPath(); c.arc(0, 0, hubR * (1 + pulse * .5), 0, Math.PI * 2); c.stroke();
    shadow(c, 30 * U, 10 * U, .18); const hg = c.createLinearGradient(0, -hubR, 0, hubR); hg.addColorStop(0, shade(b.hubColor || C.hub, .15)); hg.addColorStop(1, shade(b.hubColor || C.hub, -.12));
    c.fillStyle = hg; c.beginPath(); c.arc(0, 0, hubR, 0, Math.PI * 2); c.fill(); noShadow(c);
    const hf = fitWrap(c, b.center || '', hubR * 1.5, 50 * U, 800, SANS, 3); c.font = font(hf.size, 800); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    hf.lines.forEach((ln, i, a) => txt(c, ln, 0, (i - (a.length - 1) / 2) * hf.size * 1.1)); c.restore();
    gl3d(g, G => drawCard(G, L.card, bw, bh, pose(t, b, { s: .9, rxFrom: 24, rx: 10, ryFrom: -10, ry: -2, dolly: 120, shadow: .22 })));
    foreground(g, t, b, { palette: 'cool' });
  },

  // bar chart: bars grow on their words, values count, one bar can be the hero
  bars(g, t, b) {
    stage(g, t, b, { bg: '#F3F1EC' });
    const bars = b.bars || [], cw = V ? W * .88 : W * .62, ch = V ? H * .5 : H * .72, c = clear(L.card); cardBase(c, cw, ch);
    const pad = 60 * U, max = Math.max(...bars.map(x => x.value), 1);
    withReveal(c, prog(t, b.start, .45), () => { const f = fitWrap(c, b.title || '', cw - pad * 2, 52 * U, 800, SANS, 1); c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle'; txt(c, f.lines[0], pad, pad + 26 * U); });
    const top = pad + 100 * U, gh = ch - top - pad - 70 * U, gw = cw - pad * 2, slot = gw / Math.max(1, bars.length), bw = Math.min(150 * U, slot * .56);
    c.strokeStyle = '#ECE8E2'; c.lineWidth = 2 * U; for (let i = 0; i <= 4; i++) { const y = top + gh * i / 4; c.beginPath(); c.moveTo(pad, y); c.lineTo(pad + gw, y); c.stroke(); }
    bars.forEach((x, i) => {
      const at = x.at ?? (b.start + .4 + i * .35), k = eOut(prog(t, at, .7)), h = gh * x.value / max * k, bx = pad + slot * i + (slot - bw) / 2, hero = b.hero === i || x.hero;
      const col = x.color || (hero ? (b.color || C.accent) : (b.hero !== undefined ? '#C9C4BB' : C.pills[i % C.pills.length]));
      const gr = c.createLinearGradient(0, top + gh - h, 0, top + gh); gr.addColorStop(0, shade(col, .12)); gr.addColorStop(1, shade(col, -.08));
      c.save(); if (hero) { c.shadowColor = hexA(col, .45); c.shadowBlur = 30 * U; } c.fillStyle = gr; roundRect(c, bx, top + gh - h, bw, h, [12 * U, 12 * U, 0, 0]); c.fill(); c.restore();
      if (k > .05) { c.font = font(34 * U, 800); c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; const lab = x.display ?? ((x.prefix ?? b.prefix ?? '') + fmtNum(x.value * k, x.decimals ?? b.decimals ?? 0) + (x.suffix ?? b.suffix ?? '')); c.font = font(fitFont(c, lab, slot * .96, 34 * U, 800), 800); c.globalAlpha = x.display ? clamp(k * 1.5) : 1; txt(c, lab, bx + bw / 2, top + gh - h - 14 * U); c.globalAlpha = 1; }
      const lf = fitWrap(c, x.label, slot * .94, 28 * U, 700, SANS, 2); c.font = font(lf.size, 700); c.fillStyle = hero ? C.ink : C.mute; c.textAlign = 'center'; c.textBaseline = 'top';
      lf.lines.forEach((l, li) => txt(c, l, bx + bw / 2, top + gh + 16 * U + li * lf.size * 1.1));
    });
    gl3d(g, G => drawCard(G, L.card, cw, ch, pose(t, b, { ry: -5, rx: 5 })));
    foreground(g, t, b);
  },

  // donut: segments sweep in, a legend lists them, the centre shows the headline number
  donut(g, t, b) {
    stage(g, t, b, { palette: 'cool' });
    const parts = b.parts || [], cw = V ? W * .88 : W * .62, ch = V ? H * .52 : H * .66, c = clear(L.card); cardBase(c, cw, ch);
    const pad = 60 * U, total = parts.reduce((s, p) => s + p.value, 0) || 1;
    withReveal(c, prog(t, b.start, .45), () => { const f = fitWrap(c, b.title || '', cw - pad * 2, 50 * U, 800, SANS, 1); c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle'; txt(c, f.lines[0], pad, pad + 24 * U); });
    const R = Math.min(ch * .32, cw * (V ? .3 : .2)), ox = V ? cw / 2 : pad + R + 20 * U, oy = V ? pad + 100 * U + R : ch / 2 + 40 * U;
    let a0 = -Math.PI / 2;
    parts.forEach((p, i) => {
      const at = p.at ?? (b.start + .3 + i * .4), k = eOut(prog(t, at, .6)), a1 = a0 + Math.PI * 2 * p.value / total * k, col = p.color || C.pills[i % C.pills.length];
      c.strokeStyle = col; c.lineWidth = R * .42; c.lineCap = 'butt'; c.beginPath(); c.arc(ox, oy, R * .79, a0, a1); c.stroke();
      a0 = a0 + Math.PI * 2 * p.value / total;
      const ly = V ? oy + R + 70 * U + i * 64 * U : oy - (parts.length - 1) * 40 * U + i * 80 * U, lx = V ? pad : ox + R + 90 * U;
      c.save(); c.globalAlpha = clamp(k * 2); c.fillStyle = col; roundRect(c, lx, ly - 14 * U, 28 * U, 28 * U, 8 * U); c.fill();
      const lf = fitWrap(c, p.label, cw - lx - pad - 170 * U, 36 * U, 700, SANS, 1); c.font = font(lf.size, 700); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle'; txt(c, lf.lines[0], lx + 46 * U, ly);
      c.font = font(36 * U, 800); c.textAlign = 'right'; txt(c, Math.round(p.value / total * 100) + '%', cw - pad, ly); c.restore();
    });
    if (b.center) { const ck = prog(t, b.start + .5, .5); withReveal(c, ck, () => { const f = fitWrap(c, b.center, R * 1.1, 64 * U, 800, SANS, 2); c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'middle'; f.lines.forEach((l, i, a) => txt(c, l, ox, oy + (i - (a.length - 1) / 2) * f.size * 1.1)); }); }
    gl3d(g, G => drawCard(G, L.card, cw, ch, pose(t, b, { ry: -5, rx: 5 })));
    foreground(g, t, b, { palette: 'cool' });
  },

  // table: rows land one by one, a column (or a row) is the highlighted answer
  table(g, t, b) {
    stage(g, t, b);
    const cols = b.columns || [], rows = b.rows || [], cw = V ? W * .9 : W * .7, rh = (V ? 92 : 88) * U, head = 120 * U, titleH = b.title ? 110 * U : 30 * U;
    const ch = titleH + head + rows.length * rh + 40 * U, c = clear(L.card); cardBase(c, cw, ch);
    const pad = 50 * U, colW = (cw - pad * 2) / Math.max(1, cols.length);
    if (b.title) withReveal(c, prog(t, b.start, .45), () => { const f = fitWrap(c, b.title, cw - pad * 2, 50 * U, 800, SANS, 1); c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle'; txt(c, f.lines[0], pad, titleH / 2 + 14 * U); });
    if (b.highlightCol !== undefined) { const hk = eOut(prog(t, b.highlightAt ?? b.start + 1, .5)); c.fillStyle = hexA(C.yellow, .28 * hk); roundRect(c, pad + colW * b.highlightCol, titleH + 10 * U, colW, head + rows.length * rh, 18 * U); c.fill(); }
    cols.forEach((h, i) => { c.font = font(30 * U, 800); const f = fitWrap(c, h, colW - 30 * U, 32 * U, 800, SANS, 2); c.font = font(f.size, 800); c.fillStyle = i ? C.ink : C.mute; c.textAlign = i ? 'center' : 'left'; c.textBaseline = 'middle';
      f.lines.forEach((l, li, a) => txt(c, l, i ? pad + colW * (i + .5) : pad + 10 * U, titleH + head / 2 + (li - (a.length - 1) / 2) * f.size * 1.1)); });
    c.fillStyle = C.line; c.fillRect(pad, titleH + head, cw - pad * 2, 2 * U);
    rows.forEach((r, ri) => {
      const cells = Array.isArray(r) ? r : r.cells, at = (Array.isArray(r) ? null : r.at) ?? (b.start + .5 + ri * .5), k = eOut(prog(t, at, .45)), y = titleH + head + ri * rh + rh / 2;
      c.save(); c.globalAlpha = k; c.translate(0, (1 - k) * 20 * U);
      if (ri % 2) { c.fillStyle = 'rgba(0,0,0,.025)'; c.fillRect(pad, y - rh / 2, cw - pad * 2, rh); }
      cells.forEach((cell, i) => {
        const x = i ? pad + colW * (i + .5) : pad + 10 * U, s = String(cell);
        if (s === '✓' || s === '✗' || s === '✕') { drawTick(c, x, y, 20 * U, prog(t, at + .1 + i * .06, .3), s === '✓' ? C.green : C.red, s !== '✓'); return; }
        const f = fitWrap(c, s, colW - 30 * U, (i ? 34 : 32) * U, i ? 700 : 700, SANS, 1); c.font = font(f.size, i ? 700 : 700); c.fillStyle = i ? C.ink : C.ink2; c.textAlign = i ? 'center' : 'left'; c.textBaseline = 'middle'; txt(c, f.lines[0], x, y);
      });
      c.restore();
    });
    gl3d(g, G => drawCard(G, L.card, cw, ch, pose(t, b, { ry: -4, rx: 6 })));
    foreground(g, t, b);
  },

  // roadmap: a path with stops; the progress line runs to the stop being named and the camera tracks along it
  roadmap(g, t, b) {
    stage(g, t, b, { palette: 'warm' });
    const steps = b.steps || [], n = steps.length, sp = (V ? 420 : 520) * U, bw = Math.max(W, sp * (n - 1) + 700 * U), bh = H * .78, c = clear(L.card);
    const y = bh * .5, x0 = 350 * U, xs = steps.map((s, i) => x0 + i * sp);
    if (b.title) withReveal(c, prog(t, b.start, .45), () => { const f = fitWrap(c, b.title, W * .7, 56 * U, 800, SANS, 1); c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle'; txt(c, f.lines[0], x0 - 60 * U, 80 * U); });
    const cur = steps.reduce((a, s, i) => t >= (s.at ?? (b.start + .5 + i * 1)) ? i : a, -1);
    const lineK = cur < 0 ? 0 : cur + eOut(prog(t, steps[cur].at ?? (b.start + .5 + cur), .6)) - 1;
    c.strokeStyle = '#DDD7CE'; c.lineWidth = 10 * U; c.lineCap = 'round'; c.setLineDash([2 * U, 22 * U]); c.beginPath(); c.moveTo(xs[0], y); c.lineTo(xs[n - 1], y); c.stroke(); c.setLineDash([]);
    if (lineK > 0) { c.strokeStyle = b.color || C.accent; c.beginPath(); c.moveTo(xs[0], y); c.lineTo(lerp(xs[0], xs[n - 1], lineK / Math.max(1, n - 1)), y); c.stroke(); }
    steps.forEach((s, i) => {
      const at = s.at ?? (b.start + .5 + i * 1), k = prog(t, at, .45), on = k > 0, x = xs[i], active = i === cur;
      const r = (active ? 54 : 44) * U * (on ? lerp(.85, 1, eBack(k)) : .85);
      c.save(); shadow(c, 20 * U, 8 * U, on ? .18 : .06); c.fillStyle = on ? (s.color || (active ? (b.color || C.accent) : C.ink)) : '#fff'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); noShadow(c);
      if (!on) { c.strokeStyle = '#D5CFC6'; c.lineWidth = 4 * U; c.stroke(); }
      c.font = font(r * .8, 800); c.fillStyle = on ? '#fff' : C.mute; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s.icon || String(i + 1), x, y + 2 * U);
      if (active) { const pl = ((t - at) % 1.4) / 1.4; c.strokeStyle = hexA(b.color || C.accent, .4 * (1 - pl)); c.lineWidth = 5 * U; c.beginPath(); c.arc(x, y, r * (1 + pl * .7), 0, Math.PI * 2); c.stroke(); }
      c.restore();
      c.save(); c.globalAlpha = lerp(.4, 1, eOut(k)); const bl = (1 - eOut(k)) * 6 * U; if (bl > .3) c.filter = `blur(${bl.toFixed(1)}px)`;
      const up = i % 2 === 0, f = fitWrap(c, s.text, sp * .9, 40 * U, 800, SANS, 2); c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
      const ty = up ? y - 100 * U - (f.lines.length - 1) * f.size * 1.1 : y + 100 * U;
      f.lines.forEach((l, li) => txt(c, l, x, ty + li * f.size * 1.1));
      if (s.label) { c.font = font(26 * U, 700); c.fillStyle = C.mute; txt(c, s.label, x, up ? ty - 50 * U : ty + f.lines.length * f.size * 1.1 + 14 * U); }
      c.restore();
    });
    // the camera keeps the current stop near the middle
    const focus = cur < 0 ? xs[0] : lerp(xs[Math.max(0, cur - 1)], xs[cur], eIO(prog(t, steps[cur].at ?? b.start, .8)));
    const off = clamp(focus - W / 2, 0, Math.max(0, bw - W));
    gl3d(g, G => G.plane(L.card, pose(t, b, { w: bw, h: bh, src: [0, 0, bw / L.card.width, bh / L.card.height], x: W / 2 + (bw / 2 - W / 2) - off, y: H / 2, ryFrom: -20, ry: -8, rxFrom: 16, rx: 10, dolly: 60 })));
    foreground(g, t, b);
  },

  // stock or user photos: one fills the frame with a slow move; two or three float as prints at different depths
  async photo(g, t, b) {
    const srcs = (b.srcs || [b.src]).filter(s => IMG[s]);
    if (!srcs.length) { stage(g, t, b); return; }
    const p = prog(t, b.start - .3, b.end - b.start + .6), main = IMG[srcs[0]];
    if (srcs.length === 1 && b.frame !== true) {
      const s0 = Math.max(W / main.width, H / main.height) * 1.12, s = s0 * lerp(b.zoomFrom ?? 1.0, b.zoomTo ?? 1.08, eIO(p));
      const dx = lerp(-1, 1, eIO(p)) * (b.pan ?? 30) * U, w = main.width * s, h = main.height * s;
      g.save(); g.filter = 'contrast(1.05) saturate(1.06)'; g.drawImage(main, W / 2 - w / 2 + dx, H / 2 - h / 2 + (b.panY || 0) * U, w, h); g.restore();
      vignette(g, .32);
    } else {
      const s0 = Math.max(W / main.width, H / main.height) * 1.15;
      g.save(); g.filter = `blur(${30 * U}px) brightness(.55) saturate(1.2)`; g.drawImage(main, W / 2 - main.width * s0 / 2, H / 2 - main.height * s0 / 2, main.width * s0, main.height * s0); g.restore();
      gl3d(g, G => srcs.forEach((s, i) => {
        const im = IMG[s], n = srcs.length, mh = H * (n === 1 ? .7 : .52), mw = Math.min(im.width / im.height * mh, W * (n === 1 ? .8 : .42)), hh = mw / (im.width / im.height);
        const fr = scratch('print' + i, mw + 24 * U, hh + 24 * U), fg = fr.getContext('2d'); fg.clearRect(0, 0, fr.width, fr.height);
        fg.fillStyle = '#fff'; roundRect(fg, 0, 0, fr.width, fr.height, 14 * U); fg.fill(); fg.save(); roundRect(fg, 12 * U, 12 * U, mw, hh, 8 * U); fg.clip(); fg.drawImage(im, 12 * U, 12 * U, mw, hh); fg.restore();
        const xs = n === 1 ? [.5] : n === 2 ? [.3, .7] : [.22, .5, .78], rz = n === 1 ? [-1.5] : [-4, 3, -2];
        drawCard(G, fr, fr.width, fr.height, pose(t, { ...b, start: b.start + i * .3 }, { x: W * xs[i], y: H * (.5 + (i % 2 ? .04 : -.03)), rz: rz[i], z: -i * 40, ry: n === 1 ? -4 : (i - (n - 1) / 2) * -6, rx: 4, seed: i + 1, shadow: .45 }));
      }));
    }
    if (b.caption) {
      const k = eOut(prog(t, b.start + .3, .45)), ko = eIn(prog(t, b.end - .4, .4));
      g.save(); g.globalAlpha = k * (1 - ko); g.translate((1 - k) * -40 * U, 0); g.font = font(40 * U, 800); const cw = g.measureText(b.caption).width + 56 * U, cx = 70 * U, cy = H - 120 * U;
      shadow(g, 30 * U, 10 * U, .35); g.fillStyle = 'rgba(255,255,255,.94)'; roundRect(g, cx, cy - 36 * U, cw, 72 * U, 18 * U); g.fill(); noShadow(g);
      g.fillStyle = C.accent; g.fillRect(cx, cy - 36 * U, 8 * U, 72 * U); g.fillStyle = C.ink; g.textAlign = 'left'; g.textBaseline = 'middle'; txt(g, b.caption, cx + 30 * U, cy + 2 * U); g.restore();
    }
  },

  // a stock clip (image sequence made by fetch_stock.py) with a slow push; framed in 3D with `frame: true`
  async video(g, t, b) {
    const im = await seqFrame(b.src, t - b.start + (b.offset || 0)); if (!im) { stage(g, t, b); return; }
    const p = prog(t, b.start, b.end - b.start);
    if (!b.frame) {
      const s = Math.max(W / im.width, H / im.height) * lerp(1.02, 1.1, eIO(p)), w = im.width * s, h = im.height * s;
      g.save(); g.filter = 'contrast(1.06) saturate(1.05)'; g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); g.restore(); vignette(g, .3);
    } else {
      stage(g, t, b, { dark: true }); const mw = W * .72, mh = mw * im.height / im.width;
      const fr = scratch('vframe', mw, mh), fg = fr.getContext('2d'); fg.save(); fg.clearRect(0, 0, mw, mh); roundRect(fg, 0, 0, mw, mh, 22 * U); fg.clip(); fg.drawImage(im, 0, 0, mw, mh); fg.restore();
      gl3d(g, G => drawCard(G, fr, mw, mh, pose(t, b, { ry: -8, rx: 4, shadow: .6 })));
    }
    if (b.caption) SCENES.photo.caption?.(g, t, b);
  },

  // the user's own screenshot on the stage, as a card in 3D
  async image(g, t, b) {
    const im = IMG[b.src]; if (!im) { stage(g, t, b); return; }
    if (b.backdrop === 'presenter') { await drawPresenter(g, t, { blur: 26 * U, dim: .3, zoomMul: 1.1, noVignette: true }); } else stage(g, t, b);
    const maxW = W * (V ? .88 : .72), maxH = H * (V ? .6 : (b.caption ? .64 : .74)), s = Math.min(maxW / im.width, maxH / im.height);
    const w = im.width * s, h = im.height * s, fr = scratch('shot', w, h), fg = fr.getContext('2d');
    fg.save(); fg.clearRect(0, 0, w, h); roundRect(fg, 0, 0, w, h, 18 * U); fg.clip(); fg.drawImage(im, 0, 0, w, h); fg.restore();
    gl3d(g, G => drawCard(G, fr, w, h, pose(t, b, { y: H / 2 - (b.caption ? 40 * U : 0), ry: -6, rx: 4, shadow: .4 })));
    if (b.caption) withReveal(g, prog(t, b.start + .35, .4), () => { const f = fitWrap(g, b.caption, W * .8, (V ? 46 : 42) * U, 700, SANS, 1); g.font = font(f.size, 700); g.fillStyle = b.backdrop === 'presenter' ? '#fff' : C.ink; g.textAlign = 'center'; g.textBaseline = 'middle'; txt(g, f.lines[0], W / 2, H / 2 + h / 2 + 30 * U); });
  },

  // end screen: the last frame blurred, thanks + channel, two "watch next" slots (YouTube fills them), Subscribe
  async endscreen(g, t, b) {
    const tl = Math.min(t, SPEECH_END - .05);
    await drawPresenter(g, tl, { blur: 30 * U, dim: .5, zoomMul: 1.15 + .05 * prog(t, b.start, b.end - b.start), noVignette: true });
    g.save(); g.globalCompositeOperation = 'screen'; for (let i = 0; i < 5; i++) { const sz = (200 + 200 * hash(i * 5)) * U; g.globalAlpha = .16; g.drawImage(tintSprite(SPR.bokeh, PALETTES.dark[i % 4]), W * hash(i * 11 + 4) - sz / 2 + noise1(t * .2, i) * 60 * U, H * hash(i * 23 + 1) - sz / 2, sz, sz); } g.restore();
    vignette(g, .4);
    const k = eOut(prog(t, b.start + .1, .6));
    withReveal(g, k, () => {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24 * U;
      const f = fitWrap(g, b.text || 'Thanks for watching', W * .8, (V ? 84 : 76) * U, 800, SANS, 2); g.font = font(f.size, 800);
      f.lines.forEach((l, i) => txt(g, l, W / 2, H * (V ? .2 : .2) + i * f.size * 1.1));
      if (b.channel) { g.font = font(36 * U, 700); g.fillStyle = 'rgba(255,255,255,.8)'; txt(g, b.channel, W / 2, H * .2 + f.lines.length * f.size * 1.1 + 10 * U); }
    }, 16 * U);
    if (b.slots !== false) {
      const sw = V ? W * .78 : W * .3, sh = sw * 9 / 16, ys = V ? [H * .45, H * .66] : [H * .55, H * .55], xs = V ? [W / 2, W / 2] : [W * .3, W * .7];
      [0, 1].forEach(i => { const sk = eOut(prog(t, b.start + .35 + i * .15, .5)); g.save(); g.globalAlpha = sk; g.translate(xs[i], ys[i] + (1 - sk) * 40 * U);
        g.fillStyle = 'rgba(255,255,255,.08)'; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3 * U; roundRect(g, -sw / 2, -sh / 2, sw, sh, 20 * U); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.moveTo(-18 * U, -26 * U); g.lineTo(26 * U, 0); g.lineTo(-18 * U, 26 * U); g.closePath(); g.fill();
        g.font = font(28 * U, 700); g.textAlign = 'center'; g.fillText(i ? 'Watch next' : 'Recommended', 0, sh / 2 + 36 * U); g.restore(); });
    }
    OVER.subscribe(g, t, { ...b, start: b.start + .8, end: b.end + 1, y: V ? .85 : .86 });
  },
};
SCENES.quote.async = SCENES.photo.async = SCENES.video.async = SCENES.image.async = SCENES.endscreen.async = true;

// a mock of a post or a format for compare columns: abstract shapes, no real brand
function mock(g, kind, x, y, w, h, col, t, k) {
  g.save(); g.fillStyle = '#F6F4F0'; roundRect(g, x, y, w, h, 18 * U); g.fill();
  const line = (lx, ly, lw, lh = 14 * U, c = '#D9D4CC') => { g.fillStyle = c; roundRect(g, lx, ly, lw, lh, lh / 2); g.fill(); };
  const av = (ax, ay) => { g.fillStyle = hexA(col, .55); g.beginPath(); g.arc(ax, ay, 20 * U, 0, Math.PI * 2); g.fill(); line(ax + 34 * U, ay - 10 * U, 140 * U, 12 * U, '#BDB6AC'); line(ax + 34 * U, ay + 8 * U, 90 * U, 10 * U); };
  const p = 26 * U;
  if (kind === 'short') { av(x + p + 20 * U, y + p + 20 * U); line(x + p, y + p + 70 * U, w * .8); line(x + p, y + p + 96 * U, w * .55); g.fillStyle = hexA(col, .9); [0, 1, 2].forEach(i => { g.beginPath(); g.arc(x + p + 14 * U + i * 70 * U, y + h - p - 6 * U, 9 * U, 0, Math.PI * 2); g.fill(); }); }
  else if (kind === 'long') { av(x + p + 20 * U, y + p + 20 * U); for (let i = 0; i < 6; i++) line(x + p, y + p + 70 * U + i * 26 * U, w * (i === 5 ? .45 : .86 - (i % 2) * .08)); }
  else if (kind === 'thread') { for (let j = 0; j < 3; j++) { const yy = y + p + j * (h - p * 2) / 3; g.fillStyle = hexA(col, .5); g.beginPath(); g.arc(x + p + 16 * U, yy + 16 * U, 14 * U, 0, Math.PI * 2); g.fill(); line(x + p + 44 * U, yy + 6 * U, w * .6); line(x + p + 44 * U, yy + 30 * U, w * .4); if (j < 2) { g.fillStyle = '#D9D4CC'; g.fillRect(x + p + 15 * U, yy + 34 * U, 2 * U, (h - p * 2) / 3 - 20 * U); } } }
  else if (kind === 'video') { const vh = h - p * 2, vw = Math.min(w - p * 2, vh * .62); g.fillStyle = shade(col, -.2); roundRect(g, x + (w - vw) / 2, y + p, vw, vh, 14 * U); g.fill(); g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); const cx = x + w / 2, cy = y + h / 2; g.moveTo(cx - 16 * U, cy - 22 * U); g.lineTo(cx + 22 * U, cy); g.lineTo(cx - 16 * U, cy + 22 * U); g.fill(); }
  else if (kind === 'carousel') { for (let i = 0; i < 3; i++) { const cw = (w - p * 2) * .42, cx = x + p + i * cw * .62 + (1 - k) * i * 40 * U; g.save(); shadow(g, 14 * U, 4 * U, .12); g.fillStyle = [hexA(col, .9), '#fff', hexA(col, .5)][i]; roundRect(g, cx, y + p, cw, h - p * 2, 14 * U); g.fill(); g.restore(); } }
  else if (kind === 'chart') { const n = 6; for (let i = 0; i < n; i++) { const bh = (h - p * 2) * (.3 + .7 * hash(i * 5 + 1)) * k; g.fillStyle = i === n - 1 ? col : hexA(col, .35); roundRect(g, x + p + i * (w - p * 2) / n, y + h - p - bh, (w - p * 2) / n * .6, bh, 6 * U); g.fill(); } }
  g.restore();
}
function chartPoints(kind, n) {
  const pts = [];
  for (let i = 0; i < n; i++) { const x = i / (n - 1); let y;
    if (kind === 'up') y = .08 + .82 * Math.pow(x, 1.6) + noise1(i * .9, 5) * .03;
    else if (kind === 'down') y = .9 - .78 * Math.pow(x, .8) + noise1(i * .9, 5) * .03;
    else if (kind === 'spike') y = .12 + .05 * noise1(i * 1.3, 9) + .75 * Math.exp(-Math.pow((x - .62) * 9, 2));
    else if (kind === 'steady') y = .15 + .5 * x + noise1(i * 1.1, 7) * .04;
    else y = .35 + .04 * noise1(i * 1.1, 3);
    pts.push([x, clamp(y)]); }
  return pts;
}
// abstract thumbnails behind the search bar (no real people, no real brands)
let THUMBS = null;
function thumbGrid(g) { if (!THUMBS) { THUMBS = layer(); drawThumbs(THUMBS.getContext('2d')); } g.drawImage(THUMBS, 0, 0); }
function drawThumbs(g) {
  const cols = V ? 2 : 4, tw = (V ? W * .44 : W * .23), th = tw * 9 / 16, gap = 28 * U, x0 = (W - (cols * tw + (cols - 1) * gap)) / 2;
  for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, x = x0 + c * (tw + gap), y = H * (V ? .5 : .45) + r * (th + 80 * U) - 40 * U;
    const h1 = Math.floor(hash(i * 31 + 7) * 360), h2 = (h1 + 40 + Math.floor(hash(i * 17) * 80)) % 360;
    const gr = g.createLinearGradient(x, y, x + tw, y + th); gr.addColorStop(0, `hsl(${h1},70%,60%)`); gr.addColorStop(1, `hsl(${h2},75%,42%)`);
    g.save(); g.fillStyle = gr; roundRect(g, x, y, tw, th, 14 * U); g.fill();
    g.fillStyle = 'rgba(255,255,255,.88)'; g.font = font(th * .2, 800); g.textBaseline = 'top'; g.fillText(['IDEA', 'HOW TO', '10X', 'WHY?', 'NEW', 'TOP 5', 'DON\'T', '$1M'][i % 8], x + 18 * U, y + th * .55);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(x + tw * .75, y + th * .52, th * .32, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.7)'; roundRect(g, x + tw - 74 * U, y + th - 36 * U, 62 * U, 26 * U, 6 * U); g.fill();
    g.fillStyle = '#c9c9c9'; roundRect(g, x, y + th + 16 * U, tw * .85, 16 * U, 8 * U); g.fill(); roundRect(g, x, y + th + 42 * U, tw * .5, 13 * U, 6 * U); g.fill();
    g.restore();
  }
}
// depth of field: one side of the frame goes soft (a blurred copy faded in by a gradient)
function dof(g, side, px) {
  if (px < .5) return;
  const t2 = clear(L.fx); t2.filter = `blur(${px.toFixed(1)}px)`; t2.drawImage(g.canvas, 0, 0); t2.filter = 'none';
  t2.globalCompositeOperation = 'destination-in';
  const gr = t2.createLinearGradient(side === 'right' ? W * .35 : W * .65, 0, side === 'right' ? W : 0, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  t2.fillStyle = gr; t2.fillRect(0, 0, W, H);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(L.fx, 0, 0); g.restore();
}
