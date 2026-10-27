# Content factory JSON

The factory's `template-reel` generator builds a silent vertical reel from one JSON object. This file is the schema to follow: a copy of `FORMAT` in the factory's `worker/generators/template-reel/build.py` as of 27.10.2026. Inside the factory the generator puts its live `FORMAT` in place of this file, so there is nothing to look up.

Map the beat sheet onto it: one beat → one entry in `beats`; the caption phrases → `say`; the beat's visual → the closest `visual` type below; the end card → `end`.

```json
{
  "title": "short internal title",
  "beats": [
    {"say": ["phrase with *key words*", "next phrase"], "tone": "accent", "visual": {}}
  ],
  "end": {"line": "the takeaway, at most 6 words", "cta": "button text, at most 4 words"},
  "instagram": {"caption": "a hook line, then 2-4 short lines, no links", "hashtags": "#three #to #five"},
  "tiktok": {"caption": "one or two lines, at most 4 hashtags"},
  "youtube": {"title": "up to 70 characters, no < or >", "description": "2-3 lines"}
}
```

- 7–9 beats; all phrases together 60–110 words; 1–3 phrases per beat, 2–7 words each.
- `*asterisks*` mark the key words of one phrase per beat.
- `tone`: `accent` by default, `warn` for a beat about a risk or a mistake.
- No credit line ("Made with Clipwing"): the template adds the end card itself.

## Visual types

Pick per beat; no type more than 3 times; a number, grid or bars whenever the beat has a number. Labels are 2–4 words, table cells at most 4.

- `cards`: `{"type": "cards", "items": [{"title": "Page A", "lines": ["Covers your topic"]}, {"title": "Page B", "highlight": true, "lines": ["Real traffic", "Same niche"]}], "link": "Backlink"}` — 1–2 cards, comparison or A → B, each with 1–3 lines of at most 4 words.
- `rows`: `{"type": "rows", "items": [{"label": "Food blog", "chip": "+1 vote", "tone": "warn"}]}` — 2–4 rows with a chip each.
- `table`: `{"type": "table", "columns": ["Signal", "Strong", "Weak"], "rows": [["Relevance", "Covers your topic", "Unrelated site"]], "highlight": 0}` — 2–5 rows, exactly 3 columns: a thing, the good case (green checks), the bad case (red crosses).
- `grid`: `{"type": "grid", "count": 43, "number": "43%", "label": "of sites that sell links"}` — a share out of 100.
- `number`: `{"type": "number", "value": "45", "unit": "seconds", "label": "is all an idea needs", "strike": "not 25 minutes"}` — one big number.
- `bars`: `{"type": "bars", "items": [{"label": "Top 5 results", "value": 40}, {"label": "You", "value": 5, "highlight": true}]}` — 2–3 bars.
- `list`: `{"type": "list", "title": "1 long video becomes", "items": ["5 short clips", "3 posts"]}` — 2–5 short lines.
- `post`: `{"type": "post", "name": "Clipwing", "items": ["the text of a short post"]}` — 1–3 social-post cards.
- `phones`: `{"type": "phones", "items": [{"platform": "YouTube Shorts", "stat": "200,000 views"}, {"platform": "TikTok"}]}` — 1–3 phones playing a clip, for where clips are watched; `stat` optional, at most 3 words.
- `clips`: `{"type": "clips", "count": 5, "source": "40-min podcast", "label": "5 short clips"}` — one long video and the clips cut from it fanning out.
- `product`: `{"type": "product", "shot": "review"}` — the real Clipwing app, camera moving in, cursor clicking. Shots, each at most once: `clips-ready` (the Clips board, clips awaiting review), `review` (a clip with comments pinned to timecodes), `schedule` (platform, title, date, Schedule clip). They are the app's own screens; there is no shot of adding a link or of a calendar.

2–3 beats are `product`, and beat 2 or 3 is one of them, so Clipwing is on screen in the first third: the first one shows the step that solves the article's problem (an editor or the quality of edits → `review`, more from one long video → `clips-ready`, posting and platforms → `schedule`).
