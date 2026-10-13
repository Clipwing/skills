# hyperframes-to-after-effects

A Claude Code skill that turns a HyperFrames project into an editable After Effects project: live text, shape layers,
footage, precomps and keyframes, checked frame by frame against the HyperFrames render.

## Install

Copy this folder to your Claude Code skills folder and restart Claude Code:

- Windows: `%USERPROFILE%\.claude\skills\hyperframes-to-after-effects`
- macOS: `~/.claude/skills/hyperframes-to-after-effects`

Or install the `.skill` package from the Claude app (Save skill).

Then ask Claude, in your HyperFrames project: "convert this to an After Effects project".

## Needs

- Node 18+ and a HyperFrames project that renders (`npx hyperframes render` works). The skill reuses HyperFrames'
  own Chrome, puppeteer, fontkit and sharp; it installs nothing.
- Adobe After Effects (2023 or newer) on Windows or macOS, with *Preferences → Scripting & Expressions → Allow Scripts
  to Write Files and Access Network* on.
- ffmpeg (for the frame-by-frame check and WebM/OGG media).

## Run by hand

```bash
node scripts/hf2ae.mjs doctor <project>
node scripts/hf2ae.mjs all <project> --out <folder> [--fps 30] [--aep <file.aep>]
```

See `SKILL.md` for what maps to what and `references/` for internals and troubleshooting.
