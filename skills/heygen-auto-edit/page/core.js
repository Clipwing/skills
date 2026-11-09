// heygen-auto-edit engine, part 1: constants, maths, data, layers, text, and a small WebGL compositor for 3D planes.
// The page is a pure function of time: noise is seeded by frame, so any frame can be drawn in any order.
'use strict';

const Q = new URLSearchParams(location.search);
const ASPECT = Q.get('aspect') === '9:16' ? '9:16' : '16:9';
const V = ASPECT === '9:16';
const W = V ? 1080 : 1920, H = V ? 1920 : 1080;
const U = Math.min(W, H) / 1080;          // 1 unit = 1 px of a 1080-short-side frame
const CHECK = Q.has('check');              // layout check: every text box is recorded and tested against the frame
const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');

// ------------------------------------------------------------------ style
let C = {
  paper: '#F4F2EE', paper2: '#ECE8E1', ink: '#121212', ink2: '#3A3733', mute: '#8B8782', line: '#DCD8D1',
  green: '#22A447', red: '#E5484D', accent: '#FF3B30', yellow: '#FFD43B', blue: '#2F6BFF',
  pills: ['#7B61FF', '#FF4FA3', '#FFB020', '#FF7A1A', '#22C55E', '#14B8E6'],
  hub: '#3BA9F5', chart: '#1F9E96', chart2: '#7B61FF', chart3: '#FF7A1A',
};
let SANS = 'Inter, Helvetica, Arial, sans-serif', SERIF = 'Serif2, Caslon, Georgia, serif', HEAD = 'Head, Inter, Helvetica, sans-serif';

// ------------------------------------------------------------------ maths
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, d) => clamp((t - a) / Math.max(1e-6, d));
const eOut = k => 1 - Math.pow(1 - k, 3);
const eOut5 = k => 1 - Math.pow(1 - k, 5);
const eIn = k => k * k * k;
const eIO = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const eBack = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const eSpring = k => k >= 1 ? 1 : 1 - Math.exp(-6 * k) * Math.cos(9 * k);       // overshoots once, settles
const DEG = Math.PI / 180;
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
function noise1(x, seed = 0) { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return lerp(hash(i * 7919 + seed), hash((i + 1) * 7919 + seed), s) * 2 - 1; }
// in/out envelope of a beat: 0 before start, 1 while it holds, back to 0 at the end (exit animations use 1 - out)
function life(t, b, inD = .45, outD = .4) { return { in: prog(t, b.start, inD), out: prog(t, b.end - outD, outD) }; }

// ------------------------------------------------------------------ data
let PLAN, WORDS, FACE, INFO, TRACK, FPS, DUR, SPEECH_END;
const IMG = {};                      // plan images by src
const SEQ = {};                      // image sequences (stock video) by src: {n, fps}

async function loadJSON(u, dflt) { try { const r = await fetch(u); if (!r.ok) throw 0; return await r.json(); } catch { return dflt; } }
function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('image ' + src)); im.src = src; }); }
function lru(max) {
  const m = new Map();
  return async (key, make) => {
    if (m.has(key)) { const v = m.get(key); m.delete(key); m.set(key, v); return v; }
    const v = await make(); m.set(key, v);
    if (m.size > max) { const k = m.keys().next().value; m.get(k)?.close?.(); m.delete(k); }
    return v;
  };
}
const frameCache = lru(8), matteCache = lru(6), seqCache = lru(12);
async function frame(i) {
  i = clamp(Math.round(i), 1, INFO.frames);
  return frameCache(i, async () => createImageBitmap(await loadImage(`/data/frames/${String(i).padStart(6, '0')}.jpg`)));
}
async function matte(i) {
  if (!INFO.matte) return null;
  i = clamp(Math.round(i), 1, INFO.frames);
  return matteCache(i, async () => { try { return lumAlpha(await createImageBitmap(await loadImage(`/data/matte/${String(i).padStart(6, '0')}.jpg`))); } catch { return null; } });
}
async function seqFrame(src, t) {
  const s = SEQ[src]; if (!s) return null;
  const i = clamp(Math.floor(t * s.fps) % s.n + 1, 1, s.n);
  return seqCache(src + i, async () => createImageBitmap(await loadImage(`/assets/${src}/${String(i).padStart(5, '0')}.jpg`)));
}

// ------------------------------------------------------------------ layers
function layer(w = W, h = H) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
function clear(c) { const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  // canvas state survives between frames: reset what scenes set, or a seek order changes the picture
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.shadowBlur = 0; g.shadowOffsetX = g.shadowOffsetY = 0; g.shadowColor = 'transparent'; g.setLineDash([]); g.lineCap = 'butt'; g.lineJoin = 'miter'; g.lineWidth = 1;
  g.clearRect(0, 0, c.width, c.height); c.__boxes = []; return g; }
const L = { a: layer(), b: layer(), tmp: layer(), tmp2: layer(), cut: layer(), card: layer(), card2: layer(), card3: layer(), ui: layer(), fx: layer() };
const pools = new Map();
function scratch(key, w, h) {   // a reusable canvas of a given size
  const k = key + ':' + Math.ceil(w) + 'x' + Math.ceil(h);
  if (!pools.has(k)) pools.set(k, layer(w, h));
  return pools.get(k);
}

// ------------------------------------------------------------------ text
// heavy sans text (titles, 3D words) uses the display face; brand.json can replace all three families
function font(size, weight = 700, fam = SANS) { if (fam === SANS && weight >= 800) fam = HEAD; return `${weight} ${Math.round(size)}px ${fam}`; }
function wrap(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
    out.push(line);
  }
  return out;
}
// the largest size (<= size) at which the text fits maxW on at most maxLines lines
function fitWrap(g, text, maxW, size, weight = 700, fam = SANS, maxLines = 2, min = 18) {
  let s = size;
  for (;;) {
    g.font = font(s, weight, fam);
    const lines = wrap(g, text, maxW);
    if ((lines.length <= maxLines && Math.max(...lines.map(l => g.measureText(l).width)) <= maxW) || s <= min) return { size: s, lines };
    s = Math.max(min, s * .94);
  }
}
function fitFont(g, text, maxW, size, weight, fam, min = 18) {
  let s = size; g.font = font(s, weight, fam);
  while (s > min && Math.max(...String(text).split('\n').map(l => g.measureText(l).width)) > maxW) { s *= .95; g.font = font(s, weight, fam); }
  return s;
}
// fillText that records where the text landed (layout check)
function txt(g, s, x, y) {
  g.fillText(s, x, y);
  if (CHECK && s && String(s).trim()) recordBox(g, s, x, y);
}
function recordBox(g, s, x, y) {
  const m = g.measureText(s), al = g.textAlign;
  const l = x - (al === 'center' ? m.width / 2 : (al === 'right' || al === 'end') ? m.width : 0);
  const top = y - m.actualBoundingBoxAscent, bot = y + m.actualBoundingBoxDescent;
  const T = g.getTransform(), pts = [[l, top], [l + m.width, top], [l, bot], [l + m.width, bot]].map(([px, py]) => { const p = T.transformPoint(new DOMPoint(px, py)); return [p.x, p.y]; });
  (g.canvas.__boxes ||= []).push({ s: String(s), pts, a: g.globalAlpha });
}
// drawImage of a layer that carries its text boxes along (2D transform)
function blit(g, src, ...args) {
  g.drawImage(src, ...args);
  if (!CHECK || !src.__boxes?.length) return;
  let sx = 1, sy = 1, dx = 0, dy = 0;
  if (args.length === 2) { dx = args[0]; dy = args[1]; }
  else if (args.length === 4) { dx = args[0]; dy = args[1]; sx = args[2] / src.width; sy = args[3] / src.height; }
  const T = g.getTransform();
  for (const b of src.__boxes) (g.canvas.__boxes ||= []).push({ ...b, a: b.a * g.globalAlpha, pts: b.pts.map(([x, y]) => { const p = T.transformPoint(new DOMPoint(dx + x * sx, dy + y * sy)); return [p.x, p.y]; }) });
}

function withReveal(g, k, fn, blurPx = 14 * U, alphaFrom = 0) {
  g.save(); g.globalAlpha *= lerp(alphaFrom, 1, clamp(k * 1.4)); const b = (1 - eOut(k)) * blurPx;
  if (b > .3) g.filter = `blur(${b.toFixed(1)}px)`; fn(); g.restore();
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function shadow(g, blur, oy, a = .18) { g.shadowColor = `rgba(20,16,10,${a})`; g.shadowBlur = blur; g.shadowOffsetY = oy; }
function noShadow(g) { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function shade(hex, k) { const n = parseInt(hex.slice(1), 16), f = c => Math.round(clamp(k < 0 ? c * (1 + k) : c + (255 - c) * k, 0, 255)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
function fmtNum(v, d) { return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function drawTick(g, x, y, r, k, col, cross) {
  if (k <= 0) return; const s = eBack(clamp(k)); g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = col; g.lineWidth = r * .32; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  if (cross) { g.moveTo(-r * .55, -r * .55); g.lineTo(r * .55, r * .55); g.moveTo(r * .55, -r * .55); g.lineTo(-r * .55, r * .55); }
  else { g.moveTo(-r * .7, 0); g.lineTo(-r * .2, r * .5); g.lineTo(r * .75, -r * .6); }
  g.stroke(); g.restore();
}
// an emoji or a short glyph in a soft round badge
function badge(g, x, y, r, glyph, col = '#fff', ring = null) {
  g.save(); shadow(g, r * .6, r * .18, .14); g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); noShadow(g);
  if (ring) { g.strokeStyle = ring; g.lineWidth = r * .08; g.stroke(); }
  if (glyph) { g.font = font(r * 1.05, 700); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = C.ink; g.fillText(glyph, x, y + r * .06); }
  g.restore();
}

// ------------------------------------------------------------------ WebGL compositor: textured planes in 3D
// Screen space: x right, y down, z into the screen, pixels. A plane at z = 0 with no rotation lands pixel-exact.
const GL = (() => {
  const c = layer(); const gl = c.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true, alpha: true });
  if (!gl) return null;
  const D = (H / 2) / Math.tan(17 * DEG);       // camera distance for a ~34 degree vertical field of view
  const vs = `#version 300 es
in vec2 a; uniform mat4 M; uniform vec4 R; out vec2 uv;
void main(){ uv = R.xy + a * R.zw; gl_Position = M * vec4(a, 0., 1.); }`;
  const fs = `#version 300 es
precision highp float; in vec2 uv; uniform sampler2D T; uniform float A; uniform vec4 K; uniform int mode; out vec4 o;
void main(){ vec4 c = texture(T, uv);
  if (mode == 1) { float l = c.r; o = vec4(l, l, l, l) * A; return; }
  c.rgb = mix(c.rgb, K.rgb * c.a, K.a); o = c * A; }`;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); gl.useProgram(p);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const la = gl.getAttribLocation(p, 'a'); gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 2, gl.FLOAT, false, 0, 0);
  const uM = gl.getUniformLocation(p, 'M'), uR = gl.getUniformLocation(p, 'R'), uA = gl.getUniformLocation(p, 'A'), uK = gl.getUniformLocation(p, 'K'), uMode = gl.getUniformLocation(p, 'mode');
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const cache = new WeakMap(); let frameNo = 0;
  function texture(src, isStatic) {
    let e = cache.get(src);
    if (e && isStatic) { gl.bindTexture(gl.TEXTURE_2D, e.tex); return e; }
    if (!e) { e = { tex: gl.createTexture(), at: -1 }; cache.set(src, e); }
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    if (e.at !== frameNo || isStatic) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      e.at = frameNo;
    }
    return e;
  }
  // 4x4 column-major helpers
  const mul = (a, b) => { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
  const T3 = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  const S3 = (x, y, z = 1) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
  const RX = r => { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
  const RY = r => { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
  const RZ = r => { const c = Math.cos(r), s = Math.sin(r); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
  const P = new Float32Array([D / (W / 2), 0, 0, 0, 0, -D / (H / 2), 0, 0, 0, 0, 0, 1, 0, 0, 0, D]);
  // plane model: unit quad (0..1) -> pixels around its anchor, rotated, then placed at (x, y, z) in screen pixels
  function model(o) {
    const w = o.w, h = o.h, ax = o.ax ?? .5, ay = o.ay ?? .5;
    let m = mul(S3(w, h), T3(-ax, -ay, 0));
    m = mul(RZ((o.rz || 0) * DEG), m); m = mul(RX((o.rx || 0) * DEG), m); m = mul(RY((o.ry || 0) * DEG), m);
    m = mul(S3(o.s ?? 1, o.s ?? 1, o.s ?? 1), m);
    if (o.cam) m = mul(o.cam, m);
    return mul(T3((o.x ?? W / 2) - W / 2, (o.y ?? H / 2) - H / 2, o.z || 0), m);
  }
  // where a point of the plane (u, v in 0..1) lands on screen
  function project(Mw, u, v) {
    const x = Mw[0] * u + Mw[4] * v + Mw[12], y = Mw[1] * u + Mw[5] * v + Mw[13], z = Mw[2] * u + Mw[6] * v + Mw[14];
    const k = D / (D + z); return [W / 2 + x * k, H / 2 + y * k];
  }
  let boxes = [];
  return {
    D, canvas: c,
    begin() { frameNo++; gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); boxes = []; },
    // draw a canvas/image on a plane. o: {w,h,x,y,z,rx,ry,rz,s,ax,ay, alpha, tint:[r,g,b,amount], src:[sx,sy,sw,sh] (0..1), static, lum}
    plane(src, o) {
      const Mw = model(o); texture(src, o.static);
      gl.uniformMatrix4fv(uM, false, mul(P, Mw));
      const r = o.src || [0, 0, 1, 1]; gl.uniform4f(uR, r[0], r[1], r[2], r[3]);
      gl.uniform1f(uA, o.alpha ?? 1); const k = o.tint || [0, 0, 0, 0]; gl.uniform4f(uK, k[0], k[1], k[2], k[3]); gl.uniform1i(uMode, o.lum ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (CHECK && src.__boxes?.length && (o.alpha ?? 1) > .5 && !o.tint) {
        const r0 = o.src || [0, 0, 1, 1];
        for (const b of src.__boxes) boxes.push({ ...b, a: b.a * (o.alpha ?? 1), pts: b.pts.map(([x, y]) => project(Mw, (x / src.width - r0[0]) / r0[2], (y / src.height - r0[1]) / r0[3])) });
      }
      return Mw;
    },
    project,
    // the four screen corners of a plane, without drawing it (layout)
    bounds(o) { const Mw = model(o); return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => project(Mw, u, v)); },
    // solid extrusion: the same plane repeated behind itself, darker with depth (3D letters, thick cards)
    // (an oblique offset down-right makes the sides read even when the plane faces the camera)
    extrude(src, o, depth, n = 10, col = [0, 0, 0], ox = 0, oy = 0) {
      for (let i = n; i >= 1; i--) { const k = i / n; this.plane(src, { ...o, x: o.x + ox * k, y: o.y + oy * k, z: (o.z || 0) + depth * k, tint: [col[0], col[1], col[2], .5 + .4 * k], static: true }); }
    },
    flush(g, alpha = 1) {
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha; g.drawImage(c, 0, 0); g.restore();
      if (CHECK) for (const b of boxes) (g.canvas.__boxes ||= []).push({ ...b, a: b.a * alpha });
      boxes = [];
    },
  };
})();
// draw a set of planes into g in one GL pass (fn gets GL)
function gl3d(g, fn, alpha = 1) { if (!GL) return; GL.begin(); fn(GL); GL.flush(g, alpha); }

// a grey matte (JPEG) as an alpha mask canvas, through the GL lum->alpha mode
function lumAlpha(bm) {
  const c = layer(bm.width, bm.height);
  if (!GL) { const g = c.getContext('2d'); g.drawImage(bm, 0, 0); return c; }
  GL.begin(); GL.plane(bm, { w: W, h: H, lum: true, static: true });
  c.getContext('2d').drawImage(GL.canvas, 0, 0, W, H, 0, 0, c.width, c.height);
  return c;
}

// ------------------------------------------------------------------ sprites made once
const SPR = {};
function makeSprites() {
  // film grain: 6 full-frame layers
  SPR.grain = [];
  const tile = layer(256, 256), tg = tile.getContext('2d');
  for (let k = 0; k < 6; k++) {
    const d = tg.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (hash(i * 13 + k * 99991) - .5) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    tg.putImageData(d, 0, 0);
    const c = layer(), g = c.getContext('2d'), sc = 2 * U; g.scale(sc, sc);
    for (let x = 0; x < W / sc; x += 256) for (let y = 0; y < H / sc; y += 256) g.drawImage(tile, x, y);
    SPR.grain.push(c);
  }
  // paper fibre texture for cards and stages
  SPR.paper = layer(512, 512); { const g = SPR.paper.getContext('2d'), d = g.createImageData(512, 512);
    for (let i = 0; i < d.data.length; i += 4) { const p = i / 4, x = p % 512, y = Math.floor(p / 512); const v = 128 + (hash(p * 7 + 3) - .5) * 26 + noise1(x * .05 + noise1(y * .01, 4) * 3, 9) * 9; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); }
  // soft bokeh disc
  SPR.bokeh = layer(256, 256); { const g = SPR.bokeh.getContext('2d'); const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(.62, 'rgba(255,255,255,.75)'); r.addColorStop(.8, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); }
}
