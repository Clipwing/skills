# HeyGen Auto-Edit

Turns a HeyGen avatar video (or any talking-head take) into a finished creator-style video, in 16:9 and 9:16:

- long pauses cut, word timings from faster-whisper;
- the presenter cut between wide and close framings every few seconds, with punch-ins and a handheld drift;
- full-screen pictures for the ideas: typed serif titles, checklists, good vs bad, a search bar typing, an analytics
  card, a mind map, a quote over the blurred presenter, your own screenshots;
- bold words around the head, a Subscribe click at the end;
- whip pans, zoom blur, light leaks, flashes, film grain;
- captions in 9:16 (2–3 words, the spoken word highlighted);
- background music ducked under the voice, loudness at -14 LUFS;
- a typed sound-effect cue list for the [Real SFX](../real-sfx/) skill (whooshes, pops, typing, clicks).

Everything is drawn in code from an edit plan (`edit.json`) that Claude writes from the transcript. See `SKILL.md`
for the workflow, `references/plan-format.md` for the plan and `references/style.md` for the reference look.

## Requirements

- ffmpeg, Python 3.9+, Node 18+, Chrome or Chromium.
- `pip install faster-whisper` (word timings) and, optionally, `opencv-python-headless` (finds the face).
- Your own licensed music. For sound effects, the Real SFX skill with a sound library.

## Quick start

Ask Claude: **"Edit this HeyGen video: take.mp4"**. It runs:

```bash
python scripts/prepare.py take.mp4 --out work
# Claude writes work/edit.json from work/transcript.txt
python scripts/check_plan.py work/edit.json
node scripts/render.mjs --work work --plan work/edit.json --aspect 16:9 --cues work/cues.json --out work/film-16x9.silent.mp4
node scripts/render.mjs --work work --plan work/edit.json --aspect 9:16 --out work/film-9x16.silent.mp4
python scripts/mix.py --video work/film-16x9.silent.mp4 --voice work/voice.wav --music music/ --out work/film-16x9.mp4
```

Fonts: Inter and Libre Caslon Text (SIL Open Font License, `page/fonts/`).
