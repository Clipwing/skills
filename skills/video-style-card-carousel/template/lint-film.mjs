#!/usr/bin/env node
/*
 * lint-film.mjs: checks a video-style film against the Clipwing video rules before any render.
 * Synced into the template of every video-style skill by scripts/build_video_styles.py; edit it here.
 *
 *   node lint-film.mjs [index.html]      exit 1 on errors, 0 when only warnings or clean
 *
 * What it checks (rules from the team's reviews, see references/video-rules.md):
 *   - scenes cover the film without gaps or overlaps and end at #root data-duration
 *   - every line of words stays on screen at least 0.5 s + 1 s per 3 words
 *   - numbers are digits ("3 clips", never "three clips")
 *   - titles do not end with a full stop
 *   - no italics unless the element says data-brand-italic, no emoji
 *   - no Math.random or Date.now in the page
 */
import { readFileSync } from "node:fs";

const file = process.argv[2] || "index.html";
const src = readFileSync(file, "utf8");
const errors = [];
const warnings = [];

// A small tolerant HTML tree: enough for attributes, nesting and text. Scripts and styles are kept as raw text.
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
function parse(html) {
  const root = { tag: "#root", attrs: {}, kids: [], parent: null };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("<!--")) continue;
    if (m[5] != null) { cur.kids.push({ text: m[5] }); continue; }
    const [, close, tagRaw, attrStr, selfClose] = m;
    const tag = tagRaw.toLowerCase();
    if (close) {
      let n = cur;
      while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) cur = n.parent;
      continue;
    }
    const attrs = {};
    attrStr.replace(/([^\s=>/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g, (_, k, __, a, b, c) => { attrs[k] = a ?? b ?? c ?? ""; return ""; });
    const node = { tag, attrs, kids: [], parent: cur };
    cur.kids.push(node);
    if (tag === "script" || tag === "style") {
      const end = html.indexOf("</" + tag, re.lastIndex);
      node.raw = html.slice(re.lastIndex, end < 0 ? html.length : end);
      re.lastIndex = end < 0 ? html.length : end;
      continue;
    }
    if (!VOID.has(tag) && !selfClose) cur = node;
  }
  return root;
}
const walk = (n, fn) => { fn(n); (n.kids || []).forEach((k) => walk(k, fn)); };
const text = (n) => (n.text != null ? n.text : (n.kids || []).map(text).join(n.tag === "br" ? " " : ""));
const hasClass = (n, c) => (n.attrs?.class || "").split(/\s+/).includes(c);
const up = (n, fn) => { for (let p = n.parent; p; p = p.parent) if (fn(p)) return p; return null; };
const clean = (s) => s.replace(/&nbsp;|&#160;/g, " ").replace(/&[a-z]+;/g, "'").replace(/\s+/g, " ").trim();

const tree = parse(src);
let rootEl = null;
walk(tree, (n) => { if (n.attrs?.id === "root") rootEl = n; });
if (!rootEl) errors.push("No #root element.");
const duration = parseFloat(rootEl?.attrs["data-duration"] || "0");

// Scenes: contiguous, no overlap beyond a 0.6 s transition, end at data-duration.
const scenes = [];
walk(tree, (n) => { if (n.tag && hasClass(n, "scene")) scenes.push(n); });
scenes.sort((a, b) => parseFloat(a.attrs["data-at"]) - parseFloat(b.attrs["data-at"]));
if (!scenes.length) errors.push("No .scene sections.");
let prevEnd = 0;
scenes.forEach((s) => {
  const id = s.attrs.id || "(scene without id)";
  const at = parseFloat(s.attrs["data-at"]), len = parseFloat(s.attrs["data-len"]);
  if (!(len > 0) || Number.isNaN(at)) { errors.push(`${id}: needs data-at and a positive data-len.`); return; }
  if (at > prevEnd + 0.01) errors.push(`${id}: gap of ${(at - prevEnd).toFixed(2)} s before it (empty frames).`);
  if (at < prevEnd - 0.6) warnings.push(`${id}: overlaps the previous scene by ${(prevEnd - at).toFixed(2)} s.`);
  prevEnd = Math.max(prevEnd, at + len);
});
if (scenes.length && Math.abs(prevEnd - duration) > 0.01) errors.push(`Scenes end at ${prevEnd.toFixed(2)} s, #root data-duration is ${duration}.`);

// Text rules on everything that is a line of words.
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million|billion)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;
walk(tree, (n) => {
  if (!n.tag || n.tag === "script" || n.tag === "style") return;
  const fx = (n.attrs["data-fx"] || "").split(/\s+/);
  const scene = up(n, (p) => p.tag && hasClass(p, "scene"));
  if (fx.includes("words") || fx.includes("karaoke") || hasClass(n, "title") || hasClass(n, "sub") || hasClass(n, "cap")) {
    const words = clean(text(n));
    if (!words) return;
    const where = `${scene?.attrs.id || "?"} "${words.slice(0, 40)}"`;
    if (NUMBER_WORDS.test(words) && !n.attrs["data-allow-words"]) errors.push(`${where}: write numbers as digits.`);
    if (/\bone\b/i.test(words) && !n.attrs["data-allow-words"]) warnings.push(`${where}: "one" as a count is "1"; fine as "one long video".`);
    if (/[^.]\.$/.test(words)) errors.push(`${where}: no full stop at the end of a title.`);
    if (scene) {
      const t = parseFloat(n.attrs["data-t"] || "0");
      const out = n.attrs["data-out"] != null ? parseFloat(n.attrs["data-out"]) : parseFloat(scene.attrs["data-len"]);
      const count = words.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      const need = 0.5 + count / 3 + (fx.includes("words") || fx.includes("karaoke") ? count * 0.08 : 0);
      if (out - t < need - 0.01) errors.push(`${where}: on screen ${(out - t).toFixed(2)} s, needs ${need.toFixed(2)} s to read (${count} words${fx.includes("words") ? ", with the word-by-word entrance" : ""}).`);
    }
  }
  if ((n.tag === "i" || n.tag === "em") && clean(text(n)) && !n.attrs["data-brand-italic"]) errors.push(`<${n.tag}> in ${scene?.attrs.id || "page"}: no italics unless the brand uses them.`);
});
walk(tree, (n) => {
  if (n.text != null && EMOJI.test(n.text) && !up(n, (p) => p.tag === "script" || p.tag === "style")) warnings.push(`Emoji in text "${clean(n.text).slice(0, 30)}": no emoji as decoration.`);
  if (n.tag === "style" && /font-style\s*:\s*italic/.test(n.raw || "")) errors.push("CSS sets font-style: italic: no italics unless the brand uses them.");
  if (n.tag === "script" && /Math\.random\(|Date\.now\(|performance\.now\(/.test(n.raw || "")) errors.push("Script uses Math.random, Date.now or performance.now: use Film.hash and timeline time.");
});

for (const w of warnings) console.log("warn  " + w);
for (const e of errors) console.log("error " + e);
console.log(errors.length ? `${errors.length} error(s), ${warnings.length} warning(s)` : `ok: ${scenes.length} scenes, ${duration} s, ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
