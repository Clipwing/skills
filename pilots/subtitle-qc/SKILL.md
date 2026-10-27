---
name: subtitle-qc
description: Proofread a clip's subtitles before it goes to review, and list what to fix with timecodes in the format the Clipwing team already uses ("0:42 · on Capstable → on cap table · term"). Works from an SRT file, or from a video with burned-in subtitles (macOS, read by OCR). Use whenever someone asks to check, proofread or QC subtitles, captions or subs, or says "check subs" before tagging the reviewer.
---

# Subtitle QC

Finds the errors a subtitle reviewer fixes: stutters, misheard words, wrong names and terms, punctuation, slips and duplicates. It lists them; it never edits the subtitle file. The editor fixes and re-renders; the reviewer still does the final pass.

## 1. Input

Ask for what is missing, in one message:

- **Subtitles**: an `.srt` file (best: export it from Premiere, DaVinci or CapCut), or the rendered video with burned-in subtitles. Several files are fine; check each one separately.
- **Glossary** (optional): names and terms for this client or speaker (`glossary.txt`, one per line). Use their exact spelling.

### Video instead of SRT (macOS only)

Needs ffmpeg and the Xcode command line tools (`swiftc`). Run from this skill's `scripts/` folder:

```sh
scripts/ocr_videos.sh <folder-with-videos> <work-folder> 4
for f in <work-folder>/*.ocr.jsonl; do n=${f%.ocr.jsonl}; python3 scripts/build_srt.py "$f" "$n.srt" "$n.screen.txt"; done
```

This reads the frames at 5 fps (about 2–3 minutes per minute of video) and writes `<name>.srt` with the subtitles and `<name>.screen.txt` with on-screen text cards (typed quotes, captions), which are proofread too. OCR text is noisier than a real SRT: see "Do not report".

### Audio check (when the video is available)

Most misheard words only show up in the audio. If you have the clip with its sound and `whisper-cli` is installed (`brew install whisper-cpp`, plus a model, see the script), transcribe it first:

```sh
scripts/transcribe.sh <video> [glossary.txt]
```

This writes `<name>.heard.srt`, what the speech model heard, in about a second per 2–3 seconds of video, on the editor's machine.

In the Claude app the script cannot run, so the reviewer makes the transcript on their Mac (the "Subs transcript" icon from the setup kit) and attaches it next to the subtitles. A file ending in `.heard.srt` is always this transcript, never the subtitles to check: report findings against the other `.srt` only, with its timecodes. If only one `.srt` is attached, there is no transcript.

Use the transcript in step 2: where the subtitles and the transcript disagree on a word, that is a finding; where the transcript confirms your fix, drop "check by ear". The transcript makes its own mistakes, so trust it on ordinary words and use the topic and the glossary for names. Without the video, skip this and keep "check by ear" for guesses.

## 2. Check

Read the whole file first to learn the topic, the speaker and the terms. Then report only what a careful subtitle editor would change before publishing:

1. **Stutters and repeats**: the same word doubled by accident ("in the the cloud"). Fix: remove the extra copy. A speaker restarting a phrase is not a stutter; see "Do not report".
2. **Misheard words**: a word that does not fit the sentence and sounds like one that does ("a cash layer" for "a cache layer" in a database talk). Use the topic of the whole clip to find the intended word.
3. **Names and terms**: product, company and technical names spelled or cased wrong ("Postgres", "GitHub"; function names like `to_json` keep the underscore). Recognise a brand from context even when it is garbled ("cuba netties" in a DevOps talk is "Kubernetes"). Make every name consistent across the file and with the glossary.
   - A stray word between a product and its sub-name is often a version number: "angular for teen" is "Angular 14", not "Angular".
   - Capitalise every technology name, every time it appears, even when it is also an ordinary word: "Rust", "Go", "Swift", "Spring". Check each one; a single lowercase "swift" is a finding.
   - Names spoken as words are written as the name: "C plus plus" → "C++", "5 dot 1" → "5.1". Read across subtitle breaks: "I know C" followed by "plus plus" is one name split in two.
   - Products launched recently may be unknown to you. If a garbled name does not match a product you know well, do not force it onto an older brand: keep the subtitle text as the fix target and mark it `term · check by ear`.
4. **Sentence punctuation**, only in subtitles that use punctuation: a missing question mark on a question, a missing full stop at the end of a sentence, a comma that breaks a phrase in two. Short word-by-word captions with no punctuation at all are a style; do not add any.
5. **Slips that break the sentence**: a wrong word form or split word the speaker clearly did not say ("many user to support" for "users", "log in" for the noun "login").
6. **Duplicates**: the same line twice in a row, or a subtitle that repeats an on-screen card shown at the same moment.

### Do not report

- Casual spoken grammar the speaker plausibly said ("there's lots of tables", starting with "so" or "and"). Subtitles keep the speaker's words.
- Filler words, false starts, self-corrections and rambling or run-on sentences ("so, um, we, we kind of", "it's — what I mean is"). The team keeps subtitles true to what was said; cutting fillers is the editor's call, not an error.
- Style, rewording or shorter phrasing.
- Apostrophe and quote characters: straight or curly, ' or ‘ ("I‘m", "it’s"). The reviewer does not change them.
- From OCR input only: missing spaces between words ("wejust"), "l" or "Al" for "I"/"AI", stray single characters, fragments of on-screen text that are not speech. The real subtitle file does not have these.

Every item should be one the editor agrees with. When a fix is a guess at a misheard word, mark it to check by ear rather than leaving it out. Use "check by ear" only when the context allows two or more real readings. When the topic leaves one sensible word, give the fix without it: a list where most lines say "check by ear" saves the reviewer little time.

## 3. Report

One line per finding, in time order, in the reviewer's format:

```
0:42 · on Capstable → on cap table · term
1:13 · of the of the schema → of the schema · repeat
2:21 · hardwired into Get Lab → hardwired into GitLab · misheard · check by ear
```

- Timecode: start of the subtitle, `m:ss` from the start of the video.
- Fragment: just enough words to find the spot, not the whole subtitle.
- Type: repeat, misheard, term, punctuation, slip, duplicate. Add "check by ear" when the fix is a guess.
- On-screen cards: prefix the line with `card`.

End with one line: how many findings and how many to check by ear. If nothing needs fixing, say "all good".

Save the report next to the input as `<name>.subs-check.txt` and show it in the reply. Do not change the subtitle file unless the user asks.

## Notes

- Tested on 10 real clips against the reviewer's notes (Oct 2026): with Opus, about 60 % of the reviewer's fixes found with the right correction and few false alarms; misheard words that only the audio reveals are the main gap. Use the strongest model available.
- Reviewer's own run on 9 scripts (Oct 19, 2026): about 95 % of fixes flagged, but about 70 % of real text changes only as "check by ear"; it also "fixed" natural rambling speech. The rules on fillers, versions, new products and "check by ear" above come from that feedback.
- Reviewer's run on 8 clips with real SRTs (Oct 20, 2026): 13 of 15 fixes found; missed one misheard phrase and one lowercase technology name. 5 question marks on unpunctuated word-by-word captions were all rejected, hence the punctuation rule.
- Same 8 clips with the audio transcript (Oct 20, 2026): all 13 subtitle errors found with the right fix, 1 false flag; without audio 11 of 13. Edits that come from the script rather than the speech ("remove illustration") stay with the reviewer.
- 3 new clips without audio (Oct 22, 2026): of the reviewer's 4 fixes, 2 spots flagged with a wrong or partial fix, 2 missed; all 4 were about what was said. 3 false flags, all apostrophes, hence the apostrophe rule. A client glossary with the firm's name would have caught the wrong company name in both clips: ask the editor for one.
- The same 3 clips with the audio transcript, plus one clean clip (Oct 26, 2026): 3 of the reviewer's 4 fixes found with the right correction, both clean clips "all good". The miss was a spoken false start the reviewer cut ("it's a from a"), which these rules leave to the reviewer. 3 more findings matched the audio and looked like real errors the reviewer had not marked. Across 12 clips with audio, every subtitle error was found with the right fix.
- Client subtitles and videos stay on the editor's machine; do not upload them anywhere else.
