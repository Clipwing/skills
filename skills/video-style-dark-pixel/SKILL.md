---
name: video-style-dark-pixel
description: Make a dark, technical product promo in the Dark Pixel style with HyperFrames — near-black background, one bright accent colour, centred bold headlines, a pixel-art mascot that builds itself from flying pixels, service logos inline in the text, a browser window where a cursor types and clicks, stepped progress bars, pixel-stripe shutters between sections. 16:9, 20–50 s. Use when someone asks for a "Dark Pixel" video, a dark/dev-tool/AI-tool promo, "like Rankhog", a product demo with a simulated browser, or a launch video with a pixel mascot.
---

# Dark Pixel

A dark, technical promo with one accent colour. A pixel mascot opens and closes the film, and the middle shows the product working in a browser window: the cursor types, clicks, and results appear. Modelled on the Rankhog promo.

**Best for:** web apps, developer and AI tools where the product's own screen is the proof. **Not for:** soft lifestyle brands or anything that needs colour variety.

`template/` is a finished film: a 24 s promo for Clipwing's YouTube Timestamps Generator. Frames: [example-frames.jpg](example-frames.jpg). Start every new film from it.

## Make a film

1. **Brief.** Product name and URL, one line on what it does, the flow you will show in the window (3 steps at most), and facts you may show. Write `brief.md`. Sample data in the window gets a small "sample" label.
2. **Project.**
   ```sh
   npx --yes hyperframes@0.8.202 init <dir> --example blank --non-interactive --resolution landscape
   cp -R <this skill>/template/. <dir>/
   ```
   Put the brand's light logo in `assets/logo-light.svg` and set `--accent`. Draw the mascot as a text grid in `kit.js` → `GRIDS` (16×16 or 24×24: `#` accent, `.` light, `k` eyes).
3. **Story.** Hook line with the mascot building → "Meet" + product name → the product working in the window (one long scene, 5–7 s, with camera punch-ins) → where the result goes (a service logo inline) → the promise in 3–4 words → end card. 6 scenes, 3–6 s each.
4. **Write scenes** in `index.html` ([references/film-markup.md](references/film-markup.md)).
5. **Check and look:** `node lint-film.mjs`, `npx hyperframes check --json`, `npx hyperframes snapshot --at <mid-scene times and the shutter moments>`.
6. **Render:** `npx hyperframes render --quiet -o renders/<name>.mp4` (about 15 s for 24 s). Make a frame sheet from the MP4 and look at it.
7. **Sound:** after the render, with the Real SFX skill. Never synthesize.

Team rules: [references/video-rules.md](references/video-rules.md). They override this file.

## Look

| Role | Value |
| --- | --- |
| Background | `#0a0a0a` |
| Panels and windows | `#161616`, border `#262626`, radius 14 |
| Accent: mascot, key words, buttons, bars | `--accent` (Clipwing `#6366f1`), and nothing else in colour |
| Text | `#f5f5f5`, secondary `#9a9a9a` |
| Positive ticks | `#3ddc84` |
| Headline | Geist 700, 92–100 px, centred, 1–2 lines; accent words in the accent colour |
| UI and labels | Geist Mono 26–34 px, kickers upper case with tracking |

- Service logos sit in the line at lower-case height: `<img class="ico" src="assets/youtube.svg">YouTube`. Use them only where the service is named, never as your own brand.
- The browser window keeps one position for the whole scene. The camera moves, not the window.

## Scene attributes and effects this kit adds

| Markup | Effect |
| --- | --- |
| `data-in="shutter"` | 12 accent stripes sweep across the cut in a wave with a stepped edge. Use it on section changes (into the product scene, into the end card), at most 2–3 times a film |
| `data-push="1.04"` | A slow push over the scene's `.stage` wrapper, for text-only scenes |
| `<svg class="pixel" data-grid="wing">` | A pixel mascot drawn from `GRIDS` |
| `assemble`, `dissolve` | The mascot builds from flying pixels, or drops out pixel by pixel |
| `hop`, `blink` | A two-step pixel hop, and the eyes blink (`k` cells) |
| `<div class="blocks" data-n="16">` + `blocks` | A progress bar that fills block by block over `data-d` |
| `open` | A window opens: a quick scale from 0.96, no bounce |
| `.steps` + `state` | A mono checklist where `[ ]` becomes a green `[x]` at that moment |

Combine timed effects on the mascot: `data-fx="assemble@0.05 hop@1.9 blink@2.8"`. Hard cuts everywhere else.

## Rules learned in the runs

- Never crossfade between scenes. The ground is dark, and every cut is either hard or a shutter. A crossfade over a light canvas flashed white in v1 (14.10).
- The shutter must never cover the whole frame at once: a full accent frame reads as a flash.
- Punch the camera in on whatever is acting (the field while typing, the list when it fills) at 1.3–1.5×. Without it the window UI is too small for a phone.
- Kickers and other fixed labels don't belong in a scene with camera moves: the window slides over them.
- The cursor lives inside the `.cam` wrapper, so it moves with the camera. Its click time equals the button's `press` time.
- Mascot pixels use `Film.hash`, never `Math.random`, so the scatter is the same in every render.

## Checklist before render

- [ ] One accent colour in every frame. Everything else is grey and white.
- [ ] `lint-film.mjs` clean, `check` without errors.
- [ ] The cursor never jumps, and each click lands on a button.
- [ ] Window text is 26 px or more, or the camera punches in on it.
- [ ] Sample data is labelled, and service logos are only where the service is named.
