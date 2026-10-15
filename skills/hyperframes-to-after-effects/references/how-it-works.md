# How hyperframes-to-after-effects works

Read this before changing the scripts. Files:

| File | Role |
|---|---|
| `scripts/hf2ae.mjs` | CLI: `doctor`, `export`, `build`, `verify`, `all` |
| `scripts/lib/env.mjs` | finds the hyperframes package in the npx cache (runtime, puppeteer-core, fontkit, sharp), its Chrome, After Effects, aerender, ffmpeg |
| `scripts/lib/page.mjs` | serves the raw project with the HyperFrames runtime injected at the start of `<head>` (as Studio does), waits for `window.__renderReady`, seeks with `__player.renderSeek(t, {exact:true})` → `__hf.seek` → timelines; fetches Google Fonts the page uses but does not declare |
| `scripts/lib/sampler.js` | runs in the page: `prepare()` (composition tree; `::before/::after` and one-sided borders rewritten as real elements), `sample()` (one frame), `canvases()`, `audio()`, `fontFaces()` |
| `scripts/lib/export.mjs` | frame loop, keyframe reduction, assets, text plans, fonts, `manifest.json` |
| `scripts/lib/text.mjs` | text recipes |
| `scripts/lib/fonts.mjs` | CSS family/weight/style → real family/style/PostScript name from the font file (fontkit) |
| `scripts/lib/ae.mjs` | writes `<out>/run_build.jsx` (sets `$.global.HF2AE`, evaluates `scripts/ae/build.jsx`) and runs it: Windows `AfterFX.exe -r`, macOS `osascript … DoScriptFile`; polls `<out>/ae_status.txt` |
| `scripts/ae/build.jsx` | ExtendScript (ES3) builder |
| `scripts/lib/verify.mjs` | aerender → frames → SSIM + `verify/compare.png` |

## Loader parity

The page is the same thing Studio previews, so it matches `hyperframes snapshot` (SSIM 0.99+ measured). The loader
reads authored timing from the runtime: each sub-composition's start is `__timelines[id].startTime()` within its
parent; its visible window comes from sampling the host's `visibility` per frame (the runtime strips the host's
`data-duration`).

## Sampling model

Every frame `f` of the root (at `--fps`), `sample()` walks each visible composition from its root element:

- **Placement.** For each element the composed 2×2 linear transform `L` (product of CSS transforms down the tree)
  and the top-left of its untransformed box in the composition (`placement()`); After Effects gets anchor (0,0),
  position X/Y (separated, so nothing curves in space), scale from `|L col 1|` and `det/|col 1|`, rotation from
  `atan2`. Skew is not representable and is folded into scale.
- **Opacity** multiplies down the tree; `visibility: hidden` is 0; text colour alpha multiplies in.
- **Blur** combines down the tree as `sqrt(Σσ²)` and goes on every layer below the filtered element.
- **Keys** are reduced per track with Ramer–Douglas–Peucker (position 0.25 px, scale 0.15 %, rotation 0.05°,
  opacity 0.4 %). Linear keys between samples reproduce any easing at the sample rate. Absent frames hold the
  nearest state at opacity 0.
- **Paint order** inside a composition: the list of `z-index` values of every positioned ancestor that sets one,
  outermost first (so a cursor at `z-index: 2` inside a rig at `z-index: 50` stays above a card at `z-index: 3`),
  compared level by level with a missing level as 0, then document order. Stacking contexts made by opacity,
  transforms or filters without a `z-index` are not modelled.
- **Keys** (`k`): composition-relative DOM path with tag, `#id` or first class, and sibling index. Text lines add
  `#t<node>.<line>`; variants add `@<signature>`.

## Entry types to layers

| Type | Export | Build |
|---|---|---|
| `comp` | host placement, child `cid`, `startF`, `inF`/`outF` from the child's visible frames | precomp layer, `startTime`, in/out |
| `box` | size, radius (top-left), bg RGBA, border (top side), dashed flag, outline, hard shadow, soft shadow | shape layer: Box / Outline / Shadow groups; Drop Shadow effect for soft shadows |
| `bake` | computed background / border / radius / shadow / outline, padding for the shadow | PNG at 2x painted in a blank page, `scaleMul` 0.5, anchor offset by the padding |
| `svg` | serialized markup with `currentColor` resolved | PNG at 4x (`scaleMul` 0.25) |
| `still` | (svg or bake with ≤ 6 looks) | footage layer; one per look, opacity switches between them |
| `seq` | (svg or bake with > 6 looks) PNG per distinct look + per-frame index | sequence + time remap |
| `canvas` | backing size, CSS-to-backing scale folded into `L`; PNGs only when pixels change | sequence (`canvasFps`) + time remap |
| `image` / `video` | natural size, `object-fit`, `object-position`, radius; video: `data-start`, `data-duration`, `data-media-start`, `data-playback-rate`, muted, `data-has-audio`, `data-volume` | footage, scale = fit, anchor = −offset/scale, mask for crop/radius; video `stretch`, `startTime`, in/out, Audio Levels dB |
| `text` | per rendered line: string, family list, weight, style, size, letter-spacing, ink width in the real face, colour, stroke, text-shadow, baseline origin `lx/ly` | text layer, left-justified at the baseline origin; recipes below |
| `clip` | overflow box (rounded rect) or `clip-path` (polygon → path, inset → rounded rect, circle/ellipse) in the element's local box, plus its own `clip` parent | disabled shape layer used as alpha track matte by every layer under it; nested clips matte the matte |

Text that is uppercase via CSS is exported uppercase. A line that changes font, weight or size mid-layer keeps the
first style (warned).

## Text recipes (`text.mjs`)

Holds of the string over the layer's frames give runs. Then:

1. one run → static;
2. every run has the same template with digits (`"#%"`, `"About # min left"`, `"#:#"`, `"#:#:#:#"`) → **counter**:
   digit groups read as one mixed-radix number (radix 60 / 100 / 1000 from the largest value seen); if
   `value == floor(a + b·frame)` for all keys the expression reads `time` (no keys at all), else a Count slider with
   hold keys drives it; padding is kept;
3. a tail of runs where each extends the previous by characters (≥ 3) → **typing**: final text + Text Animator
   (opacity 0, Range Start in %, hold keys); earlier runs (placeholders) become trimmed layers;
4. ≤ 4 runs, or ≤ 60 runs that each stay ≥ 0.3 s (captions) → **split**: one trimmed layer per string;
5. otherwise → **table**: `[time, text]` expression.

Colour changes add a Fill Color animator; a key holds unless the next comes within 2 frames (a fade).

## Fonts

`fonts.mjs` resolves each used (family list, weight, style): the `@font-face` rule the page declares (weight ranges
honoured) → read the file with fontkit (typographic family name ID 16, else family with any default-instance style word
removed for variable fonts) → real family/style/PostScript name. Families not declared but available on the system keep
their CSS name. Google families fetched by `page.mjs` have TTF copies in `<out>/fonts`.

`build.jsx` matches against `app.fonts.allFonts` by family (then CSS family), nearest weight, same italic, avoiding
substitutes. Missing → first installed of the category list (sans: Inter, Helvetica Neue, Helvetica, Arial, Segoe UI,
Roboto; serif: Playfair Display, Georgia, Times New Roman; mono: JetBrains Mono, Roboto Mono, SF Mono, Menlo, Consolas,
Courier New) and the line is scaled horizontally to the ink width measured in the real face
(`sourceRectAtTime` vs `tw`, kept within 0.6–1.4).

## After Effects rules learned the hard way

- **No Source Text keyframes** from scripts (project-wide slowdown, see SKILL.md). Expressions on Source Text are fine.
- **Time Remap**: never remove the two default keys in a loop (`while (numKeys) removeKey(1)` can spin forever);
  overwrite them with `setValueAtKey`.
- **`setValuesAtTimes`** per property, not `setValueAtTime` per key. No undo group around a whole build.
- Static numbers in tracks are `{v: …}`; test `v !== undefined`, never truthiness (a `0` value is real).
- `AfterFX.exe -r` started cold runs the script and quits; with After Effects open it runs in that window.
- `CompItem.saveFrameToPng` is asynchronous and unreliable under `-r`: verify with aerender instead.
- Drop Shadow opacity is 0–255; Gaussian Blur needs *Repeat Edge Pixels* off to blur edges like CSS.
- CSS `blur(σ)` → Blurriness `2σ` (`BLUR_K` in `build.jsx`).
- The build refuses to run into a non-empty open project unless `--into-open`: it never closes or saves over the
  user's work.
