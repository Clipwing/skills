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
import argparse, array, json, math, re, shutil, sys, wave
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


class Voice:
    """Loudness of voice.wav in 10 ms steps: where the sound of a word really ends (word timings end early)."""
    def __init__(self, path):
        self.ok = path.exists()
        if not self.ok:
            return
        with wave.open(str(path), "rb") as r:
            sr, ch, sw, n = r.getframerate(), r.getnchannels(), r.getsampwidth(), r.getnframes()
            raw = r.readframes(n)
        a = array.array("h", raw) if sw == 2 else array.array("h")
        hop = sr // 100
        self.db = []
        for i in range(0, len(a) // ch - hop, hop):
            seg = a[i * ch:(i + hop) * ch:ch]
            rms = math.sqrt(sum(x * x for x in seg) / max(1, len(seg))) or 1e-9
            self.db.append(20 * math.log10(rms / 32768))
        loud = sorted(self.db)
        self.speech = loud[int(len(loud) * .8)] if loud else -20       # a typical level while speaking
        self.quiet = self.speech - 28                                  # below this the voice has stopped

    def level(self, t):
        i = int(t * 100)
        return self.db[i] if 0 <= i < len(self.db) else -120

    def sound_end(self, e, limit):
        """First moment after e (up to limit) where the voice stays quiet for 80 ms; else the quietest point."""
        if not self.ok:
            return e + .08
        i, stop, run = int(e * 100), int(limit * 100), 0
        best, best_db = i, 999
        while i < stop:
            d = self.level(i / 100)
            if d < best_db:
                best, best_db = i, d
            run = run + 1 if d < self.quiet else 0
            if run >= 8:
                return (i - 7) / 100
            i += 1
        return best / 100


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


def plan_holds(plan, words, air, read, cps_default, max_hold, voice):
    holds = []
    for b in plan.get("beats", []):
        if b.get("type") != "title":
            continue
        last = title_end(words, b)
        if not last:
            continue
        nxt = next((w for w in words if w["s"] > last["s"] + 1e-3), None)
        if not nxt:
            continue
        # where the title's last word really stops sounding (from the waveform, not the word timing)
        # (word timings run late or early by a few hundred ms: look up to half a second past the next word's timing)
        e = voice.sound_end(last["e"] - .05, max(last["e"], nxt["s"]) + .5)
        # the card goes up as the presenter starts saying the title, not before
        want = [norm(x) for x in str(b.get("text", "")).split() if norm(x)]
        first = next((w for w in words if b["start"] - 1.0 <= w["s"] <= last["s"] and want and norm(w["w"]) == want[0]), None)
        if first and abs(first["s"] - .1 - b["start"]) > .15:
            b["start"] = round(max(0.0, first["s"] - .1), 3)
        text = str(b.get("text", ""))
        readable = max(e + air, b["start"] + .14 + len(text) / (b.get("cps") or cps_default) + read)
        at = round(e + .05, 3)                          # in the silence, just after the sound has stopped
        d = round(min(max_hold, max(.35, readable - at)), 2)
        holds.append({"at": at, "d": d, "title": text, "resume": at, "level_db": round(voice.level(at), 1),
                      "quiet_db": round(voice.quiet, 1)})
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
    ap.add_argument("--air", type=float, default=.5, help="least time the card stays after the last title word (s)")
    ap.add_argument("--read", type=float, default=.6, help="time to read the title once it is typed (s)")
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
    voice = Voice(work / "voice.wav")
    holds = plan_holds(plan, words, a.air, a.read, 30, a.max, voice)
    fps = json.loads((work / "info.json").read_text())["fps"]
    total = 0.0
    for h in holds:
        h["d"] = round(round(h["d"] * fps) / fps, 4)            # whole frames: picture and sound stay in sync   # where each title's voice resumes on the new timeline
        h["resume_out"] = round(h["resume"] + total + h["d"], 3)
        total += h["d"]
        flag = "" if h["level_db"] <= h["quiet_db"] + 3 else "  CHECK: the voice is not quiet here"
        print(f"[hold] {h['at']:7.2f} s  +{h['d']:.2f} s  after \"{h['title']}\"  (level {h['level_db']} dB, quiet < {h['quiet_db']}){flag}")
    print(f"[hold] {len(holds)} pauses, {total:.1f} s in all")
    if a.dry or not holds:
        return
    apply(work, plan_path, plan, holds)
    record.write_text(json.dumps({"holds": holds}, indent=1))
    print(f"[hold] done: words, voice, frames, matte, track, info and {plan_path.name} moved. Re-run check_plan.py")


if __name__ == "__main__":
    main()
