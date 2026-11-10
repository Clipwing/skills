#!/usr/bin/env node
// Quick edits: re-render only the scenes a plan change touches and splice them into the finished silent film.
//
//   node scripts/patch.mjs --work WORK --plan WORK/edit.json --film WORK/film-16x9.silent.mp4 [--aspect 16:9]
//                          [--base FILM.plan.json] [--cues WORK/cues.json] [--pad 0.6] [--dry]
//
// render.mjs keeps the plan a whole film was made from next to it (film-16x9.silent.plan.json). patch.mjs asks the
// engine for both resolved timelines (the real start/end and transitions of every beat after the edit rules, the
// framing cuts), lists what differs, re-renders those stretches (a little wider, to cover the transitions) and puts
// them in place of the old frames. Every frame is a pure function of its time and the plan, so the frames around a
// patch match the old film exactly. Beats that did not change keep the transitions they had (the engine picks
// transitions by a beat's position, which an added or removed card would shift). The old film is kept as
// FILM.prev.mp4; the base plan is updated. A change to the film's length or to the global look (vfx, endscreen, brand)
// needs a whole render: patch.mjs says so and stops. --dry only prints the stretches.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), A = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) A[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const HERE = dirname(fileURLToPath(import.meta.url)), RENDER = join(HERE, 'render.mjs');
const WORK = resolve(A.work || 'work'), PLAN = resolve(A.plan || join(WORK, 'edit.json')), ASPECT = A.aspect || '16:9';
const FILM = resolve(A.film || join(WORK, `film-${ASPECT.replace(':', 'x')}.silent.mp4`)), STEM = FILM.replace(/\.mp4$/, '');
const BASE = resolve(A.base || STEM + '.plan.json'), PAD = Number(A.pad ?? .6);
const log = (...a) => console.log('[patch]', ...a);
if (!existsSync(FILM) || !existsSync(BASE)) { console.error(`[patch] need ${FILM} and the plan it was made from (${BASE}): render the whole film once`); process.exit(2); }

const tmpDir = dirname(FILM);
const node = (args, quiet) => execFileSync(process.execPath, [RENDER, '--work', WORK, '--aspect', ASPECT, ...(A.scale ? ['--scale', A.scale] : []), ...args], { stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit' });
function timeline(plan, name) {
  // the plan is written next to the real one: its images and clips are looked up next to the plan file
  const p = join(dirname(PLAN), `.patch-${name}.json`), t = join(tmpDir, `.patch-${name}.timeline.json`);
  writeFileSync(p, JSON.stringify(plan)); node(['--plan', p, '--timeline', t], true);
  return { tl: JSON.parse(readFileSync(t, 'utf8')), path: p };
}
const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
const key = b => { const { in: _i, out: _o, ...rest } = b; return JSON.stringify(sorted(rest)); };
const r3 = x => Math.round(x * 1000) / 1000;

const oldPlan = JSON.parse(readFileSync(BASE, 'utf8')), newPlan = JSON.parse(readFileSync(PLAN, 'utf8'));
const glob = p => { const { beats, talk, accents, ...rest } = p; return JSON.stringify(sorted(rest)); };
if (glob(oldPlan) !== glob(newPlan)) { log('the global look changed (vfx / endscreen / brand / ...): render the whole film'); process.exit(3); }

const old = timeline(oldPlan, 'old').tl;
// unchanged beats keep the transitions they had in the film
const oldByKey = new Map();
for (const b of old.beats) if (b.full && oldPlan.beats?.[b.i]) oldByKey.set(key(oldPlan.beats[b.i]), b);
const pinned = { ...newPlan, beats: (newPlan.beats || []).map(b => {
  const o = oldByKey.get(key(b)); if (!o) return b;
  const x = { ...b };
  if (!b.in && o.in && o.in !== 'self') x.in = o.in;
  if (!b.out && o.out && !['cut', 'self'].includes(o.out)) x.out = o.out;
  return x;
}) };
const neu = timeline(pinned, 'new');
const cur = neu.tl;
if (Math.round(old.duration * old.fps) !== Math.round(cur.duration * cur.fps)) { log(`the film's length changed (${old.duration.toFixed(2)} -> ${cur.duration.toFixed(2)} s): render the whole film`); process.exit(3); }

// what differs: resolved beats, framing cuts, accents
const sig = (b, plan) => (b.i in (plan.beats || []) ? key(plan.beats[b.i]) : b.type) + `|${r3(b.start)}|${r3(b.end)}|${b.in}|${b.out}`;
const spans = [];
const oldSig = new Set(old.beats.map(b => sig(b, oldPlan))), newSig = new Set(cur.beats.map(b => sig(b, pinned)));
for (const b of old.beats) if (!newSig.has(sig(b, oldPlan))) spans.push([b.start, b.end, `old ${b.type} ${b.start.toFixed(1)}-${b.end.toFixed(1)}`]);
for (const b of cur.beats) if (!oldSig.has(sig(b, pinned))) spans.push([b.start, b.end, `new ${b.type} ${b.start.toFixed(1)}-${b.end.toFixed(1)}`]);
const cuts = [...new Set([...old.talk, ...cur.talk].map(k => k.t))].sort((a, b) => a - b);
const tk = new Set(old.talk.map(k => JSON.stringify(sorted(k)))), tk2 = new Set(cur.talk.map(k => JSON.stringify(sorted(k))));
for (const k of [...old.talk.filter(k => !tk2.has(JSON.stringify(sorted(k)))), ...cur.talk.filter(k => !tk.has(JSON.stringify(sorted(k))))]) {
  // a framing holds until the next cut, and the cut after that eases out of it
  const i = cuts.indexOf(k.t), a = cuts[Math.max(0, i - 1)], b = cuts[i + 2] ?? cur.duration;
  spans.push([i > 0 ? a : 0, b, `framing cut at ${k.t.toFixed(1)}`]);
}
const ac = new Set((oldPlan.accents || []).map(x => JSON.stringify(sorted(x)))), ac2 = new Set((newPlan.accents || []).map(x => JSON.stringify(sorted(x))));
for (const x of [...(oldPlan.accents || []).filter(x => !ac2.has(JSON.stringify(sorted(x)))), ...(newPlan.accents || []).filter(x => !ac.has(JSON.stringify(sorted(x))))])
  spans.push([x.t, x.t + (x.d || .6), `accent at ${x.t.toFixed(1)}`]);

if (!spans.length) { log('nothing changed'); process.exit(0); }
const fps = cur.fps, total = Math.round(cur.duration * fps);
let win = spans.map(([a, b, why]) => [Math.max(0, Math.floor((a - PAD) * fps)), Math.min(total, Math.ceil((b + PAD) * fps)), [why]]).sort((a, b) => a[0] - b[0]);
const merged = [];
for (const w of win) { const m = merged[merged.length - 1]; if (m && w[0] <= m[1] + fps) { m[1] = Math.max(m[1], w[1]); m[2].push(...w[2]); } else merged.push([...w]); }
const nfr = merged.reduce((s, [a, b]) => s + b - a, 0);
for (const [a, b, why] of merged) log(`${(a / fps).toFixed(2)}-${(b / fps).toFixed(2)} s (${b - a} frames): ${why.join('; ')}`);
log(`${nfr} of ${total} frames to render (${(100 * nfr / total).toFixed(1)}%)`);
if (A.dry) process.exit(0);

const started = Date.now(), segs = [];
merged.forEach(([a, b], k) => {
  const out = join(tmpDir, `.patch-seg${k}.mp4`); segs.push(out);
  node(['--plan', neu.path, '--from', String(a / fps), '--to', String(b / fps), '--out', out, ...(k === 0 && A.cues ? ['--cues', resolve(A.cues)] : []), ...(A.workers ? ['--workers', A.workers] : [])]);
});
// splice: old frames outside the stretches, new frames inside, one encode with the render's settings
const inputs = ['-i', FILM, ...segs.flatMap(s => ['-i', s])], parts = [];
let graph = `[0:v]split=${merged.length + 1}${merged.map((_, k) => `[o${k}]`).join('')}[o${merged.length}];`, at = 0;
merged.forEach(([a, b], k) => {
  graph += `[o${k}]trim=start_frame=${at}:end_frame=${a},setpts=PTS-STARTPTS[a${k}];[${k + 1}:v]setpts=PTS-STARTPTS[s${k}];`;
  parts.push(`[a${k}]`, `[s${k}]`); at = b;
});
graph += `[o${merged.length}]trim=start_frame=${at},setpts=PTS-STARTPTS[z];`; parts.push('[z]');
graph += `${parts.join('')}concat=n=${parts.length}:v=1:a=0[v]`;
const tmpOut = STEM + '.patched.mp4';
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[v]', '-c:v', 'libx264', '-preset', A.preset || 'medium',
  '-crf', String(A.crf || 19), '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', tmpOut], { stdio: 'inherit' });
const got = Number(execFileSync('ffprobe', ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', tmpOut]).toString().trim());
if (got !== total) { console.error(`[patch] spliced film has ${got} frames, expected ${total}: the old film is left as it was`); process.exit(1); }
copyFileSync(FILM, STEM + '.prev.mp4'); renameSync(tmpOut, FILM);
writeFileSync(BASE, JSON.stringify(pinned, null, 1));
log(`done: ${FILM} (${((Date.now() - started) / 1000).toFixed(0)} s; the old film is ${STEM}.prev.mp4)`);
