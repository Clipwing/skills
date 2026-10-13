# Troubleshooting

## The build sits on one step for minutes
Read `<out>/ae_status.txt` (current layer) and `<out>/ae_build_log.txt` (layers over 3 s are logged as "slow layer").
A healthy build is ~10–50 ms per layer. If one layer type is slow, the usual cause is a property written key by key
or Source Text keys; fix the builder, do not wait it out. To stop a stuck build, ask the user to press *Cancel* in
After Effects' "Executing script" dialog or to close After Effects (their own projects are their call).

## After Effects never starts the script ("never started the script")
- *Preferences → Scripting & Expressions → Allow Scripts to Write Files and Access Network* must be on.
- A modal dialog in After Effects (crash recovery, missing fonts, update) blocks scripts: close it.
- macOS: the first `osascript` call asks for permission to control After Effects (System Settings → Privacy &
  Security → Automation). The app name must match the installed one (`Adobe After Effects 2026`).

## "After Effects has a project open with items in it"
The builder will not mix the film into someone's open project uninvited. Ask the user: save and close their project,
or rerun `build` with `--into-open` to add the film to it (it is then saved under the `--aep` path).

## Fonts look wrong
- `export_report.txt` → *fonts* shows what each CSS family resolved to. A web font the page fetched from Google is
  saved as TTF in `<out>/fonts`.
- `ae_build_log.txt` → "fonts substituted" lists faces After Effects could not find. Install those files **for all
  users** (Windows: right click → *Install for all users*), restart After Effects, run `build` again.
- Text a few pixels off: substitutes are fitted per line to the original width; the fit factor is in the layer
  comment.

## A frame does not match in `verify/compare.png`
1. Confirm the right side (HyperFrames) is correct: it comes from the same loader as `hyperframes snapshot`.
2. Find the element in `<out>/comps/<cid>.json` by its key path and check the sampled tracks at that frame
   (`frame = t × fps` minus the composition's start).
3. Wrong everywhere in a precomp → check its `startF` / `inF` / `outF` in the parent.
4. Element missing → `export_report.txt` warnings (unsupported clip-path, tainted canvas, filters).
5. Blur strength off → adjust `BLUR_K` in `scripts/ae/build.jsx`.

## The export is slow
Sampling costs one page evaluation per frame (~15–30 frames/s). A long film at 60 fps takes minutes; use `--fps 30`
unless the motion needs 60. Canvases are captured at `--canvas-fps` (default: fps, halved above 30).

## A canvas exports blank
WebGL canvases without `preserveDrawingBuffer` can read back empty. Set `preserveDrawingBuffer: true` on the
renderer in the project, or accept a still.

## Media
WebM / OGG video and audio are converted with ffmpeg (H.264 / WAV). WebP / AVIF / SVG images are converted to PNG
with sharp. Remote URLs are downloaded into `<out>/assets`.
