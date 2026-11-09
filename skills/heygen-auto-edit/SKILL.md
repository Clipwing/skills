---
name: heygen-auto-edit
description: Auto-edit a HeyGen avatar video (or any talking-head take) into a finished YouTube-style video in 16:9 and/or 9:16 - pauses cut, punch-in zooms on the presenter, full-screen cards (checklists, search bars, stats, mind maps, quotes, screenshots), bold words around the head, whip / zoom / light-leak transitions, film grain, captions for vertical, background music ducked under the voice and real sound effects via the real-sfx skill. Use when the user asks to edit, cut, "смонтировать", "автомонтаж", polish or add b-roll / motion graphics / zooms / captions / music to a HeyGen, Synthesia, avatar, talking-head, webcam or podcast-style video, even if they do not name the skill.
---

# heygen-auto-edit: a talking head into a finished video

The look is a modern creator explainer (references: the Lera Clipwing YouTube videos, `references/style.md`):
the presenter is cut every few seconds between a wide and a close frame, and every idea gets a picture: a warm-paper
card, a search bar typing, a number counting up, a mind map, a screenshot. Bold words pop around the head, transitions
are fast whips and zoom blurs with an occasional light leak, music sits quietly under the voice, small real sounds
land on every move.

**Everything is drawn in code** (canvas, seeked frame by frame): no stock clips, no movie or meme clips (copyright
strikes), no generated images. Real b-roll comes only from files the user gives (screenshots, photos) via `image` beats.

## What you need

- `ffmpeg`, Python 3.9+, Node 18+, Chrome or Chromium (Playwright's, or the system Chrome; `render.mjs` installs
  `playwright-core` into `~/.cache/heygen-auto-edit` on first use).
- Word timings: `pip install faster-whisper` (downloads the model once), or a VTT / words JSON you already have.
  Optional `pip install opencv-python-headless` to find the face (otherwise the centre of the upper third is assumed).
- Music: a track or a folder of tracks the user is licensed to use. Never generate music.
- Sound effects: the **real-sfx** skill with a sound library configured. Without it the film has voice + music only:
  say so.

## Workflow

Work in a folder of your own (`work/`), never inside this skill's folder. Run scripts from the skill folder.

### 1. Prepare the take
```
python scripts/prepare.py TAKE.mp4 --out work                      # faster-whisper small.en
python scripts/prepare.py TAKE.mp4 --out work --model large-v3     # not English
python scripts/prepare.py TAKE.mp4 --out work --vtt captions.vtt   # timings you already have
```
It cuts pauses longer than 0.35 s (`--max-pause`, `--no-cut` to keep the take whole), and writes `words.json`,
`transcript.txt`, `voice.wav`, every frame as JPEG (colour-graded), `face.json`, `info.json` (`--base` adds a watchable `base.mp4`). HeyGen takes have clean
audio and few fillers; a long take may still have long breaths between paragraphs: they go.

Check `face.json` (`found` > 0, or look at one frame): the camera centres every zoom on it.

### 2. Write the edit plan
Read `work/transcript.txt` (sentences with times) and `references/plan-format.md`, then write `work/edit.json`:
- **framing (`talk`)**: a cut between wide (1.0) and close (1.25–1.45) roughly every sentence, on word starts; `snap`
  on punch-ins that stress something.
- **beats**: for each idea, the picture that explains it, on the sentence that says it. Lists the presenter counts ->
  `list` (items appear on the words that say them); "how would you search..." -> `search`; a number -> `stat`;
  "good vs bad" -> `compare`; several parts of one thing -> `mindmap`; the one-line takeaway -> `quote`; a key
  phrase -> `title`; punchy phrases while talking -> `words`; a user screenshot -> `image`.
- the pacing rules at the end of `plan-format.md`: something changes every 2–4 s, a full-screen beat every 8–15 s.
- **an English plan for an English take**: card text in the video's language, short, sentence case.

Show the user the plan as a short timeline (time, what is on screen) before rendering a long film, unless they asked
for an unattended run.

### 3. Check the plan, then the look on stills
```
python scripts/check_plan.py work/edit.json
```
Fix every ERROR and the WARN lines that matter (long static stretches, a cut inside a word, unreadable short cards).
```
node scripts/render.mjs --work work --plan work/edit.json --aspect 16:9 --stills 2,8.5,14,24
node scripts/render.mjs --work work --plan work/edit.json --aspect 9:16 --stills 2,8.5,14,24
```
Look at every still (`work/stills-16x9/`, `work/stills-9x16/`): text inside the frame, nothing over the face, captions
readable, cards not empty at their start. Fix the plan and look again.

### 4. Render
```
node scripts/render.mjs --work work --plan work/edit.json --aspect 16:9 --cues work/cues.json --out work/film-16x9.silent.mp4
node scripts/render.mjs --work work --plan work/edit.json --aspect 9:16 --out work/film-9x16.silent.mp4
```
Render the aspects the user asked for (both by default: the user picks). `--scale 0.5` gives a fast preview,
`--from/--to` a piece, `--workers N` more browsers (one per two cores by default).

### 5. Sound: voice + music
```
python scripts/mix.py --video work/film-16x9.silent.mp4 --voice work/voice.wav --music MUSIC_DIR_OR_FILE --out work/film-16x9.mp4
```
Music -17 dB under the voice, ducked a further 9 dB while the presenter speaks, faded in and out, the result at
-14 LUFS. A folder: the shortest track that covers the film is picked. `--music-db -20` for a calmer bed.

### 6. Sound effects with real-sfx
`--cues` in step 4 wrote the typed cue list (whooshes on transitions, pops on items and words, typing on search and
titles, a click on Subscribe). The timeline is the same in both aspects, so one SFX track serves both. In the real-sfx
skill's folder:
```
python scripts/from_cues.py WORK/cues.json --video WORK/film-16x9.mp4 --out WORK/sfx/cues.json --ui library
python scripts/mix.py WORK/sfx/cues.json --out WORK/final-16x9.mp4 --voice-safe
```
It also writes `WORK/final-16x9_sfx_track.wav`. Lay that track under the vertical film with this skill's mixer:
```
python scripts/mix.py --video work/film-9x16.silent.mp4 --voice work/voice.wav --music MUSIC --sfx work/final-16x9_sfx_track.wav --out work/final-9x16.mp4
```
Read the real-sfx report: the SFX support the cut, the voice leads.

### 7. Deliver
Give the user the final MP4s (both aspects), a contact sheet of frames, and say which music track was used and that
the SFX came from their library. Mention anything you could not do (no face found, no SFX library, no music).

## Always

- Never cover the face with a card edge, words or a caption in 16:9. In 9:16 the words go above the head, captions
  below the chin.
- Card text is short: a title of ≤ 6 words, items of ≤ 6 words. No paragraphs on screen.
- No fake brands, people or logos inside UI mockups (the thumbnail grid is abstract on purpose); a real product
  appears only from the user's own screenshot.
- Keep every working file in `work/`. Do not change this skill's folder.
