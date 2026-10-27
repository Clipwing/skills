"""Build the video-style skills from shared/: core files, READMEs, .skill packages and catalog entries.

Every skills/video-style-*/ skill must be self-contained when installed, so each carries its own copy of the
shared engine. Edit shared/video-style-core/ and shared/video-styles.json, then run:

    python3 scripts/build_video_styles.py
"""
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / "shared" / "video-style-core"
STYLES = json.loads((ROOT / "shared" / "video-styles.json").read_text())
CORE_FILES = {"film-core.js": "template", "lint-film.mjs": "template", "video-rules.md": "references", "film-markup.md": "references"}
VERSION, UPDATED = "1.0.0", "2026-10-26"
SKIP = {".DS_Store", "__pycache__"}

README = """# {name} video style

A Claude Code skill for videos in the {name} style. {summary} Claude writes the film as HTML and [HyperFrames](https://hyperframes.heygen.com) renders it to MP4 on your computer.

![Frames from the example film](example-frames.jpg)

**Best for:** {best_for}. **Format:** {format}, {length}.

## What you need

- Claude Code.
- Node.js 18+ and Google Chrome. HyperFrames runs with `npx`, so there's nothing else to install.
- Your logo as SVG and the facts about your product.

## Install

Copy this folder to `~/.claude/skills/{slug}/` (or `.claude/skills/` in a project) and restart Claude Code.

## Use

Ask Claude, for example:

> {prompt}

Claude starts from the example film in `template/`, writes your scenes, checks them against the team's video rules (`template/lint-film.mjs`), looks at the frames and renders the MP4.

## What's inside

| Path | What |
| --- | --- |
| `SKILL.md` | The style and the workflow Claude follows |
| `template/` | A finished example film ({demo_tool} promo, {demo_len} s) to start from: `index.html`, the style kit `kit.js`, the shared engine `film-core.js`, fonts and logos |
| `template/lint-film.mjs` | Checks the film against the video rules before rendering |
| `references/` | The video rules and the scene markup reference |

The film comes out silent. Add real sound effects with the [Real SFX](https://clipwing.pro/skills/real-sfx) skill.

Fonts: {fonts}, under their open licenses (`template/assets/fonts/LICENSE-*.txt`). The Clipwing logos in `template/assets/` are only there for the example: replace them with your own.

Part of the [Clipwing video styles](https://clipwing.pro/skills/video-styles) collection.
"""


def sync_core(skill: Path) -> None:
    for name, folder in CORE_FILES.items():
        (skill / folder).mkdir(exist_ok=True)
        shutil.copy2(CORE / name, skill / folder / name)


def font_licenses(skill: Path) -> None:
    """Put each bundled font family's license next to its files, as the OFL and Apache licenses require."""
    fonts = skill / "template" / "assets" / "fonts"
    for stale in fonts.glob("LICENSE-*.txt"):
        stale.unlink()
    names = [f.name for f in fonts.glob("*.woff2")]
    for lic in sorted((ROOT / "shared" / "font-licenses").glob("*.txt")):
        family = lic.stem
        # "geist" must not claim "geist-mono-latin.woff2"
        if any(n.startswith(family) and not (family == "geist" and n.startswith("geist-mono")) for n in names):
            shutil.copy2(lic, fonts / f"LICENSE-{family}.txt")


def package(skill: Path) -> Path:
    out = ROOT / "packages" / f"{skill.name}.skill"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted(skill.rglob("*")):
            if path.is_file() and not SKIP.intersection(path.parts):
                z.write(path, path.relative_to(skill.parent))
    return out


def main() -> None:
    catalog_path = ROOT / "site" / "catalog.json"
    catalog = [s for s in json.loads(catalog_path.read_text()) if s.get("collection") != "video-styles"]
    for style in STYLES:
        skill = ROOT / "skills" / style["slug"]
        if not (skill / "SKILL.md").is_file():
            raise SystemExit(f"Missing SKILL.md: {skill}")
        sync_core(skill)
        font_licenses(skill)
        summary = style["summary"]
        (skill / "README.md").write_text(README.format(
            demo_tool=style["demo"]["tool"], demo_len=round(style["demo"]["duration"]), **style))
        pkg = package(skill)
        catalog.append({
            "slug": style["slug"], "name": f"{style['name']} video style", "summary": summary, "category": "Video styles",
            "platform": "Claude Code", "version": VERSION, "updated": UPDATED, "image": "video-styles.png", "collection": "video-styles",
        })
        print(f"{style['slug']}: README, core, {pkg.stat().st_size // 1024} KB package")
    # One download with every style, for the collection page.
    with zipfile.ZipFile(ROOT / "packages" / "video-styles.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for style in STYLES:
            skill = ROOT / "skills" / style["slug"]
            for path in sorted(skill.rglob("*")):
                if path.is_file() and not SKIP.intersection(path.parts):
                    z.write(path, path.relative_to(skill.parent))
    catalog_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    print(f"catalog: {len(catalog)} entries")


if __name__ == "__main__":
    main()
