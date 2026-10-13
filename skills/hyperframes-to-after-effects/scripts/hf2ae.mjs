#!/usr/bin/env node
// hf2ae: HyperFrames project -> editable After Effects project.
//   node hf2ae.mjs doctor  <project>                         what is installed, what is missing
//   node hf2ae.mjs export  <project> --out <dir> [--fps 30]  sample the film into <dir> (Chrome only, no After Effects)
//   node hf2ae.mjs build   --out <dir> [--aep file.aep] [--into-open] [--ae "2026"]   build the .aep in After Effects
//   node hf2ae.mjs verify  <project> --out <dir> [--frames 8]  render the .aep with aerender, compare with HyperFrames
//   node hf2ae.mjs all     <project> --out <dir> ...           export + build + verify
import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { resolveHyperframes, resolveChrome, resolveAE, resolveFfmpeg, aeRunning, IS_WIN, IS_MAC } from "./lib/env.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name, def) => { const i = argv.indexOf("--" + name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : def; };
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith("--") && !(i > 0 && arr[i - 1].startsWith("--") && !["--into-open", "--no-verify"].includes(arr[i - 1])));
const project = positional[0] ? resolve(positional[0]) : null;
const out = opt("out") ? resolve(opt("out")) : project ? join(project, "after-effects") : null;

function needProject() {
  if (!project || !existsSync(join(project, "index.html"))) { console.error("give the HyperFrames project folder (the one with index.html)"); process.exit(2); }
}

async function main() {
  if (cmd === "doctor") {
    needProject();
    const hf = resolveHyperframes(project);
    const chrome = resolveChrome(hf), ae = resolveAE(opt("ae")), ff = resolveFfmpeg();
    console.log(JSON.stringify({ platform: process.platform, node: process.version, hyperframes: hf.version, chrome: chrome || null,
      afterEffects: ae ? ae.name : null, aerender: ae?.aerender || null, ffmpeg: ff, aeRunning: aeRunning() }, null, 1));
    if (!chrome) console.log("Chrome for HyperFrames is missing: `npx hyperframes browser ensure` downloads it (ask the user first).");
    if (!ae) console.log("After Effects not found: export still works; build needs After Effects on this machine.");
    return;
  }
  if (cmd === "export" || cmd === "all") {
    needProject();
    const { exportProject } = await import("./lib/export.mjs");
    const hf = resolveHyperframes(project);
    const chrome = resolveChrome(hf);
    if (!chrome) throw new Error("Chrome for HyperFrames not found: run `npx hyperframes browser ensure` (after asking the user)");
    await exportProject({ hf, chrome, projectDir: project, out, fps: +opt("fps", 30), canvasFps: opt("canvas-fps") ? +opt("canvas-fps") : undefined });
  }
  if (cmd === "build" || cmd === "all") {
    const { buildInAE } = await import("./lib/ae.mjs");
    await buildInAE({ out, aep: opt("aep") ? resolve(opt("aep")) : join(out, "project.aep"), intoOpen: opt("into-open", false) === true, prefer: opt("ae") });
  }
  if (cmd === "verify" || (cmd === "all" && !opt("no-verify"))) {
    needProject();
    const { verify } = await import("./lib/verify.mjs");
    await verify({ project, out, aep: opt("aep") ? resolve(opt("aep")) : join(out, "project.aep"), frames: +opt("frames", 8), prefer: opt("ae") });
  }
  if (!["doctor", "export", "build", "verify", "all"].includes(cmd)) {
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 8).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  }
}
main().catch((e) => { console.error("hf2ae: " + (e.stack || e.message)); process.exit(1); });
