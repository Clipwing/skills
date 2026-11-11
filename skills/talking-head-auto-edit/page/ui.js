// talking-head-auto-edit engine, part 5: interface scenes (the kind of screen a viewer recognises from their own apps).
//   post  : a social post typed in a composer and published, in an app window on the white stage; reactions count up
//   phone : a large phone, square to the camera, playing a vertical clip cut from the presenter's own take
'use strict';

const PLATFORM = {
  x:        { name: 'X', color: '#0F1419', button: 'Post', bg: '#FFFFFF', handle: true, icon: '\u{1D54F}' },
  linkedin: { name: 'LinkedIn', color: '#0A66C2', button: 'Post', bg: '#F4F2EE', handle: false, icon: 'in' },
  threads:  { name: 'Threads', color: '#000000', button: 'Post', bg: '#FFFFFF', handle: true, icon: '@' },
  tiktok:   { name: 'TikTok', color: '#FE2C55', tabs: ['Following', 'For You'] },
  shorts:   { name: 'Shorts', color: '#FF0033', tabs: ['Shorts'] },
  reels:    { name: 'Reels', color: '#E1306C', tabs: ['Reels'] },
};

function pointer(g, x, y, s, pressed) {
  g.save(); g.translate(x, y); g.scale(s * (pressed ? .9 : 1), s * (pressed ? .9 : 1)); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 34); g.lineTo(9, 26); g.lineTo(15, 40); g.lineTo(21, 37); g.lineTo(15, 24); g.lineTo(27, 24); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function avatar(g, x, y, r, name, col) {
  g.save(); g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = font(r * .8, 800); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(), x, y + r * .05); g.restore();
}
function heart(g, x, y, s, fill) {
  g.save(); g.translate(x, y); g.scale(s, s); g.beginPath(); g.moveTo(0, 6); g.bezierCurveTo(-16, -6, -8, -18, 0, -9); g.bezierCurveTo(8, -18, 16, -6, 0, 6); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); } else { g.lineWidth = 2.2 / s * U; g.stroke(); } g.restore();
}
function bubble(g, x, y, s) { g.save(); g.translate(x, y); g.scale(s, s); g.beginPath(); g.ellipse(0, -2, 13, 10, 0, 0, Math.PI * 2); g.moveTo(-6, 6); g.lineTo(-10, 13); g.lineTo(-1, 7); g.lineWidth = 2.2 / s * U; g.stroke(); g.restore(); }
function arrows(g, x, y, s) { g.save(); g.translate(x, y); g.scale(s, s); g.lineWidth = 2.2 / s * U; g.beginPath(); g.moveTo(-12, -4); g.lineTo(-12, -8); g.lineTo(8, -8); g.moveTo(4, -12); g.lineTo(8, -8); g.lineTo(4, -4); g.moveTo(12, 4); g.lineTo(12, 8); g.lineTo(-8, 8); g.moveTo(-4, 4); g.lineTo(-8, 8); g.lineTo(-4, 12); g.stroke(); g.restore(); }

// a post typed and published: {platform, author, handle?, text, metrics: {likes, comments, reposts}, cps?}
SCENES.post = function (g, t, b) {
  const pf = PLATFORM[b.platform] || PLATFORM.linkedin, ui = clear(L.ui);
  ui.fillStyle = pf.bg; ui.fillRect(0, 0, W, H);
  browserChrome(ui);
  // the app around the feed: a top bar and a side column, quiet
  ui.fillStyle = '#fff'; ui.fillRect(0, 64 * U, W, 84 * U); ui.fillStyle = '#E3E1DC'; ui.fillRect(0, 148 * U, W, 2 * U);
  ui.fillStyle = pf.color; roundRect(ui, W * .14, 84 * U, 44 * U, 44 * U, 8 * U); ui.fill();
  ui.fillStyle = '#fff'; ui.font = font(26 * U, 800); ui.textAlign = 'center'; ui.textBaseline = 'middle'; ui.fillText(pf.icon, W * .14 + 22 * U, 107 * U);
  ui.fillStyle = '#EEECE8'; roundRect(ui, W * .14 + 64 * U, 88 * U, 300 * U, 36 * U, 18 * U); ui.fill();
  const fw = V ? W * .9 : W * .6, fx = (W - fw) / 2, side = (xx, yy, ww, hh) => { ui.fillStyle = '#fff'; roundRect(ui, xx, yy, ww, hh, 14 * U); ui.fill(); ui.fillStyle = '#E4E1DB'; roundRect(ui, xx + 24 * U, yy + 28 * U, ww * .6, 14 * U, 7 * U); ui.fill(); roundRect(ui, xx + 24 * U, yy + 56 * U, ww * .4, 12 * U, 6 * U); ui.fill(); };
  if (!V) { side(W * .04, 200 * U, W * .15, 300 * U); side(W * .81, 200 * U, W * .15, 240 * U); side(W * .81, 470 * U, W * .15, 190 * U); }
  // the composer, then the published post
  const text = b.text || '', cps = b.cps || 22, t0 = b.start + .35, typed = typeText(t, t0, text, cps);
  const tPress = Math.min(b.end - 1.6, t0 + text.length / cps + .45), posted = t >= tPress + .15, pk = eOut5(prog(t, tPress + .15, .5));
  const name = b.author || 'Your Name', col = pf.color === '#000000' || pf.color === '#0F1419' ? '#5B6CFF' : pf.color;
  const pad = 54 * U, avR = 50 * U, fs = (V ? 48 : 56) * U;
  ui.font = font(fs, 500); const lines = wrap(ui, posted ? text : typed.s || ' ', fw - pad * 2).slice(0, 6), lh = fs * 1.35, nFinal = Math.min(6, wrap(ui, text, fw - pad * 2).length);
  const ch = pad + avR * 2 + 26 * U + Math.max(2, nFinal) * lh + 40 * U + 90 * U, fy = Math.max(190 * U, (H - ch) / 2 + 40 * U);
  ui.save(); shadow(ui, 30 * U, 8 * U, .12 + .06 * pk); ui.fillStyle = '#fff'; roundRect(ui, fx, fy, fw, ch, 16 * U); ui.fill(); ui.restore();
  avatar(ui, fx + pad + avR, fy + pad + avR, avR, name, col);
  ui.textAlign = 'left'; ui.textBaseline = 'middle'; ui.fillStyle = '#111'; ui.font = font(40 * U, 800); txt(ui, name, fx + pad + avR * 2 + 22 * U, fy + pad + avR - 20 * U);
  ui.font = font(30 * U, 500); ui.fillStyle = '#777'; txt(ui, posted ? (pf.handle ? '@' + (b.handle || name.toLowerCase().replace(/\s+/g, '')) + ' · now' : 'Just now · \u{1F310}') : (pf.handle ? '@' + (b.handle || name.toLowerCase().replace(/\s+/g, '')) : 'Post to Anyone'), fx + pad + avR * 2 + 22 * U, fy + pad + avR + 22 * U);
  ui.font = font(fs, 500); ui.fillStyle = '#1a1a1a'; ui.textBaseline = 'alphabetic';
  const ty0 = fy + pad + avR * 2 + 26 * U + fs;
  lines.forEach((l, i) => txt(ui, l, fx + pad, ty0 + i * lh));
  if (!posted && (typed.caret || Math.floor(t * 2.2) % 2 === 0)) { const last = lines[lines.length - 1] || ''; ui.fillStyle = pf.color === '#0F1419' ? '#1D9BF0' : pf.color; ui.fillRect(fx + pad + ui.measureText(last).width + 3 * U, ty0 + (lines.length - 1) * lh - fs * .85, 2.5 * U, fs * 1.05); }
  const by = fy + ch - 90 * U;
  // the Post button stays where it is after the click (it turns into a quiet "Posted"); the pointer comes in, clicks
  // and then leaves the frame
  const pressed = t >= tPress && t < tPress + .15, bw2 = 190 * U, bx2 = fx + fw - pad - bw2, btnCol = pf.color === '#0F1419' ? '#0F1419' : pf.color;
  ui.save(); ui.globalAlpha = posted ? 1 : (typed.done ? 1 : .45);
  if (posted) { ui.strokeStyle = hexA(btnCol.startsWith('#') && btnCol.length === 7 ? btnCol : '#000000', .35); ui.lineWidth = 2.5 * U; roundRect(ui, bx2, by, bw2, 68 * U, 34 * U); ui.stroke(); }
  else { ui.fillStyle = btnCol; const ps = pressed ? .96 : 1; roundRect(ui, bx2 + bw2 * (1 - ps) / 2, by + 68 * U * (1 - ps) / 2, bw2 * ps, 68 * U * ps, 34 * U); ui.fill(); }
  ui.fillStyle = posted ? btnCol : '#fff'; ui.font = font(34 * U, 800); ui.textAlign = 'center'; ui.textBaseline = 'middle'; ui.fillText(posted ? 'Posted' : pf.button, bx2 + bw2 / 2, by + 35 * U); ui.restore();
  const ck = eIO(prog(t, tPress - .7, .65)), cx0 = lerp(bx2 + bw2 + 260 * U, bx2 + bw2 * .55, ck), cy0 = lerp(by + 300 * U, by + 34 * U, ck);
  const ek = eIn(prog(t, tPress + .25, .6));
  if (ck > 0 && ek < 1) pointer(ui, lerp(cx0, W + 120 * U, ek), lerp(cy0, by + 420 * U, ek), 1.8 * U, pressed);
  if (posted) {
    // reactions count up and keep ticking, on the left of the button row
    const m = b.metrics || { likes: 248, comments: 31, reposts: 12 }, kc = eOut(prog(t, tPress + .4, Math.max(1, b.end - tPress - 1)));
    ui.fillStyle = '#E8E6E1'; ui.fillRect(fx + pad, by - 14 * U, fw - pad * 2, 2 * U);
    const rowW = bx2 - fx - pad - 30 * U;
    const items = [['likes', (x, y) => heart(ui, x, y, 1.7 * U, kc > .05 ? '#F0365A' : null)], ['comments', (x, y) => bubble(ui, x, y, 1.6 * U)], ['reposts', (x, y) => arrows(ui, x, y, 1.6 * U)]];
    items.forEach(([k, ic], i) => {
      const x = fx + pad + 24 * U + i * rowW / 3, y = by + 36 * U; ui.strokeStyle = '#555'; ic(x, y);
      ui.fillStyle = '#333'; ui.font = font(36 * U, 700); ui.textAlign = 'left'; ui.textBaseline = 'middle'; txt(ui, fmtNum(Math.round((m[k] || 0) * kc), 0), x + 40 * U, y + 1 * U);
    });
    for (let i = 0; i < 6; i++) { const hk = prog(t, tPress + .5 + i * .22, 1.1); if (hk <= 0 || hk >= 1) continue; ui.save(); ui.globalAlpha = 1 - hk; heart(ui, fx + pad + 20 * U + Math.sin(i * 2.1) * 30 * U, by - hk * 160 * U, (1 + hk) * 1.1 * U, '#F0365A'); ui.restore(); }
  }
  windowShot(g, t, b);
};

// a vertical clip playing on a phone: {platform: tiktok|shorts|reels, handle?, caption?, likes?, comments?, offset?, side?}
SCENES.phone = async function (g, t, b) {
  stage(g, t, b);
  const pf = PLATFORM[b.platform] || PLATFORM.tiktok;
  const ph = H * (V ? .74 : 1.02), pw = ph * .49, bez = 16 * U, sw = pw - bez * 2, sh = ph - bez * 2;
  const card = scratch('phone', pw, ph), c = clear(card);
  // the phone body
  c.save(); shadow(c, 40 * U, 14 * U, .3); c.fillStyle = '#121214'; roundRect(c, 0, 0, pw, ph, 64 * U); c.fill(); c.restore();
  c.strokeStyle = '#3a3a3e'; c.lineWidth = 3 * U; roundRect(c, 1.5 * U, 1.5 * U, pw - 3 * U, ph - 3 * U, 63 * U); c.stroke();
  c.save(); roundRect(c, bez, bez, sw, sh, 50 * U); c.clip();
  // the clip: the presenter's own take, cropped vertical around the face
  const tc = t + (b.offset || 0), img = await frame(tc * FPS + 1), a = aimAt(tc);
  const cropH = img.height, cropW = cropH * sw / sh, cx = clamp(a.x * img.width - cropW / 2, 0, img.width - cropW);
  c.filter = PLAN.vfx?.grade ?? (INFO.graded ? 'none' : 'contrast(1.06) saturate(1.08)'); c.drawImage(img, cx, 0, cropW, cropH, bez, bez, sw, sh); c.filter = 'none';
  const sg = c.createLinearGradient(0, bez + sh * .55, 0, bez + sh); sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.65)'); c.fillStyle = sg; c.fillRect(bez, bez, sw, sh);
  const tg = c.createLinearGradient(0, bez, 0, bez + 160 * U); tg.addColorStop(0, 'rgba(0,0,0,.4)'); tg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = tg; c.fillRect(bez, bez, sw, 160 * U);
  // app chrome: tabs, the action column, handle + caption, progress
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  (pf.tabs || []).forEach((tb, i, arr) => { c.font = font(24 * U, tb === arr[arr.length - 1] ? 800 : 600); c.globalAlpha = tb === arr[arr.length - 1] ? 1 : .7; c.fillText(tb, bez + sw / 2 + (i - (arr.length - 1) / 2) * 150 * U, bez + 70 * U); });
  c.globalAlpha = 1;
  const colX = bez + sw - 52 * U, kc = eOut(prog(t, b.start + .3, b.end - b.start));
  [[(x, y) => heart(c, x, y, 2.8 * U, '#fff'), fmtNum(Math.round((b.likes ?? 48200) * (.6 + .4 * kc)), 0)], [(x, y) => { c.strokeStyle = '#fff'; bubble(c, x, y, 2.4 * U); }, fmtNum(b.comments ?? 1240, 0)], [(x, y) => { c.strokeStyle = '#fff'; arrows(c, x, y, 2.2 * U); }, 'Share']]
    .forEach(([ic, label], i) => { const y = bez + sh * .5 + i * 120 * U; ic(colX, y); c.fillStyle = '#fff'; c.font = font(20 * U, 700); c.textAlign = 'center'; c.fillText(label, colX, y + 46 * U); });
  avatar(c, colX, bez + sh * .5 - 120 * U, 30 * U, b.handle || 'You', pf.color);
  c.textAlign = 'left'; c.font = font(26 * U, 800); c.fillStyle = '#fff'; txt(c, '@' + (b.handle || 'yourchannel'), bez + 28 * U, bez + sh - 150 * U);
  if (b.caption) { c.font = font(22 * U, 500); wrap(c, b.caption, sw - 150 * U).slice(0, 2).forEach((l, i) => txt(c, l, bez + 28 * U, bez + sh - 112 * U + i * 30 * U)); }
  // spoken words as short-form captions
  const wi = WORDS.findIndex(w => w.e > tc), grp = wi < 0 ? [] : WORDS.slice(Math.floor(wi / 3) * 3, Math.floor(wi / 3) * 3 + 3).filter(w => w.s < tc + .4);
  if (grp.length) { const capY = bez + sh * .62, capLine = grp.map(w => w.w.replace(/[^\w'’-]/g, '')).join(' ').toUpperCase(); c.font = font(fitFont(c, capLine, sw * .8, 44 * U, 800), 800); c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = 9 * U; c.strokeStyle = 'rgba(0,0,0,.85)';
    const line = grp.map(w => w.w.replace(/[^\w'’-]/g, '')).join(' ').toUpperCase(); c.strokeText(line, bez + sw / 2, capY); c.fillStyle = '#fff'; c.fillText(line, bez + sw / 2, capY); }
  c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(bez, bez + sh - 8 * U, sw, 4 * U); c.fillStyle = '#fff'; c.fillRect(bez, bez + sh - 8 * U, sw * clamp((tc % 30) / 30), 4 * U);
  c.restore();
  c.fillStyle = '#000'; roundRect(c, pw / 2 - 60 * U, bez + 14 * U, 120 * U, 34 * U, 17 * U); c.fill();   // the camera island
  // the phone: large (about half the frame in 16:9; its bottom runs just off the frame), square to the camera
  const right = b.side !== 'left', px = V ? W / 2 : W * (right ? .68 : .32), py = V ? H * .58 : H * .04 + ph / 2;
  gl3d(g, G => drawCard(G, card, pw, ph, pose(t, b, { x: px, y: py, shadow: .22, dolly: 40 })));
  if (b.title && !V) {
    // the kicker first, the title a few frames later
    const ko = eIn(prog(t, b.end - .4, .4)), x0 = right ? W * .08 : W * .54, f = fitWrap(g, b.title, W * .4, 96 * U, 800, SANS, 3);
    const kk = eOut(prog(t, b.start + .2, .45)), kt = eOut(prog(t, b.start + .34, .5)), ty = H * .5 - (f.lines.length - 1) * f.size * .55 + f.size * .35;
    g.save(); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    if (b.kicker && kk > 0) withReveal(g, kk * (1 - ko), () => chip(g, x0, ty - f.size * 1.05 - 64 * U, b.kicker.toUpperCase(), pf.color), 8 * U);
    if (kt > 0) withReveal(g, kt * (1 - ko), () => { g.fillStyle = C.ink; g.font = font(f.size, 800); f.lines.forEach((l, i) => txt(g, l, x0, ty + i * f.size * 1.08)); }, 10 * U);
    g.restore();
  }
};
