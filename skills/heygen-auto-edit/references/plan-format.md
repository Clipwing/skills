# The edit plan (`edit.json`)

One JSON file describes the whole edit. Times are seconds on the **edited** timeline (the one in `work/words.json` and
`work/transcript.txt`, after the pauses were cut). The same plan renders 16:9 and 9:16; every scene lays itself out
for the aspect. Times inside a beat (`at`) are the moment the spoken word starts: take them from `words.json` (write a
small script that finds phrases in `words.json`, never guess times).

```json
{
  "talk":      [ {"t": 0, "zoom": 1.0}, {"t": 3.15, "zoom": 1.16, "snap": true}, ... ],
  "beats":     [ {"type": "list", "start": 13.0, "end": 17.1, ...}, ... ],
  "accents":   [ {"type": "leak", "t": 19.2, "d": 0.7} ],
  "endscreen": {"text": "Thanks for watching", "channel": "Channel name", "dur": 4.5},
  "brand":     "brand/brand.json",
  "vfx":       {"grain": 0.05, "handheld": 1, "vignette": true},
  "captions":  {"words": 3, "y": 0.7, "size": 84, "highlight": true, "upper": false}
}
```

## What the engine enforces (whatever the plan says)

- **The presenter is never on screen for a flash.** Two full-screen beats less than 1.6 s apart are joined (the first
  runs on and they hand over card to card). Never plan a 0.5 s glimpse of the face between two cards.
- **Every change between the presenter and a card is a transition**, never a hard cut. Without `in` / `out` the engine
  picks and varies them (presenter -> card: whip / zoom / push3d / slide; card -> presenter: zoom / slide / whip;
  card -> card: push3d / slide / whip). Set `in` / `out` only to force one.
- **Framing is never a tight face crop**: `zoom` is capped at 1.24. Framing cuts within 1.2 s of a card are dropped.
- **Text never leaves the frame**: titles, items and words shrink to fit; `render.mjs --check` lists any that still do.
- After the last word the presenter holds 0.5 s, then the **end screen** runs (`"endscreen": false` to skip it).

## `talk`: framing of the presenter

A keyframe changes the framing **as a cut**. The camera follows the presenter's head (from `matte.py`'s track), so a
medium-close shot stays locked on the face as they move.

| key | meaning |
|---|---|
| `t` | when the new framing starts: **on a word start minus ~0.05 s**, never mid-word |
| `zoom` | 1.0 = the whole take (wide); 1.08–1.12 = medium; 1.16–1.22 = medium-close (the closest that reads well) |
| `snap` | the punch-in lands with a small settle and a soft whoosh |
| `ease` | seconds: a smooth push instead of a cut (rarely) |
| `push` | the slow push inside the shot (default 0.03 = +3 % over the shot) |
| `x`, `y` | aim point in the take (0..1); default: the tracked face |

Alternate wide and medium-close; a shot lasts 2–6 s; the first 3 s are wide.

## `beats`

Every beat has `type`, `start`, `end`. Full-screen beats replace the presenter (the voice continues); overlays draw
over the presenter. Most fields are optional; every scene animates in, holds with a slow 3D camera drift and leans
away as it leaves.

### Full-screen scenes

| type | fields | looks like |
|---|---|---|
| `title` | `text`, `kicker?` (small label above, e.g. "Tip 2"), `mark?` (a word of `text` that gets a marker sweep), `sub?`, `size?`, `cps?` | big serif words typed on warm paper. Use it for chapter headings ("Make clips worth watching", kicker "Tip 2") |
| `quote` | `text`, `mark?` (word(s) highlighted), `kicker?` | the presenter blurred behind a frosted-glass panel; the words rise in one by one and leave the same way. The one-line takeaway |
| `list` | `title`, `icon?` (emoji), `highlight?`, `items: [{text, at, bad?, note?}]` | numbered checklist card: the spoken row lights up and its number turns into a tick (`bad`: red cross); a counter and a progress bar |
| `compare` | `left` / `right`: `{title, icon?, mock?, tone?, items: [{text, at}]}`, `neutral?` | two cards facing each other with a VS badge. Tones: good / bad (one ✓ or ✕ badge in the header, never one per row) or `neutral: true` (two options, no verdict). `mock`: a small abstract picture of the format: `short`, `long`, `thread`, `video`, `carousel`, `chart` |
| `search` | `query`, `suggestions: [...]`, `cps?`, `tilt?` | a search bar typing over a thumbnail grid, filmed off a monitor in a dark room: perspective, bezel, scanlines, glare, depth of field |
| `stat` | `value`, `prefix?`, `suffix?`, `decimals?`, `label`, `trend: up/down/spike/steady/flat`, `note?` (pinned on the peak), `delta?`, `xlabels?`, `tiles?: [{label, value, delta?}]` (max 2) | analytics: the number counts, the chart draws, small tiles float at other depths |
| `bars` | `title`, `bars: [{label, value, at, display?, color?}]`, `hero?` (index), `prefix?`/`suffix?` | bar chart: bars grow on their words; `display` replaces the number ("25 min"); the hero bar glows, the rest go grey |
| `donut` | `title`, `parts: [{label, value, at, color?}]`, `center?` | donut chart with a legend and percentages |
| `table` | `title?`, `columns: [...]`, `rows: [{cells: [...], at}]`, `highlightCol?`, `highlightAt?` | a table whose rows land on their words; a cell "✓" / "✗" becomes an icon |
| `roadmap` | `title?`, `steps: [{text, at, label?, icon?}]`, `color?` | stops along a path; the progress line runs to the stop being named and the camera tracks along. Steps, a week plan, a process |
| `mindmap` | `center`, `nodes: [{text, at, icon?, sub?, color?, angle?}]`, `palette?` | a whiteboard in perspective: hub with a pulse, curved branches drawing out to coloured pills |
| `split` | `side: left/right` (where the presenter goes), `kicker?`, `title`, `items?: [{text, at}]`, `value?` (+ `prefix`/`suffix`) | the presenter slides from full frame into a window on one side, the other side gets the text. Animates itself in and out: no transition |
| `photo` | `src` or `srcs` (2–3), `caption?`, `query` / `queries` (for `fetch_stock.py`), `zoomFrom?`, `zoomTo?`, `pan?` | one photo fills the frame with a slow move; two or three float as prints at different depths over a blurred backdrop |
| `video` | `src` (an image-sequence folder from `fetch_stock.py`), `query`, `offset?`, `frame?`, `caption?` | a stock clip, full frame with a slow push (`frame: true`: in a 3D frame on a dark stage) |
| `image` | `src` (the user's screenshot), `caption?`, `backdrop: paper/presenter` | a screenshot as a 3D card on the stage |
| `endscreen` | `text`, `channel`, `dur`, `slots?` | added automatically after the last word: thanks, channel name, two "watch next" slots for YouTube's end-screen elements, Subscribe click |

### Overlays on the presenter

| type | fields | looks like |
|---|---|---|
| `words` | `items: [{text, at, pos, depth?, size?, color?, ry?, scale?}]`; `text` may hold `\n` (second line small) | solid 3D words standing in the room, fixed in place as the camera moves. `depth: "behind"` (default when a matte exists) puts the word on the wall and the presenter's head in front of it: place it so it overlaps the head a little (`pos` `top`, `left`, `right`). `depth: "front"` floats it in front, clear of the face. `pos`: `left`, `right`, `top`, `top-left`, `top-right`, `bottom-left`, `bottom-right`. 1–3 words each, max 3 per beat |
| `callout` | `text`, `side: left/right` | a label with a drawn arrow to the presenter |
| `subscribe` | — | a Subscribe pill clicked by a cursor (the end screen already has one) |

## `accents`

`{"type": "leak"|"flash", "t": 12.3, "d": 0.6}` over whatever is on screen: a light leak on a topic change, at most one
every ~20 s.

## `brand` (optional)

A path (next to the plan) to `brand.json`, or the object itself:

```json
{ "colors": {"accent": "#FF3B30", "ink": "#121212", "paper": "#F4F2EE", "pills": ["#7B61FF", "#FF4FA3", "#FFB020", "#22C55E"]},
  "fonts":  {"head": "fonts/Display-800.woff2", "body": "fonts/Body.woff2", "serif": "fonts/Serif.woff2"},
  "logo":   "logo.png", "watermark": false }
```

Fonts and the logo are paths relative to `brand.json`. `head` is used for every heavy title and the 3D words, `body`
for the rest, `serif` for `title` cards. The logo shows on the end screen (and in a corner with `watermark: true`).
Without a brand: Bricolage Grotesque (titles), Inter (text), Instrument Serif (title cards).

## `captions`

Drawn only in 9:16 unless `"enabled": true`. 2–3 words per line, bold white with a dark outline, the spoken word
yellow. Hidden over text cards, shown over the presenter and photos / clips.

## Pacing (from the references)

- Something changes every **2–4 s**: a framing cut, a beat, a word. Never more than ~6 s of the same frame.
- A full-screen beat every **8–15 s**, 2.5–7 s long, on the sentence it illustrates. Show the idea, do not repeat the
  sentence: the list, the number, the search, the comparison, the photo of the thing.
- **Vary the scenes**: no type twice in a row, and a 4-minute video uses at least 8 different scene types. Use photos
  and clips for concrete things (a microphone, a person on a phone), charts and tables for numbers and choices.
- Never more than ~14 s of cards without the presenter; never a card for a sentence that is about the presenter.
- Chapter headings (`title` with `kicker`) when the script has sections.
- End on the presenter saying the last line, then the end screen.
