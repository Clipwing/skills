// talking-head-auto-edit engine, part 3: full-screen scenes. Every card is drawn flat into a layer, then placed on a
// clean white stage with a soft shadow. Cards stand square to the camera (no tilt): they settle in, the camera pushes
// in slowly while they hold, and the transitions carry them out.
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
// the stage: plain white (or the brand's paper colour). No gradients, no blurred shapes, no vignette: the editors'
// rule is a clean background that never competes with the card.
function stage(g, t, b, opt = {}) {
  g.fillStyle = opt.bg || b.bg || C.paper; g.fillRect(0, 0, W, H);
}
function foreground() {}
// how a card stands at time t: square to the camera; it rises a little and settles, then the camera pushes in slowly
function pose(t, b, o = {}) {
  const ki = eOut5(prog(t, b.start - .12, o.inDur ?? .7)), held = prog(t, b.start, b.end - b.start);
  return {
    ...o, rx: 0, ry: 0, rz: 0,
    z: lerp(o.zFrom ?? 110, o.z ?? 0, ki) - eIO(held) * (o.dolly ?? 70),
    x: o.x ?? W / 2, y: (o.y ?? H / 2) + (1 - ki) * 26 * U,
    alpha: (o.alpha ?? 1) * clamp(ki * 3),
  };
}
let SHADOW = null;
function shadowSprite() {
  if (SHADOW) return SHADOW;
  SHADOW = layer(640, 440); const g = SHADOW.getContext('2d'); g.filter = 'blur(34px)'; g.fillStyle = '#000'; roundRect(g, 90, 90, 460, 260, 40); g.fill();
  return SHADOW;
}
// a card layer (w x h at the top-left of `src`) with a soft shadow under it
function drawCard(G, src, w, h, p) {
  const sp = shadowSprite();
  G.plane(sp, { ...p, w: w * 1.39, h: h * 1.69, y: p.y + 22 * U, z: p.z + 10, alpha: (p.alpha ?? 1) * (p.shadow ?? .16), static: true, tint: undefined });
  return G.plane(src, { ...p, w, h, src: [0, 0, w / src.width, h / src.height] });
}
function cardBase(g, w, h, opt = {}) {
  g.save(); g.fillStyle = opt.fill || '#FFFFFF'; roundRect(g, 0, 0, w, h, opt.r ?? 28 * U); g.fill(); g.restore();
  g.save(); g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2 * U; roundRect(g, 1, 1, w - 2, h - 2, opt.r ?? 28 * U); g.stroke(); g.restore();
}
function chip(g, x, y, text, col, opt = {}) {   // small label pill; returns its width
  const fs = opt.size || 30 * U; g.save(); g.font = font(fs, 800); const w = g.measureText(text).width + fs * 1.4, h = fs * 1.7;
  g.fillStyle = opt.fill || hexA(col, .14); roundRect(g, x, y - h / 2, w, h, h / 2); g.fill();
  g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; txt(g, text, x + fs * .7, midBase(g, y)); g.restore(); return w;
}
function typeText(t, start, text, cps = 26) { const n = Math.floor(clamp((t - start) * cps, 0, text.length)); return { s: text.slice(0, n), done: n >= text.length, caret: n < text.length }; }

// ------------------------------------------------------------------ scenes
const SCENES = {
  // a big serif headline typed on white; the kicker lands a few frames before the words; a marker sweeps under the key word
  title(g, t, b) {
    stage(g, t, b);
    const c = clear(L.card), text = b.text || '', maxW = W * (V ? .84 : .76), cps = b.cps || 30;
    const f = fitWrap(c, text, maxW, (b.size || (text.length < 16 ? 190 : text.length < 34 ? 150 : 118)) * U, 700, SERIF, V ? 4 : 3);
    const lh = f.size * 1.16, kick = b.kicker ? 120 * U : 0, subH = b.sub ? f.size * .5 + 40 * U : 0;
    const y0 = H / 2 - (f.lines.length * lh + subH + kick) / 2 + kick + lh / 2, t0 = b.start + .14;   // ~3-4 frames after the kicker
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (b.kicker) { c.font = font(44 * U, 800); const kw = c.measureText(b.kicker.toUpperCase()).width + 44 * U * 1.4; withReveal(c, prog(t, b.start - .02, .35), () => chip(c, W / 2 - kw / 2, y0 - lh / 2 - 60 * U, b.kicker.toUpperCase(), b.color || C.accent, { size: 44 * U }), 8 * U); }
    const typed = typeText(t, t0, text, cps);
    let left = typed.s.length; c.font = font(f.size, 700, SERIF);
    f.lines.forEach((ln, i) => {
      const part = ln.slice(0, Math.max(0, left)), lw = c.measureText(ln).width, x0 = W / 2 - lw / 2, y = y0 + i * lh;
      if (b.mark && ln.includes(b.mark)) {      // marker sweep under the key word once it is typed
        const at = ln.indexOf(b.mark), mx = x0 + c.measureText(ln.slice(0, at)).width, mw = c.measureText(b.mark).width;
        const mk = eIO(prog(t, t0 + (text.indexOf(b.mark) + b.mark.length) / cps, .4));
        if (mk > 0) { c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = C.yellow; c.beginPath(); c.roundRect(mx - 10 * U, y + f.size * .04, (mw + 20 * U) * mk, f.size * .4, 8 * U); c.fill(); c.restore(); }
      }
      c.fillStyle = b.color2 || C.ink; c.textAlign = 'left'; txt(c, part, x0, y);
      if (typed.caret && left >= 0 && left <= ln.length) { c.fillStyle = C.accent; c.fillRect(x0 + c.measureText(part).width + 6 * U, y - f.size * .42, 5 * U, f.size * .84); }
      left -= ln.length + 1;
    });
    if (b.sub) {
      const k = prog(t, t0 + text.length / cps, .5);
      withReveal(c, k, () => { const s = fitFont(c, b.sub, maxW, Math.max(f.size * .32, 40 * U), 500); c.font = font(s, 500); c.fillStyle = C.mute; c.textAlign = 'center'; txt(c, b.sub, W / 2, y0 + f.lines.length * lh + 6 * U); });
    }
    gl3d(g, G => G.plane(L.card, pose(t, b, { w: W, h: H, zFrom: 60, dolly: 60 })));
  },

  // one sentence, big and heavy on white; every word lands on the moment it is spoken; the key word gets a marker
  quote(g, t, b) {
    stage(g, t, b);
    const c = clear(L.card), text = b.text || '', maxW = W * (V ? .84 : .72);
    const f = fitWrap(c, text, maxW, (b.size || (V ? 96 : 104)) * U, 800, SANS, V ? 4 : 3);
    const lh = f.size * 1.2, kick = b.kicker ? 90 * U : 0, y0 = H / 2 - (f.lines.length * lh + kick) / 2 + kick + lh / 2;
    if (b.kicker) { c.font = font(32 * U, 800); const kw = c.measureText(b.kicker.toUpperCase()).width + 32 * U * 1.4; withReveal(c, prog(t, b.start - .02, .35), () => chip(c, W / 2 - kw / 2, y0 - lh / 2 - 44 * U, b.kicker.toUpperCase(), b.color || C.accent, { size: 32 * U }), 8 * U); }
    const words = text.split(/\s+/), spoken = spokenTimes(text, b.start - .6, b.end), per = Math.min(.12, 1.2 / words.length);
    let wi = 0, last = b.start;
    const marks = String(b.mark || '').toLowerCase().split(/\s+/).filter(Boolean);
    f.lines.forEach((ln, li) => {
      c.font = font(f.size, 800); let x = W / 2 - c.measureText(ln).width / 2; const y = y0 + lh * li;
      for (const w of ln.split(' ')) {
        const at = Math.max(b.start + .1, (spoken[wi] ?? (last + per)) - .08); last = at;
        const ki = eOut(prog(t, at, .32)), ww = c.measureText(w).width, isMark = marks.includes(w.toLowerCase().replace(/[^a-z0-9'-]/g, ''));
        if (isMark && ki > 0) { const mk = eIO(prog(t, at + .18, .35)); c.save(); c.fillStyle = C.yellow; roundRect(c, x - 10 * U, y - f.size * .6, (ww + 20 * U) * mk, f.size * 1.2, 12 * U); c.fill(); c.restore(); }
        c.save(); c.globalAlpha = clamp(ki * 1.6); const bl = (1 - ki) * 10 * U; if (bl > .3) c.filter = `blur(${bl.toFixed(1)}px)`;
        c.translate(0, (1 - ki) * 26 * U); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle'; txt(c, w, x, y); c.restore();
        x += ww + c.measureText(' ').width; wi++;
      }
    });
    gl3d(g, G => G.plane(L.card, pose(t, b, { w: W, h: H, zFrom: 60, dolly: 50 })));
  },

  // checklist card: numbered rows; the spoken row lights up, its number turns into a tick; future rows wait, well blurred
  list(g, t, b) {
    stage(g, t, b);
    const items = b.items || [], cw = V ? W * .9 : Math.min(W * .74, 1420 * U), iSize = (V ? 56 : 54) * U, rowH = iSize * 2.05;
    const head = 170 * U, ch = head + items.length * rowH + 90 * U, c = clear(L.card); cardBase(c, cw, ch);
    const pad = 64 * U, tk = prog(t, b.start - .05, .5), hy = head / 2 + 8 * U, at = (it, i) => it.at ?? (b.start + .6 + i * .9);
    // header: badge, title, counter, all on one line (centred on the capital height, not the font box)
    const done = items.filter((it, i) => t >= at(it, i)).length;
    if (b.icon) badge(c, pad + 38 * U, hy, 38 * U, b.icon, '#FFF3D6');
    const tx = pad + (b.icon ? 100 * U : 0), cnt = `${done}/${items.length}`;
    c.font = font(30 * U, 800); const cntW = c.measureText(cnt).width + 30 * U * 1.4;
    withReveal(c, tk, () => {
      const f = fitWrap(c, b.title || '', cw - tx - pad - cntW - 30 * U, 72 * U, 800, SANS, 1); c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      const by = midBase(c, hy);
      if (b.highlight) { const w = c.measureText(f.lines[0]).width; c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = C.yellow; c.fillRect(tx - 8 * U, by - f.size * .3, (w + 16 * U) * eIO(prog(t, b.start + .3, .4)), f.size * .4); c.restore(); }
      txt(c, f.lines[0], tx, by);
    }, 10 * U);
    chip(c, cw - pad - cntW, hy, cnt, C.green, { size: 30 * U });
    c.fillStyle = C.line; c.fillRect(pad, head, cw - pad * 2, 2 * U);
    items.forEach((it, i) => {
      const a = at(it, i), k = prog(t, a - .1, .4), y = head + 30 * U + i * rowH + rowH / 2;
      const next = items[i + 1] ? at(items[i + 1], i + 1) : b.end, active = t >= a - .1 && t < next - .1;
      if (active || k > 0) { const ak = active ? eOut(prog(t, a - .1, .35)) : clamp(1 - prog(t, next - .1, .3)); if (ak > 0) { c.save(); c.globalAlpha = ak; c.fillStyle = hexA(it.bad ? C.red : C.yellow, it.bad ? .1 : .22); roundRect(c, pad - 16 * U, y - rowH * .42, (cw - pad * 2 + 32 * U) * eOut(ak), rowH * .84, 16 * U); c.fill(); c.restore(); } }
      const bx = pad + iSize * .55, br = iSize * .55;
      c.save(); c.beginPath(); c.arc(bx, y, br, 0, Math.PI * 2);
      if (k > 0) { c.fillStyle = it.bad ? C.red : C.green; c.globalAlpha = eOut(k); c.fill(); c.globalAlpha = 1; drawTick(c, bx, y, br * .5, prog(t, a - .05, .3), '#fff', it.bad); }
      else { c.strokeStyle = '#D3D1CC'; c.lineWidth = 3 * U; c.stroke(); c.fillStyle = C.mute; c.font = font(iSize * .5, 800); glyph(c, String(i + 1), bx, y); }
      c.restore();
      c.save(); c.globalAlpha = lerp(.3, 1, eOut(k)); const bl = (1 - eOut(k)) * 16 * U; if (bl > .3) c.filter = `blur(${bl.toFixed(1)}px)`;
      const f = fitWrap(c, it.text, cw - pad * 2 - iSize * 1.9, iSize, 700, SANS, 1); c.font = font(f.size, 700); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      txt(c, f.lines[0], pad + iSize * 1.6, midBase(c, y)); c.restore();
      if (it.note && k > 0) { c.save(); c.globalAlpha = eOut(prog(t, a + .25, .4)); c.font = font(iSize * .58, 700); const nw = c.measureText(it.note).width; chip(c, cw - pad - nw - 30 * U, y, it.note, it.bad ? C.red : C.green, { size: iSize * .5 }); c.restore(); }
    });
    // progress bar along the bottom: glides from step to step
    const pk = items.length ? items.reduce((s2, it, i) => s2 + eIO(prog(t, at(it, i) - .1, .6)), 0) / items.length : 0;
    c.fillStyle = '#EFEEEB'; roundRect(c, pad, ch - 52 * U, cw - pad * 2, 12 * U, 6 * U); c.fill();
    c.fillStyle = C.green; roundRect(c, pad, ch - 52 * U, Math.max(12 * U, (cw - pad * 2) * pk), 12 * U, 6 * U); c.fill();
    gl3d(g, G => drawCard(G, L.card, cw, ch, pose(t, b)));
  },

  // two cards side by side. Tone per side: good / bad / neutral (a neutral pair has no ticks or crosses).
  // A column can show a small mock instead of bare lines (mock: short | long | thread | video | carousel | chart).
  compare(g, t, b) {
    stage(g, t, b);
    const cols = [b.left || {}, b.right || {}], cw = V ? W * .86 : W * .4, iSize = (V ? 50 : 48) * U, rowH = iSize * 1.7;
    const tone = ci => cols[ci].tone || (b.right_bad === false || b.neutral ? 'neutral' : ci === 1 ? 'bad' : 'good');
    const col = ci => ({ good: C.green, bad: C.red, neutral: [C.blue, C.chart2][ci] })[tone(ci)];
    const canv = [L.card, L.card2], pad = 54 * U, top = 190 * U;
    // both cards get the same height (the taller one's): side by side they read as a pair
    const need = cols.map(cc => top + (cc.mock ? 340 * U : 0) + (cc.items || []).length * rowH + (cc.items?.length ? 34 * U : 20 * U));
    const ch = Math.max(...need);
    cols.forEach((cc, ci) => {
      const mockH = cc.mock ? 340 * U : 0, c = clear(canv[ci]); cardBase(c, cw, ch);
      const hk = prog(t, (cc.at ?? b.start + ci * .45), .45);
      c.save(); roundRect(c, 0, 0, cw, ch, 28 * U); c.clip(); c.fillStyle = hexA(col(ci), .12); c.fillRect(0, 0, cw, 150 * U); c.fillStyle = col(ci); c.fillRect(0, 0, cw, 8 * U); c.restore();
      withReveal(c, hk, () => {
        const sym = cc.icon || (tone(ci) === 'good' ? '✓' : tone(ci) === 'bad' ? '✕' : null), hy = 82 * U;
        if (sym) { c.save(); c.fillStyle = cc.icon ? '#fff' : col(ci); c.beginPath(); c.arc(pad + 34 * U, hy, 34 * U, 0, Math.PI * 2); c.fill();
          if (cc.icon) { c.fillStyle = C.ink; c.font = font(34 * U, 800); glyph(c, cc.icon, pad + 34 * U, hy); } else drawTick(c, pad + 34 * U, hy, 17 * U, 1, '#fff', tone(ci) === 'bad'); c.restore(); }
        const tx = pad + (sym ? 90 * U : 0), f = fitWrap(c, cc.title || '', cw - tx - pad, 64 * U, 800, SANS, 1);
        c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; txt(c, f.lines[0], tx, midBase(c, hy));
      }, 8 * U);
      let y = top;
      if (cc.mock) { const mk = eOut(prog(t, (cc.at ?? b.start + ci * .45) + .2, .6)); c.save(); c.globalAlpha = mk; mock(c, cc.mock, pad, y - 10 * U, cw - pad * 2, mockH - 30 * U, col(ci), t, mk); c.restore(); y += mockH; }
      (cc.items || []).forEach((it, i) => {
        const at = it.at ?? (b.start + .8 + i * .7 + ci * 1.6), k = prog(t, at - .1, .4), yy = y + i * rowH + rowH / 2;
        c.save(); c.globalAlpha = lerp(.3, 1, eOut(k)); const bl = (1 - eOut(k)) * 14 * U; if (bl > .3) c.filter = `blur(${bl.toFixed(1)}px)`;
        c.fillStyle = col(ci); c.beginPath(); c.arc(pad + 8 * U, yy, 8 * U, 0, Math.PI * 2); c.fill();
        const f = fitWrap(c, it.text, cw - pad * 2 - 34 * U, iSize, 600, SANS, 1); c.font = font(f.size, 600); c.fillStyle = C.ink2; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; txt(c, f.lines[0], pad + 34 * U, midBase(c, yy)); c.restore();
      });
    });
    gl3d(g, G => {
      if (V) { drawCard(G, canv[0], cw, ch, pose(t, b, { y: H * .29 })); drawCard(G, canv[1], cw, ch, pose(t, { ...b, start: b.start + .3 }, { y: H * .71 })); }
      else { drawCard(G, canv[0], cw, ch, pose(t, b, { x: W * .28 })); drawCard(G, canv[1], cw, ch, pose(t, { ...b, start: b.start + .3 }, { x: W * .72 })); }
    });
    // VS badge
    const vk = eBack(prog(t, b.start + .5, .4));
    if (vk > 0 && b.vs !== false) { g.save(); g.translate(W / 2, H / 2); g.scale(vk, vk); shadow(g, 30 * U, 10 * U, .2); g.fillStyle = C.ink; g.beginPath(); g.arc(0, 0, 52 * U, 0, Math.PI * 2); g.fill(); noShadow(g);
      g.fillStyle = '#fff'; g.font = font(40 * U, 800); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; const vw = g.measureText('VS').width; txt(g, 'VS', -vw / 2, midBase(g, 0)); g.restore(); }
  },

  // a search bar typing over a grid of video thumbnails (stills of the presenter's own take), in a browser window on white
  async search(g, t, b) {
    const ui = clear(L.ui);
    ui.fillStyle = '#FFFFFF'; ui.fillRect(0, 0, W, H);
    await thumbGrid(ui);
    const top = ui.createLinearGradient(0, 0, 0, H * .62); top.addColorStop(0, 'rgba(255,255,255,1)'); top.addColorStop(.6, 'rgba(255,255,255,.92)'); top.addColorStop(1, 'rgba(255,255,255,0)');
    ui.fillStyle = top; ui.fillRect(0, 0, W, H * .7);
    browserChrome(ui);
    const bw = V ? W * .86 : W * .62, bh = (V ? 96 : 88) * U, bx = (W - bw) / 2, by = V ? H * .28 : H * .2;
    ui.save(); shadow(ui, 30 * U, 8 * U, .1); ui.fillStyle = '#fff'; roundRect(ui, bx, by, bw, bh, bh / 2); ui.fill(); ui.restore();
    ui.strokeStyle = '#D5D5D5'; ui.lineWidth = 2 * U; roundRect(ui, bx, by, bw, bh, bh / 2); ui.stroke();
    const mx = bx + bh * .55, my = by + bh / 2; ui.strokeStyle = '#555'; ui.lineWidth = 3.4 * U;
    ui.beginPath(); ui.arc(mx, my - 3 * U, bh * .16, 0, Math.PI * 2); ui.stroke(); ui.beginPath(); ui.moveTo(mx + bh * .12, my + bh * .1); ui.lineTo(mx + bh * .24, my + bh * .22); ui.stroke();
    const q = b.query || '', typed = typeText(t, b.start + .3, q, b.cps || 16);
    const fs = fitFont(ui, q, bw - bh * 1.7, (V ? 40 : 38) * U, 500);
    ui.font = font(fs, 500); ui.fillStyle = typed.s ? '#111' : '#9a9a9a'; ui.textBaseline = 'alphabetic'; ui.textAlign = 'left';
    txt(ui, typed.s || 'Search', bx + bh, midBase(ui, my));
    if (Math.floor(t * 2.2) % 2 === 0 || typed.caret) { const cw = ui.measureText(typed.s).width; ui.fillStyle = '#111'; ui.fillRect(bx + bh + cw + 3 * U, my - fs * .6, 2.5 * U, fs * 1.2); }
    const sugg = b.suggestions || [];
    if (typed.s.length > 2 && sugg.length) {
      const k = eOut(prog(t, b.start + .3 + 3 / (b.cps || 16), .3)), rowH = (V ? 62 : 56) * U, dh = (sugg.length * rowH + 24 * U) * k;
      ui.save(); shadow(ui, 24 * U, 6 * U, .1); ui.fillStyle = '#fff'; roundRect(ui, bx, by + bh + 10 * U, bw, dh, 18 * U); ui.fill(); ui.restore();
      ui.save(); ui.beginPath(); ui.rect(bx, by + bh + 10 * U, bw, dh); ui.clip();
      sugg.forEach((s2, i) => {
        const yy = by + bh + 22 * U + i * rowH + rowH / 2, sf = fitFont(ui, s2, bw - bh * 1.4, fs * .88, 500); ui.font = font(sf, 500);
        const pre = s2.toLowerCase().startsWith(typed.s.toLowerCase()) ? s2.slice(0, typed.s.length) : '', base = midBase(ui, yy);
        ui.fillStyle = '#111'; txt(ui, pre, bx + bh, base); ui.fillStyle = '#6b6b6b'; txt(ui, s2.slice(pre.length), bx + bh + ui.measureText(pre).width, base);
        ui.strokeStyle = '#999'; ui.lineWidth = 2 * U; ui.beginPath(); ui.arc(bx + bh * .5, yy, 9 * U, 0, Math.PI * 2); ui.stroke();
      });
      ui.restore();
    }
    windowShot(g, t, b);
  },

  // analytics: a KPI card (the number counts, the chart draws, a note pins the moment) and small tiles at other depths
  stat(g, t, b) {
    stage(g, t, b);
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
      const main = pose(t, b, { x: V ? W / 2 : (tiles.length ? W * .4 : W / 2) });
      tiles.forEach((tl, i) => drawCard(G, [L.card2, L.card3][i], tw, th, pose(t, { ...b, start: b.start + .5 + i * .25 }, V ? { x: W * (i ? .7 : .3), y: H * .82 } : { x: W * .83, y: H * (i ? .64 : .36) })));
      drawCard(G, L.card, cw, ch, main);
    });
  },

  // a whiteboard: hub with a pulse, curved branches drawing out to coloured pills (icon, small sub line). A branch
  // grows just before its word and its pill lands on the word.
  mindmap(g, t, b) {
    stage(g, t, b);
    const bw = W * .9, bh = H * .84, c = clear(L.card); cardBase(c, bw, bh, { r: 36 * U, fill: '#FFFFFF' });
    c.save(); c.fillStyle = 'rgba(30,40,60,.07)'; const sp = 40 * U; for (let x = sp; x < bw; x += sp) for (let y = sp; y < bh; y += sp) { c.beginPath(); c.arc(x, y, 2 * U, 0, Math.PI * 2); c.fill(); } c.restore();
    const nodes = b.nodes || [], cx = bw / 2, cy = bh / 2, hubR = (V ? 170 : 160) * U;
    const fs = (V ? 54 : 56) * U, pos = nodes.map((n, i) => {
      const ang = (n.angle ?? (-90 + 360 * i / nodes.length + (nodes.length % 2 ? 0 : 45))) * DEG;
      return [cx + Math.cos(ang) * bw * .3, cy + Math.sin(ang) * bh * .32];
    });
    nodes.forEach((n, i) => {
      const at = n.at ?? (b.start + .5 + i * .8), k = prog(t, at - .45, .35); if (k <= 0) return;
      const col = n.color || C.pills[i % C.pills.length];
      // the pill: one line when it fits at a good size, else two
      let f = fitWrap(c, n.text, V ? bw * .6 : bw * .36, fs, 800, SANS, 1, fs * .82);
      if (f.size <= fs * .82 + .5) f = fitWrap(c, n.text, V ? bw * .5 : bw * .28, fs, 800, SANS, 2);
      const lines = f.lines; c.font = font(f.size * .95, 700);
      const iw = n.icon ? (() => { const m = c.measureText(n.icon); return m.actualBoundingBoxLeft + m.actualBoundingBoxRight + f.size * .38; })() : 0;
      c.font = font(f.size, 800); const tw = Math.max(...lines.map(l => c.measureText(l).width)) + iw, ph = (lines.length * f.size * 1.15) + 44 * U + (n.sub ? 34 * U : 0), pw = tw + 64 * U;
      const [nx, ny] = pos[i], dir = Math.abs(nx - cx) < 40 * U ? 0 : Math.sign(nx - cx);
      const px = clamp(nx + dir * pw * .3, pw / 2 + 30 * U, bw - pw / 2 - 30 * U), py = clamp(ny, ph / 2 + 30 * U, bh - ph / 2 - 30 * U);
      const ex = px - dir * pw * .45, ey = py, mx = (cx + ex) / 2 + (ey - cy) * .18, my = (cy + ey) / 2 - (ex - cx) * .18, lk = eIO(k);
      const bez = u => [(1 - u) * (1 - u) * cx + 2 * (1 - u) * u * mx + u * u * ex, (1 - u) * (1 - u) * cy + 2 * (1 - u) * u * my + u * u * ey];
      c.strokeStyle = hexA(col, .9); c.lineWidth = 4 * U; c.lineCap = 'round'; c.beginPath();
      for (let s2 = 0; s2 <= 24; s2++) { const [x, y] = bez(s2 / 24 * lk); s2 ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      const pk = eBack(prog(t, at - .12, .36)); if (pk <= 0) return;
      c.save(); c.translate(px, py); c.scale(pk, pk); shadow(c, 22 * U, 8 * U, .14);
      c.fillStyle = col; roundRect(c, -pw / 2, -ph / 2, pw, ph, Math.min(ph / 2, 40 * U)); c.fill(); noShadow(c);
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      const ty = -ph / 2 + 22 * U + f.size * .58, x0 = -pw / 2 + 32 * U;
      if (n.icon) { c.font = font(f.size * .95, 700); glyph(c, n.icon, x0 + (iw - f.size * .38) / 2, ty); }
      c.font = font(f.size, 800); lines.forEach((l, li) => txt(c, l, x0 + iw, midBase(c, ty + li * f.size * 1.15)));
      if (n.sub) { c.font = font(24 * U, 600); c.fillStyle = 'rgba(255,255,255,.85)'; txt(c, n.sub, x0 + iw, ph / 2 - 24 * U); }
      c.restore();
    });
    const hk = eBack(prog(t, b.start + .05, .45)), pulse = (t - b.start) % 1.6 / 1.6;
    c.save(); c.translate(cx, cy); c.scale(hk, hk);
    c.strokeStyle = hexA(b.hubColor || C.hub, .35 * (1 - pulse)); c.lineWidth = 6 * U; c.beginPath(); c.arc(0, 0, hubR * (1 + pulse * .5), 0, Math.PI * 2); c.stroke();
    shadow(c, 30 * U, 10 * U, .18); const hg = c.createLinearGradient(0, -hubR, 0, hubR); hg.addColorStop(0, shade(b.hubColor || C.hub, .15)); hg.addColorStop(1, shade(b.hubColor || C.hub, -.12));
    c.fillStyle = hg; c.beginPath(); c.arc(0, 0, hubR, 0, Math.PI * 2); c.fill(); noShadow(c);
    const hf = fitWrap(c, b.center || '', hubR * 1.5, 50 * U, 800, SANS, 3); c.font = font(hf.size, 800); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    hf.lines.forEach((ln, i, a2) => txt(c, ln, 0, midBase(c, (i - (a2.length - 1) / 2) * hf.size * 1.1))); c.restore();
    gl3d(g, G => drawCard(G, L.card, bw, bh, pose(t, b, { dolly: 80 })));
  },

  // bar chart: bars grow on their words, values count, one bar can be the hero
  bars(g, t, b) {
    stage(g, t, b);
    const bars = b.bars || [], cw = V ? W * .88 : W * .62, ch = V ? H * .5 : H * .72, c = clear(L.card); cardBase(c, cw, ch);
    const pad = 60 * U, max = Math.max(...bars.map(x => x.value), 1);
    withReveal(c, prog(t, b.start, .45), () => { const f = fitWrap(c, b.title || '', cw - pad * 2, 52 * U, 800, SANS, 1); c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; txt(c, f.lines[0], pad, midBase(c, pad + 26 * U)); });
    // the tallest bar stops well below the title (its value label needs the room); a small value still reads as a bar
    const top = pad + 120 * U, gh = ch - top - pad - 70 * U, gw = cw - pad * 2, slot = gw / Math.max(1, bars.length), bw = Math.min(150 * U, slot * .56);
    c.strokeStyle = '#ECE8E2'; c.lineWidth = 2 * U; for (let i = 0; i <= 4; i++) { const y = top + gh * i / 4; c.beginPath(); c.moveTo(pad, y); c.lineTo(pad + gw, y); c.stroke(); }
    bars.forEach((x, i) => {
      const at = x.at ?? (b.start + .4 + i * .35), k = eOut(prog(t, at - .15, .7)), h = gh * .84 * Math.max(x.value / max, x.value > 0 ? .12 : 0) * k, bx = pad + slot * i + (slot - bw) / 2, hero = b.hero === i || x.hero;
      const col = x.color || (hero ? (b.color || C.accent) : (b.hero !== undefined ? '#C9C4BB' : C.pills[i % C.pills.length]));
      const gr = c.createLinearGradient(0, top + gh - h, 0, top + gh); gr.addColorStop(0, shade(col, .12)); gr.addColorStop(1, shade(col, -.08));
      c.save(); if (hero) { c.shadowColor = hexA(col, .3); c.shadowBlur = 20 * U; c.shadowOffsetY = 6 * U; } c.fillStyle = gr; roundRect(c, bx, top + gh - h, bw, h, [12 * U, 12 * U, 0, 0]); c.fill(); c.restore();
      if (k > .05) { c.font = font(34 * U, 800); c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; const lab = x.display ?? ((x.prefix ?? b.prefix ?? '') + fmtNum(x.value * k, x.decimals ?? b.decimals ?? 0) + (x.suffix ?? b.suffix ?? '')); c.font = font(fitFont(c, lab, slot * .96, 34 * U, 800), 800); c.globalAlpha = x.display ? clamp(k * 1.5) : 1; txt(c, lab, bx + bw / 2, top + gh - h - 18 * U); c.globalAlpha = 1; }
      const lf = fitWrap(c, x.label, slot * .94, 28 * U, 700, SANS, 2); c.font = font(lf.size, 700); c.fillStyle = hero ? C.ink : C.mute; c.textAlign = 'center'; c.textBaseline = 'top';
      lf.lines.forEach((l, li) => txt(c, l, bx + bw / 2, top + gh + 16 * U + li * lf.size * 1.1));
    });
    gl3d(g, G => drawCard(G, L.card, cw, ch, pose(t, b)));
  },

  // donut: segments sweep in, a legend lists them, the centre shows the headline number
  donut(g, t, b) {
    stage(g, t, b);
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
    gl3d(g, G => drawCard(G, L.card, cw, ch, pose(t, b)));
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
    gl3d(g, G => drawCard(G, L.card, cw, ch, pose(t, b)));
  },

  // roadmap: a path with stops. The progress line travels to the next stop as it is named, and a stop lights up when
  // the line reaches it (never before). Names alternate above and below the path with the same spacing on both sides.
  roadmap(g, t, b) {
    stage(g, t, b);
    const steps = b.steps || [], n = steps.length, sp = Math.min(520 * U, W * .78 / Math.max(1, n - 1)), bw = W, bh = H * .78, c = clear(L.card);
    const y = bh * .55, x0 = (W - sp * (n - 1)) / 2, xs = steps.map((s2, i) => x0 + i * sp), col = b.color || C.accent;
    const at = steps.map((s2, i) => s2.at ?? (b.start + .5 + i * 1));
    if (b.title) withReveal(c, prog(t, b.start, .45), () => { const f = fitWrap(c, b.title, W * .7, 72 * U, 800, SANS, 1); c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; txt(c, f.lines[0], Math.max(90 * U, x0 - 60 * U), midBase(c, 110 * U)); });
    // the line: each leg runs in the moments before its stop is named and arrives on the word
    const leg = i => Math.min(.6, Math.max(.25, (at[i] - at[i - 1]) * .7));
    let reach = 0; for (let i = 1; i < n; i++) reach += eIO(prog(t, at[i] - leg(i), leg(i)));
    const cur = steps.reduce((a2, s2, i) => t >= at[i] - .02 ? i : a2, -1);
    c.strokeStyle = '#E2DED8'; c.lineWidth = 10 * U; c.lineCap = 'round'; c.setLineDash([2 * U, 22 * U]); c.beginPath(); c.moveTo(xs[0], y); c.lineTo(xs[n - 1], y); c.stroke(); c.setLineDash([]);
    if (reach > 0 && t >= at[0] - .1) { c.strokeStyle = col; c.beginPath(); c.moveTo(xs[0], y); c.lineTo(xs[0] + sp * reach, y); c.stroke(); }
    const R = 60 * U;
    steps.forEach((s2, i) => {
      const k = prog(t, at[i] - .02, .35), on = k > 0, x = xs[i], active = i === cur;
      const r = R * (on ? lerp(.9, active ? 1.08 : 1, eBack(k)) : .9);
      c.save(); shadow(c, 20 * U, 8 * U, on ? .16 : .05); c.fillStyle = on ? (s2.color || (active ? col : C.ink)) : '#fff'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); noShadow(c);
      if (!on) { c.strokeStyle = '#DAD6CF'; c.lineWidth = 4 * U; c.stroke(); }
      c.font = font(r * .72, 800); c.fillStyle = on ? '#fff' : C.mute; glyph(c, s2.icon || String(i + 1), x, y);
      if (active) { const pl = ((t - at[i]) % 1.4) / 1.4; c.strokeStyle = hexA(col, .35 * (1 - pl)); c.lineWidth = 5 * U; c.beginPath(); c.arc(x, y, r * (1 + pl * .6), 0, Math.PI * 2); c.stroke(); }
      c.restore();
      // the name (and its small label) beside the stop: same distances above and below, measured on capital heights
      c.save(); const ke = eOut(prog(t, at[i] - .1, .4)); c.globalAlpha = lerp(.35, 1, ke); const bl = (1 - ke) * 12 * U; if (bl > .3) c.filter = `blur(${bl.toFixed(1)}px)`;
      const up = i % 2 === 0, f = fitWrap(c, s2.text, Math.min(sp * 1.6, 2 * Math.min(xs[i], W - xs[i]) - 40 * U), 50 * U, 800, SANS, 2);
      const capN = f.size * .72, capL = 30 * U * .72, lh = f.size * 1.12, gapToStop = R * 1.08 + 34 * U, gapLabel = 16 * U;
      const centres = f.lines.map((l, li) => up ? y - gapToStop - capN / 2 - (f.lines.length - 1 - li) * lh : y + gapToStop + capN / 2 + li * lh);
      c.font = font(f.size, 800); c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      f.lines.forEach((l, li) => txt(c, l, x, midBase(c, centres[li])));
      if (s2.label) { const ly = up ? centres[0] - capN / 2 - gapLabel - capL / 2 : centres[centres.length - 1] + capN / 2 + gapLabel + capL / 2 + f.size * .12;
        c.font = font(30 * U, 700); c.fillStyle = C.mute; txt(c, s2.label, x, midBase(c, ly)); }
      c.restore();
    });
    gl3d(g, G => G.plane(L.card, pose(t, b, { w: bw, h: bh, src: [0, 0, bw / L.card.width, bh / L.card.height], s: .94, dolly: 50 })));
  },

  // stock or user photos: one fills the frame with a slow move; two or three stand side by side on white, whole (never
  // cropped by the frame), each with a thin white border and a soft shadow
  async photo(g, t, b) {
    const srcs = (b.srcs || [b.src]).filter(s2 => IMG[s2]);
    if (!srcs.length) { stage(g, t, b); return; }
    const p = prog(t, b.start - .3, b.end - b.start + .6), main = IMG[srcs[0]];
    if (srcs.length === 1 && b.frame !== true) {
      const s0 = Math.max(W / main.width, H / main.height) * 1.04, sc = s0 * lerp(b.zoomFrom ?? 1.0, b.zoomTo ?? 1.06, eIO(p));
      const dx = lerp(-1, 1, eIO(p)) * (b.pan ?? 20) * U, w = main.width * sc, h = main.height * sc;
      g.save(); g.filter = 'contrast(1.04) saturate(1.04)'; g.drawImage(main, W / 2 - w / 2 + dx, H / 2 - h / 2 + (b.panY || 0) * U, w, h); g.restore();
    } else {
      stage(g, t, b);
      const n = srcs.length, gap = 40 * U, ar = srcs.map(s2 => IMG[s2].width / IMG[s2].height), bd = 10 * U;
      const capRoom = b.caption ? 150 * U : 0, maxW = W * (V ? .9 : .9), maxH = (H - capRoom) * (V ? .3 : .62);
      // one height for every print, as big as fits: side by side in 16:9, stacked in 9:16
      let hh = V ? Math.min(maxH, ...ar.map(a2 => maxW / a2)) : Math.min(maxH, (maxW - gap * (n - 1) - bd * 2 * n) / ar.reduce((s2, a2) => s2 + a2, 0));
      const ws = ar.map(a2 => a2 * hh), total = ws.reduce((s2, w2) => s2 + w2 + bd * 2, 0) + gap * (n - 1);
      let x = (W - total) / 2;
      gl3d(g, G => srcs.forEach((s2, i) => {
        const im = IMG[s2], mw = ws[i], fr = scratch('print' + i, mw + bd * 2, hh + bd * 2), fg = fr.getContext('2d'); fg.clearRect(0, 0, fr.width, fr.height);
        fg.fillStyle = '#fff'; roundRect(fg, 0, 0, fr.width, fr.height, 16 * U); fg.fill();
        fg.save(); roundRect(fg, bd, bd, mw, hh, 9 * U); fg.clip(); fg.drawImage(im, bd, bd, mw, hh); fg.restore();
        fg.strokeStyle = 'rgba(0,0,0,.08)'; fg.lineWidth = 2 * U; roundRect(fg, 1, 1, fr.width - 2, fr.height - 2, 16 * U); fg.stroke();
        const cxp = V ? W / 2 : x + fr.width / 2, cyp = V ? (H - capRoom) / 2 + (i - (n - 1) / 2) * (hh + bd * 2 + gap) : (H - capRoom) / 2;
        x += fr.width + gap;
        drawCard(G, fr, fr.width, fr.height, pose(t, { ...b, start: b.start + i * .25 }, { x: cxp, y: cyp, dolly: 40, shadow: .22 }));
      }));
    }
    caption(g, t, b);
  },

  // a stock clip (image sequence made by fetch_stock.py) with a slow push; as a framed card on white with `frame: true`
  async video(g, t, b) {
    const im = await seqFrame(b.src, t - b.start + (b.offset || 0)); if (!im) { stage(g, t, b); return; }
    const p = prog(t, b.start, b.end - b.start);
    if (!b.frame) {
      const sc = Math.max(W / im.width, H / im.height) * lerp(1.02, 1.08, eIO(p)), w = im.width * sc, h = im.height * sc;
      g.save(); g.filter = 'contrast(1.04) saturate(1.04)'; g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); g.restore();
    } else {
      stage(g, t, b); const mw = W * .72, mh = mw * im.height / im.width;
      const fr = scratch('vframe', mw, mh), fg = fr.getContext('2d'); fg.save(); fg.clearRect(0, 0, mw, mh); roundRect(fg, 0, 0, mw, mh, 22 * U); fg.clip(); fg.drawImage(im, 0, 0, mw, mh); fg.restore();
      gl3d(g, G => drawCard(G, fr, mw, mh, pose(t, b, { shadow: .25 })));
    }
    caption(g, t, b);
  },

  // the user's own screenshot on white, as a card
  async image(g, t, b) {
    const im = IMG[b.src]; if (!im) { stage(g, t, b); return; }
    stage(g, t, b);
    const maxW = W * (V ? .88 : .72), maxH = H * (V ? .6 : (b.caption ? .64 : .74)), sc = Math.min(maxW / im.width, maxH / im.height);
    const w = im.width * sc, h = im.height * sc, fr = scratch('shot', w, h), fg = fr.getContext('2d');
    fg.save(); fg.clearRect(0, 0, w, h); roundRect(fg, 0, 0, w, h, 18 * U); fg.clip(); fg.drawImage(im, 0, 0, w, h); fg.restore();
    gl3d(g, G => drawCard(G, fr, w, h, pose(t, b, { y: H / 2 - (b.caption ? 40 * U : 0), shadow: .22 })));
    if (b.caption) withReveal(g, prog(t, b.start + .35, .4), () => { const f = fitWrap(g, b.caption, W * .8, (V ? 46 : 42) * U, 700, SANS, 1); g.font = font(f.size, 700); g.fillStyle = C.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; txt(g, f.lines[0], W / 2, midBase(g, H / 2 + h / 2 + 30 * U)); });
  },

  // end screen on white: thanks + channel, two "watch next" slots (YouTube fills them), Subscribe clicked by a cursor
  endscreen(g, t, b) {
    stage(g, t, b);
    const k = eOut(prog(t, b.start + .1, .6));
    withReveal(g, k, () => {
      g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = C.ink;
      const f = fitWrap(g, b.text || 'Thanks for watching', W * .8, (V ? 84 : 80) * U, 800, SANS, 2); g.font = font(f.size, 800);
      f.lines.forEach((l, i) => txt(g, l, W / 2, midBase(g, H * .19 + i * f.size * 1.1)));
      if (b.channel) { g.font = font(36 * U, 700); g.fillStyle = C.mute; txt(g, b.channel, W / 2, midBase(g, H * .19 + f.lines.length * f.size * 1.1 + 4 * U)); }
    }, 16 * U);
    if (b.slots !== false) {
      const sw = V ? W * .78 : W * .3, sh = sw * 9 / 16, ys = V ? [H * .45, H * .66] : [H * .53, H * .53], xs = V ? [W / 2, W / 2] : [W * .31, W * .69];
      [0, 1].forEach(i => { const sk = eOut(prog(t, b.start + .35 + i * .15, .5)); g.save(); g.globalAlpha = sk; g.translate(xs[i], ys[i] + (1 - sk) * 30 * U);
        shadow(g, 30 * U, 10 * U, .1); g.fillStyle = '#F3F3F1'; roundRect(g, -sw / 2, -sh / 2, sw, sh, 20 * U); g.fill(); noShadow(g);
        g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2 * U; roundRect(g, -sw / 2, -sh / 2, sw, sh, 20 * U); g.stroke();
        g.fillStyle = '#B9B7B2'; g.beginPath(); g.moveTo(-18 * U, -26 * U); g.lineTo(28 * U, 0); g.lineTo(-18 * U, 26 * U); g.closePath(); g.fill();
        g.fillStyle = C.ink2; g.font = font(28 * U, 700); g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(i ? 'Watch next' : 'Recommended', 0, sh / 2 + 44 * U); g.restore(); });
    }
    OVER.subscribe(g, t, { ...b, start: b.start + .8, end: b.end + 1, y: V ? .85 : .86, dark: true });
  },
};
SCENES.search.async = SCENES.photo.async = SCENES.video.async = SCENES.image.async = true;

// a mock of a post or a format for compare columns: abstract shapes, no real brand

// the UI in L.ui shown as an app window on the white stage: rounded corners, a hairline, a soft shadow, square to the
// camera, a slow push. (No monitor bezel, no dark room: the editors read those as stock.)
function browserChrome(ui) {
  ui.fillStyle = '#F1F1F1'; ui.fillRect(0, 0, W, 64 * U); ui.fillStyle = '#E2E2E2'; ui.fillRect(0, 64 * U, W, 2 * U);
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((cc, i) => { ui.fillStyle = cc; ui.beginPath(); ui.arc(36 * U + i * 30 * U, 32 * U, 9 * U, 0, Math.PI * 2); ui.fill(); });
  ui.fillStyle = '#fff'; roundRect(ui, 160 * U, 14 * U, W * .45, 36 * U, 18 * U); ui.fill();
}
function windowShot(g, t, b) {
  stage(g, t, b);
  const sc = V ? .92 : .86, r = 26 * U, win = scratch('window', W, H), wg = clear(win);
  wg.save(); roundRect(wg, 0, 0, W, H, r / sc); wg.clip(); blit(wg, L.ui, 0, 0); wg.restore();
  wg.strokeStyle = 'rgba(0,0,0,.12)'; wg.lineWidth = 2 * U / sc; roundRect(wg, 1, 1, W - 2, H - 2, r / sc); wg.stroke();
  gl3d(g, G => drawCard(G, win, W, H, pose(t, b, { s: sc, dolly: 60, shadow: .2 })));
}

// a caption plate for photos and clips: white, a soft shadow, the accent bar inside the plate
function caption(g, t, b) {
  if (!b.caption) return;
  const k = eOut(prog(t, b.start + .3, .45)), ko = eIn(prog(t, b.end - .4, .4)); if (k <= 0) return;
  g.save(); g.globalAlpha = k * (1 - ko); g.translate((1 - k) * -30 * U, 0); g.font = font(40 * U, 800);
  const pad = 26 * U, bar = 7 * U, ph = 76 * U, cw = g.measureText(b.caption).width + pad * 3 + bar, cx = 70 * U, cy = H - 110 * U;
  shadow(g, 30 * U, 10 * U, .22); g.fillStyle = '#FFFFFF'; roundRect(g, cx, cy - ph / 2, cw, ph, 18 * U); g.fill(); noShadow(g);
  g.fillStyle = C.accent; roundRect(g, cx + pad, cy - ph * .28, bar, ph * .56, bar / 2); g.fill();
  g.fillStyle = C.ink; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; txt(g, b.caption, cx + pad * 2 + bar, midBase(g, cy)); g.restore();
}
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
// thumbnails behind the search bar: stills of the presenter's own take (real footage, no stock, no real brands)
let THUMBS = null;
async function thumbGrid(g) {
  if (!THUMBS) { THUMBS = layer(); await drawThumbs(THUMBS.getContext('2d')); }
  g.drawImage(THUMBS, 0, 0);
}
async function drawThumbs(g) {
  const cols = V ? 2 : 4, tw = (V ? W * .44 : W * .22), th = tw * 9 / 16, gap = 30 * U, x0 = (W - (cols * tw + (cols - 1) * gap)) / 2;
  const titles = ['How I plan a video', 'My editing setup', '5 things I learned', 'Q&A: your questions', 'One year on YouTube', 'Behind the scenes', 'What I would change', 'Start here'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, x = x0 + c * (tw + gap), y = H * (V ? .5 : .45) + r * (th + 100 * U) - 40 * U;
    const ft = INFO.duration * (.08 + .84 * hash(i * 31 + 7)), img = await frame(ft * FPS + 1), a = aimAt(ft);
    // a tighter crop around the face, different for each thumbnail
    const z = 1.15 + .35 * hash(i * 17), cw = img.width / z, chh = img.height / z, sx = clamp(a.x * img.width - cw / 2, 0, img.width - cw), sy = clamp(a.y * img.height - chh * .42, 0, img.height - chh);
    g.save(); roundRect(g, x, y, tw, th, 14 * U); g.clip(); g.filter = 'contrast(1.08) saturate(1.12)'; g.drawImage(img, sx, sy, cw, chh, x, y, tw, th); g.filter = 'none';
    const sh = g.createLinearGradient(0, y + th * .45, 0, y + th); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.45)'); g.fillStyle = sh; g.fillRect(x, y, tw, th);
    g.font = font(th * .15, 800); g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.lineWidth = th * .03; g.strokeStyle = 'rgba(0,0,0,.6)';
    const word = titles[i % titles.length].split(' ').slice(0, 2).join(' ').toUpperCase(); g.strokeText(word, x + 16 * U, y + th - 20 * U); g.fillStyle = '#fff'; g.fillText(word, x + 16 * U, y + th - 20 * U);
    g.restore();
    g.fillStyle = 'rgba(0,0,0,.78)'; roundRect(g, x + tw - 70 * U, y + 10 * U, 60 * U, 26 * U, 6 * U); g.fill();
    g.fillStyle = '#fff'; g.font = font(17 * U, 700); g.textAlign = 'center'; g.fillText(`${4 + Math.floor(hash(i) * 14)}:${String(Math.floor(hash(i * 3) * 60)).padStart(2, '0')}`, x + tw - 40 * U, y + 29 * U); g.textAlign = 'left';
    g.fillStyle = '#1a1a1a'; g.font = font(22 * U, 700); g.fillText(titles[i % titles.length], x, y + th + 34 * U);
    g.fillStyle = '#8a8a8a'; g.font = font(18 * U, 500); g.fillText(`${(1 + hash(i * 5) * 40).toFixed(0)}K views · ${1 + Math.floor(hash(i * 9) * 11)} months ago`, x, y + th + 62 * U);
  }
}
