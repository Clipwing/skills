// export.mjs: drives a HyperFrames project frame by frame in headless Chrome and writes everything After Effects needs
// to rebuild it as editable layers: <out>/manifest.json, <out>/comps/<cid>.json, <out>/assets/... and a report.
import { mkdirSync, writeFileSync, existsSync, rmSync, copyFileSync, readFileSync } from "node:fs";
import { join, dirname, extname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { openProject } from "./page.mjs";
import { planText } from "./text.mjs";
import { resolveFonts } from "./fonts.mjs";
import { resolveFfmpeg } from "./env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const md5 = (s) => createHash("md5").update(s).digest("hex").slice(0, 12);
const AE_IMAGE = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".psd", ".bmp", ".tga", ".exr"]);
const AE_VIDEO = new Set([".mp4", ".mov", ".m4v", ".avi", ".mxf"]);
const AE_AUDIO = new Set([".wav", ".mp3", ".aif", ".aiff", ".m4a", ".aac"]);
const VARIANT_LIMIT = 6; // more distinct looks than this and an svg / baked box becomes a PNG sequence

// ---- keyframe reduction: Ramer-Douglas-Peucker per track, tolerance per component
function rdp(vals, tol) {
  const n = vals.length, keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const dev = (i, a, b) => { const p = (i - a) / (b - a); let m = 0; for (let k = 0; k < vals[i].length; k++) m = Math.max(m, Math.abs(vals[a][k] + (vals[b][k] - vals[a][k]) * p - vals[i][k]) / tol[k]); return m; };
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let mi = -1, mv = 1;
    for (let i = a + 1; i < b; i++) { const v = dev(i, a, b); if (v > mv) { mv = v; mi = i; } }
    if (mi >= 0) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
function track(frames, fn, tol) {
  const vals = frames.map(fn);
  const first = JSON.stringify(vals[0]);
  if (vals.every((v) => JSON.stringify(v) === first)) return { v: vals[0].map(r4) };
  return { k: rdp(vals, tol).map((i) => [i, vals[i].map(r4)]) };
}
function holds(frames, fn) {
  const out = []; let last;
  frames.forEach((f, i) => { const v = fn(f); const s = JSON.stringify(v); if (s !== last) { out.push([i, v]); last = s; } });
  return out.length === 1 ? { v: out[0][1] } : { k: out };
}
// any clip shape as polygon points (rounded corners and ellipses as short arcs)
function shapeToPts(s) {
  if (s.kind === "poly") return s.pts;
  const arc = (cx, cy, rx, ry, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
  if (s.kind === "ellipse") return arc(s.cx, s.cy, s.rx, s.ry, -Math.PI / 2, (3 * Math.PI) / 2, 32).slice(0, -1);
  const { x, y, w, h } = s, r = Math.min(s.r || 0, w / 2, h / 2);
  if (r < 0.5) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const P = Math.PI;
  return [...arc(x + w - r, y + r, r, r, -P / 2, 0, 6), ...arc(x + w - r, y + h - r, r, r, 0, P / 2, 6), ...arc(x + r, y + h - r, r, r, P / 2, P, 6), ...arc(x + r, y + r, r, r, P, 1.5 * P, 6)];
}
const sx = (L) => Math.hypot(L[0], L[1]);
const det = (L) => L[0] * L[3] - L[1] * L[2];
function transformTracks(fr) {
  return {
    pos: track(fr, (e) => [e.x, e.y], [0.25, 0.25]),
    scale: track(fr, (e) => [sx(e.L) * 100, (sx(e.L) > 1e-6 ? det(e.L) / sx(e.L) : Math.hypot(e.L[2], e.L[3])) * 100], [0.15, 0.15]),
    rot: track(fr, (e) => [(Math.atan2(e.L[1], e.L[0]) * 180) / Math.PI], [0.05]),
    op: track(fr, (e) => [e.o * 100], [0.4]),
  };
}

export async function exportProject({ hf, chrome, projectDir, out, fps = 30, canvasFps, only, log = console.log }) {
  projectDir = resolve(projectDir); out = resolve(out);
  // retries: antivirus / indexers briefly hold freshly written files on Windows
  // a file still open elsewhere (the last .aep in After Effects, a stray aerender) is overwritten in place instead
  if (existsSync(out)) for (const d of ["comps", "assets"]) {
    try { rmSync(join(out, d), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
    catch (e) { log(`note: could not clear ${join(out, d)} (${e.code}: a file is open in another program); overwriting in place`); }
  }
  for (const d of ["comps", "assets/images", "assets/svg", "assets/bake", "assets/seq", "assets/video", "assets/audio", "fonts"]) mkdirSync(join(out, d), { recursive: true });
  const warnings = new Set();
  const warn = (s) => { if (!warnings.has(s)) { warnings.add(s); log("warning: " + s); } };
  const T0 = Date.now();

  const P = await openProject({ hf, chrome, projectDir, log, fontsDir: join(out, "fonts") });
  const { page, seek } = P;
  for (const e of P.errors) warn("page error: " + e);
  await page.addScriptTag({ path: join(HERE, "sampler.js") });
  const prep = await page.evaluate(() => window.__hf2ae.prepare());
  log(`project ${basename(projectDir)}: ${prep.comps.length} composition(s), ${P.width}x${P.height}, ${P.duration.toFixed(3)} s; ${prep.pseudo} pseudo-elements and ${prep.lines} one-sided borders turned into elements`);
  const CF = canvasFps || (fps > 30 && fps % 2 === 0 ? fps / 2 : fps);
  const step = fps / CF;
  if (!Number.isInteger(step)) throw new Error(`canvas fps ${CF} must divide fps ${fps}`);
  const N = Math.max(1, Math.round(P.duration * fps));

  // ---- 1. sample every frame
  const comps = new Map(prep.comps.map((c) => [c.cid, { ...c, frames: new Array(N).fill(null), vis: new Uint8Array(N), bg: null }]));
  const canv = {}; // ckey -> { seq: [png index per canvas frame (global)], n, dir }
  let lastLog = Date.now();
  for (let f = 0; f < N; f++) {
    await seek(Math.min(f / fps, P.duration - 1e-4));
    const s = await page.evaluate(() => window.__hf2ae.sample());
    for (const [cid, rec] of Object.entries(s)) {
      const c = comps.get(cid); if (!c) continue;
      if (rec.visible) { c.vis[f] = 1; c.frames[f] = rec.entries; if (!c.bg && rec.bg) c.bg = rec.bg; }
    }
    if (f % step === 0) {
      const res = await page.evaluate(() => window.__hf2ae.canvases());
      for (const [k, url] of Object.entries(res)) {
        const c = (canv[k] ||= { seq: new Array(Math.ceil(N / step)).fill(-1), n: 0, dir: `c${Object.keys(canv).length}` });
        if (url) {
          mkdirSync(join(out, "assets/seq", c.dir), { recursive: true });
          writeFileSync(join(out, "assets/seq", c.dir, `f_${String(c.n).padStart(5, "0")}.png`), Buffer.from(url.split(",")[1], "base64"));
          c.n++;
        }
        c.seq[f / step] = c.n - 1;
      }
    }
    if (Date.now() - lastLog > 10000) { log(`  sampled ${f + 1}/${N} frames`); lastLog = Date.now(); }
  }
  for (const w of await page.evaluate(() => window.__hf2ae.warnings())) warn(w);

  // ---- 2. composition timing (global start frame, visible window, duration)
  const rootC = [...comps.values()].find((c) => !c.parent);
  const globalStart = (c) => (c.parent ? globalStart(comps.get(c.parent)) + c.start : 0);
  for (const c of comps.values()) {
    c.gs = Math.round(globalStart(c) * fps);
    const visF = []; c.vis.forEach((v, i) => v && visF.push(i));
    c.firstVis = visF.length ? visF[0] : null; c.lastVis = visF.length ? visF[visF.length - 1] : null;
    c.n = c.parent ? Math.max(1, (c.lastVis ?? c.gs) + 1 - c.gs, Math.round((c.dur || 0) * fps)) : N;
  }

  // ---- 3. per composition: entries -> layers with tracks
  const fetchUrl = (u) => fetch(u);
  const origin = new URL(page.url()).origin;
  const fileFor = async (url, sub) => {
    // project-local file for a page URL, or a download into assets/<sub>
    if (url.startsWith(origin)) return join(projectDir, decodeURIComponent(new URL(url).pathname));
    if (url.startsWith("data:")) { const m = url.match(/^data:([^;,]+)[^,]*,(.*)$/s); const ext = (m[1].split("/")[1] || "bin").replace("svg+xml", "svg"); const p = join(out, "assets", sub, md5(url) + "." + ext); writeFileSync(p, url.includes(";base64,") ? Buffer.from(m[2], "base64") : decodeURIComponent(m[2])); return p; }
    const p = join(out, "assets", sub, md5(url) + extname(new URL(url).pathname));
    if (!existsSync(p)) writeFileSync(p, Buffer.from(await (await fetchUrl(url)).arrayBuffer()));
    return p;
  };
  const sharp = (() => { try { return hf.require("sharp"); } catch { return null; } })();
  const ffmpeg = resolveFfmpeg();
  const images = new Map(), videos = new Map();
  async function imageAsset(src) {
    if (images.has(src)) return images.get(src);
    let p = await fileFor(src, "images"), ext = extname(p).toLowerCase(), res;
    if (AE_IMAGE.has(ext)) { res = rel(copyInto(p, "assets/images")); }
    else if (sharp) {
      const dst = join(out, "assets/images", md5(src) + ".png");
      await sharp(p, ext === ".svg" ? { density: 288 } : {}).png().toFile(dst);
      res = rel(dst);
    } else { warn(`image ${basename(p)}: format ${ext} not importable and sharp is unavailable`); res = null; }
    images.set(src, res); return res;
  }
  function copyInto(p, sub) { const dst = join(out, sub, basename(p)); if (!existsSync(dst)) copyFileSync(p, dst); return dst; }
  const rel = (p) => p.slice(out.length + 1).replace(/\\/g, "/");
  async function videoAsset(src) {
    if (videos.has(src)) return videos.get(src);
    const p = await fileFor(src, "video"), ext = extname(p).toLowerCase();
    let res = null;
    if (AE_VIDEO.has(ext)) res = rel(copyInto(p, "assets/video"));
    else if (ffmpeg) {
      const dst = join(out, "assets/video", basename(p, ext) + ".mp4");
      const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", p, "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", dst], { encoding: "utf8" });
      if (r.status === 0) res = rel(dst); else warn(`video ${basename(p)}: conversion to mp4 failed`);
    } else warn(`video ${basename(p)}: ${ext} is not importable in After Effects and ffmpeg is missing`);
    videos.set(src, res); return res;
  }
  // svg / bake rasterisation
  const svgPng = new Map();
  async function rasterSvg(svg, w, h) {
    const id = md5(svg);
    if (!svgPng.has(id)) {
      const url = await page.evaluate(async (src, w, h) => {
        const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
        await img.decode();
        const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w * 4)); c.height = Math.max(1, Math.ceil(h * 4));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL("image/png");
      }, svg, w, h);
      writeFileSync(join(out, "assets/svg", id + ".png"), Buffer.from(url.split(",")[1], "base64"));
      svgPng.set(id, `assets/svg/${id}.png`);
    }
    return svgPng.get(id);
  }
  let bakePage = null;
  const bakePng = new Map();
  async function rasterBake(e) {
    if (bakePng.has(e.sig)) return bakePng.get(e.sig);
    if (!bakePage) {
      bakePage = await P.browser.newPage();
      await bakePage.setViewport({ width: 64, height: 64, deviceScaleFactor: 2 });
      await bakePage.goto(origin + "/__hf2ae_blank__", { waitUntil: "load" }).catch(() => {});
      await bakePage.setContent(`<html><head><base href="${origin}/"></head><body style="margin:0;background:transparent"></body></html>`);
    }
    const W = Math.ceil(e.w + 2 * e.pad), H = Math.ceil(e.h + 2 * e.pad);
    await bakePage.setViewport({ width: Math.max(1, W), height: Math.max(1, H), deviceScaleFactor: 2 });
    await bakePage.evaluate((st, pad) => {
      document.body.innerHTML = "";
      const d = document.createElement("div");
      Object.assign(d.style, st, { position: "absolute", left: pad + "px", top: pad + "px", boxSizing: "border-box", margin: "0" });
      document.body.appendChild(d);
      return Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    }, e.style, e.pad);
    await new Promise((r) => setTimeout(r, 30));
    await bakePage.evaluate(() => document.fonts.ready);
    const file = join(out, "assets/bake", e.sig + ".png");
    await bakePage.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: Math.max(1, W), height: Math.max(1, H) } });
    bakePng.set(e.sig, `assets/bake/${e.sig}.png`);
    return bakePng.get(e.sig);
  }

  const fontUse = new Map();
  const manifest = { tool: "hyperframes-to-after-effects", version: 1, project: projectDir, fps, canvasFps: CF, width: P.width, height: P.height,
    duration: N / fps, root: rootC.cid, comps: [], audio: [], fonts: [], warnings: [] };
  let totalLayers = 0;
  for (const c of comps.values()) {
    if (only && !only.includes(c.cid) && c.parent) continue;
    const local = (gf) => gf - c.gs;
    // collect entries by key over the composition's own frames
    const byKey = new Map();
    for (let gf = Math.max(0, c.gs); gf < Math.min(N, c.gs + c.n); gf++) {
      const ents = c.frames[gf]; if (!ents) continue;
      for (const e of ents) {
        if (!byKey.has(e.k)) byKey.set(e.k, { first: e, at: new Array(c.n).fill(null) });
        byKey.get(e.k).at[local(gf)] = e;
      }
    }
    const layers = [], clips = [];
    for (const [k, { first, at }] of byKey) {
      // absent frames hold the nearest known state, invisible
      const firstSeen = at.find(Boolean);
      let last = firstSeen;
      const fr = at.map((e) => { if (e) { last = e; return e; } return { ...last, o: 0 }; });
      if (first.t === "clip") {
        // one clip can change kind over time (a clip-path wipe that ends as plain overflow: hidden): then every frame
        // becomes a path, so the matte never goes empty
        const kinds = new Set(fr.map((e) => e.shape.kind));
        if (kinds.size > 1) for (let i = 0; i < fr.length; i++) fr[i] = { ...fr[i], shape: { kind: "poly", pts: shapeToPts(fr[i].shape) } };
        const shapeKind = fr[0].shape.kind;
        const cl = { k, t: "clip", clip: first.clip || null, kind: shapeKind, ...transformTracks(fr) };
        cl.op = { v: [100] };
        if (shapeKind === "rrect") { cl.rect = track(fr, (e) => (e.shape.kind === "rrect" ? [e.shape.x, e.shape.y, e.shape.w, e.shape.h, e.shape.r] : [0, 0, e.w, e.h, 0]), [0.3, 0.3, 0.3, 0.3, 0.3]); }
        else if (shapeKind === "ellipse") { cl.ellipse = track(fr, (e) => [e.shape.cx, e.shape.cy, e.shape.rx, e.shape.ry], [0.3, 0.3, 0.3, 0.3]); }
        else { cl.path = holds(fr, (e) => (e.shape.pts || []).map((p) => [r4(p[0]), r4(p[1])])); }
        clips.push(cl);
        continue;
      }
      // svg and baked boxes that change look: per-variant layers, or a PNG sequence past the limit
      if ((first.t === "svg" || first.t === "bake")) {
        const sigs = [...new Set(fr.map((e) => e.sig))];
        if (sigs.length > VARIANT_LIMIT) {
          const dir = `v${md5(c.cid + k)}`; mkdirSync(join(out, "assets/seq", dir), { recursive: true });
          const idx = new Map(); const seq = [];
          for (const e of fr) {
            if (!idx.has(e.sig)) {
              const src = first.t === "svg" ? await rasterSvg(e.svg, e.w, e.h) : await rasterBake(e);
              copyFileSync(join(out, src), join(out, "assets/seq", dir, `f_${String(idx.size).padStart(5, "0")}.png`));
              idx.set(e.sig, idx.size);
            }
            seq.push(idx.get(e.sig));
          }
          const lay = { k, t: "seq", n: first.n, z: first.z, clip: first.clip || null, ...transformTracks(fr), blur: track(fr, (e) => [e.blur], [0.1]),
            blend: first.blend, dir: `assets/seq/${dir}`, pngs: idx.size, seq, seqFps: fps, scaleMul: first.t === "svg" ? 0.25 : 0.5,
            offset: first.t === "bake" ? [-first.pad, -first.pad] : [0, 0], w: first.w, h: first.h };
          layers.push(lay);
          continue;
        }
        for (const sig of sigs) {
          const fv = fr.map((e) => (e.sig === sig ? e : { ...e, o: 0 }));
          const e0 = fr.find((e) => e.sig === sig);
          const src = first.t === "svg" ? await rasterSvg(e0.svg, e0.w, e0.h) : await rasterBake(e0);
          layers.push({ k: sigs.length > 1 ? k + "@" + sig : k, t: "still", n: first.n, z: first.z, clip: first.clip || null, ...transformTracks(fv),
            blur: track(fv, (e) => [e.blur], [0.1]), blend: first.blend, src, scaleMul: first.t === "svg" ? 0.25 : 0.5,
            offset: first.t === "bake" ? [-e0.pad, -e0.pad] : [0, 0], w: e0.w, h: e0.h, from: first.t });
        }
        continue;
      }
      const lay = { k, t: first.t, n: first.n, z: first.z, clip: first.clip || null, ...transformTracks(fr), blur: track(fr, (e) => [e.blur], [0.1]), blend: first.blend };
      if (first.t === "box") {
        lay.size = track(fr, (e) => [e.w, e.h], [0.25, 0.25]);
        lay.r = track(fr, (e) => [e.r], [0.25]);
        lay.bg = track(fr, (e) => e.bg, [0.004, 0.004, 0.004, 0.004]);
        lay.border = track(fr, (e) => [e.bw, ...e.bc], [0.1, 0.004, 0.004, 0.004, 0.004]);
        lay.dash = holds(fr, (e) => e.ds);
        lay.outline = track(fr, (e) => [e.ow, ...e.oc, e.oo], [0.1, 0.004, 0.004, 0.004, 0.004, 0.1]);
        if (fr.some((e) => e.sh)) lay.shadow = track(fr, (e) => (e.sh ? [e.sh.x, e.sh.y, ...e.sh.c] : [0, 0, 0, 0, 0, 0]), [0.25, 0.25, 0.004, 0.004, 0.004, 0.004]);
        if (fr.some((e) => e.soft)) lay.soft = track(fr, (e) => (e.soft ? [e.soft.x, e.soft.y, e.soft.blur, ...e.soft.c] : [0, 0, 0, 0, 0, 0, 0]), [0.25, 0.25, 0.25, 0.004, 0.004, 0.004, 0.004]);
      } else if (first.t === "text") {
        lay.anchor = track(fr, (e) => [-e.lx, -e.ly], [0.25, 0.25]);
        const doc = holds(fr, (e) => ({ txt: e.txt, ff: e.ff, fw: e.fw, fst: e.fst, fs: e.fs, ls: r4(e.ls), tw: Math.round(e.tw * 10) / 10, col: e.col.slice(0, 3).map(r4) }));
        const K = doc.v ? [[0, doc.v]] : doc.k;
        lay.doc0 = K[0][1];
        lay.plan = planText(K, fps);
        // style changes other than text and colour (size, weight) inside one layer are rare: the first style is kept
        if (K.some(([, d]) => d.fs !== K[0][1].fs || d.ff !== K[0][1].ff || d.fw !== K[0][1].fw)) warn(`text "${K[0][1].txt.slice(0, 24)}": font or size changes over time; the first style is kept`);
        if (first.stroke) lay.stroke = first.stroke;
        if (fr.some((e) => e.tsh)) lay.soft = track(fr, (e) => (e.tsh ? [e.tsh.x, e.tsh.y, e.tsh.blur, ...e.tsh.c] : [0, 0, 0, 0, 0, 0, 0]), [0.25, 0.25, 0.25, 0.004, 0.004, 0.004, 0.004]);
        for (const [, d] of K) { const key = `${d.ff}|${d.fw}|${d.fst}`; if (!fontUse.has(key)) fontUse.set(key, { ff: d.ff, fw: d.fw, fst: d.fst }); }
      } else if (first.t === "image" || first.t === "video") {
        lay.src = first.t === "image" ? await imageAsset(first.src) : await videoAsset(first.src);
        Object.assign(lay, { w: first.w, h: first.h, nw: first.nw, nh: first.nh, fit: first.fit, opos: first.opos, r: first.r });
        // pixel size of the file After Effects imports (an SVG is rasterised larger than its natural size)
        if (first.t === "image" && lay.src && sharp) { try { const m = await sharp(join(out, lay.src)).metadata(); lay.fileW = m.width; lay.fileH = m.height; } catch {} }
        if (first.t === "video") Object.assign(lay, { vstart: first.start, vdur: first.dur, mediaStart: first.mediaStart, rate: first.rate, muted: first.muted, audio: first.audio, vol: first.vol });
        if (!lay.src) { warn(`${first.t} ${first.src}: skipped`); continue; }
      } else if (first.t === "canvas") {
        const cv = canv[first.ckey];
        Object.assign(lay, { w: first.w, h: first.h });
        if (!cv || !cv.n) continue; // never drew anything
        // the canvas sequence is global: slice this composition's span, at canvas fps
        const a = Math.floor(c.gs / step), seq = cv.seq.slice(Math.max(0, a), Math.max(0, a) + Math.ceil(c.n / step));
        Object.assign(lay, { dir: `assets/seq/${cv.dir}`, pngs: cv.n, seq, seqFps: CF });
      } else if (first.t === "comp") {
        const child = comps.get(first.cid);
        Object.assign(lay, { cid: first.cid, w: first.w, h: first.h, startF: child.gs - c.gs, inF: child.firstVis !== null ? child.firstVis - c.gs : null, outF: child.lastVis !== null ? child.lastVis + 1 - c.gs : null });
      }
      layers.push(lay);
    }
    const zcmp = (a, b) => { const za = [].concat(a.z), zb = [].concat(b.z); for (let i = 0; i < Math.max(za.length, zb.length); i++) { const d = (za[i] || 0) - (zb[i] || 0); if (d) return d; } return 0; };
    const paint = layers.sort((a, b) => zcmp(a, b) || a.n - b.n);
    totalLayers += paint.length;
    const file = `comps/${c.cid.replace(/[^\w.-]+/g, "_")}.json`;
    writeFileSync(join(out, file), JSON.stringify({ cid: c.cid, frames: c.n, layers: paint, clips }));
    manifest.comps.push({ cid: c.cid, label: c.label, parent: c.parent, w: c.w, h: c.h, frames: c.n, bg: c.bg, file });
    log(`  ${c.cid}: ${c.n} frames, ${paint.length} layers (${["text", "box", "still", "image", "video", "canvas", "seq", "comp"].map((t) => `${paint.filter((l) => l.t === t).length} ${t}`).filter((s) => !s.startsWith("0 ")).join(", ")}), ${clips.length} clips`);
  }

  // ---- 4. audio
  for (const a of await page.evaluate(() => window.__hf2ae.audio())) {
    if (!a.src) continue;
    let p = await fileFor(a.src, "audio"), ext = extname(p).toLowerCase(), file = null;
    if (AE_AUDIO.has(ext)) file = rel(copyInto(p, "assets/audio"));
    else if (ffmpeg) { const dst = join(out, "assets/audio", basename(p, ext) + ".wav"); if (spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", p, dst]).status === 0) file = rel(dst); }
    if (!file) { warn(`audio ${basename(p)}: not importable`); continue; }
    if (a.fx) warn(`audio "${a.label}": data-fx-chain / data-automation are not converted (volume only)`);
    manifest.audio.push({ ...a, file, cid: a.cid || rootC.cid });
  }

  // ---- 5. fonts
  const faces = await page.evaluate(() => window.__hf2ae.fontFaces());
  manifest.fonts = await resolveFonts({ hf, usage: [...fontUse.values()], faces, fetchUrl, serverOrigin: origin, projectDir, fontsDir: join(out, "fonts"), log });
  manifest.warnings = [...warnings];
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
  await P.close();
  const report = [`hyperframes-to-after-effects export: ${projectDir}`, `${manifest.comps.length} compositions, ${totalLayers} layers, ${N} frames at ${fps} fps, ${((Date.now() - T0) / 1000).toFixed(0)} s`,
    "", "fonts:", ...[...new Set(manifest.fonts.map((f) => `  ${f.cssFamily} ${f.weight}${f.italic ? " italic" : ""} -> ${f.family} ${f.style}${f.file ? "  [" + f.file + "]" : ""}`))],
    "", "warnings:", ...(manifest.warnings.length ? manifest.warnings.map((w) => "  " + w) : ["  none"])].join("\n");
  writeFileSync(join(out, "export_report.txt"), report);
  log(report);
  return manifest;
}
