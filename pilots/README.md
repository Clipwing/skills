# Pilot skills

Skills that were built and tested with the team but are not released. They are not in the catalog and not on clipwing.pro. Each folder is a normal skill folder: zip it with its folder at the top to install (`zip -qr <slug>.skill <slug>`).

| Skill | What it does | State (Oct 27, 2026) |
| --- | --- | --- |
| [subtitle-qc](subtitle-qc/) | Checks an SRT (plus the video's audio transcript, if there is one) and lists fixes in the reviewer's format: `0:42 · fragment → fix · type` | With audio it found every subtitle error with the right fix across 12 real clips; without audio about 60–85 %. John has the kit since Oct 27; no feedback yet. Lera: stays a skill, no Slack bot for now |
| [subtitle-qc-kit](subtitle-qc-kit/) | Setup for a reviewer's Mac: installs ffmpeg and whisper, puts a "Subs transcript" icon on the desktop (drop a clip on it to get `<name>.heard.srt`) | Tested on one Mac, including paths with spaces and apostrophes. `sh build_kit.sh` builds `subtitle-qc-kit.zip` |
| [video-script](video-script/) | Script for a 15–90 s promo or explainer from an article or product page: brief, facts, 3 angles, beats, self-check. Can output JSON for the content factory | Used by the content factory since Oct 27; all 3 test articles passed the factory's Claude check. Not tried by the team |
| [revisions-checklist](revisions-checklist/) | Turns a review thread (Slack, email, client notes) into one checklist with timecodes, who asked and status | Matched the expected list on 3 real #video-review threads with Opus. Paused on Oct 19 (no team tools for now) |
| [project-folders](project-folders/) | Creates a project folder from a template, sorts downloads into it with clean names, versions renders, can undo | 13 tests pass (`python3 -m pytest -q project-folders/tests`). The `davinci` layout is a guess, not Stas's; not tried on Windows. Paused on Oct 19 |

Notes:
- Subtitle QC was measured on Opus. The free Claude plan uses Sonnet; quality there is not measured.
- Client subtitles, videos and review threads stay on the editor's machine. None are in this folder.
- To release one: add a README in the catalog format, a package in `packages/`, a demo made with Claude, and Lera's OK.
