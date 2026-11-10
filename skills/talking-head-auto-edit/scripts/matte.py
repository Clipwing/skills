#!/usr/bin/env python3
"""Person matte + head track for a prepared take (run after prepare.py).

    python scripts/matte.py --work work [--model ~/.cache/talking-head-auto-edit/rvm_mobilenetv3_fp32.onnx]

Robust Video Matting (MobileNetV3, ONNX, GPL-3.0 model weights downloaded once from the RVM GitHub release) runs over
work/frames/ in order (it is recurrent: hair edges stay stable from frame to frame) and writes
  work/matte/000001.jpg ...  the alpha of the presenter at half size (grey JPEG)
  work/track.json            where the head is in every frame, smoothed (the camera follows it)
The engine uses the matte to put words and graphics *behind* the presenter, and the track to keep the face framed.
Needs: pip install onnxruntime opencv-python-headless numpy.
"""
import argparse, json, os, sys, time, urllib.request
from pathlib import Path

MODEL_URL = "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx"


def model_path(arg):
    p = Path(os.path.expanduser(arg)) if arg else Path.home() / ".cache" / "talking-head-auto-edit" / "rvm_mobilenetv3_fp32.onnx"
    if not p.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
        print(f"[matte] downloading the RVM model to {p}", flush=True)
        urllib.request.urlretrieve(MODEL_URL, p)
    return p


def smooth(xs, sigma):
    import numpy as np
    xs = np.asarray(xs, dtype=np.float64)
    r = int(sigma * 3)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    pad = np.pad(xs, r, mode="edge")
    return np.convolve(pad, k, mode="valid")


def head_point(a, thr=0.5):
    """Top of the head and the x of the head from one alpha (H x W, 0..1). None when nobody is there."""
    import numpy as np
    m = a > thr
    rows = np.where(m.sum(1) >= max(3, a.shape[1] // 200))[0]
    if len(rows) == 0:
        return None
    top = rows[0]
    hh = a.shape[0]
    band = m[top + int(hh * .04): top + int(hh * .2)]
    xs = np.where(band)[1]
    if len(xs) < 10:
        return None
    return float(np.median(xs)) / a.shape[1], float(top) / hh


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="work")
    ap.add_argument("--model", default="")
    ap.add_argument("--size", type=int, default=960, help="matte width (half of a 1080p frame by default)")
    ap.add_argument("--threads", type=int, default=0)
    a = ap.parse_args()
    import numpy as np, cv2, onnxruntime as ort
    work = Path(a.work)
    info = json.loads((work / "info.json").read_text())
    frames = sorted((work / "frames").glob("*.jpg"))
    if not frames:
        sys.exit("no frames: run prepare.py first")
    so = ort.SessionOptions()
    if a.threads:
        so.intra_op_num_threads = a.threads
    mp = str(model_path(a.model))
    sess = ort.InferenceSession(mp, so, providers=["CPUExecutionProvider"])
    out = work / "matte"; out.mkdir(exist_ok=True)
    w = a.size; h = int(round(w * info["height"] / info["width"] / 2) * 2)
    rec = [np.zeros((1, 1, 1, 1), np.float32)] * 4
    ds = np.array([min(1.0, 512 / max(w, h)) * 1.0], np.float32)
    pts, t0 = [], time.time()
    for i, f in enumerate(frames):
        img = cv2.imread(str(f))
        img = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)
        src = img[:, :, ::-1].transpose(2, 0, 1)[None].astype(np.float32) / 255
        fgr, pha, *rec = sess.run(None, {"src": src, "r1i": rec[0], "r2i": rec[1], "r3i": rec[2], "r4i": rec[3], "downsample_ratio": ds})
        al = pha[0, 0]
        cv2.imwrite(str(out / f.name), (al * 255).clip(0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
        pts.append(head_point(al))
        if i % 500 == 0:
            print(f"[matte] {i}/{len(frames)} {(i + 1) / (time.time() - t0):.1f} fps", flush=True)
    # fill gaps, smooth (the camera operator, not the matte, decides how fast to follow)
    good = [p for p in pts if p]
    if not good:
        print("[matte] nobody found in the frames: no track written"); return
    last = good[0]
    for i, p in enumerate(pts):
        if p: last = p
        else: pts[i] = last
    hx = smooth([p[0] for p in pts], 3); hy = smooth([p[1] for p in pts], 3)
    face = json.loads((work / "face.json").read_text()) if (work / "face.json").exists() else {"cx": .5, "cy": .38}
    # face.json is the face in a typical frame; the track moves it with the head
    mx, my = float(np.median(hx)), float(np.median(hy))
    track = {"fps": info["fps"], "x": [round(face["cx"] + x - mx, 4) for x in hx], "y": [round(face["cy"] + y - my, 4) for y in hy],
             "top": [round(float(y), 4) for y in hy], "matte": {"w": w, "h": h}}
    (work / "track.json").write_text(json.dumps(track, separators=(",", ":")))
    info.setdefault("timing_s", {})["matte"] = round(time.time() - t0, 1)
    info["matte"] = True
    (work / "info.json").write_text(json.dumps(info, indent=1))
    print(f"[matte] {len(frames)} frames in {time.time() - t0:.0f} s; head moves x {min(hx):.3f}..{max(hx):.3f}, y {min(hy):.3f}..{max(hy):.3f}")


if __name__ == "__main__":
    main()
