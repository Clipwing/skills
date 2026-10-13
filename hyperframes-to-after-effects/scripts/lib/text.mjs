// text.mjs: turns a text layer whose string changes into a native After Effects recipe. Per-frame Source Text keys make
// After Effects scripting crawl project-wide (one layer with ~150 of them slows every later scripted edit ~200x), so the
// builder never writes them. Recipes:
//   counter  digits inside a fixed template ("12%", "About 3 min left", "01:59", "00:00:03:31"): a Count slider and an
//            expression that formats it; when the value just follows time, the expression reads time and needs no keys
//   typing   a string growing by characters: the final text plus a Text Animator (opacity 0, range start keyed)
//   split    a few distinct strings: one plain text layer per string, trimmed in time
//   table    anything else (decode, scramble): a short [time, text] table in an expression
//   colours  colour changes ride on a Fill Color text animator (step keys; a run of consecutive frames is a fade)

const same = (a, b) => a.join(",") === b.join(",");
const groups = (t) => t.match(/\d+/g) || [];
const tpl = (t) => t.replace(/\d+/g, "#");

// radix for each digit group of a clock-like template, from the largest value seen in it
function radices(runs, n) {
  const max = Array(n).fill(0);
  for (const [, t] of runs) groups(t).forEach((g, i) => { max[i] = Math.max(max[i], +g); });
  return max.map((m, i) => (i === 0 ? null : m < 24 && n === 4 && i === 1 ? 60 : m < 60 ? 60 : m < 100 ? 100 : 1000));
}

export function planText(K, fps) {
  // K: [[frame, {txt, col, ...}], ...] in layer-local frames
  const txts = K.map((k) => k[1].txt);
  const fin = txts[txts.length - 1];
  const cols = [];
  for (const [f, d] of K) if (!cols.length || !same(cols[cols.length - 1][1], d.col.slice(0, 3))) cols.push([f, d.col.slice(0, 3)]);
  const runs = [];
  for (const [f, d] of K) if (!runs.length || runs[runs.length - 1][1] !== d.txt) runs.push([f, d.txt]);
  let r;
  if (runs.length === 1) r = { mode: "static", txt: fin };
  else {
    const t0 = tpl(runs[0][1]);
    const ng = groups(runs[0][1]).length;
    const allTpl = ng > 0 && runs.every(([, t]) => tpl(t) === t0);
    if (allTpl && (ng === 1 ? runs.length >= 3 : runs.length >= 3)) {
      // one number, or a clock: digit groups read as one mixed-radix value
      const rad = ng > 1 ? radices(runs, ng) : [null];
      const value = (t) => groups(t).reduce((v, g, i) => (i === 0 ? +g : v * rad[i] + +g), 0);
      const pads = groups(runs[0][1]).map((g, i) => (runs.every(([, t]) => groups(t)[i].length === g.length) && runs.some(([, t]) => groups(t)[i][0] === "0" && groups(t)[i].length > 1) ? g.length : 0));
      const parts = t0.split("#");
      const keys = runs.map(([f, t]) => [f, value(t)]);
      // does the value simply follow time? v = floor(a + b * frame)
      const [f0, v0] = keys[0], [f1, v1] = keys[keys.length - 1];
      const slope = f1 > f0 ? (v1 - v0) / (f1 - f0) : 0;
      let linear = null;
      if (slope > 0) {
        for (const off of [0, 0.5, 0.999]) {
          const a = v0 + off;
          if (K.every(([f, d]) => value(d.txt) === Math.floor(a + slope * (f - f0) + 1e-6))) { linear = { a: a - slope * f0, b: slope * fps }; break; }
        }
      }
      r = { mode: "counter", parts, rad, pads, keys: linear ? null : keys, linear };
    } else {
      let i0 = runs.length - 1;
      while (i0 > 0 && runs[i0][1].startsWith(runs[i0 - 1][1]) && runs[i0 - 1][1].length < runs[i0][1].length) i0--;
      if (runs.length - i0 >= 3) {
        r = { mode: "typing", final: fin, from: runs[i0][0], keys: runs.slice(i0).map(([f, t]) => [f, t.length]),
          before: runs.slice(0, i0).map(([f, t], j) => [t, f, runs[j + 1][0]]) };
      } else if (runs.length <= 4 || (runs.length <= 60 && runs.every(([f], j) => j + 1 >= runs.length || runs[j + 1][0] - f >= fps * 0.3))) {
        // a few strings, or strings that each stay up long enough to read (captions): plain layers, one per string
        r = { mode: "split", parts: runs.map(([f, t], j) => [t, f, j + 1 < runs.length ? runs[j + 1][0] : null]) };
      } else {
        r = { mode: "table", rows: runs.map(([f, t]) => [f, t]) };
      }
    }
  }
  if (cols.length > 1) r.colors = cols.map(([f, c], i) => [f, c, i + 1 < cols.length && cols[i + 1][0] - f > 2 ? 1 : 0]); // [frame, rgb, holdOut]
  return r;
}
