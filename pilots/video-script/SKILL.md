---
name: video-script
description: Script a short Clipwing video (15–90 s promo or explainer) from a blog article, a product or tool page, or an idea, as a beat sheet ready for HyperFrames or the content factory. Use when asked for a video script, storyboard or scene list, or to review one.
---

# Video script

You write the script for one short video: what the viewer reads or hears, what they see, and when. The script is the cheapest place to fix a video. Most review comments the team leaves on finished videos (a wrong fact, no hook, a busy frame, text gone before it is read) start in the script.

The output is a **beat sheet**: one row per beat, and each beat is one thought with one picture.

## 1. Brief

Collect these and write them at the top of the script:

- **Source**: an article (URL or text), a product or tool page, or an idea. Read the whole source before anything else.
- **Goal**: *promo* (sells Clipwing or one of its tools; the product is on screen) or *explainer* (teaches the article's idea; Clipwing comes in at the end). The goal picks the structure in step 4. When the request does not name it, ask: left alone, a model drifts to promo. Running unattended, take explainer for an article and promo for a product or tool page, and write "(default)" next to it.
- **Format**: 9:16 or 16:9; length (default 30–45 s, explainer up to 60 s); voice or silent (default silent: captions carry the story); language (default English).
- **Target**: a HyperFrames run, or the content factory (then also read [references/factory-json.md](references/factory-json.md)).

Done when every field has a value, given by the user or stated as a default.

## 2. Fact sheet

List every fact the script may use: numbers (with unit and what they count), names, brands, quotes, examples, and who speaks (the author's "I" or "we"). For a promo, add the product facts from [references/clipwing.md](references/clipwing.md). Star the 1–3 strongest facts: surprising, concrete, easy to show.

Done when every fact the script will need is on the sheet. From here on the fact sheet is the only source: a number, name or example that is not on it does not go into the script.

## 3. Angle

The **angle** is the one idea the whole video carries, plus the picture that holds it ("backlinks as votes in an election", "the article as a game level"). Write 3 angles, each as: the idea in one sentence, the hook line, the visual through-line. Recommend one and say why.

With the user in the conversation, show the three and wait for a pick. Running unattended, take your pick and list the other two under "Other angles" at the top of the output.

Done when one angle is chosen and its idea is one sentence with no "and".

## 4. Beats

Structure by goal.

**Promo** (the team's reference promo, Clipwing_v2_final, follows it):
1. Hook, at most 2 s: the pain or the result, shown.
2. Problem: from the source, in the viewer's words.
3. Turn: Clipwing or the tool does it, on a real product screen with the cursor acting.
4. Proof: a number or a before/after.
5. Call to action: product name, URL, one action.

**Explainer**:
1. Hook, at most 3 s: what the viewer gets, or an open question the video will close.
2. Setup, about 20 % of the time: the least context needed.
3. Development, about 60 %: 2–4 beats, one supporting point each, in order of importance, each carried by an example or number from the fact sheet. Link them as a narrator would ("but", "so").
4. Payoff, about 20 %: the answer to the hook and the takeaway; a soft call to action (Clipwing link) last.

A **listicle** is an explainer whose development is 3–5 parallel items, all serving the one angle. Take only the article's items that prove the angle; 3 strong items beat 5 loose ones.

**Time budget.** Compute each beat's minimum before giving it a time. Voice: words ÷ 2.5 s, plus about 1 s hold after the line ends. Silent: for every caption phrase 0.5 s + 1 s per 3 words, summed over the beat's phrases (two 4-word phrases need 2 × 1.83 = 3.7 s). A beat's time is never below its minimum. Add the beats up; over the length, cut the weakest beat or a phrase, never the reading time.

Something changes in the frame every 3–5 s (a new beat, a new element, a camera move): that is the **pattern interrupt** that holds attention.

## 5. Beat sheet

| # | Time | Voice / caption | On screen | Visual | Sound |
| --- | --- | --- | --- | --- | --- |

- **Voice / caption**: the voiceover line, or for a silent video the caption phrases, 2–7 words each, each a whole thought. The author's person stays ("I" stays "I").
- **On screen**: the key words or the number only. Mark the emphasis with `*asterisks*` on the part of the phrase that carries the meaning ("not *the biggest advantage*").
- **Visual**: what a motion designer would put in the frame: one focal object, named concretely (which product screen or asset, what moves on it). "Abstract card", "icons" or "graphics" are placeholders, not visuals.
- **Sound**: the real-world sound of an action on screen (click, pop, typing, paper), or "—". Whooshes read as AI to the team, so motion gets no sound of its own.

Then the end card: one line of at most 6 words and a button of at most 4 words.

## 6. Check

Go through [references/checklist.md](references/checklist.md) item by item against the beat sheet, as a reviewer who expects to find faults: a first draft always has some. Rewrite the beats that fail and check again, at most 2 rounds; whatever still fails goes under "Open" at the end. Facts never go to Open: a beat whose fact does not hold as written ("might" stated as certain, a number rounded into a new claim) is rewritten or cut.

Done when every checklist item is ✓ or listed under Open, and the Check section shows the timing math and every fix made.

## Output

Save as `script.md` in the working folder, or where the user says; when there is no file access, print it.

```markdown
# <title>

**Brief:** goal · format · length · voice/silent · language · target
**Angle:** <one sentence> — Other angles: <two lines, unattended runs only>

<beat sheet>

**End card:** <line> · <button>

## Fact sheet
<the facts the script uses, ★ on the strongest>

## Check
Timing: <beat: minimum → given, for every beat> · total <s> of <target>
Fixed: <checklist item — what changed in which beat>
Open: <checklist item — why it stays>, or "none"
```

For the content factory, add the JSON from [references/factory-json.md](references/factory-json.md) after the markdown.
