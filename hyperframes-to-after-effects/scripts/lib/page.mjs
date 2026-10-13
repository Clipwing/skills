// page.mjs: opens a HyperFrames project in headless Chrome the way Studio previews it (the raw project served as is,
// the HyperFrames runtime injected at the start of <head>; the runtime mounts sub-compositions itself), waits for
// window.__renderReady, and seeks with the renderer's own cascade (__player.renderSeek -> __hf.seek -> timelines).
// Font families the page uses but neither declares (@font-face) nor finds on the system are fetched from Google Fonts,
// like the HyperFrames compiler does at render time; their TTFs are kept for installing on the After Effects machine.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, extname, normalize, resolve, sep } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff",
  ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg",
  ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".lottie": "application/zip" };

export function serveProject(projectDir, runtimePath, entry = "index.html") {
  const root = resolve(projectDir);
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url === "/__hf2ae_runtime.js") {
      res.writeHead(200, { "content-type": TYPES[".js"] });
      return res.end(readFileSync(runtimePath));
    }
    const rel = url === "/" ? entry : url.replace(/^\/+/, "");
    const file = normalize(join(root, rel));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403); return res.end(); }
    if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    if (rel === entry) {
      const html = readFileSync(file, "utf8").replace(/<head([^>]*)>/i, `<head$1><script src="/__hf2ae_runtime.js"></script>`);
      res.writeHead(200, { "content-type": TYPES[".html"] });
      return res.end(html);
    }
    // byte ranges, so <video> can seek
    const size = statSync(file).size, type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m) {
      const start = m[1] ? +m[1] : Math.max(0, size - +m[2]), end = m[2] && m[1] ? Math.min(+m[2], size - 1) : size - 1;
      res.writeHead(206, { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
      return res.end(readFileSync(file).subarray(start, end + 1));
    }
    res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": size });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

export async function openProject({ hf, chrome, projectDir, log = console.log, fontsDir }) {
  const puppeteer = hf.require("puppeteer-core");
  const { server, url } = await serveProject(projectDir, hf.runtime);
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // size the viewport from the root composition before anything lays out
  const html = readFileSync(join(projectDir, "index.html"), "utf8");
  const rootTag = html.match(/<[^>]+data-composition-id="[^"]+"[^>]*>/);
  const W = +(rootTag?.[0].match(/data-width="(\d+)"/)?.[1] || 1920), H = +(rootTag?.[0].match(/data-height="(\d+)"/)?.[1] || 1080);
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  const ready = await page.waitForFunction(() => Boolean(window.__renderReady), { timeout: 120000 }).then(() => true, () => false);
  if (!ready) log("warning: the runtime never set __renderReady (continuing with what loaded)");

  const fonts = await ensureFonts(page, fontsDir, log);
  await page.evaluate(() => document.fonts.ready);

  // media: wait for <video> frames (verify screenshots); the export only reads geometry and skips the wait
  const seek = (t, { media = false } = {}) => page.evaluate((t, media) => {
    const p = window.__player, hfw = window.__hf;
    if (p && typeof p.renderSeek === "function") p.renderSeek(t, { exact: true });
    else if (hfw && typeof hfw.seek === "function") hfw.seek(t);
    else if (p && typeof p.seek === "function") p.seek(t);
    else for (const tl of Object.values(window.__timelines || {})) { tl.pause?.(); tl.seek?.(t); }
    window.gsap?.ticker?.tick?.();
    if (!media) return;
    // visible videos: wait until the seek lands (screenshots of a stale frame mislead verify)
    const vids = [...document.querySelectorAll("video")].filter((v) => v.getClientRects().length && getComputedStyle(v).visibility !== "hidden" && v.seeking);
    return Promise.race([
      Promise.all(vids.map((v) => new Promise((ok) => v.addEventListener("seeked", ok, { once: true })))),
      new Promise((ok) => setTimeout(ok, 1500)),
    ]).then(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok()))));
  }, t, media);
  const duration = await page.evaluate(() => {
    const p = window.__player;
    const d = p?.getDuration?.();
    if (d > 0) return d;
    const root = document.querySelector("body > [data-composition-id], [data-composition-id]");
    return parseFloat(root?.getAttribute("data-duration")) || 0;
  });
  return { browser, page, server, seek, duration, width: W, height: H, errors, fonts,
    close: async () => { await browser.close(); server.close(); } };
}

// families used by text but missing (no @font-face, not installed): fetch from Google Fonts into the page (woff2) and
// keep TTF copies for the After Effects machine
async function ensureFonts(page, fontsDir, log) {
  const info = await page.evaluate(async () => {
    await document.fonts.ready;
    const declared = new Set([...document.fonts].map((f) => f.family.replace(/^["']|["']$/g, "")));
    const used = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || !n.parentElement) continue;
      const cs = getComputedStyle(n.parentElement);
      const fam = cs.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
      if (!used.has(fam)) used.set(fam, new Set());
      used.get(fam).add(`${cs.fontStyle === "italic" ? 1 : 0},${cs.fontWeight}`);
    }
    const generic = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "-apple-system", "BlinkMacSystemFont"]);
    const c = document.createElement("canvas").getContext("2d"), probe = "mmmmmmmmmlli1WQ@#&";
    const installed = (f) => ["monospace", "serif", "sans-serif"].some((g) => { c.font = `40px ${g}`; const a = c.measureText(probe).width; c.font = `40px "${f}", ${g}`; return c.measureText(probe).width !== a; });
    const out = [];
    for (const [fam, styles] of used) out.push({ family: fam, styles: [...styles], declared: declared.has(fam), generic: generic.has(fam), installed: !declared.has(fam) && !generic.has(fam) && installed(fam) });
    return out;
  });
  const fetched = [];
  for (const f of info) {
    if (f.declared || f.generic || f.installed) continue;
    const axes = [...new Set(f.styles)].map((s) => s.split(",")).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const q = `family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:ital,wght@${axes.map((a) => a.join(",")).join(";")}`;
    try {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?${q}&display=block`, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" } })).text();
      if (!/@font-face/.test(css)) { log(`font "${f.family}": not declared, not installed, not on Google Fonts (text will use a fallback)`); continue; }
      await page.addStyleTag({ content: css });
      await page.evaluate(async (fam, axes) => { await Promise.all(axes.map(([i, w]) => document.fonts.load(`${i === "1" ? "italic " : ""}${w} 40px "${fam}"`))); }, f.family, axes);
      // TTF copies for After Effects (Google serves TrueType to non-browser clients)
      if (fontsDir) {
        mkdirSync(fontsDir, { recursive: true });
        const ttfCss = await (await fetch(`https://fonts.googleapis.com/css2?${q}`)).text();
        const seen = new Set();
        for (const m of ttfCss.matchAll(/font-style:\s*(\w+);\s*font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)) {
          if (seen.has(m[3])) continue; // one file can serve several weights (variable fonts)
          seen.add(m[3]);
          const buf = Buffer.from(await (await fetch(m[3])).arrayBuffer());
          let name = `${f.family.replace(/\s+/g, "")}-${m[2]}${m[1] === "italic" ? "Italic" : ""}.ttf`;
          if (existsSync(join(fontsDir, name))) name = name.replace(".ttf", `-${seen.size}.ttf`);
          writeFileSync(join(fontsDir, name), buf);
        }
      }
      fetched.push(f.family);
      log(`font "${f.family}": loaded from Google Fonts (as the HyperFrames compiler does)`);
    } catch (e) { log(`font "${f.family}": Google Fonts fetch failed (${e.message})`); }
  }
  return { used: info, fetched };
}
