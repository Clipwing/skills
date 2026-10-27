# Film markup

Every video-style skill uses the same engine, `film-core.js`, plus a style kit, `kit.js`. You write scenes as plain HTML, and the engine builds one paused GSAP timeline from their attributes. You don't write tweens unless you need a move the effects below can't do.

## Scenes

```html
<section class="scene" id="s2" data-at="6.8" data-len="4"> … </section>
```

- `data-at` is the start and `data-len` the length, both in seconds. Scenes follow each other with no gaps, and the last one ends at `#root[data-duration]`. When they don't match, a red banner shows in the frame.
- Inside a scene, every time (`data-t`, `data-out`, cursor and camera times) is local to the scene's start. Moving a scene means changing one `data-at`.
- The style kit adds its own scene attributes (backgrounds, transitions, layouts). They are listed in the skill's SKILL.md.

## Layers that outlive a scene

An element outside every `.scene` (a film strip, a phone, a dashboard that stays on screen through several scenes) can carry the same `data-fx`, cursor and camera attributes. Its times are absolute seconds of the film, not scene time. Hide it with `data-out` when it is done.

## Effects: `data-fx`

Put `data-fx="<name>"` on any element and `data-t="<seconds>"` for when it starts. Optional attributes: `data-d` for the duration, `data-out` for when it leaves (with `data-outfx`: `fade`, `drop`, `up`, `blur`, `left`), and `data-each="0.12"` to run the effect on each child, that many seconds apart. Several effects can share one element: `data-fx="rise count"` runs both at `data-t`, and `data-fx="assemble@0.1 blink@2.6 hop@3.4"` gives each effect its own scene time.

| Effect | What it does |
| --- | --- |
| `words` | Splits a line into words that enter one by one. `data-words` picks the entrance: `rise`, `blur`, `ink` (grey to ink in place), `jump`. A `<mark>` inside is the accent word, and the kit decides how it lands. `<span class="ln">` keeps a line together |
| `fade`, `rise`, `drop`, `left`, `right`, `pop`, `zoom`, `blur` | Entrances |
| `type` | Types the element's text at `data-cps` characters a second (default 30) |
| `count` | Counts from `data-from` to the number in the text (or `data-to`). `data-fmt`: `int`, `comma`, `space`, `dec1`, `time` (m:ss), `clock` (hh:mm:ss). `data-pre` and `data-suf` add text before and after |
| `fill-x`, `grow-y` | A bar fills from the left, a column grows from the bottom |
| `draw` | Draws an SVG stroke (`path`, `line`, `polyline`) |
| `press` | A button press at that moment (not an entrance) |
| `state` | Adds a class (`data-class`, default `on`) from that moment on: checked boxes, active tabs, done rows |

## Cursor and camera

```html
<svg class="cursor" data-path='[[0.9,1700,980],[1.75,1150,570,"click"]]'>…</svg>
<div class="cam" data-cam='[[0.6,1.5,1300,420,0.8],[3.2,1,960,540,0.7]]'> …UI… </div>
```

- Cursor points are `[t, x, y]` in scene pixels, with `"click"` for a press. It glides between points and never jumps. Put the click on the same `t` as the button's `press`.
- Camera moves are `[t, scale, fx, fy, duration]`: the point `(fx, fy)` of the unscaled frame moves to the centre at that scale. `[t, 1, 960, 540]` goes back to the full frame (1920×1080). Use it to punch into small UI so it reads on a phone, and keep the punched frame covered by the scene's background.

## Generated details

Decoration that repeats (waveform bars, dots, grids) can be generated in the page's inline script, as long as it uses `Film.hash(n)` for variety and never `Math.random()`. Everything the viewer reads is written in the HTML.

## The loop

```sh
node lint-film.mjs                        # team rules: digits, no full stops, reading time, italics, scene timing
npx hyperframes check --json              # HyperFrames contract, layout, contrast, craft
npx hyperframes snapshot --at <mid-scene times>   # look at every scene before rendering
npx hyperframes render --quiet -o renders/<name>.mp4
```

Fix every lint error and every `check` error. Read the `check` craft warnings: text under 28 px on a 1080 px frame is too small for a phone, and a line that stays on screen too briefly can't be read.
