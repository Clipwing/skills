---
name: project-folders
description: Set up and keep tidy a video editing project on disk — create the project folder from a template (DaVinci Resolve or Premiere/After Effects layout, or the editor's own), sort a pile of downloaded footage, music and graphics into it with clean file names, and save each new render as the next version (_v01, _v02…). Always shows the plan before moving anything and can undo. Use whenever an editor asks to create, organise, sort, rename, clean up or structure project folders, footage, sources, downloads from Google Drive, or renders, or complains that files are a mess, even if they do not name the skill.
---

# Project folders

Editors download sources from Google Drive or YouTube, then sort and rename them by hand, and the mess grows with every new file. This skill does that part with one script, `scripts/folders.py` (Python 3.9+, no dependencies). It works on the user's own disk, so it needs Claude Code, not the Claude app's sandbox.

`<skill>` below is this skill's folder. On Windows run `python` (or `py -3`) instead of `python3`. If Python is missing, tell the user and suggest installing it from python.org (on Windows `winget install Python.Python.3.12`); do not install it without asking.

## 1. New project

Ask, in one message, only what you do not know:

- where projects live (the parent folder) and the project name (client and video, e.g. `Acme promo`);
- the layout: `davinci` (DaVinci Resolve: 01_SOURCE, 02_AUDIO, 03_GRAPHICS, 04_PROJECT, 05_PROXY, 06_RENDER, 07_DELIVERY) or `adobe` (Premiere + After Effects: PR_SAVE, AE_SAVE, VID, MAT, RENDER), or their own.

```sh
python3 <skill>/scripts/folders.py new <parent> "<name>" --template davinci
```

It creates `<parent>/YYYY-MM-DD_<name>/` with the folders and keeps a copy of the template inside as `_template.txt`; later commands read that copy.

**Their own layout.** Write it as a template file and pass its path to `--template`. One line per folder, `FOLDER: file types`:

```
VID: mp4 mov mkv
MAT: wav mp3 png jpg
RENDER:
```

Folders without types are just created. The folder with `RENDER` in its name receives versioned renders. Offer to save the file next to the skill's `templates/` so the next project reuses it.

## 2. Sort downloads in

Do this **right after downloading, before importing into Premiere or DaVinci**: moving or renaming files that a project already uses breaks its media links. If the user says the files are already in the edit, stop and say so.

```sh
python3 <skill>/scripts/folders.py sort <downloads-folder> <project>            # plan only
python3 <skill>/scripts/folders.py sort <downloads-folder> <project> --apply    # move
```

Show the plan in plain words (how many files go where, which names change) and run `--apply` only after the user says yes. File names are cleaned (spaces and odd characters → `_`, lowercase extension); nothing is overwritten (`clip.mp4`, `clip_2.mp4`). Files of unknown types stay where they were and are listed with `?`: ask where they belong, add their type to the project's `_template.txt`, and sort again.

## 3. Save a render as the next version

```sh
python3 <skill>/scripts/folders.py render <exported-file> <project>            # plan
python3 <skill>/scripts/folders.py render <exported-file> <project> --apply
```

The file moves into the RENDER folder as `<project>_v01.mp4`, then `_v02`, and so on. Mention the new name, so the user can post it in the review thread.

## 4. Undo

Every applied move is logged in `<project>/_moves.csv`. To put everything back:

```sh
python3 <skill>/scripts/folders.py undo <project> --apply
```

## Notes

- Never delete files. The script only creates folders and moves files.
- Client footage stays on the user's disk; do not upload it anywhere.
