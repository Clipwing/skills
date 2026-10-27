---
name: video-style-film-slice
description: Make a one-metaphor 3D product video in the Film Slice style with HyperFrames — a long video shown as a film strip lying in perspective, a selection that frames moments on it, pieces that lift off the strip and land as finished clips, a fan of results, an end card. Dark, one accent, no footage needed (frames are drawn). 16:9, 15–25 s. Use when someone asks for a "Film Slice" video, a video about cutting, trimming, clipping or repurposing long videos, "long video into clips", or a short metaphor film for a video tool.
---

# Film Slice

One metaphor for a video tool, in 20 seconds: the long video is a film strip, you pick a piece, the piece lifts off and becomes a clip. Titles change at the top, and the 3D layers below carry the motion from scene to scene with no cuts. It shares Dark Pixel's look.

**Best for:** video editing, clipping, trimming and repurposing tools. **Not for:** products that don't work on video, or multi-feature walkthroughs.

`template/` is a finished film: a 20 s promo for Clipwing's Clip Cutter. Frames: [example-frames.jpg](example-frames.jpg).

## Make a film

1. **Brief.** The product, its URL, the one transformation it does (long video → clip), and the facts to show. Write `brief.md`. Timecodes and clip lengths in the film are samples: say so in the kicker ("sample").
2. **Project.**
   ```sh
   npx --yes hyperframes@0.8.202 init <dir> --example blank --non-interactive --resolution landscape
   cp -R <this skill>/template/. <dir>/
   ```
   Put the light logo in `assets/logo-light.svg` and set `--accent`.
3. **Story** (keep it): one long video → pick a piece → the piece becomes a result → more of them (fan) → end card. 4–5 title scenes of about 4 s each.
4. **Edit** `index.html` ([references/film-markup.md](references/film-markup.md)). The strip and the deck are layers outside the scenes, so their times are **absolute** film seconds. The scenes hold only the titles and the end card.
5. **Check and look:** `node lint-film.mjs`, `npx hyperframes check --json`, `npx hyperframes snapshot` at every select, lift and land time. Each selection must sit in the middle third of the frame when it is selected.
6. **Render:** `npx hyperframes render --quiet -o renders/<name>.mp4` (about 20 s). Look at a frame sheet from the MP4. Add sound afterwards with Real SFX: a cut on each selection, a soft whoosh on lifts, a thump when the card lands.

Team rules: [references/video-rules.md](references/video-rules.md).

## Look

Background `#0a0a0a`, one `--accent` (Clipwing `#6366f1`), text `#f5f5f5`, Geist 700 titles at 88 px centred at the top, Geist Mono for kickers, timecodes and tags. The strip is `#161616` with perforation rows. Frames are drawn: a gradient per shot (a new hue every 3 frames, set with `data-hues`) and a speaker silhouette. Clip cards are flat, radius 16, with a deep soft shadow, a play button and a mono label.

## Parts and effects

| Markup | What it does |
| --- | --- |
| `.world > .tilt > .strip[data-frames="24"][data-step="6"]` | The strip: 24 drawn frames, timecodes 6 s apart. `.tilt` sets the fixed angle (`rotateX(50deg) rotateZ(-7deg)`), and `.strip` moves |
| `data-fx="strip-in"` + `data-drift="900"` + `data-out` | Slides in from the right, then drifts left by `data-drift` px until it leaves, so the next selection comes to the centre on its own |
| `.seg` with `style="--from: 5; --len: 3"` + `<span class="tag">` | A selection over frames 5–7. It carries bright copies of those frames |
| `select`, `lift` | The selection draws and the rest of the strip dims; the piece rises toward the camera, stands up and fades |
| `.handle` (`data-side="end"` for the right one) + `handle` | Start and end handles slide in around the first selection |
| `.deck` > cards + `land`, `fan` | Clip cards land sharp from small and blurred; `fan` spreads them (`data-spread="deg,px"`) |
| `#tc[data-rate]` | Top-right timecode of the source, running `data-rate` times faster than the film |

Time each `land` 0.25 s after its `lift`, so the two read as one move.

## Rules learned in the runs

- **Never set `opacity` on a `preserve-3d` element with faces.** It flattens the 3D and shows the wrong face (v1, 14.10). Fade the face or the copy instead.
- Place the strip from the drift: each selection's centre at its select time is `left + (from + len/2) × pitch − drift so far`. Aim for the middle of the frame, then snapshot to confirm.
- Keep the strip below the deck (`.tilt` top at 760 or lower), or the landed card hides the next selection.
- Card colours match the frames they came from: the viewer follows the hue.
- Tilted text on the strip is decoration. `check` flags it as overlapping or low contrast; the world and the deck carry `data-layout-allow-overlap`. Real information lives in the tags and on the cards.
- Vertical 9:16 version: the strip on a −14° diagonal through the middle at scale 1.3, pieces of 3 neighbouring frames, cards in a row of 280 px, titles at the top (v2, 14.10).

## Checklist before render

- [ ] Every selection is fully on screen and central when selected.
- [ ] The kicker says the timecodes are a sample.
- [ ] The claims on the end card come from the product page.
- [ ] No frame where the strip, a card and a title fight for the eye: one moves at a time.
