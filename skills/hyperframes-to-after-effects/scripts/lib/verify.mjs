// verify.mjs: renders the built .aep with aerender, takes the same moments from the HyperFrames page (the loader matches
// `hyperframes snapshot` to SSIM 0.99+), and writes <out>/verify/compare.png (After Effects left, HyperFrames right, one
// row per moment) plus SSIM per moment. Look at compare.png; SSIM only says where to look.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveHyperframes, resolveChrome, resolveAE, resolveFfmpeg } from "./env.mjs";
import { openProject } from "./page.mjs";

export async function verify({ project, out, aep, frames = 8, prefer, log = console.log }) {
  const M = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
  const ae = resolveAE(prefer), ff = resolveFfmpeg();
  if (!ae?.aerender) throw new Error("aerender not found next to After Effects");
  if (!ff) throw new Error("ffmpeg not found (HyperFrames renders need it too)");
  const vdir = join(out, "verify"); mkdirSync(vdir, { recursive: true });
  const rootName = M.project.replace(/\\/g, "/").split("/").pop();
  const mp4 = join(vdir, "ae.mp4");
  log(`rendering "${rootName}" with aerender...`);
  const t0 = Date.now();
  const r = spawnSync(ae.aerender, ["-project", aep, "-comp", rootName, "-OMtemplate", "H.264 - Match Render Settings - 15 Mbps", "-output", mp4], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (!existsSync(mp4)) throw new Error("aerender produced nothing:\n" + (r.stdout || "").split("\n").slice(-15).join("\n") + (r.stderr || ""));
  log(`  aerender ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const times = Array.from({ length: frames }, (_, i) => +(((i + 0.5) * M.duration) / frames).toFixed(3));
  const hf = resolveHyperframes(project);
  const P = await openProject({ hf, chrome: resolveChrome(hf), projectDir: project, log: () => {} });
  for (const t of times) { await P.seek(t, { media: true }); await P.page.screenshot({ path: join(vdir, `hf_${t}.png`) }); }
  await P.close();
  const rows = [];
  for (const t of times) {
    const a = join(vdir, `ae_${t}.png`), b = join(vdir, `hf_${t}.png`);
    // the frame index, not -ss: exact frame from the H.264
    const fi = Math.round(t * M.fps);
    spawnSync(ff, ["-y", "-loglevel", "error", "-i", mp4, "-vf", `select=eq(n\\,${fi})`, "-frames:v", "1", "-fps_mode", "passthrough", a]);
    const s = spawnSync(ff, ["-i", a, "-i", b, "-lavfi", "[0]format=gray[x];[1]format=gray[y];[x][y]ssim", "-f", "null", "-"], { encoding: "utf8" });
    const ssim = +((s.stderr || "").match(/All:([\d.]+)/)?.[1] || 0);
    rows.push({ t, ssim, a, b });
  }
  // compare sheet: one row per moment, After Effects | HyperFrames, 800 px each
  const inputs = rows.flatMap((r) => ["-i", r.a, "-i", r.b]);
  const n = rows.length;
  const fc = rows.map((r, i) => `[${2 * i}]scale=800:-2[a${i}];[${2 * i + 1}]scale=800:-2[b${i}];[a${i}][b${i}]hstack[r${i}]`).join(";") + ";" + rows.map((_, i) => `[r${i}]`).join("") + `vstack=inputs=${n}[o]`;
  spawnSync(ff, ["-y", "-loglevel", "error", ...inputs, "-filter_complex", n > 1 ? fc : fc.replace(/;\[r0\]vstack=inputs=1\[o\]$/, "").replace("[r0]", "[o]"), "-map", "[o]", join(vdir, "compare.png")]);
  const mean = rows.reduce((s, r) => s + r.ssim, 0) / n;
  const report = [`verify ${basename(aep)}: mean SSIM ${mean.toFixed(4)} (1 = identical; text in a substitute font typically lands 0.95-0.99)`,
    ...rows.map((r) => `  t=${r.t}s  SSIM ${r.ssim.toFixed(4)}${r.ssim < 0.93 ? "  <- look here" : ""}`), `sheet: ${join(vdir, "compare.png")} (After Effects left, HyperFrames right)`].join("\n");
  writeFileSync(join(vdir, "report.txt"), report);
  log(report);
  return { mean, rows };
}
