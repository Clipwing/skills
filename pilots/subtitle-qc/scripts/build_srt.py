"""Turn per-frame OCR (ocr_frames.swift output) into a clean SRT of burned-in subtitles.

Cleaning, in order:
1. keep only subtitle-sized, horizontally centred lines (drops name plates, logos, UI text and oversized kinetic
   type); a frame with more than MAX_LINES such lines shows a text card or disclaimer, not a subtitle;
2. drop text that stays on screen too long (static captions, watermarks);
3. merge consecutive frames with the same or nearly the same text, bridging short flicker gaps;
4. drop segments shorter than MIN_FRAMES.

Text cards (typed or static blocks of more than MAX_LINES lines) are proofread too, so their final text is written
to a second file, one "[m:ss] text" line per card.

Usage: python3 build_srt.py <video.ocr.jsonl> <out.srt> <out.screen.txt>
"""
import json
import re
import sys
from collections import Counter
from difflib import SequenceMatcher

FPS = 5
MIN_CONF = 0.4
HEIGHT_RATIO = 0.7          # line height vs the video's typical subtitle height
CENTER_TOLERANCE = 0.15     # |line centre - 0.5| in frame widths
STATIC_SECONDS = 8          # the same text longer than this is not a subtitle
FLICKER_FRAMES = 2          # gap of up to this many frames is bridged
SAME_TEXT_RATIO = 0.85      # similarity above which two frames show the same subtitle
MIN_FRAMES = 2
MAX_HEIGHT_RATIO = 1.5      # larger text is a title or kinetic graphic
MAX_LINES = 2
CARD_KEY_CHARS = 12          # cards whose first characters match are the same card still typing out
CARD_LINE_WORDS = 2          # card lines are phrases; logos and labels are one or two words
CARD_MIN_SECONDS = 3         # a text card stays up; shorter multi-line frames are subtitles plus other text
CARD_OVERLAP_SECONDS = 5     # a subtitle inside a card shown this close in time is the card's first line


def norm(text):
    return re.sub(r"[^a-z0-9' ]+", "", text.lower()).strip()


def centred(line):
    return abs(line["x"] + line["w"] / 2 - 0.5) <= CENTER_TOLERANCE


def typical_height(frames):
    heights = [round(l["h"], 3) for f in frames for l in f if centred(l) and l["conf"] >= MIN_CONF]
    if not heights:
        return 0
    heights.sort()
    return heights[len(heights) * 3 // 4]  # subtitles are the large centred text


def candidate(line, typical_h):
    return (line["conf"] >= MIN_CONF and centred(line)
            and HEIGHT_RATIO * typical_h <= line["h"] <= MAX_HEIGHT_RATIO * typical_h)


def frame_text(lines, typical_h):
    kept = [l for l in lines if candidate(l, typical_h)]
    if len(kept) > MAX_LINES:
        return ""
    kept.sort(key=lambda l: l["y"])
    return " ".join(l["text"].strip() for l in kept)


def card_text(lines, typical_h):
    kept = [l for l in lines
            if l["conf"] >= MIN_CONF and HEIGHT_RATIO * typical_h <= l["h"] <= MAX_HEIGHT_RATIO * typical_h]
    if sum(len(l["text"].split()) >= CARD_LINE_WORDS for l in kept) <= MAX_LINES:
        return ""  # e.g. a two-line subtitle plus a one-word logo
    kept.sort(key=lambda l: l["y"])
    return " ".join(l["text"].strip() for l in kept)


def cards(texts):
    """Collapse a typed card's growing text into its final version: [(first frame, last frame, text)]."""
    found = []
    for i, text in enumerate(texts):
        if not text:
            continue
        key = norm(text).replace("'", "")[:CARD_KEY_CHARS]
        if found and norm(found[-1][2]).replace("'", "")[:CARD_KEY_CHARS] == key:
            start, _, best = found[-1]
            found[-1] = (start, i, text if len(text) >= len(best) else best)
        else:
            found.append((i, i, text))
    return found


def inside_card(run, card_list):
    """A run that is the beginning of a card shown around the same time is the card typing out, not a subtitle."""
    start, end, variants = run
    text = norm(Counter(variants).most_common(1)[0][0])
    margin = CARD_OVERLAP_SECONDS * FPS
    return any(c_start - margin <= start <= c_end + margin and norm(c_text).startswith(text)
               for c_start, c_end, c_text in card_list)


def similar(a, b):
    return a == b or SequenceMatcher(None, norm(a), norm(b)).ratio() >= SAME_TEXT_RATIO


def segments(texts):
    """Group frame texts into [start, end, [variants]] runs, bridging flicker gaps."""
    runs = []
    for i, text in enumerate(texts):
        if not text:
            continue
        if runs and i - runs[-1][1] <= FLICKER_FRAMES + 1 and similar(runs[-1][2][-1], text):
            runs[-1][1] = i
            runs[-1][2].append(text)
        else:
            runs.append([i, i, [text]])
    return runs


def drop_static(runs):
    total = Counter()
    for start, end, variants in runs:
        total[norm(Counter(variants).most_common(1)[0][0])] += end - start + 1
    limit = STATIC_SECONDS * FPS
    return [r for r in runs if total[norm(Counter(r[2]).most_common(1)[0][0])] <= limit]


def stamp(frame):
    ms = int(frame * 1000 / FPS)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def main(path, srt_path, screen_path):
    with open(path) as f:
        frames = [json.loads(line)["lines"] for line in f if line.strip()]
    typical_h = typical_height(frames)
    texts = [frame_text(lines, typical_h) for lines in frames]
    card_list = [c for c in cards([card_text(lines, typical_h) for lines in frames])
                 if c[1] - c[0] + 1 >= CARD_MIN_SECONDS * FPS]
    runs = [r for r in drop_static(segments(texts))
            if r[1] - r[0] + 1 >= MIN_FRAMES and not inside_card(r, card_list)]
    with open(srt_path, "w") as out:
        for n, (start, end, variants) in enumerate(runs, 1):
            text = Counter(variants).most_common(1)[0][0]
            out.write(f"{n}\n{stamp(start)} --> {stamp(end + 1)}\n{text}\n\n")
    with open(screen_path, "w") as out:
        for start, _, text in card_list:
            out.write(f"[{start // FPS // 60}:{start // FPS % 60:02}] {text}\n")


if __name__ == "__main__":
    main(*sys.argv[1:4])
