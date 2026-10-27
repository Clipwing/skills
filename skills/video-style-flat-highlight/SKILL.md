---
name: video-style-flat-highlight
description: Make a product promo video in the Flat Highlight style with HyperFrames — bright flat colour scenes that flood up from the bottom, a 2–3 line headline whose words jump in, one key word on a brand-colour plate, one white UI card with a hard shadow showing the product doing one thing per scene, a running timecode, an end card with the URL. 16:9, 20–35 s. Use when someone asks for a "Flat Highlight" video, a bright/playful SaaS or tool promo, "like TixFox", a feature walkthrough with UI cards, or a launch video for a web tool.
---

# Flat Highlight

A bright, fast product promo: each scene has its own flat colour, a headline on the left and one UI card on the right that shows the product doing one thing. Modelled on the TixFox promo (flat scenes, highlighted word, cards with numbers).

**Best for:** web tools and SaaS features with a simple 3–4 step flow (upload → process → download). **Not for:** stories without a UI, long explainers, voiceover-led films.

`template/` is a finished film: a 23 s promo for Clipwing's Gap Remover. Its frames are in [example-frames.jpg](example-frames.jpg). Start every new film from it.

## Make a film

1. **Brief.** Ask for or find: the product name, its URL, what it does in one line, 3–4 steps of the flow, and the facts you may show (from the product page). Write it down in `brief.md` next to the project. Numbers that only illustrate (a sample file's length) are marked as examples there.
2. **Project.**
   ```sh
   npx --yes hyperframes@0.8.202 init <dir> --example blank --non-interactive --resolution landscape
   cp -R <this skill>/template/. <dir>/
   ```
   Put the brand's logos in `assets/` (`logo-dark.svg`, `logo-light.svg`, `mark.svg`) and set `--brand` in `index.html`.
3. **Story.** Keep the template's shape: hook (the problem plus a card that shows it) → "Meet <product>" on dark → 2–4 steps, one per scene → end card that whips in. 5–7 scenes, 3.2–4.6 s each.
4. **Write scenes** in `index.html` (markup: [references/film-markup.md](references/film-markup.md)). Change the copy, the cards and the times; copy a scene to add a step.
5. **Check and look:** `node lint-film.mjs`, `npx hyperframes check --json`, then `npx hyperframes snapshot --at <the middle of every scene>`. Read the contact sheet against the checklist below.
6. **Render:** `npx hyperframes render --quiet -o renders/<name>.mp4` takes about 12 s for 23 s on an M-series Mac. Make a frame sheet from the MP4 and look at it before you hand the film over.
7. **Sound** is not part of this skill. Real recorded sounds go on after the render with the Real SFX skill. Never synthesize whooshes.

Team rules for every film: [references/video-rules.md](references/video-rules.md). They override this file.

## Look

| Role | Value |
| --- | --- |
| Intro and end | cream `#f3f1eb` |
| Scene colours, one per scene, never the same twice in a row | peach `#ffb27a`, periwinkle `#90a6ee`, yellow `#f2ef3f`, mint `#7fe3b8`, sky `#7dc2ff`, lilac `#c8b6fe` |
| Dark "Meet" scene | `#151517` with `class="dark"` |
| Accent: plate, buttons, progress | `--brand` (Clipwing `#6366f1`) |
| Text | ink `#151517`; cream on dark |
| Headline | Inter 500, 112 px, tracking −0.025em, left at x 120, 2–3 lines |
| Labels | JetBrains Mono, 26 px, upper case on cards |

- Card: white, 2.5 px ink outline, radius 14, hard shadow `6px 6px 0` ink, at x 990, 830 px wide, vertically centred on the headline.
- Corners: `// 02 · upload` kicker top-left in each scene, `<NAME> 00:00:SS:FF` timecode top-right (set `data-name` on `#tc`).
- Avatar: the brand mark in a white circle, bottom-left, in every scene except intro and end (`data-avatar="off"`). It hops on each scene change.

## Scene attributes this kit adds

| Attribute | Effect |
| --- | --- |
| `data-bg="var(--peach)"` | The scene's colour, flooding up from the bottom 0.1 s before the scene starts |
| `class="scene dark"` | Light corner labels and title for a dark scene |
| `data-in="whip"` | The previous scene smears off left with blur, the new colour slides in skewed. Use once, into the end card |
| `data-avatar="off"` | Hides the avatar in this scene |
| `data-fx="card"` | A card slides in from the right with a 4° turn and settles |
| `data-fx="tick"` | A chip or tick pops in |
| `data-fx="cut"` | A removed item fades and closes its width, so the text around it closes up |

The accent word is a `<mark>` inside a `data-fx="words"` title: the plate draws left to right after the last word lands, and the word turns white.

## Rules learned in the runs

- One plate per scene, under the word that carries the meaning ("1 click", not "Cut").
- A card shows one action with a visible result: a bar fills, a chip says what happened, a counter moves. An empty mockup reads as filler.
- Mono labels on periwinkle and lilac need at least `rgba(21,21,23,0.85)` to pass contrast.
- UI text under 26 px is unreadable on a phone. Make the card bigger rather than the text smaller.
- A strike-through that leaves faded "ghosts" looks broken. Use `cut`, which closes the gap.
- Put the cursor's click on the same scene time as the button's `press`. Take the button's position from a snapshot, not from a guess.
- Never draw a real person's face or another creator's thumbnail into the cards. Use `.frame`, a drawn video frame with a silhouette, unless the brief supplies the user's own footage.

## Checklist before render

- [ ] `lint-film.mjs` clean, `check` without errors.
- [ ] Each scene: one headline, one card, one plate.
- [ ] Neighbouring scenes have different colours.
- [ ] Every number and claim is from the brief. Sample numbers are labelled as sample on the card.
- [ ] Nothing touches the frame edge, and the bottom of the frame isn't empty while the card sits high.
- [ ] End card: logo, one line, the URL on a button, one mono line of plain facts.
