# The edit plan (`edit.json`)

One JSON file describes the whole edit. Times are seconds on the **edited** timeline (the one in `work/words.json` and
`work/transcript.txt`, after the pauses were cut). The same plan renders both 16:9 and 9:16; every scene lays itself out
for the aspect.

```json
{
  "talk":   [ {"t": 0, "zoom": 1.0}, {"t": 3.15, "zoom": 1.32, "snap": true}, ... ],
  "beats":  [ {"type": "list", "start": 13.0, "end": 17.1, "in": "whip", "out": "whip", ...}, ... ],
  "accents":[ {"type": "leak", "t": 19.2, "d": 0.7} ],
  "transition": "whip",
  "vfx":    {"grain": 0.07, "handheld": 1, "vignette": true},
  "captions": {"words": 3, "y": 0.7, "size": 84, "highlight": true, "upper": false}
}
```

## `talk`: framing of the presenter

A keyframe changes the framing **as a cut** (the reference cuts between a wide and a close frame every few seconds).

| key | meaning |
|---|---|
| `t` | when the new framing starts. Put it **on a word start minus ~0.05 s**, never mid-word |
| `zoom` | 1.0 = the whole take (wide); 1.25–1.45 = close; above 1.6 only for one-word reactions ("Nope.") |
| `snap` | the punch-in lands with a tiny settle (+5 % that relaxes over 0.28 s) and a soft whoosh |
| `ease` | seconds: a smooth push instead of a cut (use for a slow emotional push, rarely) |
| `push` | the slow push inside the shot (default 0.025 = +2.5 % over the shot) |
| `x`, `y` | aim point in the take (0..1); default the face from `face.json` |

Rules: alternate wide and close; a close shot lasts 1.5–5 s; the first 3 s are wide; no two framings in a row that
differ by less than 0.15 zoom (it reads as a mistake). With no `talk` the engine alternates on sentence starts.

## `beats`: what appears

Every beat has `type`, `start`, `end`. Full-screen beats replace the presenter (the voice continues); overlays draw on
top of the presenter. `in` / `out` transitions: `cut`, `whip` (fast pan with motion blur), `zoom` (zoom blur),
`leak` (crossfade under a warm light leak), `flash` (white flash), `fade`. Full-screen beats default to `in: whip`,
`out: cut`. Two full-screen beats that touch (`end` of one = `start` of the next) hand over with the second one's `in`.

Times inside a beat (`at`) are the moment the spoken word starts: take them from `words.json`.

### Full-screen

| type | fields | looks like |
|---|---|---|
| `title` | `text`, `sub?`, `size?`, `cps?` (typing speed) | big serif words typed on warm paper ("SIMPLE WORDS", "How would you search for it?") |
| `list` | `title`, `icon?` (emoji), `highlight?` (yellow marker under the title), `items: [{text, at, bad?}]` | checklist card: future items wait blurred, each turns sharp with a green tick (`bad`: red cross) when it is said |
| `compare` | `left: {title, items:[{text, at}]}`, `right: {...}`, `right_bad?` (default true) | good vs bad columns with ticks and crosses |
| `search` | `query`, `suggestions: [...]`, `cps?`, `tilt?` | a search bar typing the query over a soft grid of thumbnails, suggestions drop down |
| `stat` | `value`, `prefix?`, `suffix?`, `decimals?`, `label`, `trend: up/down/spike/flat`, `color?` | analytics card: the number counts up, the line chart draws itself |
| `mindmap` | `center`, `nodes: [{text, at, color?, angle?}]` | a hub with coloured pills branching off as they are named |
| `quote` | `text`, `size?` | the presenter blurred and dimmed behind one strong sentence ("Rhythm = engagement") |
| `image` | `src` (file next to the plan), `caption?`, `backdrop: paper/presenter`, `full?`, `tilt?` | a screenshot or photo, rounded and shadowed, pushing in with a slight tilt: real b-roll |

### Overlays on the presenter

| type | fields | looks like |
|---|---|---|
| `words` | `items: [{text, at, pos, size?, color?, rot?}]`; `text` may hold `\n`: the second line is small | big bold words around the head ("Unlock / your potential"). `pos`: `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `top`, `center`. They never cover the face in 16:9; in 9:16 they stack above the head |
| `callout` | `text`, `side: left/right` | a short bold label beside the presenter |
| `subscribe` | — | a Subscribe pill clicked by a cursor (last 2–3 s) |

## `accents`

Short VFX laid over whatever is on screen: `{"type": "leak"|"flash", "t": 12.3, "d": 0.6}`. A leak on a topic change
or a big reveal, at most one every ~20 s.

## `captions`

Drawn only in 9:16 unless `"enabled": true`. 2–3 words per line (`words`), bold white with a dark outline, no box, a
little below centre (`y` 0.7); the word being spoken is yellow (`highlight`, `color`). They hide on text cards (the
card already says it) and show over the presenter, `image` and overlays.

## Pacing rules (from the references)

- Something changes every **2–4 s**: a framing cut, a beat, a word overlay. Never more than ~6 s of the same frame.
- About **one full-screen beat per 8–15 s**, each 2–6 s long, placed on the sentence it illustrates. A card that
  repeats the sentence word for word is weak: show the idea (the list, the number, the search, the comparison).
- `words` for the punchy phrases the presenter lists or stresses: 1–3 per beat, 2 words each, never full sentences.
- Do not stack: a `words` overlay never overlaps a full-screen beat; one accent at a time.
- Start strong: a framing change or a beat inside the first 3 s. End with `subscribe` or a close framing.
- Not more than 2 `whip` transitions in a row: vary with `zoom`, `cut`, `leak`.
