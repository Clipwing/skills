// env.mjs: finds the tools a HyperFrames install already ships, so the converter installs nothing of its own:
// the hyperframes package (runtime, puppeteer-core, fontkit, sharp) in the npx cache, its Chrome, After Effects,
// aerender and ffmpeg. Works on Windows and macOS.
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

export const IS_WIN = platform() === "win32";
export const IS_MAC = platform() === "darwin";

// npm / npx are .cmd shims on Windows and need a shell; one quoted command string keeps Node from warning about it
function sh(cmd, args, opts = {}) {
  const q = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const r = IS_WIN ? spawnSync([cmd, ...args].map(q).join(" "), { encoding: "utf8", shell: true, ...opts }) : spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// the version the project pins in its package.json scripts (hyperframes@X.Y.Z), else null
export function projectPin(projectDir) {
  const p = join(projectDir, "package.json");
  if (!existsSync(p)) return null;
  const m = readFileSync(p, "utf8").match(/hyperframes@(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

function npxCacheDirs() {
  const dirs = [];
  const r = sh("npm", ["config", "get", "cache"]);
  const cache = r.code === 0 ? r.out.trim().split(/\r?\n/).pop() : null;
  for (const c of [cache, IS_WIN ? join(process.env.LOCALAPPDATA || "", "npm-cache") : join(homedir(), ".npm")]) {
    if (c && existsSync(join(c, "_npx")) && !dirs.includes(join(c, "_npx"))) dirs.push(join(c, "_npx"));
  }
  return dirs;
}

function findHyperframesPackages() {
  const found = [];
  for (const npx of npxCacheDirs()) {
    for (const d of readdirSync(npx)) {
      const pj = join(npx, d, "node_modules", "hyperframes", "package.json");
      if (!existsSync(pj)) continue;
      try { found.push({ version: JSON.parse(readFileSync(pj, "utf8")).version, dir: join(npx, d, "node_modules", "hyperframes") }); } catch {}
    }
  }
  const num = (v) => v.split(".").map(Number).reduce((a, x) => a * 1000 + x, 0);
  return found.sort((a, b) => num(b.version) - num(a.version));
}

// hyperframes package for this project: the pinned version if cached (fetched once via npx if not), else the newest
export function resolveHyperframes(projectDir, { log = console.log } = {}) {
  const pin = projectPin(projectDir);
  let pkgs = findHyperframesPackages();
  let pkg = pin ? pkgs.find((p) => p.version === pin) : pkgs[0];
  if (!pkg) {
    const spec = pin ? `hyperframes@${pin}` : "hyperframes@latest";
    log(`fetching ${spec} into the npx cache (same package the project's own scripts use)...`);
    sh("npx", ["--yes", spec, "--version"]);
    pkgs = findHyperframesPackages();
    pkg = pin ? pkgs.find((p) => p.version === pin) : pkgs[0];
  }
  if (!pkg) throw new Error("hyperframes package not found in the npx cache; run `npx hyperframes --version` once and retry");
  const req = createRequire(join(pkg.dir, "package.json"));
  const runtime = ["dist/hyperframe-runtime.js", "dist/hyperframe.runtime.iife.js"].map((f) => join(pkg.dir, f)).find(existsSync);
  if (!runtime) throw new Error(`no HyperFrames runtime in ${pkg.dir}`);
  return { version: pkg.version, dir: pkg.dir, runtime, require: req };
}

// Chrome that hyperframes renders with. `browser path` only reports; `browser ensure` may download (ask the user first).
export function resolveChrome(hf) {
  const r = sh("npx", ["--yes", `hyperframes@${hf.version}`, "browser", "path"]);
  const line = r.out.split(/\r?\n/).map((s) => s.trim()).reverse().find((s) => /chrome|chromium/i.test(s) && existsSync(s));
  if (line) return line;
  const cache = join(homedir(), ".cache", "puppeteer", "chrome");
  if (existsSync(cache)) {
    for (const v of readdirSync(cache).sort().reverse()) {
      for (const rel of ["chrome-win64/chrome.exe", "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-linux64/chrome"]) {
        if (existsSync(join(cache, v, rel))) return join(cache, v, rel);
      }
    }
  }
  return null;
}

// After Effects: the newest install unless one is named. Returns { app, version, afterfx (win), appName (mac), aerender }
export function resolveAE(prefer) {
  const roots = IS_WIN ? ["C:/Program Files/Adobe"] : IS_MAC ? ["/Applications"] : [];
  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root)) {
      const m = d.match(/^Adobe After Effects (\d{4}|CC \d{4}|\d+(\.\d+)?)$/);
      if (!m) continue;
      const year = parseInt(m[1].replace("CC ", ""), 10);
      if (IS_WIN) {
        const afterfx = join(root, d, "Support Files", "AfterFX.exe"), aerender = join(root, d, "Support Files", "aerender.exe");
        if (existsSync(afterfx)) found.push({ name: d, year, afterfx, aerender: existsSync(aerender) ? aerender : null });
      } else {
        const app = join(root, d, `${d}.app`), aerender = join(root, d, "aerender");
        if (existsSync(app)) found.push({ name: d, year, appName: d, app, aerender: existsSync(aerender) ? aerender : null });
      }
    }
  }
  found.sort((a, b) => b.year - a.year);
  if (prefer) return found.find((f) => f.name.includes(prefer)) || null;
  return found[0] || null;
}

export function resolveFfmpeg() {
  for (const c of ["ffmpeg", "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
    const r = spawnSync(c, ["-version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  return null;
}

export function aeRunning() {
  if (IS_WIN) {
    const r = sh("tasklist", ["/FI", "IMAGENAME eq AfterFX.exe", "/FO", "CSV", "/NH"]);
    return /AfterFX\.exe/i.test(r.out);
  }
  if (IS_MAC) return sh("pgrep", ["-f", "After Effects"]).code === 0;
  return false;
}

export { sh, execFileSync };
