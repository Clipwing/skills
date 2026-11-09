#!/usr/bin/env python3
"""Free stock photos and clips for `photo` / `video` beats, from APIs that need no key.

    python scripts/fetch_stock.py --plan work/edit.json            # candidates for every beat with a "query"
    python scripts/fetch_stock.py --plan work/edit.json --credits  # work/credits.txt for the files the plan uses

Photos come from Openverse (CC0, public domain, CC BY, CC BY-SA; commercial use allowed) or Wikimedia Commons, clips
from Wikimedia Commons (free licences). For each beat with a `query` (or a list of `queries`, one per print) and no `src`, up to --n candidates land in work/stock/<beat>/ with a
contact sheet (left to right, top to bottom: c1, c2, ...) work/stock/<beat>/sheet.jpg. Look at the sheets, then set the beat's `src` (or `srcs`) to the
chosen file, e.g. "stock/b07/c2.jpg" (paths are relative to the plan). A clip becomes an image sequence
(stock/b07/v1/00001.jpg ... + seq.json) of --clip seconds from its middle (or from the beat's `offset`).
Every candidate's author, licence and page are kept in work/stock/credits.json; --credits writes the lines to put in
the video description (CC BY / BY-SA require them).
"""
import argparse, json, re, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

UA = {"User-Agent": "heygen-auto-edit/1.0 (video editing skill)"}


def get_json(url, tries=3):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.loads(r.read().decode())
        except Exception:
            if k == tries - 1: raise
            time.sleep(3 * (k + 1))


def download(url, dest):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r, open(dest, "wb") as f:
        while True:
            b = r.read(1 << 16)
            if not b: break
            f.write(b)


def openverse(q, n):
    url = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode({"q": q, "page_size": 20, "license_type": "commercial"})   # 20 = the anonymous limit
    out = []
    for r in get_json(url).get("results", []):
        if (r.get("width") or 0) < 1400 or r.get("license") not in ("cc0", "pdm", "by", "by-sa"):
            continue
        out.append({"url": r["url"], "title": r.get("title") or "", "author": r.get("creator") or "unknown", "license": f"CC {r['license'].upper()} {r.get('license_version') or ''}".strip().replace("CC PDM", "Public domain").replace("CC CC0", "CC0"),
                    "page": r.get("foreign_landing_url") or r["url"], "w": r.get("width"), "h": r.get("height")})
        if len(out) >= n: break
    return out


def commons_images(q, n):
    """Wikimedia Commons photos (the fallback when Openverse is down or finds nothing)."""
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrsearch": f"{q} filetype:bitmap", "gsrlimit": 40,
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 2400, "iiextmetadatafilter": "Artist|LicenseShortName"})
    pages = sorted(get_json(url).get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    out = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        if (ii.get("width") or 0) < 1600 or ii.get("mime") not in ("image/jpeg", "image/png"):
            continue
        md = ii.get("extmetadata", {})
        out.append({"url": ii.get("thumburl") or ii["url"], "title": p["title"], "author": re.sub("<[^>]+>", "", md.get("Artist", {}).get("value", "unknown")).strip(),
                    "license": md.get("LicenseShortName", {}).get("value", ""), "page": ii.get("descriptionurl", ""), "w": ii.get("width"), "h": ii.get("height")})
        if len(out) >= n: break
    return out


def photos(q, n):
    try:
        found = openverse(q, n)
    except Exception as e:
        print(f"[stock] Openverse: {e}; trying Wikimedia Commons"); found = []
    return found if len(found) >= 3 else found + commons_images(q, n - len(found))


def commons_videos(q, n):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrsearch": f"{q} filetype:video", "gsrlimit": 40,
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiextmetadatafilter": "Artist|LicenseShortName"})
    pages = sorted(get_json(url).get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    out = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        dur = ii.get("duration") or 0
        if (ii.get("width") or 0) < 960 or not (3 <= dur <= 900):
            continue
        md = ii.get("extmetadata", {})
        out.append({"url": ii["url"], "title": p["title"], "author": re.sub("<[^>]+>", "", md.get("Artist", {}).get("value", "unknown")).strip(),
                    "license": md.get("LicenseShortName", {}).get("value", ""), "page": ii.get("descriptionurl", ""), "w": ii.get("width"), "h": ii.get("height"), "duration": dur})
        if len(out) >= n: break
    return out


def sheet(files, dest):
    """Contact sheet of the candidates, 3 per row, in order c1, c2, ... (ffmpeg only)."""
    if not files: return
    inputs, filt = [], []
    for i, f in enumerate(files):
        inputs += ["-i", str(f)]
        filt.append(f"[{i}:v]scale=480:270:force_original_aspect_ratio=increase,crop=480:270,pad=484:274:2:2:black[v{i}]")
    cols = min(3, len(files)); rows = (len(files) + cols - 1) // cols
    layout = "|".join(f"{(i % cols) * 484}_{(i // cols) * 274}" for i in range(len(files)))
    graph = ";".join(filt) + ";" + "".join(f"[v{i}]" for i in range(len(files))) + (f"xstack=inputs={len(files)}:layout={layout}:fill=black" if len(files) > 1 else "copy")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", graph, "-frames:v", "1", str(dest)], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True)
    ap.add_argument("--n", type=int, default=6)
    ap.add_argument("--clip", type=float, default=6.0, help="seconds of each clip kept as frames")
    ap.add_argument("--fps", type=float, default=25)
    ap.add_argument("--credits", action="store_true")
    ap.add_argument("--again", action="store_true", help="search again for beats that already have candidates")
    a = ap.parse_args()
    plan_path = Path(a.plan); plan = json.loads(plan_path.read_text()); base = plan_path.parent
    stock = base / "stock"; stock.mkdir(exist_ok=True)
    cred_path = stock / "credits.json"; credits = json.loads(cred_path.read_text()) if cred_path.exists() else {}

    if a.credits:
        used = set()
        for b in plan.get("beats", []):
            for s in [b.get("src"), *(b.get("srcs") or [])]:
                if s: used.add(s.rstrip("/"))
        lines = [f"- \"{c['title']}\" by {c['author']}, {c['license']}, {c['page']}" for k, c in credits.items() if k in used and c.get("license") not in ("CC0", "Public domain")]
        (base / "credits.txt").write_text(("Stock footage and photos:\n" + "\n".join(lines) + "\n") if lines else "")
        print(f"[stock] {len(lines)} credit line(s) in {base / 'credits.txt'}"); return

    jobs = []
    for i, b in enumerate(plan.get("beats", [])):
        if b.get("type") not in ("photo", "video") or b.get("src") or b.get("srcs"):
            continue
        qs = b.get("queries") or ([b["query"]] if b.get("query") else [])
        jobs += [(f"b{i:02d}" + (f"-{j + 1}" if len(qs) > 1 else ""), b, q) for j, q in enumerate(qs)]
    for tag, b, q in jobs:
        d = stock / tag; d.mkdir(exist_ok=True)
        if (d / "sheet.jpg").exists() and not a.again:
            print(f"[stock] {tag}: candidates already there ({d / 'sheet.jpg'})"); continue
        try:
            found = photos(q, a.n) if b["type"] == "photo" else commons_videos(q, a.n)
        except Exception as e:
            print(f"[stock] {tag} \"{q}\": search failed ({e})"); continue
        files = []
        for j, c in enumerate(found, 1):
            try:
                if b["type"] == "photo":
                    raw = d / f"raw{j}"; download(c["url"], raw); f = d / f"c{j}.jpg"
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-vf", "scale='min(2400,iw)':-2", "-frames:v", "1", "-update", "1", "-q:v", "3", str(f)], check=True); raw.unlink()
                    credits[f"stock/{tag}/c{j}.jpg"] = c; files.append(f)
                else:
                    raw = d / f"raw{j}"; download(c["url"], raw); v = d / f"v{j}"; v.mkdir(exist_ok=True)
                    start = b.get("offset", max(0, c["duration"] / 2 - a.clip / 2))
                    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-i", str(raw), "-t", str(a.clip), "-vf", f"fps={a.fps},scale=1920:-2", "-q:v", "3", str(v / "%05d.jpg")], check=True); raw.unlink()
                    n = len(list(v.glob("*.jpg"))); (v / "seq.json").write_text(json.dumps({"n": n, "fps": a.fps}))
                    credits[f"stock/{tag}/v{j}"] = c; files.append(v / f"{max(1, n // 2):05d}.jpg")
            except Exception as e:
                print(f"[stock] {tag} candidate {j}: {e}")
        cred_path.write_text(json.dumps(credits, indent=1))
        if files:
            sheet(files, d / "sheet.jpg")
        print(f"[stock] {tag} {b['type']} \"{q}\": {len(files)} candidate(s) -> {d / 'sheet.jpg' if files else 'none'}")


if __name__ == "__main__":
    main()
