#!/usr/bin/env node
// ONE BLIND PAGE holding N Pro rounds' OWN captured frames. FREE - reads finished rounds,
// copies pictures, writes HTML. Calls no model and re-renders nothing.
//
//   node scripts/pro-freeform-compare-gallery.mjs <round> <round> [...] --out=<dir>
//   node scripts/pro-freeform-compare-gallery.mjs <round> <round> [...] --out=<dir> --reveal
//
// WHY THIS EXISTS BESIDE pro-round-compare-gallery.mjs. That page compares exactly two
// LANGUAGE rounds through today's composer - recomposition is what makes its comparison fair,
// because a language round's paid artefact is the language and everything downstream is
// deterministic. A FREE-FORM round's paid artefact is the emitted code itself: recomposing is
// not possible and the round's own captured frames ARE the result. The free-form coder round
// compares FOUR checkpoints and the accepted Phase A set at once, so this page takes N rounds
// and shows each cell's committed hold, stress hold and motion clips.
//
// THE SAME BLINDING RULES AS EVERY GALLERY HERE (pro-spike.mjs §0.2): ids are reissued over
// the rounds' cells INTERLEAVED, frames are COPIED under the issued id (a filename naming the
// round answers the question before the reviewer looks - and a <video src> is more visible
// than an <img src>), display order is a hash of the issued id, and nothing on the page says
// round, arm, checkpoint, cost or verdict. The brief and brand ARE shown: they are constants
// across every round, so they leak nothing about the checkpoint - and the whole point of a
// same-brief read is seeing the five answers to one brief without knowing whose is whose.
//
// Write notes.md BEFORE --reveal writes key.html. The key joins ids back to round, model,
// contract, validation, device channels and cost.

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const rounds = args.filter((a) => !a.startsWith('--'));
const outDir = value('out');

if (rounds.length < 2 || !outDir) {
  console.error('usage: node scripts/pro-freeform-compare-gallery.mjs <round> <round> [...] --out=<dir> [--reveal]');
  process.exit(1);
}

/** Stable string hash - the same shuffle the other galleries use. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function load(dir) {
  const ledger = JSON.parse(await readFile(path.resolve(dir, 'results.json'), 'utf8'));
  return (ledger.results ?? [])
    .filter((r) => r.kind === 'candidate' && !r.skipped && !r.error)
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((r) => ({ dir: path.resolve(dir), roundName: path.basename(path.resolve(dir)), record: r }));
}

const perRound = [];
for (const dir of rounds) perRound.push(await load(dir));

// INTERLEAVE the rounds' cells so the issued ordinal says nothing about the round, then issue
// sequential ids a human can cite in a note without transcribing a hash.
const cells = [];
const longest = Math.max(...perRound.map((list) => list.length));
for (let i = 0; i < longest; i += 1) {
  for (const list of perRound) if (list[i]) cells.push(list[i]);
}
cells.forEach((cell, i) => { cell.id = `X-${String(i + 1).padStart(2, '0')}`; });

const blindDir = path.join(path.resolve(outDir), 'blind');
await mkdir(blindDir, { recursive: true });

for (const cell of cells) {
  const copy = async (file, name, ext) => {
    if (!file) return null;
    const blindName = `${cell.id}.${name}.${ext}`;
    try {
      await copyFile(path.join(cell.dir, file), path.join(blindDir, blindName));
      return `blind/${blindName}`;
    } catch {
      return null;
    }
  };
  cell.hold = await copy(cell.record.hold, 'hold', 'png');
  cell.stress = await copy(cell.record.stressHold, 'stress', 'png');
  cell.clips = {};
  for (const [strip, file] of Object.entries(cell.record.clips ?? {})) {
    const copied = await copy(file, strip, 'webm');
    if (copied) cell.clips[strip] = copied;
  }
  // A cell whose frames did not copy is LISTED, not dropped - a blind page quietly showing
  // fewer items than the rounds hold lies about its own coverage.
  cell.missing = !cell.hold;
}

const shuffled = [...cells].sort((a, b) => hash(a.id) - hash(b.id));

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const items = shuffled.map((cell) => {
  const r = cell.record;
  const briefLabel = `${r.slug.split('.')[0]}${r.brand ? ` · brand ${r.brand}` : ''}`;
  if (cell.missing) {
    return `<section class="item"><h2>${cell.id} <small>${esc(briefLabel)}</small></h2>
<p class="missing">FRAMES MISSING - this cell exists in its round but its pictures did not copy.</p></section>`;
  }
  const clips = Object.entries(cell.clips)
    .map(([strip, file]) => `<figure><video src="${file}" autoplay loop muted playsinline></video><figcaption>${strip}</figcaption></figure>`)
    .join('\n');
  return `<section class="item"><h2>${cell.id} <small>${esc(briefLabel)}</small></h2>
<div class="row">
  <figure><img src="${cell.hold}" loading="lazy"><figcaption>hold</figcaption></figure>
  ${cell.stress ? `<figure><img src="${cell.stress}" loading="lazy"><figcaption>stress</figcaption></figure>` : ''}
</div>
${clips ? `<div class="row clips">${clips}</div>` : ''}
</section>`;
}).join('\n');

const html = `<!doctype html><meta charset="utf-8">
<title>Blind read - ${cells.length} items over ${rounds.length} rounds</title>
<style>
  body{background:#101216;color:#e8eaf0;font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px}
  h1{font-size:18px} h2{font-size:15px;margin:0 0 8px} h2 small{color:#9aa0ab;font-weight:400}
  .item{margin:0 0 40px;border-top:1px solid #262a33;padding-top:18px}
  .row{display:flex;gap:12px;flex-wrap:wrap}
  figure{margin:0} figcaption{color:#9aa0ab;font-size:12px;margin-top:4px}
  img,video{max-width:900px;width:100%;height:auto;background:#333;border:1px solid #262a33}
  .clips video{max-width:440px}
  .missing{color:#e8b23a}
  .lead{color:#9aa0ab;max-width:70ch}
</style>
<h1>Blind read - ${cells.length} items</h1>
<p class="lead">Same briefs, same brands, several rounds - nothing on this page says which round
an item came from. Read each one for deliberate hierarchy, proportion, spacing and composition;
whether the motion serves the reading order; whether it would go on air. Write notes into
notes.md BEFORE revealing.</p>
${items}`;

await writeFile(path.join(path.resolve(outDir), 'review.html'), html);

const notes = `# Blind notes - write these BEFORE the reveal\n\n${
  shuffled.map((c) => `## ${c.id}\n\n- `).join('\n\n')}\n`;
// Never clobber notes someone already started.
try {
  await readFile(path.join(path.resolve(outDir), 'notes.md'));
  console.log('notes.md already exists - left untouched.');
} catch {
  await writeFile(path.join(path.resolve(outDir), 'notes.md'), notes);
}

if (flag('reveal')) {
  const keyRows = [...cells].sort((a, b) => a.id.localeCompare(b.id)).map((cell) => {
    const r = cell.record;
    const device = r.deviceReport
      ? (r.deviceReport.present ? r.deviceReport.channels.map((c) => c.channel).join('+') : 'none')
      : '-';
    return `<tr><td>${cell.id}</td><td>${esc(cell.roundName)}</td><td>${esc(r.model ?? '-')}</td>
<td>${esc(r.slug)}</td><td>${r.contract?.scaffoldOk ? 'ok' : 'FAIL'}</td>
<td>${(r.contract?.blockingErrors ?? []).length}</td><td>${device}</td>
<td>${r.repairRounds ?? 0}</td><td>$${(r.costUsd ?? 0).toFixed(4)}</td></tr>`;
  }).join('\n');
  const key = `<!doctype html><meta charset="utf-8"><title>Key</title>
<style>body{background:#101216;color:#e8eaf0;font:13px/1.5 system-ui,sans-serif;padding:24px}
table{border-collapse:collapse}td,th{border:1px solid #262a33;padding:4px 10px;text-align:left}</style>
<h1>The key - read only after the notes are written</h1>
<table><tr><th>id</th><th>round</th><th>model</th><th>cell</th><th>contract</th><th>blocking</th><th>device</th><th>repairs</th><th>cost</th></tr>
${keyRows}</table>`;
  await writeFile(path.join(path.resolve(outDir), 'key.html'), key);
  console.log(`Key written: ${path.join(outDir, 'key.html')} - notes first.`);
}

console.log(`Blind page: ${path.join(outDir, 'review.html')} (${cells.length} items, ${rounds.length} rounds`
  + `${cells.filter((c) => c.missing).length ? `, ${cells.filter((c) => c.missing).length} MISSING` : ''}).`);
