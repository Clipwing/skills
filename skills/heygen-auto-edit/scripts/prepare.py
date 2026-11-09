#!/usr/bin/env python3
"""Prepare a HeyGen (or any talking-head) take for editing.

    python scripts/prepare.py TAKE.mp4 --out work [--vtt subs.vtt | --words words.json] [--model small.en]
                              [--max-pause 0.35] [--no-cut] [--from S --to E]

Writes into --out:
  words.json       every spoken word with its time on the EDITED timeline: [{"w","s","e"}]
  transcript.txt   the text in sentences with times, for writing the edit plan
  cut.json         which ranges of the take were kept (take time) and the edited duration
  base.mp4         (--base) the take with long pauses removed, to watch the cut
  voice.wav        its sound (48 kHz stereo), what mix.py puts under the music
  frames/          every frame of base.mp4 as JPEG (000001.jpg = t 0), what the renderer draws
  face.json        where the face is (0..1 of the frame): {"cx","cy","w","h"}; the camera centres on it
  info.json        size, fps, durations

Word times come from, in order: --words (a JSON list of {w,s,e} in take time), --vtt (YouTube-style VTT with
<00:00:01.200><c> word</c> timings), or faster-whisper (pip install faster-whisper; downloads the model once).
"""
import argparse, json, math, os, re, shutil, subprocess, sys, time
from pathlib import Path


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        sys.exit(f"command failed: {' '.join(map(str, cmd))}\n{r.stderr[-2000:]}")
    return r.stdout


def probe(path):
    j = json.loads(run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)]))
    v = next(s for s in j["streams"] if s["codec_type"] == "video")
    num, den = (v.get("avg_frame_rate") or v.get("r_frame_rate") or "30/1").split("/")
    fps = float(num) / float(den or 1) if float(num) else 30.0
    has_audio = any(s["codec_type"] == "audio" for s in j["streams"])
    return {"width": int(v["width"]), "height": int(v["height"]), "fps": fps,
            "duration": float(j["format"]["duration"]), "audio": has_audio}


# ---------------------------------------------------------------- words

def ts(s):
    h, m, rest = s.split(":")
    return int(h) * 3600 + int(m) * 60 + float(rest)


def words_from_vtt(path):
    """YouTube auto-captions: each cue has '<time><c> word</c>' runs; the first word starts at the cue start."""
    words, seen = [], set()
    text = Path(path).read_text(encoding="utf-8")
    for block in text.split("\n\n"):
        lines = block.strip().splitlines()
        if not lines or "-->" not in lines[0]:
            continue
        start, end = [ts(x.strip().split(" ")[0]) for x in lines[0].split("-->")]
        body = " ".join(l for l in lines[1:] if "<c>" in l or re.search(r"<\d\d:", l))
        if not body:
            continue
        parts = re.split(r"<(\d\d:\d\d:\d\d\.\d+)>", body)
        cur_t = start
        for i, p in enumerate(parts):
            if i % 2 == 1:
                cur_t = ts(p)
                continue
            w = re.sub(r"</?c>", "", p).strip()
            if not w:
                continue
            key = (round(cur_t, 2), w)
            if key in seen:
                continue
            seen.add(key)
            words.append({"w": w, "s": cur_t})
    words.sort(key=lambda x: x["s"])
    for i, w in enumerate(words):   # VTT gives starts only: a word lasts until the next one, at most 0.8 s
        nxt = words[i + 1]["s"] if i + 1 < len(words) else w["s"] + 0.5
        w["e"] = round(min(nxt, w["s"] + 0.8), 3)
        w["s"] = round(w["s"], 3)
    return words


def words_from_whisper(path, model_name):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("no word timings: pass --vtt/--words, or `pip install faster-whisper` for transcription")
    import numpy as np
    # decode with ffmpeg ourselves: faster-whisper's own decoder (PyAV) breaks between versions
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    audio = np.frombuffer(pcm, dtype=np.float32)
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio, word_timestamps=True, vad_filter=True, beam_size=5)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)})
    print(f"[prepare] whisper {model_name}: {len(words)} words, language {info.language}")
    return words


# ---------------------------------------------------------------- pauses

def keep_ranges(words, duration, max_pause, pad):
    """Speech islands: words closer than max_pause stay together; each island gets `pad` of air on both sides."""
    if not words:
        return [[0.0, duration]]
    ranges, s, e = [], words[0]["s"], words[0]["e"]
    for w in words[1:]:
        if w["s"] - e > max_pause:
            ranges.append([s, e]); s = w["s"]
        e = max(e, w["e"])
    ranges.append([s, e])
    out = []
    for a, b in ranges:
        a, b = max(0.0, a - pad), min(duration, b + pad)
        if out and a <= out[-1][1] + 0.02:
            out[-1][1] = b
        else:
            out.append([a, b])
    return [[round(a, 3), round(b, 3)] for a, b in out]


def remap(t, ranges):
    acc = 0.0
    for a, b in ranges:
        if t < a:
            return acc
        if t <= b:
            return acc + (t - a)
        acc += b - a
    return acc


def cut_take(src, ranges, out, fps, info, jpeg_q, base=False):
    """One decode of the take: trim + concat (12 ms audio fades at every join, no clicks), written straight to
    frames/%06d.jpg at a constant frame rate and voice.wav; base.mp4 (a watchable cut) only when asked."""
    n = len(ranges)
    parts, labels = [], []
    for i, (a, b) in enumerate(ranges):
        d = b - a
        parts.append(f"[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{i}]")
        if info["audio"]:
            parts.append(f"[0:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,"
                         f"afade=t=in:d=0.012,afade=t=out:st={max(0, d - 0.012):.3f}:d=0.012[a{i}]")
            labels.append(f"[v{i}][a{i}]")
        else:
            labels.append(f"[v{i}]")
    parts.append("".join(labels) + f"concat=n={n}:v=1:a={1 if info['audio'] else 0}" + ("[vc][ac]" if info["audio"] else "[vc]"))
    # the colour grade is baked in here once (cheaper than a canvas filter on every rendered frame)
    parts.append(f"[vc]fps={fps},eq=contrast=1.06:saturation=1.08:brightness=0.004" + (",split=2[v][vb]" if base else "[v]"))
    if info["audio"]:
        parts.append("[ac]aresample=48000,aformat=channel_layouts=stereo" + (",asplit=2[a][ab]" if base else "[a]"))
    graph = ";\n".join(parts)
    frames = out / "frames"
    shutil.rmtree(frames, ignore_errors=True); frames.mkdir()
    # inline graph: -filter_complex_script is gone in ffmpeg 8 and the file form (-/filter_complex) is missing in 6
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter_complex", graph,
           "-map", "[v]", "-q:v", str(jpeg_q), str(frames / "%06d.jpg")]
    if info["audio"]:
        cmd += ["-map", "[a]", "-c:a", "pcm_s16le", str(out / "voice.wav")]
    if base:
        cmd += ["-map", "[vb]"] + (["-map", "[ab]", "-c:a", "aac", "-b:a", "192k"] if info["audio"] else []) + \
               ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", str(out / "base.mp4")]
    run(cmd)
    info["graded"] = True
    return len(list(frames.glob("*.jpg")))


# ---------------------------------------------------------------- face

def find_face(frames_dir, n_frames):
    try:
        import cv2
    except ImportError:
        print("[prepare] no opencv: face box guessed (centre, upper third); pip install opencv-python-headless")
        return None
    try:
        casc = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
    except AttributeError:
        print("[prepare] this OpenCV has no Haar cascades (OpenCV 5): face box guessed; pass --face CX,CY if it is off")
        return None
    boxes = []
    for k in range(12):
        idx = 1 + int((n_frames - 1) * (k + 0.5) / 12)
        img = cv2.imread(str(frames_dir / f"{idx:06d}.jpg"))
        if img is None:
            continue
        h, w = img.shape[:2]
        small = cv2.resize(img, (w // 2, h // 2))
        faces = casc.detectMultiScale(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), 1.1, 6, minSize=(h // 16, h // 16))
        if len(faces):
            x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            boxes.append(((x + fw / 2) * 2 / w, (y + fh / 2) * 2 / h, fw * 2 / w, fh * 2 / h))
    if not boxes:
        return None
    med = lambda i: sorted(b[i] for b in boxes)[len(boxes) // 2]
    return {"cx": round(med(0), 4), "cy": round(med(1), 4), "w": round(med(2), 4), "h": round(med(3), 4), "found": len(boxes)}


# ---------------------------------------------------------------- transcript

def sentences(words):
    out, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.!?]$", w["w"]) or (len(cur) > 22 and re.search(r"[,;:]$", w["w"])):
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    return [(c[0]["s"], c[-1]["e"], " ".join(x["w"] for x in c)) for c in out]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("take")
    ap.add_argument("--out", default="work")
    ap.add_argument("--vtt"); ap.add_argument("--words")
    ap.add_argument("--model", default="small.en", help="faster-whisper model (small.en, medium.en, large-v3 for non-English)")
    ap.add_argument("--max-pause", type=float, default=0.35, help="pauses longer than this are cut (s)")
    ap.add_argument("--pad", type=float, default=0.12, help="air kept around speech at each cut (s)")
    ap.add_argument("--no-cut", action="store_true", help="keep the take whole (only trim the head and tail)")
    ap.add_argument("--from", dest="t0", type=float, default=0.0); ap.add_argument("--to", dest="t1", type=float)
    ap.add_argument("--fps", type=float, help="output frame rate (default: the take's, at most 30)")
    ap.add_argument("--jpeg-q", type=int, default=3, help="ffmpeg -q:v for frames (2 best .. 5 smaller)")
    ap.add_argument("--face", help="CX,CY of the face in the take (0..1), when detection is off or unavailable")
    ap.add_argument("--base", action="store_true", help="also write base.mp4, the take with the pauses cut")
    a = ap.parse_args()

    src, out = Path(a.take).resolve(), Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    info = probe(src)
    fps = a.fps or min(30.0, round(info["fps"]))
    t1 = min(a.t1 or info["duration"], info["duration"])

    clock = time.monotonic(); timing = {}
    def lap(name):
        nonlocal clock
        now = time.monotonic(); timing[name] = round(now - clock, 1); clock = now
    raw = out / "words.raw.json"
    if a.words:
        words = json.loads(Path(a.words).read_text())
    elif a.vtt:
        words = words_from_vtt(a.vtt)
    elif raw.exists() and json.loads(raw.read_text()).get("take") == str(src):
        words = json.loads(raw.read_text())["words"]; print("[prepare] word timings reused from words.raw.json")
    else:
        words = words_from_whisper(src, a.model)
        raw.write_text(json.dumps({"take": str(src), "words": words}, ensure_ascii=False))
    lap("words")
    words = [w for w in words if a.t0 <= w["s"] < t1 and w["w"].strip()]
    if not words:
        sys.exit("no words found in the take")
    print(f"[prepare] {len(words)} words, take {info['width']}x{info['height']} {info['fps']:.2f} fps {info['duration']:.1f} s")

    if a.no_cut:
        ranges = [[max(a.t0, words[0]["s"] - a.pad), min(t1, words[-1]["e"] + a.pad)]]
    else:
        ranges = keep_ranges(words, t1, a.max_pause, a.pad)
        ranges = [[max(r[0], a.t0), min(r[1], t1)] for r in ranges if r[1] > a.t0 and r[0] < t1]
    kept = sum(b - a_ for a_, b in ranges)
    print(f"[prepare] {len(ranges)} ranges kept, {kept:.1f} s of {t1 - a.t0:.1f} s ({t1 - a.t0 - kept:.1f} s of pauses cut)")

    n_frames = cut_take(src, ranges, out, fps, info, a.jpeg_q, a.base)
    lap("cut + frames")
    edited = [{"w": w["w"], "s": round(remap(w["s"], ranges), 3), "e": round(remap(w["e"], ranges), 3)} for w in words]
    (out / "words.json").write_text(json.dumps(edited, ensure_ascii=False, indent=0))
    (out / "cut.json").write_text(json.dumps({"source": str(src), "ranges": ranges, "duration": round(kept, 3)}, indent=1))
    with open(out / "transcript.txt", "w") as f:
        for s, e, text in sentences(edited):
            f.write(f"[{s:7.2f} - {e:7.2f}] {text}\n")

    frames = out / "frames"
    if a.face:
        cx, cy = (float(x) for x in a.face.split(","))
        face = {"cx": cx, "cy": cy, "w": 0.12, "h": 0.2, "found": "given"}
    else:
        face = find_face(frames, n_frames) or {"cx": 0.5, "cy": 0.38, "w": 0.18, "h": 0.32, "found": 0}
    lap("face")
    (out / "face.json").write_text(json.dumps(face, indent=1))
    (out / "info.json").write_text(json.dumps({"width": info["width"], "height": info["height"], "fps": fps,
                                               "frames": n_frames, "duration": round(n_frames / fps, 3),
                                               "take": str(src), "timing_s": timing}, indent=1))
    print(f"[prepare] {kept:.1f} s, {n_frames} frames, face {face}")
    print(f"[prepare] time: " + ", ".join(f"{k} {v} s" for k, v in timing.items()))
    print(f"[prepare] next: read {out / 'transcript.txt'} and write the edit plan (references/plan-format.md)")


if __name__ == "__main__":
    main()
