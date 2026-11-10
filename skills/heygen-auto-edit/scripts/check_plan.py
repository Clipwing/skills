#!/usr/bin/env python3
"""Check an edit plan against the pacing and layout rules before rendering.

    python scripts/check_plan.py work/edit.json [--work work]

Prints ERROR lines (the render would look broken) and WARN lines (the edit breaks a style rule), then a one-line
summary: how often something changes on screen. Exit code 1 when there is an ERROR.
"""
import argparse, json, sys
from pathlib import Path

FULL = {"title", "list", "compare", "search", "stat", "mindmap", "quote", "image", "bars", "donut", "table", "roadmap", "photo", "video", "split", "post", "phone", "endscreen"}
OVER = {"words", "callout", "subscribe"}
TRANS = {"cut", "whip", "zoom", "leak", "flash", "fade", "slide", "push3d"}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("plan"); ap.add_argument("--work")
    a = ap.parse_args()
    plan_path = Path(a.plan); plan = json.loads(plan_path.read_text())
    work = Path(a.work) if a.work else plan_path.parent
    info = json.loads((work / "info.json").read_text()) if (work / "info.json").exists() else {}
    words = json.loads((work / "words.json").read_text()) if (work / "words.json").exists() else []
    dur = plan.get("duration") or info.get("duration") or 0
    errs, warns = [], []
    E, Wn = errs.append, warns.append

    beats = sorted(plan.get("beats", []), key=lambda b: b.get("start", 0))
    for i, b in enumerate(beats):
        tag = f"beat {i} {b.get('type')} {b.get('start')}-{b.get('end')}"
        if b.get("type") not in FULL | OVER: E(f"{tag}: unknown type"); continue
        if not (0 <= b.get("start", -1) < b.get("end", -1)): E(f"{tag}: start/end"); continue
        if dur and b["end"] > dur + .05: E(f"{tag}: ends after the film ({dur:.2f} s)")
        for k in ("in", "out"):
            if b.get(k) and b[k] not in TRANS: E(f"{tag}: {k} '{b[k]}' unknown ({', '.join(sorted(TRANS))})")
        L = b["end"] - b["start"]
        if b["type"] in FULL and L < 1.2: Wn(f"{tag}: {L:.1f} s is too short to read")
        if b["type"] in FULL and b["type"] != "endscreen" and L > 9: Wn(f"{tag}: {L:.1f} s on one card: split it or cut back to the presenter")
        for src in [b.get("src"), *(b.get("srcs") or [])]:
            if b["type"] in ("image", "photo") and src and not (plan_path.parent / src).is_file(): E(f"{tag}: image {src} not next to the plan")
            if b["type"] == "video" and src and not (plan_path.parent / src / "seq.json").is_file(): E(f"{tag}: clip {src}/seq.json not next to the plan (fetch_stock.py)")
        if b["type"] in ("photo", "video") and not (b.get("src") or b.get("srcs")): E(f"{tag}: no src yet: run fetch_stock.py and pick a candidate")
        if b["type"] == "words":
            for it in b.get("items") or []:
                if len(str(it.get("text", "")).split("\n")[0].split()) > 3: Wn(f"{tag}: word '{it.get('text')}' is long for a 3D word (> 3 words)")
        items = b.get("items") or b.get("nodes") or []
        for c in ("left", "right"):
            items = items + ((b.get(c) or {}).get("items") or [])
        for it in items:
            at = it.get("at")
            if at is not None and not (b["start"] - .05 <= at <= b["end"]): Wn(f"{tag}: item '{it.get('text')}' at {at} outside the beat")
            if len(str(it.get("text", "")).split()) > 7: Wn(f"{tag}: item '{it.get('text')}' is long (> 7 words)")
        for f in ("title", "text"):
            if b["type"] != "quote" and len(str(b.get(f, "")).split()) > 9: Wn(f"{tag}: {f} is long (> 9 words)")
    fulls = [b for b in beats if b.get("type") in FULL]
    for x, y in zip(fulls, fulls[1:]):
        if y["start"] < x["end"] - .01: E(f"full-screen beats overlap: {x['type']}@{x['start']} and {y['type']}@{y['start']}")
        elif 0.05 < y["start"] - x["end"] < 1.6: Wn(f"presenter for only {y['start'] - x['end']:.1f} s between {x['type']}@{x['start']} and {y['type']}@{y['start']}: the engine joins the two cards")
    chain = fulls[:1]
    for y in fulls[1:] + [None]:
        if y and y["start"] - chain[-1]["end"] < 1.6: chain.append(y); continue
        if chain and chain[-1]["end"] - chain[0]["start"] > 14: Wn(f"{chain[-1]['end'] - chain[0]['start']:.0f} s of cards without the presenter from {chain[0]['start']:.0f} s: give the viewer the face back")
        chain = [y] if y else []
    for o in (b for b in beats if b.get("type") in OVER and b.get("type") != "subscribe"):
        for f in fulls:
            if o["start"] < f["end"] - .05 and f["start"] < o["end"] - .05: Wn(f"{o['type']}@{o['start']} is hidden under {f['type']}@{f['start']}")

    talk = sorted(plan.get("talk", []), key=lambda k: k["t"])
    for x, y in zip(talk, talk[1:]):
        if abs(x.get("zoom", 1) - y.get("zoom", 1)) < .08: Wn(f"talk {x['t']} -> {y['t']}: zoom {x.get('zoom', 1)} -> {y.get('zoom', 1)} differs too little (reads as a jump)")
    starts = [w["s"] for w in words]
    for k in talk:
        if k.get("zoom", 1) > 1.24: Wn(f"talk {k['t']}: zoom {k['zoom']} is a tight face crop: the engine caps it at 1.24")
        inside = [w for w in words if w["s"] + .06 < k["t"] < w["e"] - .06]
        if inside: Wn(f"talk cut at {k['t']} falls inside the word '{inside[0]['w']}' ({inside[0]['s']}-{inside[0]['e']})")

    # how long the screen stays the same
    events = sorted({0.0, dur} | {k["t"] for k in talk} | {b["start"] for b in beats} | {b["end"] for b in beats if b.get("type") in FULL}
                    | {it["at"] for b in beats for it in (b.get("items") or []) if it.get("at") is not None})
    gaps = [(b - a, a) for a, b in zip(events, events[1:]) if b > a]
    long = [(g, a) for g, a in gaps if g > 6.5]
    for g, a in long: Wn(f"{g:.1f} s without any change from {a:.1f} s")
    for m in errs: print("ERROR", m)
    for m in warns: print("WARN ", m)
    n_full = len(fulls)
    print(f"{len(events) - 2} changes in {dur:.0f} s (one every {dur / max(1, len(events) - 1):.1f} s), "
          f"{n_full} full-screen beats (one every {dur / max(1, n_full):.0f} s), {len(talk)} framings")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
