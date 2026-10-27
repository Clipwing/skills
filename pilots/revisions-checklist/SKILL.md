---
name: revisions-checklist
description: Turn a review thread about a video (Slack, email, a client's notes) into one checklist of revisions with timecodes, who asked, and where each one stands — open, done, dropped or waiting for an answer. Reads the whole back-and-forth, so later replies ("ok, I'll remove it", "never mind, keep it as is") update the item instead of piling up. Use whenever an editor or producer asks to list, track, collect or sort revisions, fixes, notes, feedback or "правки" on a cut, wants to know what is still left to fix, or pastes a review thread, even if they do not say "checklist".
---

# Revisions checklist

Video feedback arrives as a chat: notes in two languages, timecodes typed any way ("0 11", "около 0:31", "00:04-00:05, 00:21"), questions from the editor, decisions that change three messages later. This skill reads the whole thread and gives the editor one list of what to fix and where each item stands. It never edits the video and never replies in the thread.

## 1. Input

Any of these, ask only for what is missing:

- **A Slack thread link**, when a Slack connector is available: read the parent message and every reply.
- **Pasted text** of the thread or of a client's notes.
- **A previous checklist** plus new messages: update it, keep its items and order.

Names matter: keep who wrote each message. If pasted text has no names, write "?" for who asked rather than guessing.

## 2. Read the thread

Go through the messages in order and track:

- **Rounds.** A new cut posted (a video or file attachment from the editor, "залил", "updated", "v2", a link to a new render) starts a new round. Notes after it are about that cut. A message with only an attachment and no text from the editor is usually a new cut.
- **Revisions.** Anything the reviewer wants changed. One spot and one change per item: "0:11 too many sounds, and the pill is ugly" is two items. One change at several spots ("00:04-00:05, 00:07-00:08, 00:38: zooms too abrupt") stays one item with all its timecodes.
- **Answers that change an item.** Update the item in place, do not add a new one:
  - editor confirms it is done ("убрал", "fixed", "done", "сделал") → done;
  - the editor posted a new cut after the note, nobody said it was fixed, and the reviewer did not bring it back in the notes on that cut → probably fixed, check;
  - reviewer drops it ("тогда как есть", "never mind", "оставим") → dropped, with the short reason;
  - the request changes ("redesign the pill" → later "давай без плашки") → keep one item with the final request, and add `(was: redesign it)`;
  - editor asks and nobody answers yet → waiting, with the question and who should answer;
  - "на твоё усмотрение" / "your call" → open, note that the editor decides.
- **Not revisions:** praise ("красивая вставка!"), thanks, status chatter ("скоро скину"), explanations with no change requested. Leave them out. A reviewer's doubt with no request ("хз по звукам") is not an item until someone decides.

Done means someone in the thread said so. Never decide an item is fixed from other clues (a word showing up in the subtitles, a later screenshot): that is "check" at most.

Keep later rounds honest: an item from round 2 that the reviewer repeats in round 3 ("всё ещё плохо") is the same item, still open, with the newer note.

## 3. Timecodes

- Write `m:ss`: "0 11" → `0:11`, "00:04" → `0:04`, "1 52" → `1:52`.
- Approximate ones ("около 0 31", "примерно 0:15", "somewhere around") get a tilde: `~0:31`.
- Ranges with an en dash: `0:15–0:18`; to the end: `0:55–end`.
- Several spots: `0:04–0:05, 0:07–0:08, 0:38`.
- No timecode: `—` (whole video, or the spot is described by words: then keep the words, e.g. `— (on the word "between")`).
- Never invent or "fix" a timecode. If a note points at a spot only by a screenshot or "here", write `— (see screenshot)`.

## 4. Write the checklist

Markdown, newest round last, items sorted by time inside a round, `—` items first:

```
# Revisions · <video name or thread topic>

Open 7 · check 2 · waiting 1 · done 3 · dropped 2

## Round 2 · after the cut of 16.10 13:40
- [ ] 0:11 · remove the pill under the name, no caption at all (was: redesign it in the brand) · Lera
- [x] 0:18 · drop the "turning" falling animation, plain text animation like the others · Lera
- [~] 0:29 · remove the scene with the icons · Lera
- [-] 0:41 · show the guest, not the host · Lera — dropped: only one shot of the guest exists
- [?] — · were the subtitles checked? · Lera — Rodion took them from the script, asks if he should recheck
```

- Markers: `[ ]` open, `[~]` probably fixed in a later cut, check it, `[x]` done, `[-]` dropped, `[?]` waiting for an answer.
- Item text: a short instruction in the language the reviewer used, in their words where possible ("убрать звук", "smooth out the zooms"). Never translate: a note written in Russian stays in Russian even when the rest of the list is in English. Headings and counts stay in English. Cut filler, keep specifics (names, words on screen, references).
- After `[~]` add nothing: the marker already says "not confirmed". After `[x]`, `[-]` and `[?]` add the short reason or the open question.
- Who asked: first name as in the thread. A client's notes forwarded by the editor: write `client (via Vadim)`.
- Keep "nice to have" notes, mark them `· nice to have`.
- Links the reviewer gave as a reference (a YouTube timestamp, a style example) go at the end of the item.

Top line: the counts. If a reviewer said something is fine to send as is, or set a deadline, add one line under the counts: `Lera, 16.10: send as is` / `Deadline: Fri`.

Save it next to the input as `revisions-<topic>.md` (or `revisions.md`) and show it in the reply. For Slack, the user can paste it as is: Slack shows the lines fine without rendering the checkboxes.

## Notes

- The thread is the only source. If something is ambiguous (two people disagree and nobody decided), make it `[?]` and say who has to decide, do not pick a side.
- Client notes stay on the user's machine; do not post them anywhere.
