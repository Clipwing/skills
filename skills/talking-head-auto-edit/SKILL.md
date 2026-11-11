---
name: talking-head-auto-edit
description: Auto-edit a HeyGen avatar video (or any talking-head take) into a finished creator-style YouTube video in 16:9 and/or 9:16 - pauses cut, a camera that follows the face, cards in gentle perspective on a clean white stage (checklists, charts, tables, roadmaps, mind maps, compare cards), app screens in a clean window (search, social posts, a large phone playing a clip), a split screen with the presenter in a window, words in a white panel beside the presenter and a one-line headline, free stock photos and clips (Pixabay / Pexels), transitions, film grain, captions for vertical, music ducked under the voice and real sound effects via the real-sfx skill. Takes an optional brand kit (colours, fonts, logo). After delivery, changes to single scenes are patched into the finished film without a full re-render. Use when the user asks to edit, cut, auto-edit, polish or add b-roll / motion graphics / zooms / captions / music to a HeyGen, Synthesia, avatar, talking-head, webcam or podcast-style video, or to change a scene of a video made with this skill, even if they do not name the skill.
---

# talking-head-auto-edit: a talking head into a finished video

The look is a modern creator explainer (references: the Lera Clipwing YouTube videos, `references/style.md`):
the presenter is cut every few seconds between a wide and a medium-close frame that follows the face, and every idea
gets a picture: cards in gentle perspective on a plain white stage (checklists, charts, tables, roadmaps, mind maps), app screens in a
clean window (a search typing, a post being published), a large phone playing a clip, the presenter sliding aside for
a text panel, stock photos. For a phrase on the presenter the camera moves them aside and white plates turned towards them take the
other side; transitions are soft blur dissolves and push-in zooms that keep the whole frame. Music sits quietly under the
voice, small real sounds land on every move. The look follows a review by two professional editors
(`references/style.md`, "Editors' rules"): no 3D lettering, no gradients or dark stages; depth is kept clean (a slight turn and a soft shadow).


**Drawn in code** (canvas + WebGL, seeked frame by frame), plus free stock: photos from Pexels / Openverse /
Wikimedia Commons, clips only from Pexels or Pixabay (free API keys `PEXELS_API_KEY`, `PIXABAY_API_KEY`). No movie or
meme clips (copyright strikes), no generated images; the user's own screenshots go in `image` beats.

## What you need

- `ffmpeg`, Python 3.9+, Node 18+, Chrome or Chromium (Playwright's, or the system Chrome; `render.mjs` installs
  `playwright-core` into `~/.cache/talking-head-auto-edit` on first use).
- Word timings: `pip install faster-whisper` (downloads the model once), or a VTT / words JSON you already have.
  Optional `pip install opencv-python-headless` to find the face (otherwise the centre of the upper third is assumed).
- The person matte: `pip install onnxruntime opencv-python-headless numpy` (`matte.py` downloads the RVM model, ~15 MB,
  once from GitHub). Without it there are no words behind the head and the camera does not follow the face.
- Stock clips: `PEXELS_API_KEY` and/or `PIXABAY_API_KEY` in the environment (both free). Without one, plan no `video`
  beats (keyless clips from Commons are too random to cut in).
- Music: a track or a folder of tracks the user is licensed to use. Never generate music.
- Sound effects: the **real-sfx** skill with a sound library configured. Without it the film has voice + music only:
  say so.

## Before you start: ask for a free Pixabay key

Stock clips come from Pixabay (free; Pexels works too). Before the first edit, ask the user to create a free account at
https://pixabay.com/accounts/register/, copy the API key from https://pixabay.com/api/docs/ (shown under "Parameters"
once signed in) and paste it in the chat. Set it as `PIXABAY_API_KEY` in the environment `fetch_stock.py` runs in
(an `.env` file or the shell), never in the plan, a script or a committed file. Without a key the edit still works: plan
photos and cards instead of clips, and say so in the report.

Ask once, together with the other choices: the aspect (16:9, 9:16 or both), a brand kit if the user has one, the music.
If the user has no preference, the defaults are: 16:9, the look in `references/style.md`, no brand kit.

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

Check `face.json` (`found` > 0, or look at one frame). Then the matte and the head track (the camera follows it):
```
python scripts/matte.py --work work          # ~10-15 frames/s on a laptop CPU
```

### 2. Write the edit plan
Read `work/transcript.txt` (sentences with times) and `references/plan-format.md`, then write `work/edit.json`:
- **framing (`talk`)**: a cut between wide (1.0) and medium-close (1.1–1.22, never tighter) roughly every sentence,
  on word starts; `snap` on punch-ins that stress something.
- **beats**: for each idea, the picture that explains it, on the sentence that says it. Lists the presenter counts ->
  `list` (items appear on the words that say them); "how would you search..." -> `search`; a number -> `stat`;
  "good vs bad" -> `compare`; several parts of one thing -> `mindmap`; numbers -> `bars` / `donut` / `stat`; options
  by audience -> `table`; steps or a week -> `roadmap`; a short list said to camera -> `split`; posting somewhere ->
  `post`; clips / Shorts / TikTok -> `phone`; a concrete thing (a desk, a camera) -> `photo` / `video`; the one-line
  takeaway -> `quote`; a section -> `title` with `kicker`; one or two punchy words while talking -> `words` (sparingly:
  prefer the scenes above); a user screenshot -> `image`.
  Write a small script that finds phrases in `words.json` for every `at`; never guess times.
- **stock**: give `photo` / `video` beats a `query` (or `queries`), run `python scripts/fetch_stock.py --plan
  work/edit.json`, look at each `work/stock/<beat>/sheet.jpg` as one image and set `src` / `srcs`. Skip anything odd, off-topic,
  generated-looking ("AI slop") or weak: no picture is better than a strange one; a designed card often says it better. `--credits` writes the attribution lines.
- the pacing rules at the end of `plan-format.md`: something changes every 2–4 s, a full-screen beat every 8–15 s.
- **an English plan for an English take**: card text in the video's language, short, sentence case.

Show the user the plan as a short timeline (time, what is on screen) before rendering a long film, unless they asked
for an unattended run.

### 2b. Give section titles a moment
```
python scripts/hold.py --work work --plan work/edit.json --dry    # the pauses it would add
python scripts/hold.py --work work --plan work/edit.json
```
The title card goes up as the presenter starts saying it; right after the title's last word has stopped sounding
(found in voice.wav, not from the word timings, which run early or late) a micro pause is added and the card leaves
before the presenter carries on. The section's content is never said while only its title is on screen. Every pause
is printed with the voice level at the cut; a CHECK line means the cut is not in silence: fix it before rendering.
It moves every later time in the plan and the work files. `--undo` takes the pauses out (do that before re-planning).

### 3. Check the plan, then the look on stills
```
python scripts/check_plan.py work/edit.json
```
Fix every ERROR and the WARN lines that matter (long static stretches, a cut inside a word, unreadable short cards).
```
node scripts/render.mjs --work work --plan work/edit.json --aspect 16:9 --check          # any text leaving the frame
node scripts/render.mjs --work work --plan work/edit.json --aspect 16:9 --stills 2,8.5,14,24
```
Make one contact sheet of the stills (ffmpeg `tile`) and look at it as a single image: cheaper than one by one.
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
Music -24 dB under the voice, ducked a further 8 dB while the presenter speaks, faded in and out, the result at
-14 LUFS; the voice is padded to the film's length so the end screen keeps its sound. A folder: the shortest track
that covers the film is picked.

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
Give the user the final MP4s, a contact sheet of frames, the time each step took, the stock credits
(`work/credits.txt`), which music track was used and that the SFX came from their library. Mention anything you could
not do (no face found, no matte, no stock key, no SFX library, no music).

### 8. Changes after delivery: patch, do not re-render
When the user asks to change a scene, edit `work/edit.json` (only the beats, framings or accents that change), then:
```
node scripts/patch.mjs --work work --plan work/edit.json --film work/film-16x9.silent.mp4 --cues work/cues.json --dry
node scripts/patch.mjs --work work --plan work/edit.json --film work/film-16x9.silent.mp4 --cues work/cues.json
```
`--dry` lists the stretches that will be re-rendered and why; check that they are only the scenes you meant to change.
The new frames replace the old ones in the silent film (the old film stays as `.prev.mp4`); then run steps 5–6
again (sound takes a few minutes). Unchanged cards keep their transitions. A change to the film's length or to `vfx`,
`endscreen` or the brand needs a whole render (step 4): `patch.mjs` says so. Report how much of the film was
re-rendered and how long it took.

## Always

- Never cover the face with a card edge, words or a caption: the engine moves the presenter aside for words.
- Never leave the presenter on screen for a moment between two cards (the engine joins cards closer than 3.4 s,
  unless words beside the presenter sit in the gap), and give every presenter <-> card change a transition (the
  engine does by default).
- Follow the editors' rules in `references/style.md`: plain white, flat, everything on the words, eased motion.
- Do not repeat the same mark in a column (a tick on every row); one badge in a header is enough.
- A brand kit (`brand.json`: colours, fonts, logo) styles everything: see `plan-format.md`.
- Card text is short: a title of ≤ 6 words, items of ≤ 6 words. No paragraphs on screen.
- No fake brands, people or logos inside UI mockups (the thumbnail grid is abstract on purpose); a real product
  appears only from the user's own screenshot.
- Keep every working file in `work/`. Do not change this skill's folder.
