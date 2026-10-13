"""Build the public catalog and downloadable packages without external dependencies."""
import html
import json
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"
BASE = "https://clipwing.pro/skills"
REPO = "https://github.com/Clipwing/skills"


def escape(value):
    return html.escape(str(value), quote=True)


def page(title, description, route, image, content):
    canonical = BASE + route.rstrip("/")
    redirect = f'<meta http-equiv="refresh" content="0; url={canonical}">' if route != "/404.html" else ""
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
{redirect}
<title>{escape(title)}</title><meta name="description" content="{escape(description)}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Clipwing Skills">
<meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(description)}">
<meta property="og:url" content="{canonical}"><meta property="og:image" content="{BASE}/social/{image}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{escape(title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{escape(title)}">
<meta name="twitter:description" content="{escape(description)}"><meta name="twitter:image" content="{BASE}/social/{image}">
<link rel="icon" href="/skills/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/skills/assets/style.css">
</head>
<body><a class="skip" href="#main">Skip to content</a>
<header class="nav"><a class="brand" href="/skills/"><span class="mark" aria-hidden="true">↗</span> clipwing<span class="brand-sub"> / skills</span></a><nav aria-label="Main"><a href="/skills/">Catalog</a><a href="{REPO}">GitHub ↗</a></nav></header>
<main id="main">{content}</main>
<footer><a class="brand" href="/skills/">clipwing / skills</a><span>Useful workflows. Yours to explore.</span><a href="{REPO}">View source ↗</a></footer>
</body></html>'''


def build():
    catalog = json.loads((ROOT / "site/catalog.json").read_text())
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "downloads").mkdir(parents=True)
    shutil.copytree(ROOT / "site/assets", OUT / "assets")
    (OUT / ".nojekyll").touch()
    cards = []
    seen = set()
    for skill in catalog:
        slug = skill["slug"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug in seen:
            raise ValueError(f"Invalid or duplicate skill slug: {slug}")
        seen.add(slug)
        source = ROOT / "skills" / slug
        if not (source / "SKILL.md").is_file():
            raise ValueError(f"Missing SKILL.md: {slug}")
        if not (OUT / "assets" / skill["image"]).is_file():
            raise ValueError(f"Missing social image: {slug}")
        with zipfile.ZipFile(OUT / "downloads" / f"{slug}.skill", "w", zipfile.ZIP_DEFLATED) as package:
            for path in sorted(source.rglob("*")):
                if path.is_symlink():
                    raise ValueError(f"Symlinks are not supported: {path}")
                if path.is_file():
                    package.write(path, path.relative_to(source.parent))
        route = f"/{slug}/"
        body = (ROOT / "site/pages" / f"{slug}.html").read_text()
        values = {**skill, "download": f"/skills/downloads/{slug}.skill", "source": f"{REPO}/tree/main/skills/{slug}"}
        for key, value in values.items():
            body = body.replace("{{" + key + "}}", escape(value))
        if re.search(r"\{\{[^}]+\}\}", body):
            raise ValueError(f"Unresolved template placeholder: {slug}")
        target = OUT / slug
        target.mkdir()
        (target / "index.html").write_text(page(skill["name"] + " | Clipwing Skills", skill["summary"], route, skill["image"], body))
        visual = f'<span class="app-badge">{escape(skill.get("visual_from", "SKILL"))}</span>'
        if skill.get("visual_to"):
            visual += f'<span class="transfer">→</span><span class="app-badge ae">{escape(skill["visual_to"])}</span>'
        cards.append(f'''<a class="skill-card" href="/skills/{slug}/"><div class="card-art" aria-hidden="true">{visual}<span class="art-caption">{escape(skill.get("visual_caption", skill["category"]))}</span></div><div class="card-body"><span class="eyebrow">{escape(skill['category'])}</span><h2>{escape(skill['name'])} <span aria-hidden="true">↗</span></h2><p>{escape(skill['summary'])}</p><div class="card-bottom"><span>{escape(skill['platform'])}</span><span>Explore skill →</span></div></div></a>''')
    home = '''<section class="catalog-hero"><div class="eyebrow"><span class="status-dot"></span> THE CLIPWING SKILL LIBRARY</div><h1>Less setup.<br><em>More making.</em></h1><p>Reusable skills for the work you want to get back to.<br>Find a workflow, download it, and make it yours.</p><a class="text-link" href="#catalog">Explore the collection ↓</a><div class="hero-stamp" aria-hidden="true">TOOLS FOR<br>YOUR NEXT<br><strong>GOOD IDEA ↗</strong></div></section><section class="catalog" id="catalog"><div class="section-heading"><h2>The collection</h2><span>''' + f"{len(catalog):02d} skill{'s' if len(catalog) != 1 else ''} / more to come" + '''</span></div><div class="card-grid">''' + "".join(cards) + '''</div></section><section class="how-strip"><span class="eyebrow">FROM DOWNLOAD TO DONE</span><div><h3>01 / Pick your workflow</h3><p>Read what it does and check the requirements.</p></div><div><h3>02 / Add the skill</h3><p>Download the package or copy its folder into Claude Code.</p></div><div><h3>03 / Start making</h3><p>Ask Claude to run the workflow in your project.</p></div></section>'''
    (OUT / "index.html").write_text(page("Clipwing Skills — Less setup. More making.", "Discover and download reusable Clipwing skills for creative workflows. Start with HyperFrames to After Effects.", "/", "catalog.png", home))
    (OUT / "404.html").write_text(page("Page not found | Clipwing Skills", "Find your next workflow in the Clipwing skill catalog.", "/404.html", "catalog.png", '<section class="catalog-hero"><span class="eyebrow">404</span><h1>This page flew away.</h1><p><a class="button" href="/skills/">Back to the catalog →</a></p></section>'))
    urls = [BASE + "/"] + [BASE + f"/{item['slug']}/" for item in catalog]
    (OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + ''.join(f"<url><loc>{url}</loc></url>" for url in urls) + '</urlset>')
    print(f"Built {len(catalog)} skill page(s), catalog, social assets and packages in {OUT}")


if __name__ == "__main__":
    build()
