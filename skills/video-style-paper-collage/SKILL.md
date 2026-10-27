---
name: video-style-paper-collage
description: Make an explainer in the Paper Collage style (Vox-like) with HyperFrames — dark grainy cardboard, objects with torn paper edges stuck down with tape, huge cut-out words and numbers in mustard, red or paper colour, typewriter labels on paper strips, a red thread pulled from one object to the next, ink blots, a slow camera push inside each scene and paper sheets sliding up between scenes. 16:9 or 9:16, 15–50 s. Use when someone asks for a "Paper Collage" or "Vox style" video, a collage or scrapbook look, a history or "how it works" explainer, blog to video with a handmade feel, or a story that connects facts.
---

# Paper Collage

An explainer that looks made by hand: every scene is a sheet of dark cardboard, and things are cut out and stuck onto it. A big cut-out word or number carries the beat, a typewriter label names it, and a red thread links one thing to the next. Modelled on the Vox-style collage skill (v2, 15.10).

**Best for:** explainers, "how it works", history and facts, and blog to video where the idea matters more than UI. **Not for:** product UI demos, or anything that needs a crisp tech look.

`template/` is a finished 20 s promo for Clipwing's YouTube Transcript Generator. Frames: [example-frames.jpg](example-frames.jpg).

## Make a film

1. **Brief.** One idea, 4–5 beats, and for each beat: the big word or number, the label, and the object. Facts and numbers come from the source; sample numbers carry "sample" on their label. Write `brief.md`.
2. **Images.** The reference used engravings and objects from an image model. Without one, draw objects in paper as the template does (a video frame, a page), or use the person's own photos and screenshots in a `.cut.torn` box. Keep one look per film: all drawn or all photos, never a mix with flat vector icons.
3. **Project.**
   ```sh
   npx --yes hyperframes@0.8.202 init <dir> --example blank --non-interactive --resolution landscape   # or portrait
   cp -R <this skill>/template/. <dir>/
   ```
4. **Scenes** ([references/film-markup.md](references/film-markup.md)): at most 3 objects and 1 big word per scene, with empty cardboard around them. The film ends with everything joined by threads, or with a paper end card.
5. **Check and look:** `node lint-film.mjs`, `npx hyperframes check --json`, `npx hyperframes snapshot` at the middle of each scene.
6. **Render:** `npx hyperframes render --quiet -o renders/<name>.mp4` (about 20 s). The grain makes files large (about 12 MB for 20 s); for the web, re-encode with `ffmpeg -crf 28`.

Team rules: [references/video-rules.md](references/video-rules.md). Italics are never used here.

## Look

| Role | Value |
| --- | --- |
| Cardboard | `#2b2b2b` with a fractal-noise grain and a soft vignette (in the CSS) |
| Paper | `#ece4d0`, darker `#d8cdb8` |
| Big words and numbers | Oswald 700, 140–230 px, mustard `#d9a94a`, paper, or red `#c8372d`. Red goes on a paper strip, because red on cardboard is too dark to read |
| Labels | Special Elite 32–40 px on a paper strip with a small turn |
| Thread, blots | red `#c8372d`, 4 px |
| Tape | translucent beige `rgba(235,225,200,.82)` |

## Parts and effects

| Markup | What it does |
| --- | --- |
| `.cut.torn` with `style="--r: -4deg"` + `stick` | A cut-out with a seeded torn edge flies in with an extra turn and settles at its own angle `--r`. Never set the angle with CSS `transform`: the effect owns the transform |
| `.tape` + `tape` | Tape lands a beat after the object |
| `.big` + `letters` | Cut-out letters land one by one, each on its own small turn |
| `.label` + `stick` | A typewriter label on a paper strip |
| `<svg class="thread">` path + `draw` | The thread pulls from one object's edge to the next, never across text |
| `.blot` + `blot` | An ink blot spreads and stays |
| Scene `data-push` | The slow camera push inside the scene (default 1.06) |

Scenes change by sliding: the next sheet comes up over the old one in 0.6 s. Never fade or flash.

## Rules learned in the runs

- Without real images the style slides into a "ransom note". Keep the cut-out letters to one big word per scene and make the objects carry the picture.
- Group letters by word so a word never breaks across lines ("HA/ND", v1).
- A blot goes under text, never over it.
- `check` flags letters of a cut-out word as overlapping because each letter is turned. That's the look; keep the word on one line.
- Objects in vertical 9:16 need to be bigger than you think: a frame under 500 px wide is lost on a phone.

## Checklist before render

- [ ] At most 3 objects and 1 big word per scene.
- [ ] Digits for numbers (1819, 9 IN 10), labels on paper strips, no italics.
- [ ] Every thread starts and ends at an object's edge.
- [ ] Sample numbers labelled; facts from the source.
