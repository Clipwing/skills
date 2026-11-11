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
  "vfx":       {"grain": 0.03, "handheld": 1, "vignette": false},
  "captions":  {"words": 3, "y": 0.7, "size": 84, "highlight": true, "upper": false}
}
```

## What the engine enforces (whatever the plan says)

- **No short presenter shots between inserts.** Two full-screen beats less than 3.4 s apart are joined (the first runs
  on and they hand over card to card), unless a `words` beat sits in the gap (then 1.6 s). Never plan a short glimpse
  of the face between two cards.
- **Every change between the presenter and a card is a transition**, never a hard cut. Without `in` / `out` the engine
  picks them: `blur` (a soft blur dissolve) and `zoom` (a push-in) between the presenter and a card, `blur` card to
  card. Both keep the whole frame on screen: no shrunken or cropped screens, no dark gaps. Older names (`whip`,
  `slide`, `push3d`) play as `blur`. Set `in` / `out` only to force one.
- **Framing is never a tight face crop**: `zoom` is capped at 1.24. Framing cuts within 1.2 s of a card are dropped.
- **Text never leaves the frame**: titles, items and words shrink to fit; `render.mjs --check` lists any that still do.
- **The last item of a card stays readable**: a card runs at least 1.6 s (+ a little per character) past its last item;
  a `title` until it is typed + 1.6 s, a `quote` until its last word is said + 1.6 s (the next card may start later
  when its first point comes later anyway).
- **Progress moves smoothly**: bars, counters and lines glide from step to step.
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
over the presenter. Most fields are optional; every scene rises in flat to the camera, holds with a slow push-in
and hands over with a soft blur. The stage is plain white (`brand.colors.paper`).

### Full-screen scenes

| type | fields | looks like |
|---|---|---|
| `title` | `text`, `kicker?` (small label above, e.g. "Tip 2"), `mark?` (a word of `text` that gets a marker sweep), `sub?`, `size?`, `cps?` | big heavy serif words typed on white; the kicker lands 3–4 frames before the words. Use it for chapter headings ("Make clips worth watching", kicker "Tip 2") |
| `quote` | `text`, `mark?` (word(s) highlighted), `kicker?` | one sentence, heavy ink on white; every word lands as it is spoken, the `mark` words get a yellow marker. The one-line takeaway |
| `list` | `title`, `icon?` (emoji), `highlight?`, `items: [{text, at, bad?, note?}]` | numbered checklist card: the spoken row lights up and its number turns into a tick (`bad`: red cross); a counter and a progress bar |
| `compare` | `left` / `right`: `{title, icon?, mock?, tone?, items: [{text, at}]}`, `neutral?` | two cards facing each other with a VS badge. Tones: good / bad (one ✓ or ✕ badge in the header, never one per row) or `neutral: true` (two options, no verdict). `mock`: a small abstract picture of the format: `short`, `long`, `thread`, `video`, `carousel`, `chart` |
| `search` | `query`, `suggestions: [...]`, `cps?` | a search bar typing over a grid of thumbnails cut from the presenter's own take, in a clean app window on white |
| `stat` | `value`, `prefix?`, `suffix?`, `decimals?`, `label`, `trend: up/down/spike/steady/flat`, `note?` (pinned on the peak), `delta?`, `xlabels?`, `tiles?: [{label, value, delta?}]` (max 2) | analytics: the number counts, the chart draws, small tiles float at other depths |
| `bars` | `title`, `bars: [{label, value, at, display?, color?}]`, `hero?` (index), `prefix?`/`suffix?` | bar chart: bars grow on their words; `display` replaces the number ("25 min"); the hero bar glows, the rest go grey |
| `donut` | `title`, `parts: [{label, value, at, color?}]`, `center?` | donut chart with a legend and percentages |
| `table` | `title?`, `columns: [...]`, `rows: [{cells: [...], at}]`, `highlightCol?`, `highlightAt?` | a table whose rows land on their words; a cell "✓" / "✗" becomes an icon |
| `roadmap` | `title?`, `steps: [{text, at, label?, icon?}]`, `color?` | stops along a path; the progress line runs to the stop being named and the camera tracks along. Steps, a week plan, a process |
| `mindmap` | `center`, `nodes: [{text, at, icon?, sub?, color?, angle?}]`, `palette?` | hub with a pulse, curved branches drawing out to coloured pills that pop as each is said |
| `split` | `side: left/right` (where the presenter goes), `kicker?`, `title`, `items?: [{text, at}]`, `value?` (+ `prefix`/`suffix`) | the presenter eases from full frame into a clean window on one side, the other side gets the text (kicker first, title 3–4 frames later). Animates itself in and out from the presenter; from a card the window is already in place |
| `photo` | `src` or `srcs` (2–3), `caption?`, `query` / `queries` (for `fetch_stock.py`), `zoomFrom?`, `zoomTo?`, `pan?` | one photo fills the frame with a slow move; two or three stand side by side on white, whole (never cropped), at one height |
| `video` | `src` (an image-sequence folder from `fetch_stock.py`), `query`, `offset?`, `frame?`, `caption?` | a stock clip, full frame with a slow push (`frame: true`: in a clean frame on white). Clips come only from Pexels / Pixabay (`PEXELS_API_KEY` / `PIXABAY_API_KEY`); without a key plan no `video` beats |
| `post` | `platform: x/linkedin/threads`, `author`, `handle?`, `text` (≤ 20 words), `metrics?: {likes, comments, reposts}`, `cps?` | a post typed in the app's composer, the pointer clicks Post, the button stays ("Posted") while the pointer leaves the frame, reactions count up; in an app window like `search`. For "share an opinion on X", "post it on LinkedIn" |
| `phone` | `platform: tiktok/shorts/reels`, `handle?`, `caption?`, `title?`, `kicker?`, `side?: left/right`, `likes?`, `comments?` | a large phone (about half the 16:9 frame), square to the camera, playing a vertical clip cut live from the presenter's own take, with the app's UI and word captions; a title on the free side. For clips, Shorts, "one video, many clips" |
| `image` | `src` (the user's screenshot), `caption?`, `backdrop: paper/presenter` | a screenshot as a flat card on white |
| `endscreen` | `text`, `channel`, `dur`, `slots?` | added automatically after the last word: thanks, channel name, two "watch next" slots for YouTube's end-screen elements, Subscribe click |

### Overlays on the presenter

| type | fields | looks like |
|---|---|---|
| `words` | `items: [{text, at, color?}]`, `side?: left/right` (where the text goes; default: the first item's `pos`, else right) | the camera eases the presenter to the other side and a little closer (1.22), a flat white panel takes the free side; lines land on their words and stack, the active one with an accent bar, older ones muted. 1–5 words a line, max 3 lines; prefer `split`, `phone`, `post` and cards for anything longer |
| `words` + `style: "headline"` | `text`, `mark?` (word(s) with a marker) | one line on a white band across the lower third, each word landing as it is spoken. For the video's opening line |
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

Fonts and the logo are paths relative to `brand.json`. `head` is used for every heavy title, `body`
for the rest, `serif` for `title` cards. The logo shows on the end screen (and in a corner with `watermark: true`).
Without a brand: Bricolage Grotesque (titles), Inter (text), Playfair Display 800 (title cards).

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
