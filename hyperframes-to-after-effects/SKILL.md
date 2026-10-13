---
name: hyperframes-to-after-effects
description: Convert a HyperFrames project (HTML/GSAP video compositions) into an editable Adobe After Effects project (.aep) with real layers and keyframes, not a rendered video. Text stays live text, cards become shape layers, images and video become footage, sub-compositions become precomps, animation becomes keyframes, and the result is checked against the HyperFrames render frame by frame. Use this whenever someone wants to move, port, export or "hand off" a HyperFrames / HTML video to After Effects or AE, wants an .aep from their HyperFrames composition, wants to keep editing a HyperFrames film in After Effects, or asks why an AE import of their HTML animation is slow or broken, even if they do not say "skill" or name the tool. Windows and macOS.
---

# HyperFrames → After Effects

A HyperFrames film is a paused GSAP timeline over HTML. This skill plays it in headless Chrome frame by frame, records
what every element looks like, and rebuilds that in After Effects as native, editable layers:

| HyperFrames | After Effects |
|---|---|
| sub-composition (`data-composition-src`, nested `data-composition-id`) | precomp at its start, trimmed to its visible window |
| text node (each rendered line) | text layer, live font; changing strings become native recipes (below) |
| box with background / border / radius / outline / hard shadow | shape layer (rounded rect, fill, stroke, dashes) |
| soft `box-shadow` / `text-shadow`, `filter: blur()`, `mix-blend-mode` | Drop Shadow, Gaussian Blur (keyed), blending mode |
| gradients, background images, inset or multiple shadows, mixed radii | PNG painted by Chrome (transform and opacity still keyed) |
| `<img>` (`object-fit`, rounded corners), `<video>` (trim, rate, volume) | footage layer with fit, crop mask, timing, audio level |
| inline `<svg>` | PNG at 4x (a few looks: one layer each; many: a sequence) |
| `<canvas>` (2D, three.js, Lottie) | PNG sequence with time remap |
| `overflow: hidden`, `clip-path` (polygon, inset, circle, ellipse) | track matte (nested clips nest) |
| `<audio>` | audio layer at its start, with its volume |

Changing text never becomes per-frame Source Text keys: After Effects slows down project-wide once any layer has them
(one 150-key layer makes every later scripted edit ~200x slower, a 3,000-key film took hours). Instead:
counters → a Count slider + expression (or pure `time` expression when the number follows time), typing → Text Animator,
a few strings or captions → one trimmed layer per string, scrambles → a small `[time, text]` expression table,
colour changes → Fill Color animator.

## Before you start

Run the doctor and read it to the user in plain words:

```bash
node <skill>/scripts/hf2ae.mjs doctor <project>
```

- **Node 18+, the project's HyperFrames CLI and its Chrome.** The tool reuses what HyperFrames already installed
  (puppeteer-core, fontkit, sharp, Chrome) from the npx cache. If Chrome is missing, `npx hyperframes browser ensure`
  downloads it: ask the user before running it.
- **After Effects** (any recent version; 2023+ for the track-matte API) with *Preferences → Scripting & Expressions →
  Allow Scripts to Write Files and Access Network* switched on. Ask the user to check it; the build cannot set it.
- **ffmpeg** for verification (HyperFrames rendering needs it anyway) and for converting WebM/OGG media.

Ask the user (only what you cannot infer):
1. Where to save the `.aep` (default `<project>/after-effects/project.aep`).
2. If After Effects is open with a project: build into that open project (`--into-open`), or save and close it first.
   Never close, save over or discard the user's open project yourself.
3. Frame rate: the project's render rate if known (`hyperframes render -f`), else 30. Use 60 for fast UI motion.

## Workflow

```bash
node <skill>/scripts/hf2ae.mjs export <project> --out <dir> [--fps 30]   # Chrome only, no After Effects
node <skill>/scripts/hf2ae.mjs build  --out <dir> [--aep <file>] [--into-open]
node <skill>/scripts/hf2ae.mjs verify <project> --out <dir> [--frames 8]
node <skill>/scripts/hf2ae.mjs all    <project> --out <dir> ...           # the three in a row
```

`<skill>` is this skill's folder. Run steps one at a time the first time on a project, so problems surface at the
step that caused them.

1. **Export** writes `<dir>/manifest.json`, `<dir>/comps/*.json`, `<dir>/assets/`, `<dir>/fonts/` and
   `<dir>/export_report.txt`. Read the report before building: its *fonts* list says which real face every CSS
   family resolves to (aliases such as `"Brand Sans"` are read from the font files), and *warnings* lists what was
   approximated. Tell the user about warnings that affect what they will see.
2. **Build** starts After Effects (or uses the open one), writes progress to `<dir>/ae_status.txt` and a log to
   `<dir>/ae_build_log.txt`, saves after every composition. Typical films build in under a minute. If it runs for
   minutes on one layer, stop and read the log rather than waiting: see `references/troubleshooting.md`.
3. **Verify** renders the `.aep` with `aerender` and puts After Effects and HyperFrames side by side in
   `<dir>/verify/compare.png`, with SSIM per moment in `<dir>/verify/report.txt`. Open the sheet and look at it. SSIM
   tells you where to look, your eyes tell you what is wrong: typical numbers are 0.98+ with the original fonts and
   0.95–0.99 with substitutes. Fix causes in the export or build (not by hand in After Effects), rebuild, re-verify.

## Fonts

After Effects only sees fonts installed **for all users** (on Windows a per-user install is invisible to it). The
build uses the real face when After Effects has it; otherwise it picks the closest installed face of the same kind
(sans / serif / mono), fits each line to the width it had in the film (so words placed side by side keep their spaces),
and writes the original font into the layer comment. The files to install are in `<dir>/fonts/` (Google Fonts are
fetched as TTF). Offer the user that choice: install them for all users, restart After Effects, run `build` again
(no re-export needed). Installing fonts is the user's action, not yours.

## Reporting back

Tell the user, briefly: where the `.aep` is; what became what (precomps, text, shapes, footage); which fonts were
substituted and how to get the originals; the warnings that matter; the verify result with the sheet. Mention what
stays approximate (3D transforms flattened to 2D, CSS filters other than blur, painted PNGs for gradients, blend modes
that After Effects mixes slightly differently) so nothing surprises them in After Effects.

## Going deeper

- `references/how-it-works.md`: the export format, keyframe reduction, text recipes, mattes, timing of precomps and
  media. Read it before changing the scripts.
- `references/troubleshooting.md`: slow or stuck builds, After Effects not running the script, fonts, mismatched
  frames, macOS specifics.
