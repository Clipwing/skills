// talking-head-auto-edit engine, part 4: what draws over (or around) the presenter.
//   words  : solid 3D words standing in the room; `behind` ones sit on the wall and the head passes in front of them
//   callout, subscribe : small labels
//   split  : the presenter slides into a window on one side, a text panel takes the other side (a full-screen beat
//            that animates itself in and out, so it needs no transition)
'use strict';

// ------------------------------------------------------------------ 3D words
// text -> canvas: one or two lines of heavy letters that rise in one after another; returns {c, w, h}
function wordCanvas(key, lines, sub, size, col, t, at, out) {
  const g0 = scratch('wm', 8, 8).getContext('2d'), lh = size * 1.02;
  g0.font = font(size, 900, ROOM); const mw = Math.max(...lines.map(l => g0.measureText(l).width));
  g0.font = font(size * .36, 800); const sw = sub ? g0.measureText(sub).width : 0;
  const pad = size * .22, w = Math.max(mw, sw) + pad * 2, h = lh * lines.length + size * .2 + (sub ? size * .5 : 0) + pad * 2;
  const c = scratch('word' + key, w, h), g = clear(c);
  const n = lines.reduce((a, l) => a + l.length, 0), step = Math.min(.03, .45 / n);
  let idx = 0;
  lines.forEach((line, li) => {
    g.font = font(size, 900, ROOM); g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const base = pad + size * .9 + li * lh;
    // lines line up on the side that faces the presenter (that end is anchored next to the head)
    let x = pad + (key.endsWith('R') ? 0 : mw - g.measureText(line).width);
    for (const ch of line) {
      const k = eOut(prog(t, at + idx * step, .4)), ko = eIn(prog(t, out - .34 + (n - idx) * .01, .3)); idx++;
      g.save(); g.globalAlpha = clamp(k * 2) * (1 - ko); g.translate(0, (1 - k) * size * .3 - ko * size * .18);
      const lg = g.createLinearGradient(0, base - size * .8, 0, base); lg.addColorStop(0, col); lg.addColorStop(1, shade(col.startsWith('#') ? col : '#ffffff', -.1));
      g.fillStyle = lg; txt(g, ch, x, base); g.restore();
      x += g.measureText(ch).width;
    }
  });
  if (sub) { const k = eOut(prog(t, at + .3, .4)); g.save(); g.globalAlpha = k * (1 - eIn(prog(t, out - .3, .3))); g.font = font(size * .36, 800); g.fillStyle = col; g.textAlign = key.endsWith('R') ? 'left' : 'right'; txt(g, sub, key.endsWith('R') ? pad + size * .04 : w - pad - size * .04, pad + size * .9 + (lines.length - 1) * lh + size * .52); g.restore(); }
  return { c, w, h };
}
function blurred(key, src, px) {
  const c = scratch('blur' + key, src.width, src.height), g = clear(c); g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); g.filter = 'none'; return c;
}
// the rule for words around the presenter: the face stays clear, the words stay readable. A word stands beside the
// head (its inner end may tuck under the hair, never under the face), turned in perspective: the outer end is nearer
// the camera, the inner end recedes towards the wall behind the presenter.
const WORD_TURN = 26;    // degrees per side: the end next to the presenter comes towards the camera, the outer end recedes
function sortWords(b) {
  if (b._sides) return b._sides;
  let last = 1;
  return b._sides = (b.items || []).map(it => { const p = it.pos || ''; const s = /left/.test(p) ? -1 : /right/.test(p) ? 1 : -last; last = s; return s; });
}
function placeWord(b, i, it, at, leave) {
  const side = sortWords(b)[i], depth = it.depth || b.depth || (INFO.matte ? 'behind' : 'front'), pos = it.pos || '';
  const xa = presenterXf(at), m = 64 * U, gap = 30 * U;
  // the head moves while the word stands (leans, turns): keep clear of everywhere it goes during the word's life
  const ts = [0, .2, .4, .6, .8, 1].map(q => lerp(at, Math.max(at, leave - .1), q));
  const room = ts.map(tt => { const x2 = presenterXf(tt), h = headBox(tt, x2), r = v => v / x2.s;
    return { l: r(h.cx - h.w * .62 - x2.x), rr: r(h.cx + h.w * .62 - x2.x), top: r(h.top - x2.y), cy: r(h.cy - x2.y), h: r(h.h) }; });
  const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1], toX = v => xa.x + v * xa.s, toY = v => xa.y + v * xa.s;
  const hb = { cy: toY(med(room.map(r => r.cy))), h: med(room.map(r => r.h)) * xa.s, top: toY(Math.min(...room.map(r => r.top))) };
  const faceL = toX(Math.min(...room.map(r => r.l))), faceR = toX(Math.max(...room.map(r => r.rr))), faceT = hb.top - hb.h * .05, faceB = hb.cy + hb.h * .7;
  const innerX = side < 0 ? faceL - gap : faceR + gap;
  let y = /top/.test(pos) ? faceT + hb.h * .1 : /bottom/.test(pos) ? faceB + hb.h * .15 : hb.cy - hb.h * .12;
  const [mainText, sub] = String(it.text).split('\n'), avail = side < 0 ? innerX - m : W - m - innerX;
  // one line if it fits at a good size, else two balanced lines
  const g0 = scratch('wm', 8, 8).getContext('2d'), fits = (lines, sz) => { g0.font = font(sz, 900, ROOM); return Math.max(...lines.map(l => g0.measureText(l).width)) * 1.08 <= avail; };
  // one line or two balanced lines: whichever lets the word stand bigger (one line wins a close call)
  const size0 = (it.size || 150) * U, sizeFor = ls => { let sz = size0; while (sz > 70 * U && !fits(ls, sz)) sz *= .96; return sz; };
  const ws = mainText.split(' '), layouts = [[mainText]];
  if (ws.length > 1) { let best = null; for (let k = 1; k < ws.length; k++) { const a = [ws.slice(0, k).join(' '), ws.slice(k).join(' ')]; g0.font = font(size0, 900, ROOM); const wmax = Math.max(...a.map(l => g0.measureText(l).width)); if (!best || wmax < best.w) best = { a, w: wmax }; } layouts.push(best.a); }
  const sizes = layouts.map(sizeFor), pick = sizes.length > 1 && sizes[1] > sizes[0] * 1.15 ? 1 : 0;
  const lines = layouts[pick], size = sizes[pick];
  const key = b.i + '_' + i + (side < 0 ? 'L' : 'R');
  const wc = wordCanvas(key, lines, sub, size, '#fff', at + 9, at, at + 99);
  // fit in room units: check the resting pose at several moments of its life (the framing may change meanwhile)
  const u = (innerX - xa.x) / xa.s; let v = (y - xa.y) / xa.s, fit = 1;
  const pose = (tt, f, vv) => { const x2 = presenterXf(tt), k = x2.s / xa.s; return { w: wc.w, h: wc.h, ax: side < 0 ? 1 : 0, ay: .5, x: x2.x + u * x2.s, y: x2.y + vv * x2.s, z: depth === 'behind' ? 0 : -60, ry: side * WORD_TURN, rx: 3, s: k * f }; };
  const rectOf = o => { const bd = GL.bounds(o); return [Math.min(...bd.map(p => p[0])), Math.min(...bd.map(p => p[1])), Math.max(...bd.map(p => p[0])), Math.max(...bd.map(p => p[1]))]; };
  for (let pass = 0; pass < 8; pass++) {
    let bad = false;
    for (const tt of ts) {
      const r = rectOf(pose(tt, fit, v));
      if (r[0] < m || r[2] > W - m) { fit *= .93; bad = true; break; }
      if (r[1] < m) { v += (m - r[1]) / presenterXf(tt).s + 4 * U; bad = true; break; }
      if (r[3] > H - m) { v -= (r[3] - H + m) / presenterXf(tt).s + 4 * U; bad = true; break; }
    }
    if (!bad) break;
  }
  // (no dependence on other words' placement: each render worker places words on its own, so it must be deterministic;
  //  a word on the same side leaves as the next one arrives, so they never share the spot)
  return { u, v, s: xa.s, fit, size, lines, sub, side, depth, key, rect: rectOf(pose(at, fit, v)) };
}

const OVER = {
  async words(g, t, b, xf) {
    const items = b.items || [], behind = [], front = [];
    b._pl ||= [];
    items.forEach((it, i) => {
      const at = it.at ?? (b.start + i * .6);
      // a word stays until the next word on its side arrives (or the one two places later), at least 1.6 s
      const sides = sortWords(b), nextSame = items.findIndex((x, j) => j > i && sides[j] === sides[i]);
      const until = Math.min(...[nextSame, i + 2].filter(j => j > i && j < items.length).map(j => (items[j].at ?? (b.start + j * .6)) - .15), b.end);
      const leave = Math.min(b.end, Math.max(at + 1.6, until));
      if (t < at - .05 || t >= leave) return;
      b._pl[i] ||= placeWord(b, i, it, at, leave);
      const pl = b._pl[i], wc = wordCanvas(pl.key, pl.lines, pl.sub, pl.size, it.color || '#FFFFFF', t, at, leave);
      const ki = eOut5(prog(t, at, .8)), ko = eIn(prog(t, leave - .4, .4)), k = xf.s / pl.s;
      const turn = pl.side * WORD_TURN;
      (pl.depth === 'behind' ? behind : front).push({ wc, key: pl.key, o: {
        w: wc.w, h: wc.h, ax: pl.side < 0 ? 1 : 0, ay: .5, x: xf.x + pl.u * xf.s, y: xf.y + pl.v * xf.s,
        z: (pl.depth === 'behind' ? 0 : -60) + ko * 60,
        ry: turn * (1 + (1 - ki) * .8 + ko * .6), rx: 3 + (1 - ki) * 8, rz: 0,
        s: k * pl.fit * (.9 + .1 * ki), alpha: clamp(ki * 2.5) * (1 - ko) } });
    });
    const draw = list => gl3d(g, G => list.forEach(({ wc, o, key }) => {
      // the word stands off the wall: a soft shadow cast on the wall behind it (light from the front, up and to the
      // presenter's side, so it falls down and outwards), plus a tighter contact shadow
      const side = o.ax > .5 ? -1 : 1, soft = blurred(key + 's', wc.c, 22 * U), hard = blurred(key, wc.c, 7 * U);
      G.plane(soft, { ...o, x: o.x + side * 80 * U * o.s, y: o.y + 70 * U * o.s, z: o.z + 120, ry: o.ry * .5, rx: 0, s: o.s * 1.02, tint: [.12, .1, .14, 1], alpha: o.alpha * .5 });
      G.plane(hard, { ...o, x: o.x + side * 12 * U * o.s, y: o.y + 18 * U * o.s, z: o.z + 70, tint: [.08, .07, .1, 1], alpha: o.alpha * .3 });
      G.extrude(wc.c, o, 60, 20, [.36, .36, .42], side * 3 * U * o.s, 6 * U * o.s);
      G.plane(wc.c, o);
    }));
    if (behind.length) { draw(behind); if (await presenterCutout(t, xf)) blit(g, L.cut, 0, 0); }
    if (front.length) draw(front);
  },

  // a short label with a hand-drawn arrow towards the presenter
  callout(g, t, b, xf) {
    const k = eOut(prog(t, b.start, .4)), ko = eIn(prog(t, b.end - .3, .3)); if (k <= 0) return;
    const left = (b.side || 'left') === 'left', hb = headBox(t, xf);
    const f = fitWrap(g, b.text || '', W * (V ? .7 : .26), (V ? 52 : 50) * U, 800, SANS, 3);
    const x = left ? Math.max(70 * U, hb.cx - hb.w * 1.3 - W * .26) : Math.min(W - 70 * U - W * .26, hb.cx + hb.w * 1.3), y = hb.cy - hb.h * .3;
    g.save(); g.globalAlpha = k * (1 - ko); g.translate((1 - k) * (left ? -40 : 40) * U, 0);
    g.font = font(f.size, 800); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 22 * U;
    f.lines.forEach((ln, i) => txt(g, ln, x, y + i * f.size * 1.12));
    const lw = Math.max(...f.lines.map(l => g.measureText(l).width)), ak = eOut(prog(t, b.start + .2, .4));
    const sx = left ? x + lw + 20 * U : x - 20 * U, sy = y + 10 * U, ex = left ? hb.cx - hb.w * .75 : hb.cx + hb.w * .75, ey = hb.cy;
    g.strokeStyle = '#fff'; g.lineWidth = 6 * U; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, sy);
    const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 60 * U; for (let s = 1; s <= 20; s++) { const u = s / 20 * ak; g.lineTo((1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cx + u * u * ex, (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cy + u * u * ey); } g.stroke();
    g.restore();
  },

  // "Subscribe" pressed by a cursor
  subscribe(g, t, b) {
    const k = eBack(prog(t, b.start, .4)), out = clamp((b.end - t) / .25); if (k <= 0) return;
    const press = b.start + .9, done = t >= press, label = done ? 'SUBSCRIBED' : 'SUBSCRIBE';
    g.save(); g.globalAlpha = out; g.font = font(44 * U, 800);
    const pw = g.measureText('SUBSCRIBED').width + 150 * U, ph = 96 * U, x = W / 2, y = H * (b.y ?? (V ? .8 : .84));
    const pk = t >= press && t < press + .18 ? .94 : 1;
    g.translate(x, y); g.scale(k * pk, k * pk);
    shadow(g, 30 * U, 10 * U, .3); g.fillStyle = done ? '#E9E9E9' : '#FF0033'; roundRect(g, -pw / 2, -ph / 2, pw, ph, ph / 2); g.fill(); noShadow(g);
    g.fillStyle = done ? '#333' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; txt(g, label, 18 * U, 3 * U);
    g.strokeStyle = done ? '#333' : '#fff'; g.lineWidth = 4 * U; g.beginPath(); g.arc(-pw / 2 + 52 * U, -2 * U, 14 * U, Math.PI, 0); g.lineTo(-pw / 2 + 70 * U, 14 * U); g.lineTo(-pw / 2 + 34 * U, 14 * U); g.closePath(); g.stroke();
    g.restore();
    const ck = eIO(prog(t, b.start + .2, .65)); if (ck > 0 && t < b.end - .1) {
      const cx = lerp(x + 380 * U, x + pw * .15, ck), cy = lerp(y + 260 * U, y + 10 * U, ck);
      g.save(); g.globalAlpha = out; g.translate(cx, cy); g.scale(1.5 * U * pk, 1.5 * U * pk); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 34); g.lineTo(9, 26); g.lineTo(15, 40); g.lineTo(21, 37); g.lineTo(15, 24); g.lineTo(27, 24); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  },
};

// ------------------------------------------------------------------ split: presenter on one side, a panel on the other
SCENES.split = async function (g, t, b) {
  const right = (b.side || 'left') === 'right';                      // which side the presenter goes to
  const kin = eIO(prog(t, b.start, .75)), kout = eIO(prog(t, b.end - .7, .7)), k = kin * (1 - kout);
  stage(g, t, b, { palette: b.palette || 'warm' });
  // the panel text
  const pw = V ? W * .86 : W * .44, px = V ? W * .07 : (right ? W * .05 : W * .51), c = clear(L.card);
  let y = V ? H * .58 : H * .2;
  const reveal = (d, fn) => { const kk = prog(t, b.start + .45 + d, .45) * (1 - prog(t, b.end - .75, .35)); if (kk > 0) withReveal(c, kk, fn, 10 * U); };
  if (b.kicker) { reveal(0, () => chip(c, px, y, b.kicker.toUpperCase(), b.color || C.accent)); y += 70 * U; }
  const tf = fitWrap(c, b.title || '', pw, (V ? 88 : 84) * U, 800, SANS, 3);
  reveal(.08, () => { c.font = font(tf.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'top'; tf.lines.forEach((l, i) => txt(c, l, px, y + i * tf.size * 1.08)); });
  y += tf.lines.length * tf.size * 1.08 + 40 * U;
  if (b.value !== undefined) {
    const v = Number(b.value) || 0, kc = eOut(prog(t, b.start + .6, 1.2)), s = (b.prefix || '') + fmtNum(v * kc, b.decimals || 0) + (b.suffix || '');
    reveal(.15, () => { const ns = fitFont(c, (b.prefix || '') + fmtNum(v, b.decimals || 0) + (b.suffix || ''), pw, 150 * U, 800); c.font = font(ns, 800); c.fillStyle = b.color || C.accent; c.textAlign = 'left'; c.textBaseline = 'top'; txt(c, s, px, y); y += ns * 1.1; });
    y += 170 * U;
  }
  (b.items || []).forEach((it, i) => {
    const at = it.at ?? (b.start + .9 + i * .6), kk = prog(t, at, .4) * (1 - prog(t, b.end - .75, .35)); if (kk <= 0) { y += 0; }
    const f = fitWrap(c, it.text, pw - 70 * U, (V ? 46 : 42) * U, 700, SANS, 2), yy = y;
    if (kk > 0) withReveal(c, kk, () => { c.fillStyle = b.color || C.accent; c.beginPath(); c.arc(px + 14 * U, yy + f.size * .55, 10 * U, 0, Math.PI * 2); c.fill();
      c.font = font(f.size, 700); c.fillStyle = C.ink2; c.textAlign = 'left'; c.textBaseline = 'top'; f.lines.forEach((l, li) => txt(c, l, px + 50 * U, yy + li * f.size * 1.15)); }, 8 * U);
    y += f.lines.length * f.size * 1.15 + 30 * U;
  });
  gl3d(g, G => G.plane(L.card, { w: W, h: H, ry: (1 - k) * (right ? 12 : -12), z: (1 - k) * 200, alpha: clamp(k * 2) }));
  // the presenter: from the full frame into a rounded window, cropped around the face
  const xf = presenterXf(t), pg = clear(L.tmp); await drawPresenter(pg, t, { xf, noVignette: true });
  const ww = V ? W * .86 : W * .42, wh = V ? H * .44 : H * .84, wx = V ? W * .07 : (right ? W * .54 : W * .04), wy = V ? H * .06 : H * .08;
  const hb = headBox(t, xf), srcW = H * ww / wh, sx = clamp(hb.cx - srcW / 2, 0, W - srcW);
  const r0 = [0, 0, W, H], r1 = [sx, 0, srcW, H], d1 = [wx, wy, ww, wh];
  const sr = r0.map((v, i) => lerp(v, r1[i], k)), dr = r0.map((v, i) => lerp(v, d1[i], k)), rad = 34 * U * k;
  g.save(); shadow(g, 60 * U * k, 24 * U * k, .3 * k); g.fillStyle = '#000'; roundRect(g, dr[0], dr[1], dr[2], dr[3], rad); g.fill(); noShadow(g);
  roundRect(g, dr[0], dr[1], dr[2], dr[3], rad); g.clip(); g.drawImage(L.tmp, sr[0], sr[1], sr[2], sr[3], dr[0], dr[1], dr[2], dr[3]); g.restore();
};
SCENES.split.async = true;
