// heygen-auto-edit engine, part 4: what draws over (or around) the presenter.
//   words  : solid 3D words standing in the room; `behind` ones sit on the wall and the head passes in front of them
//   callout, subscribe : small labels
//   split  : the presenter slides into a window on one side, a text panel takes the other side (a full-screen beat
//            that animates itself in and out, so it needs no transition)
'use strict';

// ------------------------------------------------------------------ 3D words
// text -> canvas (letters can stagger in); returns {c, w, h}
function wordCanvas(key, main, sub, size, col, t, at, out) {
  const g0 = scratch('wm', 8, 8).getContext('2d');
  g0.font = font(size, 800); const mw = g0.measureText(main).width; g0.font = font(size * .4, 800); const sw = sub ? g0.measureText(sub).width : 0;
  const pad = size * .25, w = Math.max(mw, sw) + pad * 2, h = size * (sub ? 1.62 : 1.18) + pad * 2;
  const c = scratch('word' + key, w, h), g = clear(c);
  g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.font = font(size, 800);
  let x = pad; const base = pad + size * .92, n = main.length;
  for (let i = 0; i < n; i++) {
    const ch = main[i], k = eOut(prog(t, at + i * Math.min(.035, .4 / n), .38)), ko = eIn(prog(t, out - .32 + (n - i) * .012, .3));
    g.save(); g.globalAlpha = clamp(k * 2) * (1 - ko); g.translate(0, (1 - k) * size * .35 + ko * -size * .2);
    const lg = g.createLinearGradient(0, base - size, 0, base); lg.addColorStop(0, col); lg.addColorStop(1, shade(col.startsWith('#') ? col : '#ffffff', -.08));
    g.fillStyle = lg; txt(g, ch, x, base); g.restore();
    x += g.measureText(ch).width;
  }
  if (sub) { const k = eOut(prog(t, at + .25, .4)); g.save(); g.globalAlpha = k * (1 - eIn(prog(t, out - .3, .3))); g.font = font(size * .4, 800); g.fillStyle = col; txt(g, sub, pad + size * .04, base + size * .55); g.restore(); }
  return { c, w, h };
}
function blurred(key, src, px) {
  const c = scratch('blur' + key, src.width, src.height), g = clear(c); g.filter = `blur(${px}px)`; g.drawImage(src, 0, 0); g.filter = 'none'; return c;
}

const OVER = {
  async words(g, t, b, xf) {
    const items = b.items || [], behindAny = [], front = [];
    const sideOf = pos => /left/.test(pos) ? -1 : /right/.test(pos) ? 1 : 0;
    // placement is fixed in the room at the word's start: it moves with the camera like a real object
    b._pl ||= [];
    items.forEach((it, i) => {
      const at = it.at ?? (b.start + i * .6); if (t < at - .05) return;
      const pos = it.pos || ['left', 'right', 'top-left', 'top-right'][i % 4];
      const depth = it.depth || b.depth || (INFO.matte ? 'behind' : 'front');
      const side = sideOf(pos);
      const [main, sub] = String(it.text).split('\n');
      if (!b._pl[i]) {
        const xa = presenterXf(at), hb = headBox(at, xa);
        let size = (it.size || (depth === 'behind' ? 150 : 120)) * U;
        // into the head a little when behind (the head covers part of the word), clear of the face when in front
        const gapX = depth === 'behind' ? -hb.w * .25 : hb.w * .75;
        let sx = side < 0 ? hb.cx - hb.w * .5 - gapX : side > 0 ? hb.cx + hb.w * .5 + gapX : hb.cx;
        let sy = /top/.test(pos) || side === 0 ? hb.top - size * (depth === 'behind' ? .05 : .55) : /bottom/.test(pos) ? hb.cy + hb.h * .9 : hb.cy - hb.h * .2;
        b._pl[i] = { u: (sx - xa.x) / xa.s, v: (sy - xa.y) / xa.s, s: xa.s, size, side, depth };
      }
      const pl = b._pl[i], k = xf.s / pl.s, size = pl.size;
      const col = it.color || '#FFFFFF', wc = wordCanvas(b.i + '_' + i, main, sub, size, col, t, at, b.end);
      let x = xf.x + pl.u * xf.s, y = xf.y + pl.v * xf.s;
      const ki = eSpring(prog(t, at, .7)), ko = eIn(prog(t, b.end - .35, .35));
      const ryT = (it.ry ?? pl.side * -16), o = {
        w: wc.w, h: wc.h, ax: pl.side < 0 ? 1 : pl.side > 0 ? 0 : .5, ay: .62, x, y,
        z: lerp(420, 0, ki) + ko * 500 + (pl.depth === 'behind' ? 0 : -60), ry: lerp(ryT + pl.side * 60, ryT, ki) - ko * pl.side * 30, rx: lerp(-25, 4, ki), rz: it.rz ?? pl.side * -1.5,
        s: k * (it.scale ?? 1), alpha: clamp(ki * 3) * (1 - ko),
      };
      // keep the whole word inside the frame (never cut by the edge): measured at its resting pose, then the same
      // shift / shrink applies to the animated one
      const m = 48 * U, rest = { ...o, z: pl.depth === 'behind' ? 0 : -60, ry: ryT, rx: 4, alpha: 1 };
      for (let pass = 0; pass < 3; pass++) {
        const bd = GL.bounds(rest), xs = bd.map(p => p[0]), ys = bd.map(p => p[1]);
        const wspan = Math.max(...xs) - Math.min(...xs), hspan = Math.max(...ys) - Math.min(...ys);
        if (wspan > W - 2 * m || hspan > H - 2 * m) { const f = Math.min((W - 2 * m) / wspan, (H - 2 * m) / hspan) * .97; rest.s *= f; o.s *= f; continue; }
        const dx = Math.max(0, m - Math.min(...xs)) - Math.max(0, Math.max(...xs) - (W - m)), dy = Math.max(0, m - Math.min(...ys)) - Math.max(0, Math.max(...ys) - (H - m));
        rest.x += dx; rest.y += dy; o.x += dx; o.y += dy;
      }
      (pl.depth === 'behind' ? behindAny : front).push({ wc, o, key: b.i + '_' + i });
    });
    const draw = list => gl3d(g, G => list.forEach(({ wc, o, key }) => {
      const sh = blurred(key, wc.c, 10 * U);
      G.plane(sh, { ...o, x: o.x + 10 * U, y: o.y + 16 * U, z: o.z + 30, tint: [0, 0, 0, 1], alpha: o.alpha * .45 });
      G.extrude(wc.c, o, 26, 9, [.16, .17, .2]);
      G.plane(wc.c, o);
    }));
    if (behindAny.length) { draw(behindAny); if (await presenterCutout(t, xf)) blit(g, L.cut, 0, 0); }
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
