#!/usr/bin/env node
// THE VARIETY / BRAND-ADHERENCE DIFF between two Pro Phase A rounds. FREE - it reads two
// finished rounds' `results.json` and calls nothing.
//
//   node scripts/pro-language-diff.mjs <roundA> <roundB> [--json] [--out=<file.md>]
//
// WHY THIS IS A SEPARATE SCRIPT AND NOT A GALLERY COLUMN. The gallery is BLIND on purpose
// (pro-spike.mjs §0.2): a human writes notes before anything is revealed, so no machine number
// gets the chance to frame a picture. This runs on the other side of that line - it never
// renders and never scores, it counts what the two rounds' design languages ARE. Every figure
// below is a count, a rate or a distance; there is no verdict anywhere in the output, and
// adding one here would defeat the gallery it sits beside.
//
// WHAT IT MEASURES, and why each one is a number rather than an impression:
//
//   1. FIELD DISTRIBUTIONS - every enum in `pro/language/contract.ts`, both rounds side by
//      side, with the distinct-value count and the normalized Shannon entropy. Entropy is the
//      honest variety measure: "6 distinct fonts" says nothing about a round that used one of
//      them 13 times. 1.00 is a perfectly flat spread over the values that appeared, 0.00 is
//      every cell answering the same thing.
//   2. LOOK COLLAPSE - the signature is every enum field except the palette and the name. Two
//      briefs with the same signature differ only in colour, which is the "same layout,
//      different colours" failure this repo already has a name for (src/ai/AGENTS.md). Reported
//      as distinct signatures over cells, plus the largest cluster and who is in it.
//   3. PALETTE SPREAD - distinct accents and panels, and the MEAN PAIRWISE OKLab distance
//      between the round's accents. Distinct-hex counting alone calls #C8F531 and #C9F532 two
//      colours; a distance does not.
//   4. BRAND ADHERENCE - per cell, whether the accent/panel the model chose is one of the
//      assigned brand's own palette entries, exactly and then within an OKLab tolerance, and
//      whether the typeface it chose is the brand's. A brand round whose languages ignore the
//      brand is measuring the model's taste rather than the brief.
//   5. FALLBACKS, COST AND REASONING - how many cells fell back to the house language, what
//      the round billed, and how much of the output was thinking. `usage.reasoning` is only
//      present on rounds captured after 2026-08-17; where it is absent the script says so
//      rather than printing a zero, because a missing measurement and a measured zero are
//      different facts.
//
// Cells are matched across rounds by `<brief>.<brand>` (the record slug), so a round that ran
// a different bank reports the overlap and the unmatched keys on both sides.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const rounds = args.filter((a) => !a.startsWith('--'));

if (rounds.length !== 2) {
  console.error('usage: node scripts/pro-language-diff.mjs <roundA> <roundB> [--json] [--out=file.md]');
  process.exit(1);
}

// ── colour, in a space where distance means something ──────────────────────────────────────
// sRGB -> linear -> OKLab (Björn Ottosson's matrices). Used ONLY for distances and tolerances;
// nothing here paints anything, so the round trip is deliberately not implemented.
function oklab(hex) {
  const h = String(hex ?? '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const srgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

function distance(hexA, hexB) {
  const A = oklab(hexA);
  const B = oklab(hexB);
  if (!A || !B) return null;
  return Math.hypot(A.L - B.L, A.a - B.a, A.b - B.b);
}

/** The tolerance a "near" brand match is reported at. 0.05 in OKLab is a difference a viewer
 *  reads as the same colour rendered slightly differently, not as a different colour - stated
 *  here rather than buried, because every near-match rate below depends on it. */
const NEAR_TOLERANCE = 0.05;

// ── the fields, in the contract's own order ────────────────────────────────────────────────
const FIELDS = [
  ['typography.fontId', (l) => l.typography?.fontId],
  ['typography.headingWeight', (l) => l.typography?.headingWeight],
  ['typography.supportingWeight', (l) => l.typography?.supportingWeight],
  ['typography.step', (l) => l.typography?.step],
  ['typography.headingCase', (l) => l.typography?.headingCase],
  ['typography.supportingCase', (l) => l.typography?.supportingCase],
  ['typography.tracking', (l) => l.typography?.tracking],
  ['shape.corner', (l) => l.shape?.corner],
  ['shape.panel', (l) => l.shape?.panel],
  ['accent.form', (l) => l.accent?.form],
  ['accent.weight', (l) => l.accent?.weight],
  ['density', (l) => l.density],
  ['motion.character', (l) => l.motion?.character],
  ['motion.pace', (l) => l.motion?.pace],
];

function counts(values) {
  const map = new Map();
  for (const v of values) if (v !== undefined && v !== null) map.set(v, (map.get(v) ?? 0) + 1);
  return map;
}

/** Shannon entropy over the values that APPEARED, normalized by log2 of how many appeared.
 *  Undefined for a single value (there is no spread to measure), reported as 0.00 with its
 *  distinct count beside it so the two are never confused. */
function entropy(map) {
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  if (!total || map.size <= 1) return 0;
  let h = 0;
  for (const n of map.values()) {
    const p = n / total;
    h -= p * Math.log2(p);
  }
  return h / Math.log2(map.size);
}

function topLine(map) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
}

function signature(l) {
  return FIELDS.map(([, read]) => read(l) ?? '-').join('|');
}

// ── load ───────────────────────────────────────────────────────────────────────────────────
const brandFixture = JSON.parse(
  await readFile(path.resolve('benchmarks/pro/v1/spike/brands.json'), 'utf8'),
);
const brandById = new Map(brandFixture.brands.map((b) => [b.id, b]));

async function loadRound(dir) {
  const file = path.resolve(dir, 'results.json');
  const round = JSON.parse(await readFile(file, 'utf8'));
  const cells = (round.results ?? [])
    .filter((r) => r.kind === 'candidate' && r.language && !r.skipped)
    .map((r) => ({
      key: `${r.slug}`,
      brief: String(r.slug ?? '').split('.')[0],
      brand: r.brand ?? null,
      divergence: Boolean(r.divergence),
      language: r.language,
      fallbacks: r.languageFallbacks ?? [],
      costUsd: r.costUsd ?? 0,
      usage: r.usage ?? null,
      // What the composer had to CHANGE about the answer to render it. Present only on a round
      // that has been through `--recompose`, and worth a section of its own: a palette the
      // legibility ladder had to clamp is a language that did not read as returned.
      adjustments: r.recomposedAdjustments ?? null,
    }));
  return { dir, file, route: round.route, capturedAt: round.capturedAt, spentUsd: round.spentUsd, cells };
}

const [A, B] = await Promise.all(rounds.map(loadRound));

// ── the measurements ───────────────────────────────────────────────────────────────────────
function fieldTable(round) {
  const out = {};
  for (const [name, read] of FIELDS) {
    const map = counts(round.cells.map((c) => read(c.language)));
    out[name] = { distinct: map.size, entropy: entropy(map), spread: topLine(map) };
  }
  return out;
}

function collapse(round) {
  const map = new Map();
  for (const c of round.cells) {
    const sig = signature(c.language);
    if (!map.has(sig)) map.set(sig, []);
    map.get(sig).push(c.key);
  }
  const clusters = [...map.values()].sort((a, b) => b.length - a.length);
  return {
    cells: round.cells.length,
    distinct: map.size,
    largest: clusters[0]?.length ?? 0,
    sharedCells: clusters.filter((c) => c.length > 1).reduce((n, c) => n + c.length, 0),
    clusters: clusters.filter((c) => c.length > 1),
  };
}

function palette(round) {
  const accents = round.cells.map((c) => c.language.palette?.accent).filter(Boolean);
  const panels = round.cells.map((c) => c.language.palette?.panel).filter(Boolean);
  const pairs = [];
  for (let i = 0; i < accents.length; i += 1) {
    for (let j = i + 1; j < accents.length; j += 1) {
      const d = distance(accents[i], accents[j]);
      if (d !== null) pairs.push(d);
    }
  }
  const mean = pairs.length ? pairs.reduce((a, b) => a + b, 0) / pairs.length : null;
  const near = pairs.filter((d) => d <= NEAR_TOLERANCE).length;
  return {
    accents: accents.length,
    distinctAccents: new Set(accents.map((h) => h.toLowerCase())).size,
    distinctPanels: new Set(panels.map((h) => h.toLowerCase())).size,
    meanAccentDistance: mean,
    accentPairsWithinTolerance: near,
    accentPairs: pairs.length,
  };
}

function adherence(round) {
  let withBrand = 0;
  let accentExact = 0;
  let accentNear = 0;
  let panelExact = 0;
  let panelNear = 0;
  let typeface = 0;
  const misses = [];
  for (const c of round.cells) {
    const brand = c.brand ? brandById.get(c.brand) : null;
    if (!brand) continue;
    withBrand += 1;
    const hexes = brand.palette.map((p) => p.hex.toLowerCase());
    const accent = String(c.language.palette?.accent ?? '').toLowerCase();
    const panel = String(c.language.palette?.panel ?? '').toLowerCase();
    const nearest = (hex) => hexes
      .map((h) => ({ h, d: distance(hex, h) }))
      .filter((x) => x.d !== null)
      .sort((a, b) => a.d - b.d)[0] ?? null;
    const accentHit = nearest(accent);
    const panelHit = nearest(panel);
    if (hexes.includes(accent)) accentExact += 1;
    if (accentHit && accentHit.d <= NEAR_TOLERANCE) accentNear += 1;
    else misses.push({ key: c.key, brand: c.brand, field: 'accent', chose: accent, nearest: accentHit?.h ?? null, distance: accentHit?.d ?? null });
    if (hexes.includes(panel)) panelExact += 1;
    if (panelHit && panelHit.d <= NEAR_TOLERANCE) panelNear += 1;
    if (c.language.typography?.fontId === brand.typeface) typeface += 1;
  }
  return { withBrand, accentExact, accentNear, panelExact, panelNear, typeface, misses };
}

/** What the composer had to repair, per round. Read off the RECOMPOSED pass, so both rounds are
 *  measured by the same composer rather than by whichever one was live on their capture day. */
function repairs(round) {
  const measured = round.cells.filter((c) => Array.isArray(c.adjustments));
  const map = counts(measured.flatMap((c) => c.adjustments));
  return {
    measured: measured.length,
    cells: round.cells.length,
    cellsAdjusted: measured.filter((c) => c.adjustments.length).length,
    spread: map.size ? topLine(map) : 'none',
  };
}

function ledger(round) {
  const withReasoning = round.cells.filter((c) => c.usage && typeof c.usage.reasoning === 'number');
  const sum = (pick) => round.cells.reduce((n, c) => n + (c.usage?.[pick] ?? 0), 0);
  return {
    cells: round.cells.length,
    spentUsd: round.spentUsd ?? null,
    perCellUsd: round.cells.length ? round.cells.reduce((n, c) => n + c.costUsd, 0) / round.cells.length : null,
    input: sum('input'),
    output: sum('output'),
    reasoningRecorded: withReasoning.length,
    reasoning: withReasoning.reduce((n, c) => n + c.usage.reasoning, 0),
    fallbackCells: round.cells.filter((c) => c.fallbacks.length).length,
    fallbackFields: round.cells.flatMap((c) => c.fallbacks),
  };
}

const report = {
  generatedFrom: [A.file, B.file],
  nearToleranceOklab: NEAR_TOLERANCE,
  rounds: [A, B].map((r) => ({ dir: r.dir, route: r.route, capturedAt: r.capturedAt, cells: r.cells.length })),
  overlap: {
    both: A.cells.filter((c) => B.cells.some((d) => d.key === c.key)).map((c) => c.key),
    onlyA: A.cells.filter((c) => !B.cells.some((d) => d.key === c.key)).map((c) => c.key),
    onlyB: B.cells.filter((c) => !A.cells.some((d) => d.key === c.key)).map((c) => c.key),
  },
  fields: { A: fieldTable(A), B: fieldTable(B) },
  collapse: { A: collapse(A), B: collapse(B) },
  palette: { A: palette(A), B: palette(B) },
  adherence: { A: adherence(A), B: adherence(B) },
  repairs: { A: repairs(A), B: repairs(B) },
  ledger: { A: ledger(A), B: ledger(B) },
};

if (flag('json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// ── the written report ─────────────────────────────────────────────────────────────────────
const num = (v, digits = 2) => (v === null || v === undefined ? '-' : Number(v).toFixed(digits));
const pct = (n, d) => (d ? `${n}/${d} (${Math.round((n / d) * 100)}%)` : '-');
const lines = [];
const say = (s = '') => lines.push(s);

say(`# Two Pro design-language rounds, side by side`);
say();
say(`Machine counts only - no verdict is written here, and none belongs here (the picture`);
say(`gallery beside this file is blind on purpose).`);
say();
say('| | round A | round B |');
say('| --- | --- | --- |');
say(`| directory | \`${path.basename(A.dir)}\` | \`${path.basename(B.dir)}\` |`);
say(`| route | \`${A.route}\` | \`${B.route}\` |`);
say(`| captured | ${A.capturedAt ?? '-'} | ${B.capturedAt ?? '-'} |`);
say(`| cells with a language | ${A.cells.length} | ${B.cells.length} |`);
say();
say(`Cells present in both rounds: **${report.overlap.both.length}**.`
  + (report.overlap.onlyA.length ? ` Only in A: ${report.overlap.onlyA.join(', ')}.` : '')
  + (report.overlap.onlyB.length ? ` Only in B: ${report.overlap.onlyB.join(', ')}.` : ''));
say();

say('## 1. Field distributions');
say();
say('`distinct` is how many of the contract\'s values the round ever used; `entropy` is the');
say('normalized Shannon entropy over those values - 1.00 is a flat spread, 0.00 is one answer');
say('repeated. A high distinct count with a low entropy is a round with one habit and a few');
say('exceptions.');
say();
say('| field | A distinct | A entropy | A spread | B distinct | B entropy | B spread |');
say('| --- | ---: | ---: | --- | ---: | ---: | --- |');
for (const [name] of FIELDS) {
  const a = report.fields.A[name];
  const b = report.fields.B[name];
  say(`| \`${name}\` | ${a.distinct} | ${num(a.entropy)} | ${a.spread} | ${b.distinct} | ${num(b.entropy)} | ${b.spread} |`);
}
say();

say('## 2. Look collapse - how many briefs answered to the same design');
say();
say('The signature is every enum field above; the palette and the name are excluded, so two');
say('cells sharing a signature are the same design in different colours.');
say();
say('| | A | B |');
say('| --- | ---: | ---: |');
say(`| cells | ${report.collapse.A.cells} | ${report.collapse.B.cells} |`);
say(`| distinct signatures | ${report.collapse.A.distinct} | ${report.collapse.B.distinct} |`);
say(`| largest cluster | ${report.collapse.A.largest} | ${report.collapse.B.largest} |`);
say(`| cells sharing a signature with another | ${report.collapse.A.sharedCells} | ${report.collapse.B.sharedCells} |`);
say();
for (const [label, c] of [['A', report.collapse.A], ['B', report.collapse.B]]) {
  if (!c.clusters.length) { say(`Round ${label}: no two cells share a signature.`); say(); continue; }
  say(`Round ${label}'s shared signatures:`);
  say();
  for (const cluster of c.clusters) say(`- ${cluster.length} cells: ${cluster.join(', ')}`);
  say();
}

say('## 3. Palette spread');
say();
say(`Distance is OKLab euclidean, over every pair of accents in the round. "Within tolerance"`);
say(`counts pairs closer than ${NEAR_TOLERANCE} - a difference a viewer reads as the same colour.`);
say();
say('| | A | B |');
say('| --- | ---: | ---: |');
say(`| distinct accents | ${report.palette.A.distinctAccents} of ${report.palette.A.accents} | ${report.palette.B.distinctAccents} of ${report.palette.B.accents} |`);
say(`| distinct panels | ${report.palette.A.distinctPanels} | ${report.palette.B.distinctPanels} |`);
say(`| mean pairwise accent distance | ${num(report.palette.A.meanAccentDistance, 3)} | ${num(report.palette.B.meanAccentDistance, 3)} |`);
say(`| accent pairs within tolerance | ${report.palette.A.accentPairsWithinTolerance} of ${report.palette.A.accentPairs} | ${report.palette.B.accentPairsWithinTolerance} of ${report.palette.B.accentPairs} |`);
say();

say('## 4. Brand adherence');
say();
say('Every cell carries an assigned brand with a named palette and a typeface. This asks');
say('whether the language the model returned used them.');
say();
say('| | A | B |');
say('| --- | ---: | ---: |');
say(`| cells with a brand | ${report.adherence.A.withBrand} | ${report.adherence.B.withBrand} |`);
say(`| accent is a brand hex, exactly | ${pct(report.adherence.A.accentExact, report.adherence.A.withBrand)} | ${pct(report.adherence.B.accentExact, report.adherence.B.withBrand)} |`);
say(`| accent within ${NEAR_TOLERANCE} of a brand hex | ${pct(report.adherence.A.accentNear, report.adherence.A.withBrand)} | ${pct(report.adherence.B.accentNear, report.adherence.B.withBrand)} |`);
say(`| panel is a brand hex, exactly | ${pct(report.adherence.A.panelExact, report.adherence.A.withBrand)} | ${pct(report.adherence.B.panelExact, report.adherence.B.withBrand)} |`);
say(`| panel within ${NEAR_TOLERANCE} of a brand hex | ${pct(report.adherence.A.panelNear, report.adherence.A.withBrand)} | ${pct(report.adherence.B.panelNear, report.adherence.B.withBrand)} |`);
say(`| typeface is the brand's | ${pct(report.adherence.A.typeface, report.adherence.A.withBrand)} | ${pct(report.adherence.B.typeface, report.adherence.B.withBrand)} |`);
say();
for (const [label, a] of [['A', report.adherence.A], ['B', report.adherence.B]]) {
  if (!a.misses.length) { say(`Round ${label}: every accent is within tolerance of a brand colour.`); say(); continue; }
  say(`Round ${label}'s accents outside tolerance (chosen, nearest brand colour, distance):`);
  say();
  for (const m of a.misses) say(`- \`${m.key}\` (${m.brand}) chose ${m.chose}, nearest ${m.nearest ?? '-'} at ${num(m.distance, 3)}`);
  say();
}

say('## 5. What the composer had to repair');
say();
say('Read off the RECOMPOSED pass, so both rounds are measured by today\'s composer rather than');
say('by whichever one was live on their capture day. A `palette_*_clamped` code is a language');
say('whose own colours did not clear the legibility floor as returned; `mark_ink_knocked` is the');
say('brand mark being recoloured to read on the panel the language chose.');
say();
say('| | A | B |');
say('| --- | ---: | ---: |');
for (const [label, r] of [['A', report.repairs.A], ['B', report.repairs.B]]) {
  if (r.measured < r.cells) say(`| ${label}: cells with a recomposed record | ${r.measured} of ${r.cells} | |`);
}
say(`| cells the composer adjusted | ${pct(report.repairs.A.cellsAdjusted, report.repairs.A.measured)} | ${pct(report.repairs.B.cellsAdjusted, report.repairs.B.measured)} |`);
say(`| adjustments | ${report.repairs.A.spread} | ${report.repairs.B.spread} |`);
say();

say('## 6. Fallbacks, cost and reasoning');
say();
say('| | A | B |');
say('| --- | ---: | ---: |');
say(`| cells that fell back to the house on any field | ${report.ledger.A.fallbackCells} | ${report.ledger.B.fallbackCells} |`);
say(`| round total billed | $${num(report.ledger.A.spentUsd, 4)} | $${num(report.ledger.B.spentUsd, 4)} |`);
say(`| per generation | $${num(report.ledger.A.perCellUsd, 4)} | $${num(report.ledger.B.perCellUsd, 4)} |`);
say(`| input tokens | ${report.ledger.A.input} | ${report.ledger.B.input} |`);
say(`| output tokens | ${report.ledger.A.output} | ${report.ledger.B.output} |`);
// A missing measurement and a measured zero are different facts, so a round whose runner did
// not record reasoning tokens says that in the cell rather than printing 0.
const reasoningCell = (l) => {
  if (l.reasoningRecorded === 0) return 'not recorded at capture time';
  const share = Math.round((l.reasoning / (l.output || 1)) * 100);
  const over = l.reasoningRecorded === l.cells ? '' : ` (over ${l.reasoningRecorded} of ${l.cells} cells)`;
  return `${l.reasoning} = ${share}% of output${over}`;
};
say(`| reasoning tokens | ${reasoningCell(report.ledger.A)} | ${reasoningCell(report.ledger.B)} |`);
say();
const fallbackFields = (l) => (l.fallbackFields.length ? [...new Set(l.fallbackFields)].join(', ') : 'none');
say(`Fields that fell back - A: ${fallbackFields(report.ledger.A)}. B: ${fallbackFields(report.ledger.B)}.`);
say();

const text = `${lines.join('\n')}\n`;
const out = value('out');
if (out) {
  await writeFile(path.resolve(out), text, 'utf8');
  console.log(`wrote ${out}`);
} else {
  process.stdout.write(text);
}
