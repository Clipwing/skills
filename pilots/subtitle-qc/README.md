# subtitle-qc

A Claude skill that proofreads a clip's subtitles before review and lists fixes with timecodes, in the format the Clipwing reviewers use:

```
0:42 · on Capstable → on cap table · term
2:21 · hardwired into Get Lab → hardwired into GitLab · misheard · check by ear
```

Input: an `.srt` file, or a video with burned-in subtitles (macOS: ffmpeg + Xcode command line tools for OCR). Output: the list in the chat and in `<name>.subs-check.txt`. The subtitle file is never changed.

Install: copy the `subtitle-qc` folder to `~/.claude/skills/`, restart Claude Code, then ask "check subs for clip.srt".

In the Claude app, upload `subtitle-qc.skill` under Settings → Capabilities → Skills, then attach the `.srt` and type "check subs".

Check against the audio whenever you have the video: most misheard words and wrong names only show up there (Oct 2026: with audio, every subtitle error on 12 clips was found; without it, 0 of 4 on the last 3). Needs `brew install ffmpeg whisper-cpp` and a speech model (~1.6 GB, the download command is in `scripts/transcribe.sh`), then ask "check subs for clip.srt, the video is clip.mp4". In the Claude app the script can't run: make `clip.heard.srt` on the Mac with the subtitle-qc setup kit (`setup.sh` adds a "Subs transcript" icon to drop videos on) and attach it next to the `.srt`.

Internal pilot, October 2026. Use Opus.
