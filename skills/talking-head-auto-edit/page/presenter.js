// talking-head-auto-edit engine, part 2: the camera on the presenter.
// Framing is a set of cuts between a wide shot (1.0) and a medium-close shot (<= ~1.2: never a tight face crop).
// The camera follows the head (work/track.json from matte.py) like an operator: the face stays put in the frame.
'use strict';

const ZMAX = 1.24;                  // the closest the plan may frame the presenter
let TALK = [], AIM = null;          // AIM: smoothed head track per frame {x, y}

function buildTalk() {
  const kf = (PLAN.talk && PLAN.talk.length ? PLAN.talk.slice() : autoTalk()).map(k => ({ ...k, zoom: Math.min(ZMAX, k.zoom || 1) }));
  kf.sort((a, b) => a.t - b.t);
  if (!kf.length || kf[0].t > 0) kf.unshift({ t: 0, zoom: 1 });
  TALK = kf;
  if (TRACK && TRACK.x?.length) {
    // operator smoothing: a critically damped follow, run forward and backward (no lag, no jitter)
    const n = TRACK.x.length, sm = (arr, k) => { const o = arr.slice(); for (let i = 1; i < n; i++) o[i] = lerp(o[i - 1], arr[i], k); for (let i = n - 2; i >= 0; i--) o[i] = lerp(o[i + 1], o[i], k); return o; };
    AIM = { x: sm(TRACK.x, .22), y: sm(TRACK.y, .18) };
  }
}
function autoTalk() {
  const out = [{ t: 0, zoom: 1 }]; let last = 0, close = false;
  WORDS.forEach((w, i) => { const prev = WORDS[i - 1]; if (prev && /[.!?]$/.test(prev.w) && w.s - last > 2.5) { close = !close; out.push({ t: w.s - .05, zoom: close ? 1.18 : 1 }); last = w.s; } });
  return out;
}
function talkAt(t) {
  let i = 0; while (i + 1 < TALK.length && TALK[i + 1].t <= t) i++;
  const k = TALK[i], next = TALK[i + 1], end = next ? next.t : DUR;
  const span = Math.max(.5, end - k.t), p = clamp((t - k.t) / span);
  let zoom = (k.zoom || 1) * (1 + (k.push ?? .03) * eIO(p));
  if (k.snap) zoom *= 1 + .035 * (1 - eOut(prog(t, k.t, .3)));
  if (k.ease && i > 0) zoom = lerp(TALK[i - 1].zoom || 1, zoom, eIO(prog(t, k.t, k.ease)));
  return { zoom, fx: k.x, fy: k.y, side: k.side, idx: i, since: t - k.t };
}
function aimAt(t) {
  if (!AIM) return { x: FACE.cx, y: FACE.cy };
  const f = clamp(t * FPS, 0, AIM.x.length - 1), i = Math.floor(f), j = Math.min(AIM.x.length - 1, i + 1), k = f - i;
  return { x: lerp(AIM.x[i], AIM.x[j], k), y: lerp(AIM.y[i], AIM.y[j], k) };
}

// where the take lands on screen at time t: {x, y, s, rot, sw, sh} (s = pixels of screen per pixel of take)
function presenterXf(t, opt = {}) {
  const sw = INFO.width, sh = INFO.height, cam = talkAt(t);
  const zoom = cam.zoom * (opt.zoomMul || 1);
  const s0 = Math.max(W / sw, H / sh), s = s0 * zoom;
  const aim = aimAt(t);
  const fx = (cam.fx ?? aim.x) * sw, fy = (cam.fy ?? aim.y) * sh;
  // the face goes to an anchor (centre, a little above the middle); at zoom 1 there is no room, so it stays put
  const ax = W * (opt.anchorX ?? .5), ay = H * (V ? .36 : .4);
  let x = ax - fx * s, y = ay - fy * s;
  const amp = (PLAN.vfx?.handheld ?? 1) * U * (opt.handheld ?? 1);
  x += noise1(t * .5, 11) * 5 * amp; y += noise1(t * .45, 23) * 4 * amp;
  const dw = sw * s, dh = sh * s;
  x = clamp(x, W - dw, 0); y = clamp(y, H - dh, 0);       // never show an edge of the take
  return { x, y, s, sw, sh, dw, dh, rot: noise1(t * .4, 37) * .0012 * (PLAN.vfx?.handheld ?? 1) };
}
function applyXf(g, xf) { g.translate(W / 2, H / 2); g.rotate(xf.rot); g.translate(-W / 2, -H / 2); }

async function drawPresenter(g, t, opt = {}) {
  const img = await frame(t * FPS + 1), xf = opt.xf || presenterXf(t, opt);
  g.save(); applyXf(g, xf);
  const grade = PLAN.vfx?.grade ?? (INFO.graded ? '' : 'contrast(1.06) saturate(1.08) brightness(1.01)');
  g.filter = ((opt.blur ? `blur(${opt.blur}px) ` : '') + (opt.dim ? `brightness(${1 - opt.dim}) ` : '') + (grade === 'none' ? '' : grade)).trim() || 'none';
  const pad = opt.blur ? opt.blur * 2 : 0;
  g.drawImage(img, xf.x - pad, xf.y - pad, xf.dw + pad * 2, xf.dh + pad * 2);
  g.restore();
  if (!opt.noVignette && (PLAN.vfx?.vignette ?? true)) vignette(g, .26);
  return xf;
}
// the presenter alone (alpha from the matte) in L.cut, drawn with the same transform: put it back over anything that
// should sit *behind* the presenter. Returns false without a matte.
async function presenterCutout(t, xf, opt = {}) {
  const m = await matte(t * FPS + 1); if (!m) return false;
  const img = await frame(t * FPS + 1), g = clear(L.cut);
  g.save(); applyXf(g, xf);
  if (opt.grade !== false && !INFO.graded) g.filter = 'contrast(1.06) saturate(1.08) brightness(1.01)';
  g.drawImage(img, xf.x, xf.y, xf.dw, xf.dh); g.filter = 'none';
  g.globalCompositeOperation = 'destination-in'; g.drawImage(m, xf.x, xf.y, xf.dw, xf.dh);
  g.restore();
  return true;
}
function vignette(g, a) {
  const r = g.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .62);
  r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = r; g.fillRect(0, 0, W, H);
}
// head box on screen (for layout: words never cover the face)
function headBox(t, xf) {
  const a = aimAt(t), fx = xf.x + a.x * xf.sw * xf.s, fy = xf.y + a.y * xf.sh * xf.s;
  const fw = (FACE.w || .16) * xf.sw * xf.s, fh = (FACE.h || .3) * xf.sh * xf.s;
  return { cx: fx, cy: fy, w: fw, h: fh, top: fy - fh * .75 };
}
