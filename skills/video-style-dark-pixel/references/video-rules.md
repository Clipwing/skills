# Video rules

These come from the Clipwing team's reviews of AI-made videos (October 2026). They override the style file when the two disagree. `node lint-film.mjs` checks the ones marked ✓ before you render.

## Text

- ✓ Numbers as digits: 40, 2, 10x. Never spelled out.
- ✓ No full stop at the end of a title.
- ✓ No italics unless the brand itself uses them. No emoji as decoration.
- ✓ Every text stays on screen at least 0.5 s + 1 s per 3 words, counted from when its last word lands.
- On-screen text is a skeleton: a title plus a few key words. Never a paragraph.
- One text colour plus one accent. The accent goes on the part of the phrase that carries the meaning ("not the biggest advantage", the verb in "put it in front of millions"), never on a detached word.
- Never stack several titles at once or scroll a list of titles past the viewer.
- Small labels never sit bare on a photo or busy background: put them on a solid chip.
- With a voiceover, the script runs as subtitles: whole phrases, each shown exactly while it is spoken.

## Composition

- Simplest version that works: ask how a motion designer would do it by hand and cut what they would not add.
- One focal point per frame. A single element sits in the centre; when a second arrives, the first moves aside. Never leave half the frame empty while waiting for the next element.
- No new block while the viewer is still reading the previous one. Elements that belong together stay together.
- Padding always: text keeps at least max(24 px, half its font size) from every card edge.
- Connectors end at an object's edge and never cross text.
- Nothing stray at the frame edges: no bars, no seams, nothing poking in from a side. Backgrounds cover the whole frame at every camera position.
- Cards and screenshots contrast with the background.

## Rhythm and motion

- Calm pace: fewer, longer scenes; motion inside a scene stays smooth and continuous.
- No zoom plus whoosh on every cut. No white flashes between scenes (set an explicit dark or brand canvas).
- A landed title is dead still. No breathing, floating or pulsing loops on titles or UI; a character's idle is acting and is fine.
- Every scene holds about 1 s after its last line lands, so the last animation is seen before the cut.
- With a voiceover: voice first, then time text and animation to its word timings.

## Sound

- Real recorded sounds from your library only; no synthesized whooshes, and not the same sound on every moment. The Real SFX skill (clipwing.pro/skills/real-sfx) places them on the frame after the render.
- Claude cannot hear: ask the person to listen before calling the sound done.

## Facts

- Every claim, number and name on screen comes from the brief or the product's own page. Numbers that only illustrate (a sample counter) are marked as an example in the brief, and never shown as a real result.
- Real logos only where the brand is named, and never as your own brand.
