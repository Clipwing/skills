#!/bin/sh
# Transcribe a clip's audio locally with whisper.cpp -> <name>.heard.srt next to the video.
# Usage: transcribe.sh <video> [glossary.txt]
# Model: $WHISPER_MODEL, else the first ggml model found in the usual places.
set -eu
VIDEO=$1
GLOSSARY=${2:-}
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)" >&2; exit 1; }
command -v whisper-cli >/dev/null || { echo "whisper-cli not found (brew install whisper-cpp)" >&2; exit 1; }

MODEL=${WHISPER_MODEL:-}
if [ -z "$MODEL" ]; then
  for m in \
    "$HOME/Library/Application Support/github.com.thewh1teagle.vibe/ggml-large-v3-turbo.bin" \
    "$HOME/.cache/whisper/ggml-large-v3-turbo.bin" \
    "$HOME/.cache/whisper/ggml-large-v3.bin" \
    "$HOME/.cache/whisper/ggml-medium.en.bin"; do
    [ -f "$m" ] && { MODEL=$m; break; }
  done
fi
[ -n "$MODEL" ] && [ -f "$MODEL" ] || {
  echo "No whisper model. Download one, e.g.:" >&2
  echo "  mkdir -p ~/.cache/whisper && curl -L -o ~/.cache/whisper/ggml-large-v3-turbo.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin" >&2
  exit 1
}

OUT=${VIDEO%.*}.heard
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
ffmpeg -nostdin -loglevel error -i "$VIDEO" -vn -ac 1 -ar 16000 "$TMP/audio.wav"

# Names from the glossary steer the model towards the right spelling.
PROMPT=""
[ -n "$GLOSSARY" ] && [ -f "$GLOSSARY" ] && PROMPT=$(tr '\n' ',' < "$GLOSSARY" | sed 's/,$//')

whisper-cli -m "$MODEL" -f "$TMP/audio.wav" -l en -np -osrt -of "$OUT" ${PROMPT:+--prompt "$PROMPT"} >/dev/null 2>&1
[ -s "$OUT.srt" ] || { echo "whisper produced no transcript for $VIDEO" >&2; exit 1; }
echo "$OUT.srt"
