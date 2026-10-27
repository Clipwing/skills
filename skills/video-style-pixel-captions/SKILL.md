---
name: video-style-pixel-captions
description: Make a vertical 9:16 short (Reels, TikTok, Shorts) in the Pixel Captions style with HyperFrames — big captions are the hero, one phrase at a time in the lower third, words light up from grey as they are said, one word per phrase on a brand-colour plate; above, a tiny pixel-mascot scene with 1–3 props acts the phrase out; pastel background with a fine grid, flipped to a bold colour at plot turns. 15–70 s, works with or without a voiceover. Use when someone asks for a "Pixel Captions" video, a vertical short or story about a product or idea, a captions-first explainer, or a Reels/TikTok video with a mascot.
---

# Pixel Captions

A vertical short in which the captions carry the story. Each phrase sits in the lower third: its words turn from grey to ink as they are said, and the word that carries the meaning gets the accent plate. Above it, a small scene shows the same phrase with a pixel mascot and one or two props. Modelled on a Russian Claude Code agents short (15.10).

**Best for:** Reels, Shorts and TikTok about a product, a tip or a short story, with a voiceover or silent. **Not for:** horizontal promos and detailed UI walkthroughs.

`template/` is a finished 23 s silent short for Clipwing's Subtitles Generator. Frames: [example-frames.jpg](example-frames.jpg).

## Make a film

1. **Brief.** The message in 4–6 phrases of 3–7 words, one key word per phrase, the product URL, and the facts. Write `brief.md`.
2. **Voiceover (optional, recommended).** Record or generate the voice first, transcribe it with word timings (`npx hyperframes transcribe`), and put each phrase's word times in `data-beats`. With no voice, `data-step="0.3"` paces the words. Claude cannot hear the voice: ask the person to listen before building.
3. **Project.**
   ```sh
   npx --yes hyperframes@0.8.202 init <dir> --example blank --non-interactive --resolution portrait
   cp -R <this skill>/template/. <dir>/
   ```
   Set `--accent` and put the logo in `assets/logo-dark.svg`. Draw your mascot as a grid in `kit.js` → `GRIDS`.
4. **Write scenes** ([references/film-markup.md](references/film-markup.md)): one phrase per scene, and the scene's props show that phrase. Mark plot turns with `data-bg` (and `data-ink="light"` on dark colours), no more than once every 10–15 s.
5. **Check and look:** `node lint-film.mjs`, `npx hyperframes check --json`, `npx hyperframes snapshot` at each phrase's last word.
6. **Render:** `npx hyperframes render --quiet -o renders/<name>.mp4` (about 15 s). Look at a frame sheet. Add sound afterwards with Real SFX.

Team rules: [references/video-rules.md](references/video-rules.md).

## Look

| Role | Value |
| --- | --- |
| Ground | pastel lavender gradient `#ede9f8 → #e6e1fb` with a warm peach spot top-right, plus a 48 px grid at 6% |
| Plot-turn backgrounds | brand indigo, dark `#1a1c20`, saturated yellow or red: one per turn |
| Accent: plate, mascot | `--accent` (Clipwing `#6366f1`) |
| Captions | Inter 800, 66 px, centred, 1–2 lines, top at y 1290; unsaid words at 32% ink |
| Props | white cards, radius 18, soft shadow; phones; pills with a mono label |

The bottom 15% (below y 1632) stays empty: that's where the platform's UI sits.

## Parts and effects

| Markup | What it does |
| --- | --- |
| `<p class="cap" data-fx="karaoke">` with one `<mark>` | The caption. The whole phrase is there in grey; words turn ink at `data-beats` (times per word) or every `data-step` s, and the `<mark>` word gets the plate on its beat |
| `.stage` | The scene's props, above the caption. It slides out left as the next scene comes in |
| `data-bg="#4f46e5" data-ink="light"` | A plot turn: the whole ground crossfades to that colour in 0.3 s. A scene without `data-bg` returns to the pastel ground |
| `<svg class="pixel" data-grid="wing">` + `hop`, `pop`, `enter` | The mascot, with a two-step hop |
| `crowd` | The element's children pop in as a wave 0.04 s apart (the "it multiplies" joke) |
| `stamp` | A stamp slams in at −6° with one shake |
| `cycle` (`data-every`) | The children take turns being shown: a style picker, a word being corrected |

## Rules learned in the runs

- Captions change by phrase, never by word. Inside a phrase the highlight follows the voice.
- The plate goes on the word with the stress, which is the meaning, not the first noun.
- Captions never sit on top of a clip that already has its own subtitles (v1, 15.10). Put a ✓ label beside it instead.
- First frame: the scene and the caption (in grey) are already there at 0 s. On social players it's the thumbnail.
- Colour turns crossfade through colour, never through white.
- A number of mascot copies is a visual joke: show it, don't explain it in the caption.

## Checklist before render

- [ ] One phrase, at most 2 lines, exactly one plate per caption.
- [ ] Each scene's props show its phrase.
- [ ] Nothing in the bottom 15%, and nothing touching the side edges.
- [ ] With a voice: beats come from the transcript, not guessed.
