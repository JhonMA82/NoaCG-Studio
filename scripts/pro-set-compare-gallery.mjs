#!/usr/bin/env node
// TWO ROUNDS' PACKAGE ROWS ON ONE BLIND PAGE. FREE - it reads two finished rounds and writes
// HTML; the browser work happened earlier, in `pro-spike.mjs --recompose --set`.
//
//   node scripts/pro-set-compare-gallery.mjs <roundA> <roundB> --out=<file.html>
//   node scripts/pro-set-compare-gallery.mjs <roundA> <roundB> --out=<file.html> --reveal
//
// THE QUESTION THIS PAGE ASKS AND NOTHING ELSE DOES. A per-item blind page cannot see a
// BETWEEN-item property: every graphic can be good while a checkpoint's whole round is
// narrower - the 2026-08-17 read passed all 36 items while the machine diff showed one
// checkpoint choosing a solid panel on 17 of 18 cells and accents 0.196 apart in OKLab against
// 0.282 (docs/NOACG_PRO_PLAN.md §19.2). The surface that asks "is the narrower vocabulary a
// problem?" is the two rounds' set-gallery ROWS side by side, which until this file nothing
// built (`two-rounds-notes.md`). One row = one design language rendered as the whole package;
// the reader judges rows for coherence AND scans across rows for variety.
//
// IT SHOWS THE RECOMPOSED FRAMES, like `pro-round-compare-gallery.mjs` and for the same
// reason: the saved `language.json` is the artefact the money bought, everything after it is
// deterministic, and rebuilding both rounds through TODAY's composer separates the two halves
// of the page by their checkpoint alone. Recompose is NOT byte-stable on the Anton cells
// (§20) - run it twice before reading any frame diff as a composer change.
//
// SAME BLINDING RULES as the item comparator, inherited deliberately: ids issued over the two
// rounds' cells INTERLEAVED then shuffled by id hash (neither position nor ordinal carries the
// round); frames COPIED under the issued id into `blind/` (a `src` naming the round dir is a
// page that is blind only until someone hovers); the language's model-given NAME never appears
// on the page (it names the brand - the leak the set gallery itself shipped once, found by the
// owner mid-read on 2026-08-16). `--reveal` writes the key beside it; write the notes first.

import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const rounds = args.filter((a) => !a.startsWith('--'));
const outFile = value('out');

if (rounds.length !== 2 || !outFile) {
  console.error('usage: node scripts/pro-set-compare-gallery.mjs <roundA> <roundB> --out=<file.html> [--reveal]');
  console.error('  (both rounds need `pro-spike.mjs --recompose --set --out=<round>` run first)');
  process.exit(1);
}

/** Stable string hash - the same shuffle the other blind galleries use. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const exists = async (file) => access(file).then(() => true, () => false);

async function load(dir, letter) {
  const round = JSON.parse(await readFile(path.resolve(dir, 'results.json'), 'utf8'));
  const cells = [];
  for (const r of round.results ?? []) {
    if (r.kind !== 'candidate' || r.skipped || r.error || !r.language) continue;
    cells.push({
      round: letter,
      dir,
      slug: r.slug,
      route: round.route,
      brand: r.brand ?? null,
      divergence: Boolean(r.divergence),
      languageName: r.language?.name ?? null,
      adjustments: r.recomposedAdjustments ?? [],
      hold: r.recomposedHold ?? null,
      set: r.recomposedSet ?? [],
    });
  }
  return { dir, route: round.route, capturedAt: round.capturedAt, cells };
}

const [A, B] = await Promise.all([load(rounds[0], 'A'), load(rounds[1], 'B')]);

// A cell with no recomposed SET cannot sit on this page as a row of one - that would show a
// per-item page wearing this page's title. Refuse loudly instead of degrading quietly.
for (const [letter, round] of [['A', A], ['B', B]]) {
  const bare = round.cells.filter((cell) => !cell.set.length);
  if (bare.length === round.cells.length) {
    console.error(`round ${letter} (${round.dir}) has no recomposed set members on any cell -`
      + ' run `node scripts/pro-spike.mjs --recompose --set --out=' + round.dir + '` first.');
    process.exit(1);
  }
}

// Interleave before issuing ids, so the ordinal carries no round information even before the
// shuffle.
const interleaved = [];
for (let i = 0; i < Math.max(A.cells.length, B.cells.length); i += 1) {
  if (A.cells[i]) interleaved.push(A.cells[i]);
  if (B.cells[i]) interleaved.push(B.cells[i]);
}
interleaved.forEach((cell, i) => { cell.id = `S-${String(i + 1).padStart(2, '0')}`; });

const shown = [...interleaved].sort((a, b) => hash(a.id) - hash(b.id));

const outDir = path.dirname(path.resolve(outFile));
const blindDir = path.resolve(outDir, 'blind');
await mkdir(blindDir, { recursive: true });

const missing = [];
async function blindCopy(cell, sourceFile, suffix) {
  if (!sourceFile) { missing.push(`${cell.id} has no recomposed ${suffix} frame in its ledger`); return null; }
  const from = path.resolve(cell.dir, sourceFile);
  if (!(await exists(from))) { missing.push(`${cell.id}: ${sourceFile} is missing on disk`); return null; }
  const blind = `${cell.id}.${suffix}.png`;
  await copyFile(from, path.resolve(blindDir, blind));
  return `blind/${blind}`;
}

for (const cell of shown) {
  cell.cells = [
    { label: 'Lower third', file: await blindCopy(cell, cell.hold, 'lower-third') },
    ...await Promise.all(cell.set.map(async (member) => ({
      label: member.label ?? member.graphic,
      file: await blindCopy(cell, member.file, member.graphic),
    }))),
  ];
}

const sections = shown.map((cell) => {
  const figures = cell.cells.map((c) => (c.file
    ? `<figure><img src="${c.file}"><figcaption>${c.label}</figcaption></figure>`
    : `<p class="note">no ${c.label} frame</p>`)).join('');
  return `<section id="${cell.id}"><h2>${cell.id}</h2><div class="row">${figures}</div></section>`;
}).join('\n');

const page = `<!doctype html><meta charset="utf-8">
<title>NoaCG Pro - two rounds' packages, blind - ${shown.length} rows</title>
<style>
body{background:#101216;color:#e8e9ec;font:14px/1.5 system-ui;padding:24px;max-width:1900px;margin:0 auto}
h1{font-size:20px} h2{font-size:15px;border-top:1px solid #2a2d34;padding-top:16px;margin:30px 0 8px}
.lead{color:#9aa0ab;max-width:76ch}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start}
figure{margin:0}
figcaption{color:#9aa0ab;font-size:11px;margin-top:3px}
/* Transparent frames over a checkerboard - a graphic judged on a flat dark page is judged
   against a background it will never have on air. */
img{width:560px;display:block;border:1px solid #2a2d34;
  background-color:#20242b;
  background-image:linear-gradient(45deg,#171a20 25%,transparent 25%),linear-gradient(-45deg,#171a20 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#171a20 75%),linear-gradient(-45deg,transparent 75%,#171a20 75%);
  background-size:24px 24px;
  background-position:0 0,0 12px,12px -12px,-12px 0}
.note{color:#f6a623}
</style>
<h1>Two rounds' packages, blind - ${shown.length} rows</h1>
<p class="lead">Each row is <strong>one design language</strong> rendered as the whole package by
<strong>the same platform code</strong>. The languages were bought in one of two paid rounds;
nothing on this page says which round a row came from.</p>
<p class="lead">Read it TWICE, for two different things:</p>
<p class="lead">1. <strong>Each row as a set</strong> - do the lower third, the bug and the
countdown visibly belong to each other? Every graphic in an incoherent package can be
individually fine.</p>
<p class="lead">2. <strong>Across the rows</strong> - does the page hold a broad range of looks,
or do many rows repeat one vocabulary (the same panel treatment, near-identical accents, one
typographic voice)? This is the question no per-item read can answer, and the one this page
exists for.</p>
<p class="lead">Write your notes BEFORE anything is revealed.</p>
${missing.length ? `<p class="note">${missing.length} frame(s) missing: ${missing.join('; ')}</p>` : ''}
${sections}
`;

await writeFile(path.resolve(outFile), page, 'utf8');
console.log(`wrote ${outFile} - ${shown.length} rows (${A.cells.length} + ${B.cells.length})`);
if (missing.length) for (const m of missing) console.log(`  MISSING ${m}`);

if (flag('reveal')) {
  const keyFile = path.resolve(outDir, `${path.basename(outFile, '.html')}-key.html`);
  const rows = shown.map((c) => `<tr><td>${c.id}</td><td>${c.route}</td><td>${c.slug}</td>`
    + `<td>${c.brand ?? '-'}${c.divergence ? ' (divergence)' : ''}</td>`
    + `<td>${c.languageName ?? '-'}</td><td>${c.adjustments.join(', ') || '-'}</td></tr>`).join('\n');
  await writeFile(keyFile, `<!doctype html><meta charset="utf-8">
<title>Key - two rounds' packages</title>
<style>body{background:#101216;color:#e8e9ec;font:13px/1.5 system-ui;padding:24px}
table{border-collapse:collapse} td,th{border:1px solid #2a2d34;padding:4px 8px;text-align:left}</style>
<h1>Key</h1>
<p>A: <code>${A.route}</code> (${path.basename(A.dir)}) · B: <code>${B.route}</code> (${path.basename(B.dir)})</p>
<table><tr><th>id</th><th>route</th><th>cell</th><th>brand</th><th>language name</th><th>composer adjustments</th></tr>
${rows}</table>
`, 'utf8');
  console.log(`wrote ${keyFile}`);
}
