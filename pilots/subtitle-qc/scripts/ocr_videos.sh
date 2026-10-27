#!/bin/sh
# Frames at 5 fps (720 px wide) -> macOS Vision OCR -> <out>/<video>.ocr.jsonl
# Videos run in parallel (Vision accurate mode does ~2 frames/s per process).
# Usage: ocr_videos.sh <videos-dir> <out-dir> [jobs]
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
VIDEOS=$1
OUT=$2
JOBS=${3:-5}
mkdir -p "$OUT/frames"
[ -x "$OUT/ocr_frames" ] || swiftc -O "$HERE/ocr_frames.swift" -o "$OUT/ocr_frames"

one() {
  video=$1
  name=$(basename "$video" .mp4 | tr ' ' '-')  # 'V1 final' vs 'v1_final' on a case-insensitive disk
  [ -s "$OUT/$name.ocr.jsonl" ] && return 0
  frames="$OUT/frames/$name"
  mkdir -p "$frames"
  ffmpeg -v error -y -i "$video" -vf "fps=5,scale=720:-2" "$frames/%06d.jpg"
  "$OUT/ocr_frames" "$frames" accurate > "$OUT/$name.ocr.jsonl.tmp"
  mv "$OUT/$name.ocr.jsonl.tmp" "$OUT/$name.ocr.jsonl"
  rm -rf "$frames"
  echo "done $name"
}

if [ "${OCR_ONE:-}" ]; then
  one "$OCR_ONE"
else
  # longest first so the 7-minute video does not finish last
  ls -S "$VIDEOS"/*.mp4 | tr '\n' '\0' |
    xargs -0 -P "$JOBS" -I{} env OCR_ONE={} "$0" "$VIDEOS" "$OUT" "$JOBS"
fi
