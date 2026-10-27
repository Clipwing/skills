#!/bin/bash
# Set up the audio side of the subtitle-qc skill on a reviewer's Mac.
#
#   bash setup.sh              install or update: Homebrew, ffmpeg, whisper, the speech model,
#                              and the "Subs transcript" icon on the Desktop; ends with a self-test
#   bash setup.sh --uninstall  remove the icon and ~/subtitle-qc (tools and the model stay)
#
# Drop a video on the icon and it writes <video name>.heard.srt next to the video:
# what was said, transcribed on this Mac. Drag that file and the editor's .srt into Claude.
# Run from the unzipped subtitle-qc-kit folder. Safe to run again.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
KIT_HOME="${SUBQC_KIT_HOME:-$HOME/subtitle-qc}"
DESKTOP="${SUBQC_DESKTOP:-$HOME/Desktop}"
APP="$DESKTOP/Subs transcript.app"
MODEL_DIR="$HOME/.cache/whisper"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

say_step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

if [ "${1:-}" = --uninstall ]; then
  rm -rf "$APP" "$KIT_HOME"
  echo "Removed. Homebrew, ffmpeg, whisper and the speech model stay installed."
  exit 0
fi
[ -z "${1:-}" ] || fail "Unknown option $1. Use --uninstall or nothing."
[ "$(uname)" = Darwin ] || fail "This runs on a Mac."
[ -f "$HERE/transcribe.sh" ] || fail "transcribe.sh is missing next to setup.sh. Unzip the whole subtitle-qc-kit.zip and run it again."

say_step "1/5 Homebrew"
if ! command -v brew >/dev/null; then
  echo "  Installing Homebrew. It asks for your Mac password (typing is invisible) and to press Return."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  [ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
  [ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
fi
command -v brew >/dev/null || fail "Homebrew is not installed. Open https://brew.sh, install it, then run this again."
echo "  ok"

say_step "2/5 ffmpeg and whisper (speech to text, runs on this Mac)"
for pkg in ffmpeg whisper-cpp; do
  brew list --versions "$pkg" >/dev/null || brew install "$pkg"
done
echo "  ok"

say_step "3/5 Speech model (1.6 GB, once)"
if [ ! -f "$MODEL_DIR/ggml-large-v3-turbo.bin" ] &&
   [ ! -f "$HOME/Library/Application Support/github.com.thewh1teagle.vibe/ggml-large-v3-turbo.bin" ]; then
  mkdir -p "$MODEL_DIR"
  curl -fL --progress-bar --retry 3 -C - -o "$MODEL_DIR/ggml-large-v3-turbo.bin.part" "$MODEL_URL"
  mv "$MODEL_DIR/ggml-large-v3-turbo.bin.part" "$MODEL_DIR/ggml-large-v3-turbo.bin"
fi
echo "  ok"

say_step "4/5 The \"Subs transcript\" icon on the Desktop"
mkdir -p "$KIT_HOME"
cp "$HERE/transcribe.sh" "$KIT_HOME/transcribe.sh"
xattr -d com.apple.quarantine "$KIT_HOME/transcribe.sh" 2>/dev/null || true    # the zip came through Slack
SCRIPT="$(mktemp -d)/droplet.applescript"
cat > "$SCRIPT" <<APPLESCRIPT
on open theFiles
	repeat with f in theFiles
		set p to POSIX path of f
		display notification "Takes about a minute for every 2–3 minutes of video." with title "Transcribing " & (name of (info for f))
		try
			set out to do shell script "export PATH=/opt/homebrew/bin:/usr/local/bin:\$PATH; /bin/sh " & quoted form of "$KIT_HOME/transcribe.sh" & " " & quoted form of p & " | tail -n 1"
			tell application "Finder"
				reveal (POSIX file out as alias)
				activate
			end tell
			display dialog "Transcript ready:" & return & out & return & return & "Drag it into Claude together with the editor's .srt and type: check subs" buttons {"OK"} default button 1 with title "Subs transcript"
		on error msg
			display dialog "Could not transcribe " & p & return & return & msg & return & return & "Post this screen in #subtitles-checker." buttons {"OK"} default button 1 with icon caution with title "Subs transcript"
		end try
	end repeat
end open

on run
	display dialog "Drag a video (.mp4, .mov) onto this icon. The transcript appears next to the video as <name>.heard.srt." buttons {"OK"} default button 1 with title "Subs transcript"
end run
APPLESCRIPT
rm -rf "$APP"
mkdir -p "$DESKTOP"
osacompile -o "$APP" "$SCRIPT" 2>/dev/null
rm -rf "$(dirname "$SCRIPT")"
echo "  ok"

say_step "5/5 Self-test: a made-up clip, transcribed on this Mac"
dir="$(mktemp -d)"
say -o "$dir/t.aiff" "We closed the Series A last week. The cap table now has a bigger option pool."
ffmpeg -nostdin -loglevel error -f lavfi -i color=c=black:s=640x360 -i "$dir/t.aiff" -shortest \
  -c:v libx264 -pix_fmt yuv420p -c:a aac "$dir/selftest.mp4"
heard="$(/bin/sh "$KIT_HOME/transcribe.sh" "$dir/selftest.mp4" 2>&1 | tail -n 1)" || true
text="$(cat "$heard" 2>/dev/null || true)"
rm -rf "$dir"
printf '%s\n' "$text" | grep -v -- '-->' | grep -v '^[0-9]*$' | sed '/^$/d; s/^/  heard: /'
printf '%s' "$text" | grep -qi "cap table" || fail "Self-test failed: the transcript is wrong or empty. Post this screen in #subtitles-checker."

printf '\n\033[32mDone.\033[0m The "Subs transcript" icon is on your Desktop.\n'
