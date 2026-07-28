// Aggregate NoaCG Lite benchmark output into one honest report. Never collapses to a
// single number: machine validity, human acceptance, and human visual score stay
// visibly separate, and every candidate is positioned between the calibration floor and
// gold ceiling (docs/AI_LITE_BENCHMARK.md).
//
//   npm run bench:report [-- out-dir]
//
// Reads under out-dir: *-metrics.json (paid eval runs), calibration/calibration-summary
// .json, blind-key.json + judgements.jsonl (from bench:gallery). Writes report.json and
// prints the summary table.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { classifyFailure } from './ai-lite-bench/taxonomy.mjs';

const OUT = path.resolve(process.argv[2] || './lite-bench-out');

async function findFiles(dir, predicate, relative = '') {
  const found = [];
  let entries;
  try {
    entries = await readdir(path.join(dir, relative), { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const rel = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory() && entry.name !== '.raw-video') found.push(...await findFiles(dir, predicate, rel));
    else if (predicate(entry.name)) found.push(rel);
  }
  return found;
}

const groups = new Map(); // candidate/arm -> rows
const addRow = (group, row) => {
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(row);
};

for (const file of await findFiles(OUT, (name) => name.endsWith('-metrics.json'))) {
  const parsed = JSON.parse(await readFile(path.join(OUT, file), 'utf8'));
  for (const row of parsed.rows ?? []) {
    addRow(parsed.candidate, {
      key: `${parsed.candidate}:${row.fixtureId}`,
      machineValid: row.status === 'machine-usable',
      costUsd: row.costUsd ?? 0,
      latencyMs: row.latencyMs,
      repairs: row.repairs ?? 0,
      failureCode: classifyFailure({
        // Fixture-bank briefs are all supported lower thirds - an unsupported answer is
        // a category miss; a failed call carries its provider code.
        expect: { decision: 'ready', aiCategory: 'lower-third' },
        decision: row.status === 'unsupported' ? { status: 'unsupported' } : { status: 'ready' },
        aiCategory: row.status === 'unsupported' ? null : 'lower-third',
        providerErrorCode: row.status === 'failed' ? (row.errorCode ?? 'provider') : null,
        validationRuleCodes: row.ruleCodes ?? [],
      }),
    });
  }
}

for (const file of await findFiles(OUT, (name) => name === 'calibration-summary.json')) {
  const parsed = JSON.parse(await readFile(path.join(OUT, file), 'utf8'));
  for (const row of parsed.rows ?? []) {
    addRow(row.arm, {
      key: `${row.arm}:${row.id}`,
      machineValid: Boolean(row.ok),
      costUsd: 0,
      latencyMs: row.ms,
      repairs: 0,
      failureCode: row.ok ? null : classifyFailure({ compileError: row.compileError, validationRuleCodes: row.ruleCodes ?? [] }),
    });
  }
  if (parsed.context) console.log('Context measurements:', JSON.stringify(parsed.context));
}

// Judgements join through the blind key. Every judgements*.jsonl in the out dir merges -
// one file per reviewer (the gallery downloads judgements-<initials>.jsonl), so a class
// of student reviewers just drop their files side by side.
const judgements = new Map(); // item key -> [{decision, score, reviewer, note}]
const repeats = [];
try {
  const key = JSON.parse(await readFile(path.join(OUT, 'blind-key.json'), 'utf8'));
  const byCode = new Map(key.map((entry) => [entry.code, entry]));
  const files = (await readdir(OUT)).filter((name) => /^judgements.*\.jsonl$/.test(name));
  if (!files.length) throw new Error('none');
  // Repeat-item consistency is per reviewer: compare a reviewer's repeat against THEIR base.
  const judgedByReviewer = new Map(); // reviewer -> Map(code -> judgement)
  for (const file of files) {
    for (const line of (await readFile(path.join(OUT, file), 'utf8')).split('\n').filter(Boolean)) {
      const j = JSON.parse(line);
      const reviewer = j.reviewer ?? 'anonymous';
      if (!judgedByReviewer.has(reviewer)) judgedByReviewer.set(reviewer, new Map());
      judgedByReviewer.get(reviewer).set(j.code, j);
      const entry = byCode.get(j.code);
      if (!entry) continue;
      if (!judgements.has(entry.key)) judgements.set(entry.key, []);
      judgements.get(entry.key).push(j);
    }
  }
  for (const [, judged] of judgedByReviewer) {
    for (const entry of key.filter((e) => e.repeatOf)) {
      const a = judged.get(entry.repeatOf);
      const b = judged.get(entry.code);
      if (a && b) repeats.push({ same: a.decision === b.decision, scoreDelta: Math.abs((a.score ?? 0) - (b.score ?? 0)) });
    }
  }
  console.log(`Merged ${files.length} reviewer file(s): ${files.join(', ')}`);
} catch {
  console.log('No judgements yet (run bench:gallery, review, and drop judgements*.jsonl into the out dir).');
}

const report = [];
for (const [group, rows] of groups) {
  const n = rows.length;
  const valid = rows.filter((r) => r.machineValid).length;
  const cost = rows.reduce((sum, r) => sum + r.costUsd, 0);
  const judgedRows = rows.map((r) => judgements.get(r.key) ?? []).flat();
  const accepted = judgedRows.filter((j) => j.decision === 'yes' || j.decision === 'minor').length;
  const scores = judgedRows.map((j) => j.score).filter((s) => typeof s === 'number');
  const taxonomy = {};
  for (const r of rows) if (r.failureCode) taxonomy[r.failureCode] = (taxonomy[r.failureCode] ?? 0) + 1;
  report.push({
    group,
    runs: n,
    machineValidRate: n ? valid / n : 0,
    totalCostUsd: cost,
    costPerCallUsd: n ? cost / n : 0,
    costPerMachineValidUsd: valid ? cost / valid : null,
    judged: judgedRows.length,
    acceptanceRate: judgedRows.length ? accepted / judgedRows.length : null,
    meanScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    costPerAcceptedUsd: accepted ? cost / accepted : null,
    repairShare: n ? rows.filter((r) => r.repairs > 0).length / n : 0,
    medianLatencyMs: rows.map((r) => r.latencyMs).filter(Boolean).sort((a, b) => a - b)[Math.floor(n / 2)] ?? null,
    failureTaxonomy: taxonomy,
  });
}
report.sort((a, b) => (a.costPerAcceptedUsd ?? Infinity) - (b.costPerAcceptedUsd ?? Infinity));

const consistency = repeats.length
  ? {
      repeats: repeats.length,
      decisionAgreement: repeats.filter((r) => r.same).length / repeats.length,
      meanScoreDelta: repeats.reduce((sum, r) => sum + r.scoreDelta, 0) / repeats.length,
    }
  : null;

const pct = (x) => (x === null || x === undefined ? '-' : `${Math.round(x * 100)}%`);
const usd = (x) => (x === null || x === undefined ? '-' : `$${x.toFixed(4)}`);
console.log('\ngroup | runs | machine-valid | judged | accepted | mean score | cost/call | cost/valid | cost/accepted');
for (const r of report) {
  console.log(
    `${r.group} | ${r.runs} | ${pct(r.machineValidRate)} | ${r.judged} | ${pct(r.acceptanceRate)} | ` +
    `${r.meanScore === null ? '-' : r.meanScore.toFixed(2)} | ${usd(r.costPerCallUsd)} | ${usd(r.costPerMachineValidUsd)} | ${usd(r.costPerAcceptedUsd)}`,
  );
  const failures = Object.entries(r.failureTaxonomy);
  if (failures.length) console.log(`  failures: ${failures.map(([code, count]) => `${code}×${count}`).join(', ')}`);
}

// Reviewer notes are the fixable findings behind the numbers - print them per item.
const noted = [...judgements.entries()]
  .flatMap(([key, list]) => list.filter((j) => j.note).map((j) => ({ key, reviewer: j.reviewer, note: j.note })));
if (noted.length) {
  console.log('\nReviewer notes:');
  for (const { key, reviewer, note } of noted) console.log(`- ${key} [${reviewer}]: ${note}`);
}
if (consistency) {
  console.log(`\nReviewer self-consistency: ${pct(consistency.decisionAgreement)} decision agreement, ` +
    `mean score delta ${consistency.meanScoreDelta.toFixed(2)} over ${consistency.repeats} planted repeats.`);
  if (consistency.decisionAgreement < 0.8) {
    console.log('Self-agreement is LOW: widen the promotion threshold - small deltas cannot discriminate.');
  }
}
console.log('\nGold is the catalog ceiling and floor the zero-model baseline: read every candidate as a position between them.');

// The sameness metric (bench:sameness) folds in when it has been computed for this dir.
let sameness = null;
try {
  sameness = JSON.parse(await readFile(path.join(OUT, 'sameness.json'), 'utf8'));
  console.log('\nSameness (bench:sameness; relative distances, min pair is the tripwire):');
  for (const s of sameness.summary ?? []) {
    if (!s.pairwise) continue;
    const min = (s.pairwise.min * 100).toFixed(2);
    const mean = (s.pairwise.mean * 100).toFixed(2);
    const houseLine = s.minHouseDistance !== undefined
      ? `; nearest-house min ${(s.minHouseDistance * 100).toFixed(2)}`
      : '';
    console.log(`- ${s.label}: mean ${mean}, min ${min} (${s.pairwise.minPair.join(' ~ ')})${houseLine}`);
  }
} catch {
  console.log('\nNo sameness.json yet (run bench:sameness over this dir to measure visual diversity).');
}

await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), report, consistency, notes: noted, sameness }, null, 2), 'utf8');
console.log(`Wrote ${path.join(OUT, 'report.json')}`);
