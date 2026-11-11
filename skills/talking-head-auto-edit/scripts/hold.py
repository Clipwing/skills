#!/usr/bin/env python3
"""Give every section title a moment on screen: a short pause in the voice right after the presenter says the title.

    python scripts/hold.py --work work --plan work/edit.json            # apply (once; it refuses to stack)
    python scripts/hold.py --work work --plan work/edit.json --dry      # print the pauses only
    python scripts/hold.py --work work --plan work/edit.json --undo     # take them out again

A `title` card goes up when the presenter announces a section. Without a pause the voice runs on into the section
while the viewer is still reading the card. This script finds, for every `title` beat, the end of the spoken title,
works out how long the card needs to be readable (typed + a short read, at least --air after the last title word), and
inserts the missing time as silence right after that word: in voice.wav, frames/ and matte/ (the frame repeats; it is
behind the card), words.json, track.json and info.json. Every plan time after the pause moves by the same amount and
the title ends when the voice starts again. The card never hangs into the next sentence.

The pauses are recorded in work/holds.json, so --undo can take them out and a second run does not add them twice.
Run it after the plan is written (step 2) and before rendering; re-run `check_plan.py` after it.
"""
import argparse, json, re, shutil, sys, wave
from pathlib import Path

SHIFT_KEYS = {"start", "end", "at", "t"}


def norm(w):
    return re.sub(r"[^a-z0-9']", "", str(w).lower())


def title_end(words, b):
    """End time of the last spoken word of the title (matched in order), else of the last word said during the card."""
    want = [norm(x) for x in str(b.get("text", "")).split() if norm(x)]
    pool = [w for w in words if b["start"] - 1.0 <= w["s"] <= b["end"] + 1.0]
    j, last, hits = 0, None, 0
    for x in want:
        for k in range(j, len(pool)):
            if norm(pool[k]["w"]) == x:
                last, j, hits = pool[k], k + 1, hits + 1
                break
    if last is None or hits < len(want) * .6:   # the card words are not what was said: use the speech under the card
        said = [w for w in words if w["s"] < b["end"]]
        last = said[-1] if said else None
    return last


def shift(obj, at, d):
    """Move every time >= at by d (plan keys start/end/at/t)."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in SHIFT_KEYS and isinstance(v, (int, float)) and not isinstance(v, bool):
                if v >= at - 1e-6:
                    obj[k] = round(v + d, 3)
            else:
                shift(v, at, d)
    elif isinstance(obj, list):
        for x in obj:
            shift(x, at, d)


def plan_holds(plan, words, air, read, cps_default, max_hold):
    holds = []
    for b in plan.get("beats", []):
        if b.get("type") != "title":
            continue
        last = title_end(words, b)
        if not last:
            continue
        e = last["e"]
        nxt = next((w for w in words if w["s"] >= e - 1e-3 and w is not last), None)
        if not nxt:
            continue
        text = str(b.get("text", ""))
        readable = max(e + air, b["start"] + .14 + len(text) / (b.get("cps") or cps_default) + read)
        d = round(min(max_hold, readable - nxt["s"]), 2)
        if d >= .1:
            holds.append({"at": round(e + min(.08, (nxt["s"] - e) / 2), 3), "d": d, "title": text, "resume": nxt["s"]})
    return sorted(holds, key=lambda h: h["at"])


# ---------------------------------------------------------------- media edits (one pause at a time, latest first)

def frame_files(folder):
    return sorted(folder.glob("*.jpg")) if folder.is_dir() else []


def insert_frames(folder, at_frame, n):
    """frames are 000001.jpg = t 0: frame index i (1-based) shows t = (i-1)/fps. Repeat frame at_frame n times."""
    files = frame_files(folder)
    if not files:
        return
    last = len(files)
    for i in range(last, at_frame, -1):                       # rename from the end so nothing is overwritten
        (folder / f"{i:06d}.jpg").rename(folder / f"{i + n:06d}.jpg")
    src = folder / f"{at_frame:06d}.jpg"
    for k in range(1, n + 1):
        shutil.copyfile(src, folder / f"{at_frame + k:06d}.jpg")


def remove_frames(folder, at_frame, n):
    files = frame_files(folder)
    if not files:
        return
    last = len(files)
    for i in range(at_frame + n + 1, last + 1):
        (folder / f"{i:06d}.jpg").replace(folder / f"{i - n:06d}.jpg")
    # the last n names are now duplicates of earlier files: park them (deleting may not be allowed everywhere)
    park = folder.parent / (folder.name + ".unhold")
    park.mkdir(exist_ok=True)
    for i in range(last - n + 1, last + 1):
        p = folder / f"{i:06d}.jpg"
        if p.exists():
            p.replace(park / p.name)


def edit_wav(path, at, d, insert=True):
    with wave.open(str(path), "rb") as r:
        params, data = r.getparams(), r.readframes(r.getnframes())
    bpf = params.sampwidth * params.nchannels
    pos = int(round(at * params.framerate)) * bpf
    n = int(round(d * params.framerate)) * bpf
    data = data[:pos] + bytes(n) + data[pos:] if insert else data[:pos] + data[pos + n:]
    with wave.open(str(path), "wb") as w:
        w.setparams(params)
        w.writeframes(data)


def edit_track(path, at_frame, n, insert=True):
    if not path.exists():
        return
    tr = json.loads(path.read_text())
    for k in ("x", "y", "top"):
        if isinstance(tr.get(k), list) and tr[k]:
            a = tr[k]
            i = min(max(at_frame - 1, 0), len(a) - 1)
            tr[k] = a[:i + 1] + [a[i]] * n + a[i + 1:] if insert else a[:i + 1] + a[i + 1 + n:]
    path.write_text(json.dumps(tr))


def apply(work, plan_path, plan, holds, undo=False):
    info = json.loads((work / "info.json").read_text())
    fps = info["fps"]
    words = json.loads((work / "words.json").read_text())
    # times in holds are on the timeline without pauses: insert the latest first, remove the earliest first
    for h in (holds if undo else reversed(holds)):
        at, d = h["at"], h["d"]
        n = int(round(d * fps))
        at_frame = int(at * fps) + 1
        for folder in ("frames", "matte"):
            (remove_frames if undo else insert_frames)(work / folder, at_frame, n)
        if (work / "voice.wav").exists():
            edit_wav(work / "voice.wav", at, d, insert=not undo)
        edit_track(work / "track.json", at_frame, n, insert=not undo)
        sign = -1 if undo else 1
        for w in words:
            for k in ("s", "e"):
                if w[k] >= at + (d if undo else 0) - 1e-6:
                    w[k] = round(w[k] + sign * d, 3)
        if undo:
            shift(plan, at + d, -d)
        else:
            shift(plan, at, d)
        info["frames"] += sign * n
        info["duration"] = round(info["frames"] / fps, 3)
    if not undo:   # the title ends when the voice starts again
        for b in plan.get("beats", []):
            for h in holds:
                if b.get("type") == "title" and b.get("text") == h["title"]:
                    b["end"] = round(h["resume_out"], 3)
    (work / "words.json").write_text(json.dumps(words, ensure_ascii=False, indent=0))
    (work / "info.json").write_text(json.dumps(info, indent=1))
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", default="work"); ap.add_argument("--plan", required=True)
    ap.add_argument("--air", type=float, default=.8, help="least time the card stays after the last title word (s)")
    ap.add_argument("--read", type=float, default=1.0, help="time to read the title once it is typed (s)")
    ap.add_argument("--max", type=float, default=1.6, help="longest pause inserted (s)")
    ap.add_argument("--dry", action="store_true"); ap.add_argument("--undo", action="store_true")
    a = ap.parse_args()
    work, plan_path = Path(a.work), Path(a.plan)
    plan = json.loads(plan_path.read_text())
    record = work / "holds.json"
    if a.undo:
        if not record.exists():
            sys.exit("no holds.json: nothing to undo")
        holds = json.loads(record.read_text())["holds"]
        apply(work, plan_path, plan, holds, undo=True)
        record.rename(work / "holds.undone.json")
        print(f"[hold] removed {len(holds)} pauses")
        return
    if record.exists():
        sys.exit("pauses are already in (holds.json). Run --undo first to plan them again")
    words = json.loads((work / "words.json").read_text())
    holds = plan_holds(plan, words, a.air, a.read, 30, a.max)
    fps = json.loads((work / "info.json").read_text())["fps"]
    total = 0.0
    for h in holds:
        h["d"] = round(round(h["d"] * fps) / fps, 4)            # whole frames: picture and sound stay in sync   # where each title's voice resumes on the new timeline
        h["resume_out"] = round(h["resume"] + total + h["d"], 3)
        total += h["d"]
        print(f"[hold] {h['at']:7.2f} s  +{h['d']:.2f} s  after \"{h['title']}\"")
    print(f"[hold] {len(holds)} pauses, {total:.1f} s in all")
    if a.dry or not holds:
        return
    apply(work, plan_path, plan, holds)
    record.write_text(json.dumps({"holds": holds}, indent=1))
    print(f"[hold] done: words, voice, frames, matte, track, info and {plan_path.name} moved. Re-run check_plan.py")


if __name__ == "__main__":
    main()
