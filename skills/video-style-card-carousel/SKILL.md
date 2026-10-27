---
name: video-style-card-carousel
description: Make a video that shows many things of one kind — thumbnails, clips, templates, products, skills — in the Card Carousel 3D style with HyperFrames — a ring of cards turning in 3D that morphs into an arc with a centre card, a focus on one card, a fan, and an exit, on a dark stage with one accent; the layouts flow into each other with no cuts. 16:9, 15–25 s, or a 4–8 s insert inside another film. Use when someone asks for a "carousel", "3D cards", "ring of cards", a gallery or catalogue video, "show all our templates/clips/thumbnails", or a promo for a tool that outputs many items.
---

# Card Carousel 3D

A gallery that moves. One painter places every card from the film time in the current layout, and morphs it into the next layout over `data-morph` seconds. A spinning ring can melt into an arc, then a focus, then a fan, without a cut. Modelled on a tour of a 3D carousel component library (15.10).

**Best for:** catalogues, galleries, "one input → many outputs", and template libraries. It also works as a 4–8 s insert inside a film in another style. **Not for:** one product screen, or text-heavy explainers.

`template/` is a finished 20 s promo for Clipwing's YouTube Thumbnail Downloader, with 16 made-up thumbnails. Frames: [example-frames.jpg](example-frames.jpg).

## Make a film

1. **Brief.** What the cards are, the 3–4 beats (what the viewer should notice at each layout), the URL and the facts. Write `brief.md`.
2. **Project.**
   ```sh
   npx --yes hyperframes@0.8.202 init <dir> --example blank --non-interactive --resolution landscape
   cp -R <this skill>/template/. <dir>/
   ```
3. **Cards.** 12–20 `.card` elements in `.deck`, all with the same aspect ratio. Use real images (`<img>` filling the card) when the person supplies them. Otherwise draw them as the template does (a gradient, a title and a silhouette), and never another creator's real thumbnail or face.
4. **Layout steps** on `.deck`: `data-layouts='[[0,"ring"],[4,"arc",3],[8,"focus",3],[12,"fan",3],[15.7,"out",3]]'`. Each step is `[absolute time, layout, focus card index]`. Keep the same focus index from step to step, or the focused card flies across the frame.
5. **Scenes** hold the title (one line at the top) and the UI around the deck: a field, chips, buttons and the end card.
6. **Check and look:** `node lint-film.mjs`, `npx hyperframes check --json`, and `npx hyperframes snapshot` at every step time plus 1 s.
7. **Render:** `npx hyperframes render --quiet -o renders/<name>.mp4` (about 25 s). Look at a frame sheet.

Team rules: [references/video-rules.md](references/video-rules.md).

## Look

Dark stage `#0b0b0d` with a soft lighter ellipse behind the deck; one `--accent` (Clipwing `#6366f1`) on the title's key word, buttons and the "hot" chip; Geist 600 titles at 84 px, centred at the top; Geist Mono for UI. The cards carry the colour, and everything around them stays neutral.

## Layouts (`kit.js` → `LAYOUTS`)

| Layout | Pose | For |
| --- | --- | --- |
| `ring` | Cards around a circle of `data-radius` px, turning at `data-spin` rad/s. The far side stays visible and dims. The ring is tilted 15° (on `.tilt`) so it reads as a ring | "So many of them": the opening |
| `arc` | A shallow arc; the focus card is straight and 1.25×, the neighbours turn away and fade | Choosing one |
| `focus` | The focus card comes forward at 1.75×, and the rest step back to 30% | The detail: size, quality, the result |
| `fan` | 5 cards like a hand of cards, around the focus | A few variants side by side |
| `out` | Everything shrinks back and fades | Before the end card |

Add a layout as a function `(i, n, focus, t, opts) => ({ x, y, z, ry, rz, s, o })`. It can depend on `t` for continuous motion, as the ring's spin does.

## Rules learned in the runs

- At least 12 cards in the ring, or it looks empty. With 4 different images repeated, the repeats show (v1, 15.10): make 12 or more different cards.
- All cards share one aspect ratio. The focused card is at least 1.5× the others.
- The deck is positioned by the painter (`style.transform`), so never animate `.card` with GSAP as well: one owner per property.
- A focus change between two layouts moves that card across the screen during the morph. Keep the focus index from step to step unless the move is the point.
- First frame: the ring and the title are already on screen at 0 s.

## Checklist before render

- [ ] Each layout holds at least 2.5 s after its morph, so the eye can rest on it.
- [ ] No real creator's thumbnail or face unless the person supplied it and has the rights.
- [ ] The UI under the deck (field, chips) never overlaps a card in its layout.
- [ ] End card: logo, one line, the URL, one mono line of facts from the product page.
