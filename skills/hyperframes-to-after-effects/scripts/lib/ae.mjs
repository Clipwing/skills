// ae.mjs: runs scripts/ae/build.jsx in After Effects and waits for it.
//   Windows: AfterFX.exe -r <wrapper.jsx>  (hands the script to a running After Effects, or starts one that runs it and quits)
//   macOS:   osascript: tell application "Adobe After Effects <year>" to DoScript "$.evalFile(<wrapper.jsx>)"
// After Effects needs Preferences > Scripting & Expressions > "Allow Scripts to Write Files and Access Network".
import { writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { resolveAE, aeRunning, IS_WIN, IS_MAC } from "./env.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fwd = (p) => p.replace(/\\/g, "/");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runJsx({ jsx, prefer, statusFile, timeoutMs = 30 * 60 * 1000, log = console.log }) {
  const ae = resolveAE(prefer);
  if (!ae) throw new Error("After Effects not found (looked in " + (IS_WIN ? "C:/Program Files/Adobe" : "/Applications") + ")");
  if (statusFile && existsSync(statusFile)) rmSync(statusFile);
  const running = aeRunning();
  log(`${ae.name}${running ? " (already open: the script runs in that window)" : " (starting it; it quits when the script ends)"}`);
  if (IS_WIN) spawn(ae.afterfx, ["-r", jsx], { detached: true, stdio: "ignore" }).unref();
  // DoScript with $.evalFile sidesteps AppleScript's HFS / POSIX path formats
  else if (IS_MAC) spawn("osascript", ["-e", `with timeout of 7200 seconds\ntell application "${ae.appName}" to DoScript "$.evalFile(new File(${JSON.stringify(fwd(jsx)).replace(/"/g, "'")}))"\nend timeout`], { detached: true, stdio: "ignore" }).unref();
  else throw new Error("After Effects runs on Windows and macOS only");
  if (!statusFile) return;
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < timeoutMs) {
    await sleep(2000);
    if (!existsSync(statusFile)) {
      if (Date.now() - t0 > 180000) throw new Error("After Effects never started the script: enable Preferences > Scripting & Expressions > \"Allow Scripts to Write Files and Access Network\", close any open dialog in After Effects, and retry");
      continue;
    }
    const s = readFileSync(statusFile, "utf8");
    if (s !== last) { last = s; if (Date.now() - t0 > 5000) log("  " + s); }
    if (/\]\s*(DONE|FAILED)/.test(s)) return s;
  }
  throw new Error("After Effects script timed out; see " + statusFile);
}

export async function buildInAE({ out, aep, intoOpen, prefer, log = console.log }) {
  if (!existsSync(join(out, "manifest.json"))) throw new Error(`no export in ${out}: run the export step first`);
  const wrapper = join(out, "run_build.jsx");
  writeFileSync(wrapper, `// written by hf2ae: runs the shared builder on this export\n$.global.HF2AE = ${JSON.stringify({ out: fwd(out), aep: fwd(aep), intoOpen: !!intoOpen })};\n$.evalFile(new File(${JSON.stringify(fwd(join(HERE, "..", "ae", "build.jsx")))}));\n`);
  const t0 = Date.now();
  const st = await runJsx({ jsx: wrapper, prefer, statusFile: join(out, "ae_status.txt"), log });
  const buildLog = existsSync(join(out, "ae_build_log.txt")) ? readFileSync(join(out, "ae_build_log.txt"), "utf8") : "";
  log(buildLog.trim());
  log(`build ${/DONE/.test(st) ? "finished" : "FAILED"} in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${aep}`);
  if (!/DONE/.test(st)) throw new Error("After Effects build failed: " + st);
  // After Effects writes the .aep asynchronously right after the script returns
  for (let i = 0; i < 30 && !existsSync(aep); i++) await sleep(1000);
}
