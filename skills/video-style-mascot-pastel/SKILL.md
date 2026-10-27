---
name: video-style-mascot-pastel
description: Make a friendly product promo in the Mascot Pastel style with HyperFrames — a character who opens the film big (says "psst…", waves) and then rides along as an avatar in a ring; every scene has its own pastel background that flows into the next; a two-line headline on the left with one accent word in a serif (never italic) in the scene's colour; a phone on the right whose live product screen changes from scene to scene; a dark line, then a white end card. 16:9 (or 9:16 with the phone under the headline), 20–45 s. Use when someone asks for a "Mascot Pastel" video, a playful consumer or creator-tool promo with a character, "like Pocketsflow", or a mobile app walkthrough with a mascot.
---

# Mascot Pastel

A warm, friendly promo. A character opens the film, then shrinks into an avatar in the corner. Each step of the product gets its own pastel colour, the phone on the right stays in place and its screen does one thing per scene. Modelled on the Pocketsflow promo (16:9 and 9:16).

**Best for:** consumer and creator tools, mobile apps, and anything playful. **Not for:** dev tools, serious B2B, or films without a product screen.

`template/` is a finished 23 s promo for Clipwing's Tier List Generator, with a drawn SVG character. Frames: [example-frames.jpg](example-frames.jpg).

## Make a film

1. **Brief.** The product, its 3 steps, one line for the dark beat, the URL, and facts. Write `brief.md`.
2. **Character.** Use the brand's mascot if there is one: an SVG, or a PNG without background. Otherwise draw a simple one in SVG as the template does (`<g id="guy">` in `<defs>`, reused by the avatar with `<use>`). The arm that waves is a separate `.arm` with `data-origin` at the shoulder. Keep the character in the brand colour.
3. **Project.**
   ```sh
   npx --yes hyperframes@0.8.202 init <dir> --example blank --non-interactive --resolution landscape
   cp -R <this skill>/template/. <dir>/
   ```
4. **Scenes:** intro (bright brand ground, character, falling category cards, "<word> <serif word>") → one scene per step, each with its own `data-bg` pastel and `data-accent` → a dark line → a white end card. The phone and the avatar are layers outside the scenes, with absolute times.
5. **Check and look:** `node lint-film.mjs`, `npx hyperframes check --json`, `npx hyperframes snapshot` at the middle of each scene and while tiles move.
6. **Render:** `npx hyperframes render --quiet -o renders/<name>.mp4` (about 15 s). Look at a frame sheet.

Team rules: [references/video-rules.md](references/video-rules.md). The reference used an italic serif for the accent word; we use the same serif upright, because the team bans italics unless the brand uses them.

## Look

| Role | Value |
| --- | --- |
| Intro ground | the brand colour (Clipwing `#6366f1`), white title |
| Scene grounds, one per scene | `#d3e1fc` blue, `#dcdef9` lavender, `#f2d4e0` pink, `#cfeeea` mint, `#d5e4d8` sage |
| Accent word, per scene | a saturated version of that scene's colour: `#1d4ed8`, `#6d28d9`, `#be185d`, `#0f766e`, `#15803d` |
| Dark beat and end | `#0a0a0a`, then `#ffffff` |
| Headline | Geist 600, 118 px, −0.035em, left, 2 lines; accent word Newsreader 600, 1.1× |
| Labels | Geist Mono 26 px, upper case, `// 02 · rank` top-left |

## Parts and effects

| Markup | What it does |
| --- | --- |
| Scene `data-bg`, `data-accent` | The ground crossfades colour to colour in 0.45 s; the accent drives the serif word and the avatar ring |
| `<mark>` in the title | The serif accent word, landing a beat after the line |
| `.phone` (layer) | The product screen, entering at the first step and leaving before the dark beat |
| `drag` + `data-dx`, `data-dy` | A tile moves from (dx, dy) to its place with a slight lift. Combine as `fade@6.3 drag@9.2` so it first appears where it starts |
| `fall` (`--r`) | A card falls in with a bounce and lands turned |
| `wave`, `blink` | The character waves 2 times; the eyes blink |
| `tocorner` (`data-to="x,y,scale"`) | The intro character shrinks away toward the avatar's corner |
| `#avatar` (layer) | The character in a ring of the scene's accent colour, hopping on every scene change |

## Rules learned in the runs

- Containers that clip (`overflow: hidden`) hide anything that moves in from outside them: the tier rows clipped the dragged tiles. Round the corners on the children instead.
- Pastel tiles take dark text. White on yellow, green or light blue fails contrast.
- Exactly one serif word per headline, and it carries the meaning ("rank", "tier", "video").
- The avatar never covers the phone screen.

## Checklist before render

- [ ] One headline and one screen per scene, nothing else.
- [ ] Neighbouring scenes have different grounds; colour changes never pass through white.
- [ ] The phone screen does exactly one visible thing per scene.
- [ ] Claims (sizes, formats) come from the product page.
