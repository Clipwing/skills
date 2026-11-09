#!/usr/bin/env python3
"""Put the sound under the rendered picture: the voice, background music ducked under it, optional SFX.

    python scripts/mix.py --video film.silent.mp4 --voice work/voice.wav --music track.mp3 --out film.mp4
                          [--music-db -17] [--duck 9] [--sfx sfx_track.wav --sfx-db 0] [--lufs -14] [--music-start 0]

--music may be a folder: the track is picked by the film's length (the shortest track that covers it, otherwise the
longest one, looped with a crossfade). The music sits --music-db under the voice and is pulled down a further --duck dB
while the presenter speaks (sidechain from the voice), comes up in pauses and on full-screen cards without speech,
fades in over 1 s and out over 2.5 s. The result is normalised to --lufs (YouTube / Reels: -14).
"""
import argparse, json, subprocess, sys
from pathlib import Path

AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}


def dur(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                         capture_output=True, text=True).stdout.strip()
    return float(out or 0)


def pick_music(path, need):
    p = Path(path)
    if p.is_file():
        return p
    tracks = sorted([f for f in p.rglob("*") if f.suffix.lower() in AUDIO], key=lambda f: f.name)
    if not tracks:
        sys.exit(f"no audio files in {p}")
    lens = [(dur(f), f) for f in tracks]
    covering = sorted([x for x in lens if x[0] >= need])
    return (covering[0] if covering else max(lens))[1]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True); ap.add_argument("--voice", required=True)
    ap.add_argument("--music"); ap.add_argument("--music-start", type=float, default=0.0)
    ap.add_argument("--music-db", type=float, default=-17.0, help="music level against the voice (dB)")
    ap.add_argument("--duck", type=float, default=9.0, help="extra dB the music drops while the voice speaks")
    ap.add_argument("--sfx"); ap.add_argument("--sfx-db", type=float, default=0.0)
    ap.add_argument("--lufs", type=float, default=-14.0)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    length = dur(a.video)
    inputs = ["-i", a.video, "-i", a.voice]
    graph = ["[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[voice][key]"]
    mix = ["[voice]"]
    if a.music:
        track = pick_music(a.music, length + a.music_start)
        tlen = dur(track)
        loop = tlen - a.music_start < length
        inputs += (["-stream_loop", "-1"] if loop else []) + ["-ss", str(a.music_start), "-i", str(track)]
        mi = 2
        # ratio from the requested duck depth; threshold low enough that any speech triggers it
        ratio = max(2.0, min(20.0, 10 ** (a.duck / 20) * 2))
        graph.append(f"[{mi}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:{length:.3f},asetpts=PTS-STARTPTS,"
                     f"volume={a.music_db}dB,afade=t=in:d=1,afade=t=out:st={max(0, length - 2.5):.3f}:d=2.5[mus]")
        graph.append(f"[mus][key]sidechaincompress=threshold=0.02:ratio={ratio:.1f}:attack=40:release=450:makeup=1[ducked]")
        mix.append("[ducked]")
        print(f"[mix] music {track.name} ({tlen:.0f} s{', looped' if loop else ''}) at {a.music_db} dB, duck {a.duck} dB")
    else:
        graph.append("[key]anullsink")
    if a.sfx:
        si = len([x for x in inputs if x == "-i"])
        inputs += ["-i", a.sfx]
        graph.append(f"[{si}:a]aresample=48000,aformat=channel_layouts=stereo,volume={a.sfx_db}dB[sfx]")
        mix.append("[sfx]")
    graph.append("".join(mix) + f"amix=inputs={len(mix)}:duration=first:normalize=0,"
                 f"loudnorm=I={a.lufs}:TP=-1.5:LRA=11,aresample=48000[aout]")
    cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(graph),
           "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
           "-movflags", "+faststart", a.out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[-2000:])
    print(f"[mix] {a.out} ({length:.1f} s)")


if __name__ == "__main__":
    main()
