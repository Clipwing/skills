// talking-head-auto-edit engine, part 4: what draws over (or around) the presenter.
//   words  : flat text beside the presenter. The camera moves the presenter to one side (a little closer) and a clean
//            white panel with the words takes the other side; `style: "headline"` is one line across the lower third
//   callout, subscribe : small labels
//   split  : the presenter in a window on one side, a text panel on the other side (a full-screen beat that animates
//            itself in and out, so it needs no transition)
'use strict';

// ------------------------------------------------------------------ words beside the presenter
// the side the text takes (the presenter goes to the other one): b.side, else the first item's pos, else right
function wordsSide(b) {
  if (b._side) return b._side;
  const p = b.side || (b.items || []).map(it => it.pos || '').find(p2 => /left|right/.test(p2)) || 'right';
  return b._side = /left/.test(p) ? -1 : 1;
}
// how far the camera has moved the presenter aside for a words beat at time t (0..1), and to which side
function wordsFrame(t) {
  if (V) return null;
  for (const b of BEATS) {
    if (b.type !== 'words' || b.style === 'headline' || t < b.start - .5 || t > b.end + .5) continue;
    const k = eIO(prog(t, b.start - .35, .6)) * (1 - eIO(prog(t, b.end - .3, .6)));
    if (k > 0) return { k, side: wordsSide(b) };
  }
  return null;
}
const wordText = it => String(it.text || '').replace(/\s*\n\s*/g, ' ').trim();

const OVER = {
  words(g, t, b, xf) {
    if (b.style === 'headline') return headline(g, t, b);
    const items = b.items || [], side = wordsSide(b);
    const env = eOut(prog(t, b.start - .1, .45)) * (1 - eIn(prog(t, b.end - .3, .3)));
    if (env <= 0) return;
    // one white plate per line, standing in space on the free side, turned gently (~11 degrees) so the outer edge is nearer the camera (the edge by the
    // presenter recedes), stacked as they are said, each with a soft shadow. 9:16: low, square to the camera.
    const pw = V ? W * .82 : W * .36, pad = 44 * U, gapY = 26 * U, cx = V ? W / 2 : (side > 0 ? W * .73 : W * .27);
    const tmp = scratch('wordsMeasure', 8, 8).getContext('2d');
    const fits = items.map(it => fitWrap(tmp, wordText(it), pw - pad * 2 - 26 * U, (it.size || (items.length > 1 ? 72 : 92)) * U, 800, SANS, 2, 44 * U));
    const lh = f => f.size * 1.1, ph = fits.map(f => f.lines.length * lh(f) + pad * 1.5);
    const total = ph.reduce((a2, x) => a2 + x, 0) + gapY * (ph.length - 1);
    let y = V ? H * .62 : H * .5 - total / 2 + 10 * U, lastOn = -1;
    items.forEach((it, i) => { if (t >= (it.at ?? b.start + i * .6) - .12) lastOn = i; });
    const plates = items.map((it, i) => {
      const f = fits[i], h = ph[i], at = (it.at ?? (b.start + i * .6)) - .12, k = eOut5(prog(t, at, .55)), cur = i === lastOn || items.length === 1;
      const cy = y + h / 2; y += h + gapY;
      if (k <= 0) return null;
      const cv = scratch('wordPlate' + i, Math.ceil(pw), Math.ceil(h)), c = clear(cv);
      c.fillStyle = '#FFFFFF'; roundRect(c, 0, 0, pw, h, 24 * U); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.06)'; c.lineWidth = 2 * U; roundRect(c, 1, 1, pw - 2, h - 2, 24 * U); c.stroke();
      if (cur) { c.fillStyle = it.color && !/^#f{3,6}$/i.test(it.color) ? it.color : C.accent; roundRect(c, pad, pad * .75 + f.size * .1, 8 * U, h - pad * 1.5 - f.size * .2, 4 * U); c.fill(); }
      c.font = font(f.size, 800); c.fillStyle = cur ? C.ink : C.mute; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      f.lines.forEach((l, li) => txt(c, l, pad + 30 * U, pad * .75 + li * lh(f) + f.size * .84));
      return { cv, h, cy, k, i };
    }).filter(Boolean);
    gl3d(g, G => plates.forEach(p => drawCard(G, p.cv, pw, p.h, {
      x: cx + (1 - p.k) * side * 60 * U, y: p.cy + (1 - p.k) * 30 * U, z: (1 - p.k) * 140 - p.i * 24,
      ry: V ? 0 : side * (11 + 6 * (1 - p.k)), rx: V ? 4 : 0, rz: 0, alpha: env * clamp(p.k * 2), shadow: .2,
    })));
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

// ------------------------------------------------------------------ headline: one line across the lower third
// the sentence lands word by word on the voice; `mark` words get a marker; the presenter stays as framed
function headline(g, t, b) {
  const text = b.text || (b.items || []).map(wordText).join(' '), words = text.split(/\s+/).filter(Boolean);
  const env = eOut(prog(t, b.start - .1, .4)) * (1 - eIn(prog(t, b.end - .3, .3))); if (env <= 0) return;
  const spoken = spokenTimes(text, b.start - .3, b.end), marks = String(b.mark || '').toLowerCase().split(/\s+/).filter(Boolean);
  const maxW = W * (V ? .86 : .84), f = fitWrap(g, text, maxW, (b.size || (V ? 80 : 88)) * U, 800, SANS, V ? 3 : 1, 40 * U);
  g.font = font(f.size, 800); const sp = g.measureText(' ').width, padX = 46 * U, lh = f.size * 1.18;
  const bw = Math.max(...f.lines.map(l => g.measureText(l).width)) + padX * 2, bh = f.lines.length * lh + 40 * U;
  const bx = (W - bw) / 2, by = H * (V ? .66 : .79) - bh / 2;
  g.save(); g.globalAlpha = env; g.translate(0, (1 - env) * 30 * U);
  shadow(g, 40 * U, 14 * U, .18); g.fillStyle = 'rgba(255,255,255,.97)'; roundRect(g, bx, by, bw * lerp(.85, 1, env) + bw * 0, bh, 26 * U); g.fill(); noShadow(g);
  let wi = 0, last = b.start;
  f.lines.forEach((ln, li) => {
    let x = W / 2 - g.measureText(ln).width / 2; const yc = by + 20 * U + lh * (li + .5);
    for (const w of ln.split(' ')) {
      const at = Math.max(b.start, (spoken[wi] ?? last + .12) - .06); last = at;
      const k = eOut(prog(t, at, .3)), ww = g.measureText(w).width, isMark = marks.includes(w.toLowerCase().replace(/[^a-z0-9'-]/g, ''));
      if (isMark && k > 0) { const mk = eIO(prog(t, at + .15, .35)); g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = C.yellow; roundRect(g, x - 8 * U, yc - f.size * .52, (ww + 16 * U) * mk, f.size * 1.04, 10 * U); g.fill(); g.restore(); }
      g.save(); g.globalAlpha *= clamp(k * 1.6); g.translate(0, (1 - k) * 16 * U); g.fillStyle = C.ink; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; txt(g, w, x, midBase(g, yc)); g.restore();
      x += ww + sp; wi++;
    }
  });
  g.restore();
}

// ------------------------------------------------------------------ split: presenter on one side, a panel on the other
SCENES.split = async function (g, t, b) {
  const right = (b.side || 'left') === 'right';                      // which side the presenter goes to
  // coming from the presenter (in: self) the full frame eases into the window; coming from a card (a transition) the
  // window is already in place, so no shape changes under the transition
  const kin = b.in === 'self' ? eIO(prog(t, b.start, .8)) : 1, kout = b.out === 'self' ? eIO(prog(t, b.end - .8, .8)) : 0, k = kin * (1 - kout);
  stage(g, t, b);
  // the panel text: the kicker first, the title a few frames later, then the points on their words
  const pw = V ? W * .86 : W * .44, px = V ? W * .07 : (right ? W * .05 : W * .51), c = clear(L.card);
  let y = V ? H * .58 : H * .2;
  const textOut = b.out === 'self' ? prog(t, b.end - .8, .35) : 0;
  const reveal = (at, fn) => { const kk = prog(t, at, .45) * (1 - textOut); if (kk > 0) withReveal(c, kk, fn, 10 * U); };
  const t0 = b.in === 'self' ? b.start + .45 : b.start + .1;
  if (b.kicker) { reveal(t0, () => chip(c, px, y, b.kicker.toUpperCase(), b.color || C.accent)); y += 70 * U; }
  const tf = fitWrap(c, b.title || '', pw, (V ? 88 : 84) * U, 800, SANS, 3);
  reveal(t0 + .14, () => { c.font = font(tf.size, 800); c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'top'; tf.lines.forEach((l, i) => txt(c, l, px, y + i * tf.size * 1.08)); });
  y += tf.lines.length * tf.size * 1.08 + 40 * U;
  if (b.value !== undefined) {
    const v = Number(b.value) || 0, kc = eOut(prog(t, t0 + .2, 1.2)), sv = (b.prefix || '') + fmtNum(v * kc, b.decimals || 0) + (b.suffix || '');
    reveal(t0 + .2, () => { const ns = fitFont(c, (b.prefix || '') + fmtNum(v, b.decimals || 0) + (b.suffix || ''), pw, 150 * U, 800); c.font = font(ns, 800); c.fillStyle = b.color || C.accent; c.textAlign = 'left'; c.textBaseline = 'top'; txt(c, sv, px, y); });
    y += 170 * U;
  }
  (b.items || []).forEach((it, i) => {
    const at = Math.max(t0 + .25, (it.at ?? (b.start + .9 + i * .6)) - .1), kk = prog(t, at, .4) * (1 - textOut);
    const f = fitWrap(c, it.text, pw - 70 * U, (V ? 46 : 42) * U, 700, SANS, 2), yy = y;
    if (kk > 0) withReveal(c, kk, () => { c.font = font(f.size, 700); c.fillStyle = b.color || C.accent; c.beginPath(); c.arc(px + 14 * U, yy + f.size * .55, 10 * U, 0, Math.PI * 2); c.fill();
      c.fillStyle = C.ink2; c.textAlign = 'left'; c.textBaseline = 'top'; f.lines.forEach((l, li) => txt(c, l, px + 50 * U, yy + li * f.size * 1.15)); }, 8 * U);
    y += f.lines.length * f.size * 1.15 + 30 * U;
  });
  blit(g, L.card, 0, 0);
  // the presenter: from the full frame into a rounded window, cropped around the face. Clean edge: a white mat under
  // the picture carries the shadow, nothing dark can show at the rounded corners.
  const xf = presenterXf(t), pg = clear(L.tmp); await drawPresenter(pg, t, { xf, noVignette: true });
  const ww = V ? W * .86 : W * .42, wh = V ? H * .44 : H * .84, wx = V ? W * .07 : (right ? W * .54 : W * .04), wy = V ? H * .06 : H * .08;
  const hb = headBox(t, xf), srcW = H * ww / wh, sx = clamp(hb.cx - srcW / 2, 0, W - srcW);
  const r0 = [0, 0, W, H], r1 = [sx, 0, srcW, H], d1 = [wx, wy, ww, wh];
  const sr = r0.map((v, i) => lerp(v, r1[i], k)), dr = r0.map((v, i) => lerp(v, d1[i], k)), rad = 30 * U * k;
  g.save(); if (k > .02) { shadow(g, 50 * U * k, 16 * U * k, .18 * k); g.fillStyle = '#FFFFFF'; roundRect(g, dr[0], dr[1], dr[2], dr[3], rad); g.fill(); noShadow(g); }
  roundRect(g, dr[0], dr[1], dr[2], dr[3], rad); g.clip(); g.drawImage(L.tmp, sr[0], sr[1], sr[2], sr[3], dr[0], dr[1], dr[2], dr[3]); g.restore();
};
SCENES.split.async = true;
