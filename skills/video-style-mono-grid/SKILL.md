---
name: video-style-mono-grid
description: Make a short black-and-white editorial video in the Mono Grid style with HyperFrames — the frame split into four panels (2×2) on black, each panel living its own rhythm (a phrase inking in word by word in a serif, a scrolling list with one row in black, a drawn schematic, a product frame, a countdown, a big number), panels replaced one by one with a top-down wipe, one brand accent only on the final button. 16:9, 15–25 s. Use when someone asks for a "Mono Grid" or "grid" video, a black-and-white or editorial look, "like Pocketsflow 2×2", a calm premium brand teaser, or a product video without bright colours.
---

# Mono Grid

Four panels tell one thought. At any moment one panel leads (the biggest text or the action) and the other three support it. When the beat changes, the panels are replaced one at a time with a short wipe, so something moves about every second and the frame never cuts as a whole. Paper and black only. Modelled on the Pocketsflow 2×2 film.

**Best for:** brand teasers, calm product videos, and anything that has to look premium and quiet. **Not for:** colourful consumer promos, or long UI walkthroughs (each panel is small).

`template/` is a finished 19 s promo for Clipwing's Webcam Recorder. Frames: [example-frames.jpg](example-frames.jpg).

## Make a film

1. **Brief.** The product, the URL, 4 beats (each beat = one phrase of 3–6 words + three supporting panels), and facts. Write `brief.md`.
2. **Project.**
   ```sh
   npx --yes hyperframes@0.8.202 init <dir> --example blank --non-interactive --resolution landscape
   cp -R <this skill>/template/. <dir>/
   ```
3. **Scenes.** One scene per beat with four `.pane` elements (`data-cell` 0–3) and the end card as one `data-cell="full"` pane. Alternate light and dark so the pattern changes from beat to beat. The phrase pane leads, and the other three show the phrase: an object, a list, a number, a drawing.
4. **Check and look:** `node lint-film.mjs`, `npx hyperframes check --json`, `npx hyperframes snapshot` at the middle of each beat and 0.3 s after each change.
5. **Render:** `npx hyperframes render --quiet -o renders/<name>.mp4` (about 15 s; files are small, under 1 MB). Look at a frame sheet.

Team rules: [references/video-rules.md](references/video-rules.md).

## Look

| Role | Value |
| --- | --- |
| Paper | `#f1f2ee` |
| Black panels and gaps | `#0c0c0c`, 12 px gaps |
| Secondary text | `#9a9a96` |
| Accent | none; `--accent` (Clipwing `#6366f1`) only on the final button |
| Phrase | Newsreader 400, 66 px, one word in 600 for weight instead of colour |
| Lists | Newsreader 52 px rows; one row in black |
| UI bits | Geist (chips), Geist Mono (labels, 28 px or more) |

Small outline pictograms can sit inside a phrase (`<svg class="pic">`), at the height of the letters.

## Parts and effects

| Markup | What it does |
| --- | --- |
| `.pane.light` / `.pane.dark` with `data-cell` | A panel. On a scene change each new pane wipes in from the top, diagonally ordered (0, 3, 1, 2), 0.14 s apart. The old scene stays under them until the last wipe |
| `data-keep` on a pane | That cell doesn't change at this beat (no wipe): copy its content from the previous scene |
| `words` (default `ink`) | Words go from faint to ink in place. Nothing slides in this style |
| `.mosaic[data-cols][data-rows]` + `mosaic` | A chequerboard that flickers on and off in a seeded order, revealing the panel: the opening |
| `.list` + `scroll` (`data-speed` px/s) | A list moving up linearly for the rest of the scene |
| `countdown` (`data-every`) | Children shown one at a time: 3, 2, 1 |
| `draw`, `pop`, `count`, `state`, `press` | From the shared engine: schematic lines, dots, a timer, chips switching on, a button press |

## Rules learned in the runs

- Exactly one panel leads at a time. If two panels both have a big phrase, one of them is wrong.
- Colour is absent on purpose. Emphasis is serif weight (600), a black row or a black chip.
- Wipes, not fades: a fade between panels reads as muddy grey on paper and black.
- The first frame shows the mosaic already on the first pane, so the thumbnail isn't black.
- Panels are 942×522: keep the phrase to 2 lines at 66 px and lists to 5 visible rows.

## Checklist before render

- [ ] Four panels read as one thought at every beat.
- [ ] Only paper and black, plus the one accent button at the end.
- [ ] Text 28 px or more everywhere.
- [ ] Sample numbers (a timer) labelled "sample"; claims from the product page.
