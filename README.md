# Clipwing Skills

A collection of reusable AI agent skills from Clipwing. Each skill lives in its own folder under `skills/`, with a `SKILL.md` file and any supporting scripts or references.

**[Browse the public catalog](https://clipwing.pro/skills/)** — each skill has its own page, installation guide and direct download.

## Catalog

| Skill | What it does | Download |
| --- | --- | --- |
| [HyperFrames to After Effects](skills/hyperframes-to-after-effects/) | Converts a HyperFrames project into an editable After Effects project with text, shapes, footage, precomps and keyframes, then compares frames against the original render. | [.skill package](packages/hyperframes-to-after-effects.skill) |
| [Real SFX](skills/real-sfx/) | Sound-designs motion videos with real recorded sound effects from your own library, placed on the exact frame, keeping music and voice. Ships with 78 CC0 UI sounds; bring your own library for the rest. | [.skill package](packages/real-sfx.skill) |

Share these skills: [HyperFrames to After Effects](https://clipwing.pro/skills/hyperframes-to-after-effects/), [Real SFX](https://clipwing.pro/skills/real-sfx/).

### Video styles

Ten skills that make videos with Claude in ten styles. Each one ships a finished example film as its template, the team's video rules and a check that runs them before the render. They render with [HyperFrames](https://hyperframes.heygen.com). See them all at [clipwing.pro/skills/video-styles](https://clipwing.pro/skills/video-styles) or download [all ten at once](packages/video-styles.zip).

| Style | What it makes | Format | Download |
| --- | --- | --- | --- |
| [Flat Highlight](skills/video-style-flat-highlight/) | Bright product promos: flat colour scenes, words that jump in, one key word on a brand-colour plate, one UI card per scene. | 16:9 | [.skill](packages/video-style-flat-highlight.skill) |
| [Dark Pixel](skills/video-style-dark-pixel/) | Dark tech promos with one accent colour, a pixel mascot, a browser where a cursor types and clicks, and pixel-stripe shutters. | 16:9 | [.skill](packages/video-style-dark-pixel.skill) |
| [Film Slice 3D](skills/video-style-film-slice/) | One 3D metaphor for video tools: a long video as a film strip, a piece lifts off and lands as a finished clip. | 16:9 | [.skill](packages/video-style-film-slice.skill) |
| [Pixel Captions](skills/video-style-pixel-captions/) | Vertical shorts where the captions are the hero: words light up as they are said, one word on a plate, a pixel scene above. | 9:16 | [.skill](packages/video-style-pixel-captions.skill) |
| [HUD Dashboard](skills/video-style-hud-dashboard/) | A no-cut control panel: a turning point sphere lights up, counters tick, a log grows. A system at work in 20 seconds. | 16:9 or 4:5 | [.skill](packages/video-style-hud-dashboard.skill) |
| [Card Carousel 3D](skills/video-style-card-carousel/) | Many cards in 3D layouts that flow into each other: a turning ring, an arc, a focus, a fan. For galleries and catalogues. | 16:9 | [.skill](packages/video-style-card-carousel.skill) |
| [Mono Grid](skills/video-style-mono-grid/) | A black-and-white editorial film in four panels. Each panel has its own rhythm, and the panels change one by one. | 16:9 | [.skill](packages/video-style-mono-grid.skill) |
| [Paper Collage](skills/video-style-paper-collage/) | Explainers that look made by hand: torn paper on dark cardboard, cut-out words, typewriter labels and a red thread. | 16:9 or 9:16 | [.skill](packages/video-style-paper-collage.skill) |
| [Mascot Pastel](skills/video-style-mascot-pastel/) | Friendly promos with a character: pastel scenes that flow into each other, a serif accent word, a phone with the live product. | 16:9 or 9:16 | [.skill](packages/video-style-mascot-pastel.skill) |
| [Split Compare](skills/video-style-split-compare/) | Before and after on one frame: a compare slider, BEFORE and AFTER tags, a frame that reshapes, scene changes by a seam. | 16:9 | [.skill](packages/video-style-split-compare.skill) |

The ten skills share one engine. Edit `shared/video-style-core/` (engine, rule check, references) and `shared/video-styles.json` (names, summaries, demo data), then run `python3 scripts/build_video_styles.py`. It copies the engine and the font licenses into every skill, writes their READMEs, rebuilds the packages and `packages/video-styles.zip`, and updates the catalog entries.

## Install in Claude Code

Download or clone this repository, then copy the **individual skill folder** from `skills/` into your Claude Code skills directory. Include all files inside the folder, not just `SKILL.md`.

For a personal installation:

- **macOS / Linux:** `~/.claude/skills/<skill-name>/`
- **Windows:** `%USERPROFILE%\.claude\skills\<skill-name>\`

For installation in one project, copy the skill folder into `<project>/.claude/skills/<skill-name>/` instead.

For example, on macOS / Linux:

```bash
git clone https://github.com/Clipwing/skills.git clipwing-skills
mkdir -p ~/.claude/skills
cp -R clipwing-skills/skills/hyperframes-to-after-effects ~/.claude/skills/
```

On Windows (PowerShell):

```powershell
git clone https://github.com/Clipwing/skills.git clipwing-skills
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse "clipwing-skills\skills\hyperframes-to-after-effects" "$HOME\.claude\skills\"
```

Restart Claude Code after installing. Read the selected skill's README for prerequisites and usage.

See Anthropic's [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) for details about personal and project skill installation.

## Install a packaged skill in Claude

Open a `.skill` link in the catalog and use GitHub's **Download raw file** button to save the package. Open the package in the Claude app and choose **Save skill**.

Packaged downloads are stored in `packages/`.

## HyperFrames to After Effects prerequisites

- Node.js 18 or newer and a HyperFrames project that renders successfully.
- Adobe After Effects 2023 or newer, with **Allow Scripts to Write Files and Access Network** enabled in its scripting preferences.
- ffmpeg for media conversion and frame comparison.

In the HyperFrames project, ask Claude: **"Convert this to an After Effects project."**

See the [skill README](skills/hyperframes-to-after-effects/README.md) for setup and the [skill instructions](skills/hyperframes-to-after-effects/SKILL.md) for workflow and limitations. The skill includes Windows and macOS support; the supplied version was tested on Windows, while macOS has not yet been verified.

## Repository layout

```text
skills/
  <skill-name>/
    SKILL.md
    README.md
    scripts/       # optional
    references/    # optional
packages/
  <skill-name>.skill
README.md
```

## Adding or updating a skill

1. Add a self-contained folder under `skills/<skill-name>/` with `SKILL.md` and all supporting files.
2. Document prerequisites, installation and usage in the skill's README.
3. Add an entry to the catalog above.
4. If distributing a `.skill` package, build it from the same source folder and update `packages/<skill-name>.skill` in the same change. The archive should contain a top-level `<skill-name>/` folder with `SKILL.md` inside it.

The folders under `skills/` are the source of truth. Keep packaged downloads in sync with their source folders.

## Public website

The public catalog lives on the main Clipwing website at **https://clipwing.pro/skills** and uses its shared branding and navigation. Its pages are maintained in [`Clipwing/clipwing-website`](https://github.com/Clipwing/clipwing-website).

GitHub Pages is retained for existing shared links and package distribution. It redirects catalog and skill-page visitors to the main website. Every push to `main` builds and deploys these compatibility pages through `.github/workflows/pages.yml`.

To add a skill to this repository and its compatibility catalog:

1. Add its source folder under `skills/`.
2. Add its metadata to `site/catalog.json` (unique slug, name, summary, category, platform, version, update date and social image filename).
3. Add its detail page to `site/pages/<slug>.html` and a 1200 × 630 PNG preview to `site/assets/`. Use the existing page as a template; placeholders such as `{{download}}` and `{{source}}` are supplied by the builder.
4. Run `python3 scripts/build_site.py` to check the build, then commit the sources. The builder generates the catalog, pages, social metadata and `.skill` downloads in ignored `_site/`.

Website downloads are built directly from `skills/<slug>/` on every deployment. The manually distributed archives in `packages/` are retained separately and should also be updated when a skill changes. Version labels in the catalog describe the skill; GitHub Releases are not yet configured.

To update the main website, run `node scripts/sync-skills.mjs <full-commit-sha>` in `Clipwing/clipwing-website`, review its detail content and branded social images, then deploy it. The website serves a pinned snapshot of the catalog and packages; updating this repository alone does not change that reviewed snapshot.

To preview locally, serve a parent directory that maps `_site/` to `/skills/`, matching the public GitHub Pages URL. No JavaScript framework, package installation or application server is needed for the deployed site.
