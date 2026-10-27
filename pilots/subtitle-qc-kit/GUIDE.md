# Subtitle check: setup

Two parts:

- **The skill in the Claude app** reads the editor's subtitles and lists fixes in your format: `0:42 · on Capstable → on cap table · term`.
- **The "Subs transcript" icon** on your Desktop. Drop the clip on it and your Mac writes down what was actually said. With that transcript, Claude checks the subtitles against the audio, not just the text. That is how it catches misheard words and names: on 12 checked clips it found every subtitle error with the right fix. Without the transcript it mostly guesses.

The video never leaves your Mac. Claude only gets the two text files.

## Setup (once, about 10 minutes)

**1. Update the skill in Claude.** In the Claude app: Settings → Capabilities → Skills. Delete the old `subtitle-qc`, then click "Upload skill" and choose `subtitle-qc.skill` from this folder.

**2. Install the transcript icon.** Open **Terminal** (Cmd + Space, type "Terminal", Return), paste this line and press Return:

```
bash ~/Downloads/subtitle-qc-kit/setup.sh
```

- If it asks for your **Mac password**, type it (nothing shows on screen, that's normal) and press Return.
- Most of the time goes into downloading the speech model (1.6 GB).
- It ends with a green **"Done."** and a "Subs transcript" icon on your Desktop.

## Checking a clip

1. Download the clip and its `.srt` from the editor's message.
2. Drag the **clip** onto the **Subs transcript** icon. Wait until a window says "Transcript ready" (about a minute for every 2–3 minutes of video). A file `<clip name>.heard.srt` appears next to the clip.
3. In a new Claude chat, drag in **both** files: the editor's `.srt` and the `.heard.srt`. Type `check subs`.
4. You get the list of fixes. Lines marked `check by ear` are guesses, so listen to those spots.

Use the strongest model you have in Claude (Opus if your plan has it).

## If something goes wrong

- The icon shows an error: post a screenshot in #subtitles-checker.
- To reinstall or update, run the Terminal line from step 2 again.
- To remove the icon: `bash ~/Downloads/subtitle-qc-kit/setup.sh --uninstall`

After each check, post in #subtitles-checker what the skill missed and what was noise. That's how it gets better.
