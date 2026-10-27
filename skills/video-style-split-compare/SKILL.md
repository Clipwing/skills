---
name: video-style-split-compare
description: Make a before/after video in the Split Compare style with HyperFrames — warm light-grey paper, big bold two-line headlines with the key word underlined in the brand colour, BEFORE and AFTER tags, a compare slider (one picture over another split by a handle that sweeps), a frame that reshapes from one format into another, and scene changes made by a vertical seam that crosses the frame. 16:9, 15–30 s. Use when someone asks for a "Split Compare", before/after or "versus" video, a comparison of two versions, a demo of an edit (raw vs edited, horizontal vs vertical, without vs with captions), or "v1 vs v2" of a skill or design.
---

# Split Compare

Before and after, side by side or one over the other. Every scene shows a change, and the scene changes are changes too: a seam crosses the frame and the next scene is behind it. Calm, light and editorial, so the pictures do the talking. A Clipwing style (26.10): the reference roundup of 15.10 named "v1 vs v2" and "tool A vs tool B" as a ready format for our posts.

**Best for:** editing tools (raw vs edited), format converters, redesigns, "v1 vs v2", "with vs without". **Not for:** products with no visible before and after.

`template/` is a finished 20 s promo for Clipwing's Horizontal to Vertical converter. Frames: [example-frames.jpg](example-frames.jpg).

## Make a film

1. **Brief.** The before, the after, 3 beats of change (format, mode, result), the URL and facts. Write `brief.md`. Use the person's real before/after footage or screenshots when they have them. Otherwise draw the frames as the template does.
2. **Project.**
   ```sh
   npx --yes hyperframes@0.8.202 init <dir> --example blank --non-interactive --resolution landscape
   cp -R <this skill>/template/. <dir>/
   ```
3. **Scenes:** the before alone → before and after side by side, with an arrow and the after reshaping out of the before → a compare slider on the detail that matters → the result with its specs → end card. Titles go top-left in 2 lines, the pictures on the right.
4. **Check and look:** `node lint-film.mjs`, `npx hyperframes check --json`, `npx hyperframes snapshot` at each sweep point of the slider and in the middle of each seam.
5. **Render:** `npx hyperframes render --quiet -o renders/<name>.mp4` (about 15 s, around 1 MB). Look at a frame sheet.

Team rules: [references/video-rules.md](references/video-rules.md).

## Look

| Role | Value |
| --- | --- |
| Paper | `#efece6`; cards and tags `#ffffff` |
| Ink and secondary | `#141414`, `#6b6862` |
| "After" colour: underline, seam, AFTER tag, buttons | `--accent` (Clipwing `#6366f1`) |
| Headline | Inter 700, 104 px, −0.035em, 2 lines, top-left at x 96 |
| Notes and tags | JetBrains Mono 26–28 px; BEFORE in an ink outline, AFTER filled with the accent |

The pictures carry colour; the frame around them stays neutral.

## Parts and effects

| Markup | What it does |
| --- | --- |
| Scene change (automatic) | A 6 px accent seam crosses the frame left to right in 0.65 s, and the next scene opens behind it |
| `<mark>` in the title | The key word gets an underline drawn left to right in the accent |
| `.compare` with `.before`, `.after`, `.handle` + `compare` | The after layer shows to the right of the handle. `data-sweep='[[t, pct], …]'` moves the handle (times relative to the effect, eased between points) |
| `reshape` + `data-from="w,h"` | A frame grows out of another size into its own (16:9 into 9:16) |
| `.tag.b`, `.tag.a` | BEFORE and AFTER labels |
| `.shot` (with `--pw`, `--ph`) | A drawn video frame (a speaker in a room); set the figure's size to show a crop |

## Rules learned in the runs

- The slider should rest at 50% between sweeps; a sweep to 18% and to 82% shows each side clearly.
- Blur fill means the whole picture in the middle plus a blurred, enlarged copy of the same picture behind it, not a plain gradient.
- Split a title only on words: a `<mark>` followed by punctuation leaves a gap before the comma, so rephrase.
- The first frame already shows the before picture: it's the thumbnail.

## Checklist before render

- [ ] Before and after are the same picture, so the difference is the only thing that changes.
- [ ] The seam never crosses during a line the viewer is reading.
- [ ] Specs and claims (sizes, limits) from the product page.
