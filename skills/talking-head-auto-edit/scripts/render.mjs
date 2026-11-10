#!/usr/bin/env node
// Render the edit: page/index.html is seeked frame by frame in headless Chromium and piped to ffmpeg (no sound;
// mix.py adds voice, music and effects). Several browsers draw ranges of the film in parallel.
//
//   node scripts/render.mjs --work WORK --plan edit.json --aspect 16:9|9:16 --out film.silent.mp4
//                           [--workers N] [--stills 1.5,8,20.2] [--from S --to E] [--cues cues.json] [--scale 0.5]
//
// WORK is prepare.py's folder (frames/, words.json, face.json, info.json). Images named in the plan are looked up next
// to the plan file. --stills writes JPEGs into WORK/stills-<aspect>/ instead of a film. --scale renders smaller (a fast
// preview: 0.5 = 960x540 / 540x960). --cues writes the typed sound cue list for real-sfx. A whole film also gets
// <out>.plan.json, the plan it was made from (scripts/patch.mjs re-renders only what changed against it).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, createReadStream, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import http from 'node:http';
import os from 'node:os';

const argv = process.argv.slice(2), A = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) A[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const HERE = dirname(fileURLToPath(import.meta.url)), PAGE = resolve(HERE, '..', 'page');
const WORK = resolve(A.work || 'work'), PLAN = resolve(A.plan || join(WORK, 'edit.json')), PLAN_DIR = dirname(PLAN);
const ASPECT = A.aspect === '9:16' ? '9:16' : '16:9', V = ASPECT === '9:16';
const SCALE = Number(A.scale || 1), W = (V ? 1080 : 1920), H = (V ? 1920 : 1080);
const log = (...m) => console.log(`[render ${ASPECT}]`, ...m);
if (!existsSync(join(WORK, 'info.json'))) { console.error(`no ${join(WORK, 'info.json')}: run prepare.py first`); process.exit(2); }
if (!existsSync(PLAN)) { console.error(`no plan ${PLAN}`); process.exit(2); }

async function playwright() {
  let groot = ''; try { groot = execFileSync('npm', ['root', '-g'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
  for (const base of [process.env.PLAYWRIGHT_DIR, HERE, WORK, join(os.homedir(), '.cache', 'talking-head-auto-edit'), groot].filter(Boolean)) for (const name of ['playwright', 'playwright-core']) {
    try { const p = createRequire(join(base, 'noop.js')).resolve(name); const m = await import(pathToFileURL(p).href); return m.default ?? m; } catch {} }
  const cache = join(os.homedir(), '.cache', 'talking-head-auto-edit'); log('installing playwright-core into', cache); mkdirSync(cache, { recursive: true });
  execFileSync('npm', ['i', '--prefix', cache, 'playwright-core@1.56.1'], { stdio: 'inherit' });
  const m = await import(pathToFileURL(createRequire(join(cache, 'noop.js')).resolve('playwright-core')).href); return m.default ?? m;
}
function findChrome() {
  for (const p of [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/chromium', '/usr/bin/google-chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']) if (p && existsSync(p)) return p;
  return null;
}

// ---- tiny static server: /index.html,/engine.js,/fonts/* from page/, /data/* from WORK (plan.json = the plan), /assets/* from the plan's folder
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
function safe(root, rel) { const f = normalize(join(root, rel)); return f.startsWith(root) ? f : null; }
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  let f = null;
  if (p === '/data/plan.json') f = PLAN;
  else if (p.startsWith('/data/')) f = safe(WORK, p.slice(6));
  else if (p.startsWith('/assets/')) f = safe(PLAN_DIR, p.slice(8));
  else f = safe(PAGE, p === '/' ? 'index.html' : p.slice(1));
  if (!f || !existsSync(f) || !statSync(f).isFile()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'max-age=3600' }); createReadStream(f).pipe(r);
}).listen(0);
await new Promise(r => srv.once('listening', r));
const url = `http://localhost:${srv.address().port}/index.html?aspect=${encodeURIComponent(ASPECT)}${A.check ? '&check=1' : ''}`;

const pw = await playwright();
let exe = null; try { if (!existsSync(pw.chromium.executablePath())) exe = findChrome(); } catch { exe = findChrome(); }
// WebGL through SwiftShader: the same pixels on every machine, with or without a GPU
const ARGS = ['--font-render-hinting=none', '--disable-lcd-text', '--disable-gpu-vsync', '--force-color-profile=srgb', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function open() {
  const br = await pw.chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ARGS });
  const page = await br.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  page.on('pageerror', e => console.error('PAGE ERROR', e.stack || e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => window.__ready || window.__failed, null, { timeout: 120000 });
  const failed = await page.evaluate(() => window.__failed);
  if (failed) throw new Error(failed);
  const film = await page.evaluate(() => ({ duration: window.DURATION, fps: window.FPS, cues: window.CUES }));
  // the canvas encodes its own JPEG: cheaper than a page screenshot (no compositor round trip)
  const grab = async t => Buffer.from(await page.evaluate(async t => { await window.seek(t);
    return document.getElementById('c').toDataURL('image/jpeg', 0.93).slice(23); }, t), 'base64');
  return { br, page, grab, film };
}

// --timeline FILE: the resolved timeline (beats with their real start/end/transitions, framing cuts) for patch.mjs
if (A.timeline) {
  const P = await open(); writeFileSync(resolve(A.timeline), JSON.stringify(await P.page.evaluate(() => window.TIMELINE)));
  await P.br.close(); srv.close(); process.exit(0);
}

// --check [step]: seek through the whole film without encoding and list every text that leaves the frame
if (A.check) {
  const P = await open(), step = Number(A.check) > 0 ? Number(A.check) : .2, bad = new Map();
  for (let t = Number(A.from) || 0; t < Math.min(P.film.duration, Number(A.to) || 1e9); t += step) {
    await P.page.evaluate(t => window.seek(t), t);
    for (const [s, box] of await P.page.evaluate(() => window.BAD || [])) { const r = bad.get(s) || [t, t, box]; r[1] = t; bad.set(s, r); }
  }
  const beats = await P.page.evaluate(() => window.BEATS_INFO);
  await P.br.close(); srv.close();
  for (const [s, [a, b, box]] of bad) console.log(`TEXT OUT OF FRAME ${a.toFixed(1)}-${b.toFixed(1)} s: "${s}" (at ${box})`);
  console.log(`[check] ${bad.size ? bad.size + ' text(s) leave the frame' : 'every text stays inside the frame'}; ${beats.length} beats`);
  if (A.beats) writeFileSync(resolve(A.beats), JSON.stringify(beats, null, 1));
  process.exit(bad.size ? 1 : 0);
}

if (A.stills) {
  const P = await open(); const dir = join(WORK, `stills-${ASPECT.replace(':', 'x')}`); mkdirSync(dir, { recursive: true });
  for (const t of String(A.stills).split(',').map(Number)) writeFileSync(join(dir, `t${t.toFixed(2).padStart(7, '0')}.jpg`), await P.grab(t));
  await P.br.close(); srv.close(); log('stills in', dir); process.exit(0);
}

const out = resolve(A.out || join(WORK, `film-${ASPECT.replace(':', 'x')}.silent.mp4`)), started = Date.now();
const probe = await open(), film = probe.film, FPS = Number(A.fps || film.fps || 30);
const T0 = Number(A.from || 0), T1 = Math.min(Number(A.to || film.duration), film.duration);
const F0 = Math.round(T0 * FPS), FRAMES = Math.round(T1 * FPS) - F0;   // whole frames: a piece lines up with the full film
if (A.cues) writeFileSync(resolve(A.cues), JSON.stringify(film.cues, null, 1));
const N = Math.max(1, Math.min(Number(A.workers || Math.max(1, Math.min(6, Math.floor(os.cpus().length / 2)))), Math.ceil(FRAMES / 90)));
log(`${N} workers, ${FRAMES} frames at ${FPS} fps (${(T1 - T0).toFixed(1)} s), ${W * SCALE}x${H * SCALE}`);
const tmp = join(dirname(out), `.parts-${ASPECT.replace(':', 'x')}`); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
const parts = []; let done = 0, lastLog = 0;
async function work(k) {
  const f0 = Math.floor(FRAMES * k / N), f1 = Math.floor(FRAMES * (k + 1) / N), file = join(tmp, `p${k}.mp4`); parts[k] = file;
  const P = k === 0 ? probe : await open();
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', A.preset || 'medium', '-crf', String(A.crf || 19), '-pix_fmt', 'yuv420p', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise((res, rej) => ff.on('close', c => c ? rej(new Error('ffmpeg exit ' + c)) : res()));
  for (let f = f0; f < f1; f++) {
    const buf = await P.grab((F0 + f) / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    done++;
    if (Date.now() - lastLog > 15000) { lastLog = Date.now(); const s = (Date.now() - started) / 1000; log(`${done}/${FRAMES} frames, ${(done / s).toFixed(1)} fps`); }
  }
  ff.stdin.end(); await closed; await P.br.close();
}
await Promise.all(Array.from({ length: N }, (_, k) => work(k)));
const list = join(tmp, 'list.txt'); writeFileSync(list, parts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
rmSync(tmp, { recursive: true, force: true }); srv.close();
// a whole film keeps the plan it was made from: patch.mjs re-renders only what changes against it
if (!A.from && !A.to) writeFileSync(out.replace(/\.mp4$/, '') + '.plan.json', readFileSync(PLAN));
log(`done: ${out} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
