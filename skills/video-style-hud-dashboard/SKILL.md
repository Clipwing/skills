---
name: video-style-hud-dashboard
description: Make a no-cut "system at work" video in the HUD Dashboard style with HyperFrames — the whole frame is a live black control panel with one orange accent, monospace type, a slowly turning point sphere whose nodes light up one by one, counters that tick with every event, a tail -f log, bars, input/output panels; a short callout at the top changes per beat, and the panel dims for an end card. 16:9 or 4:5, 15–30 s. Use when someone asks for a "HUD" or "dashboard" video, "Brain HUD" style, a video showing a pipeline, batch job, automation or AI tool processing many items, or a week or run of a system compressed into seconds.
---

# HUD Dashboard

The frame is a control panel that never cuts. Everything happens in it at once, but the eye follows whatever lit up last: a node on the sphere, a new log line, a counter tick. A callout at the top tells the story in 4–5 short lines. Modelled on Brain HUD by @Argona0x.

**Best for:** tools that process many things (files, languages, clips, runs), automations, "a week of work in 20 seconds". **Not for:** emotional stories, or products whose value is one simple screen.

`template/` is a finished 20 s promo for Clipwing's SRT Subtitle Translator: one file, eight languages, the same timings. Frames: [example-frames.jpg](example-frames.jpg).

## Make a film

1. **Brief.** What gets processed, the list of events (here, 8 languages), what stays constant (timings, names), the URL and the facts. Sample data is labelled "sample" in a panel label. Every number must agree across panels.
2. **Project.**
   ```sh
   npx --yes hyperframes@0.8.202 init <dir> --example blank --non-interactive --resolution landscape   # portrait-ish 4:5: set 1080×1350 by hand
   cp -R <this skill>/template/. <dir>/
   ```
3. **Events first.** Pick the event times (evenly spaced, at least 1.5 s apart, so a changing panel can be read), then make every panel read the same times: sphere `data-nodes`, `tally` `data-ticks`, log lines `data-at`, bars `data-at`, output `swap` children `data-at`. Generate the repeated parts with a short script when there are more than 5 events.
4. **Callouts.** 4–5 scenes, each holding one callout line of 3–5 words with one accent. The last scene dims the dashboard (`dim` on `.dash`) and shows logo, title, URL and one line of facts.
5. **Check and look:** `node lint-film.mjs`, `npx hyperframes check --json`, `npx hyperframes snapshot` at a few event times and the end.
6. **Render:** `npx hyperframes render --quiet -o renders/<name>.mp4` (about 25 s). The point sphere makes the file large (about 10 MB for 20 s); for the web, re-encode with `ffmpeg -crf 28`.

Team rules: [references/video-rules.md](references/video-rules.md).

## Look

| Role | Value |
| --- | --- |
| Background | `#030303`; panels `#0a0a0a` with a 1 px `#2a2a2a` frame, square corners |
| Accent: panel tags, values, links, bars | orange `--accent: #ff6a1a`, glow `#ffb070`. It is the style's own colour; use the brand colour only if the brand insists |
| Text | `#e8e8e8`, secondary `#8a8a8a`, "waiting" flag `#f5c542` |
| Type | Geist Mono everywhere: panel tags 24 px caps on an accent chip, values 54 px; callouts Geist 700, 52 px |

Layout at 1920×1080: callout at the top; a row of 5 counters; the sphere on the left (760×780); input and output panels top right; log and bars bottom right.

## Parts and effects

| Markup | What it does |
| --- | --- |
| `<canvas class="sphere" data-points data-spin data-nodes='[[t,"ES"],…]'>` | A point sphere turning at `data-spin` rad/s (about 7°/s). Each node lights at its time with a line from the hub and a label chip; nodes behind the sphere stay faint |
| `count` | A value rolls up once (`data-fmt="space"` gives 1 257) |
| `tally` + `data-ticks` | A count that steps exactly at the event times. Use it whenever a number must match what the viewer sees happen |
| `.logview > #log[data-fx=log][data-rows]` | Lines appear at their `data-at` and scroll up, showing the last `data-rows` |
| `bars` | Children grow to `data-v` % at their `data-at` |
| `swap` | Of the children, the last one whose `data-at` has passed is shown: an output that changes per event |
| `.dash` + `dim` | The whole dashboard steps back to 12% for the end card. Never cover it with a dark veil: `check` reads that as hidden text |

The dashboard lives outside the scenes, so its times are absolute. Scenes hold only the callouts and the end card.

## Rules learned in the runs

- One accent. Motion is everywhere, but only one thing is new at a time.
- A panel that changes every event must hold for at least 1.5 s. 12 languages at 1.15 s each was unreadable, and 8 at 1.5 s works.
- Counts that describe events use `tally`, not `count`: an eased count shows "5" while the log says 4.
- Sphere points come from a Fibonacci spiral, so there is no randomness. Draw them from the frame time in a painter, never in requestAnimationFrame.
- Lines that scroll out of the log box get opacity 0, so `check` doesn't see hidden text.
- Non-Latin output (Japanese, Arabic) needs a font that covers it in `assets/fonts/`, or it renders in a fallback face.

## Checklist before render

- [ ] Every number agrees across counters, log, bars and sphere at every moment.
- [ ] The first frame already shows the dashboard and the first callout.
- [ ] Sample data is labelled; claims on the end card come from the product page.
- [ ] Text is 24 px or more, except the bar labels.
