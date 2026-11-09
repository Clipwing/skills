# HeyGen Auto-Edit

Turns a HeyGen avatar video (or any talking-head take) into a finished creator-style video, in 16:9 and 9:16:

- long pauses cut (a breath kept after the last word), word timings from faster-whisper;
- a person matte (Robust Video Matting): the camera follows the face, and 3D words stand on the wall *behind* the head;
- the presenter cut between wide and medium-close framings, never a tight face crop;
- full-screen scenes in 3D (WebGL) with depth, shadows and a drifting camera: typed serif chapter titles, checklists,
  good vs bad / option vs option cards, bar and donut charts, tables, roadmaps, analytics with tiles, a mind-map board,
  a search bar filmed off a monitor, quotes on frosted glass, a split screen with the presenter in a window;
- free stock photos and clips (Openverse, Wikimedia Commons; no API key) and your own screenshots;
- whip, zoom, slide and 3D push transitions on every change between the presenter and a card, light leaks, film grain;
- an end screen with two "watch next" slots and a Subscribe click;
- captions in 9:16; background music well under the voice; a typed sound-effect cue list for [Real SFX](../real-sfx/);
- an optional brand kit (colours, fonts, logo); a layout check that no text ever leaves the frame.

Everything is drawn in code from an edit plan (`edit.json`) that Claude writes from the transcript. See `SKILL.md`
for the workflow, `references/plan-format.md` for the plan and `references/style.md` for the reference look.

## Requirements

- ffmpeg, Python 3.9+, Node 18+, Chrome or Chromium.
- `pip install faster-whisper onnxruntime opencv-python-headless numpy` (word timings, the matte).
- Your own licensed music. For sound effects, the Real SFX skill with a sound library.

## Quick start

Ask Claude: **"Edit this HeyGen video: take.mp4"**. It runs:

```bash
python scripts/prepare.py take.mp4 --out work
python scripts/matte.py --work work
# Claude writes work/edit.json from work/transcript.txt, then picks stock from fetch_stock.py's sheets
python scripts/fetch_stock.py --plan work/edit.json
python scripts/check_plan.py work/edit.json
node scripts/render.mjs --work work --plan work/edit.json --aspect 16:9 --check
node scripts/render.mjs --work work --plan work/edit.json --aspect 16:9 --cues work/cues.json --out work/film-16x9.silent.mp4
node scripts/render.mjs --work work --plan work/edit.json --aspect 9:16 --out work/film-9x16.silent.mp4
python scripts/mix.py --video work/film-16x9.silent.mp4 --voice work/voice.wav --music music/ --out work/film-16x9.mp4
```

Fonts: Bricolage Grotesque, Inter, Instrument Serif and Libre Caslon (SIL Open Font License, `page/fonts/`).
The RVM matting model (GPL-3.0) is downloaded at run time, not shipped.
