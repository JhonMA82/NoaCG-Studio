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
const rowsByKey = new Map(); // blind-key key -> row, for the judge-vs-reviewer join below
const addRow = (group, row) => {
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(row);
  rowsByKey.set(row.key, row);
};

for (const file of await findFiles(OUT, (name) => name.endsWith('-metrics.json'))) {
  const parsed = JSON.parse(await readFile(path.join(OUT, file), 'utf8'));
  // Mirror bench:gallery's key scoping exactly: nested runs carry their directory so a
  // judgement joins the ONE row that was reviewed; top-level metrics keep the old shape.
  const fileDir = path.dirname(file);
  const keyScope = fileDir && fileDir !== '.' ? `${fileDir.replaceAll('\\', '/')}:` : '';
  for (const row of parsed.rows ?? []) {
    addRow(parsed.candidate, {
      key: `${parsed.candidate}:${keyScope}${row.fixtureId}`,
      machineValid: row.status === 'machine-usable',
      costUsd: (row.costUsd ?? 0) + (row.judgeCostUsd ?? 0),
      latencyMs: row.latencyMs,
      repairs: row.repairs ?? 0,
      judgeVerdict: row.judgeVerdict ?? null,
      judgeScores: row.judgeScores ?? null,
      judgeReason: row.judgeReason ?? null,
      skinFinal: row.skinFinal ?? null,
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
      // An unscored side contributes no delta: treating a missing score as 0 would
      // manufacture a 5-point disagreement and make a consistent reviewer look erratic.
      if (a && b) {
        repeats.push({
          same: a.decision === b.decision,
          scoreDelta: typeof a.score === 'number' && typeof b.score === 'number'
            ? Math.abs(a.score - b.score) : null,
        });
      }
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
  // The vision-judge funnel over skinned results. Mean per-axis scores are the
  // calibration signal: compare them against blind-review outcomes before trusting the
  // threshold anywhere near production.
  const judgedSkins = rows.filter((r) => r.judgeVerdict === 'pass' || r.judgeVerdict === 'fail');
  // Read the axes off the rows rather than restating the contract's list: the judge gains
  // an axis when a blind review finds something it missed (textIntegrity did, 2026-07-29),
  // and a hardcoded copy here would silently keep reporting the old four.
  const judgeAxes = [...new Set(judgedSkins.flatMap((r) => Object.keys(r.judgeScores ?? {})))];
  const skinJudge = judgedSkins.length
    ? {
        judged: judgedSkins.length,
        passRate: judgedSkins.filter((r) => r.judgeVerdict === 'pass').length / judgedSkins.length,
        reverted: rows.filter((r) => r.skinFinal === 'judge-reverted').length,
        erroredOpen: rows.filter((r) => r.judgeVerdict === 'error').length,
        // Each axis averages over the rows that actually carry it, so an axis added
        // mid-programme reports its own honest mean instead of one diluted by the rounds
        // that predate it.
        meanScores: Object.fromEntries(judgeAxes.map((axis) => {
          const scored = judgedSkins.filter((r) => typeof r.judgeScores?.[axis] === 'number');
          return [axis, scored.length
            ? scored.reduce((sum, r) => sum + r.judgeScores[axis], 0) / scored.length
            : null];
        })),
      }
    : null;
  report.push({
    skinJudge,
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
      meanScoreDelta: (() => {
        const deltas = repeats.map((r) => r.scoreDelta).filter((d) => typeof d === 'number');
        return deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
      })(),
    }
  : null;

// Judge-vs-reviewer agreement. The threshold decides whether a skin airs or reverts, so the
// only thing that can justify a threshold is the judge agreeing with a human on the SAME
// item - never the group means above, which average two populations that never meet.
// Decisions only: reviewer yes/minor = accept, no = reject; judge pass = accept. The 1-5
// scores are deliberately excluded, they need far more items than blind review has produced.
const agreementItems = [];
for (const [key, list] of judgements) {
  const row = rowsByKey.get(key);
  if (!row || (row.judgeVerdict !== 'pass' && row.judgeVerdict !== 'fail')) continue;
  for (const j of list) {
    if (j.decision !== 'yes' && j.decision !== 'minor' && j.decision !== 'no') continue;
    agreementItems.push({
      key,
      reviewer: j.reviewer ?? 'anonymous',
      reviewerAccepts: j.decision !== 'no',
      decision: j.decision,
      note: j.note ?? null,
      judgeAccepts: row.judgeVerdict === 'pass',
      judgeScores: row.judgeScores,
      judgeReason: row.judgeReason,
    });
  }
}
let agreement = null;
if (agreementItems.length) {
  const cell = (rev, jud) => agreementItems.filter((i) => i.reviewerAccepts === rev && i.judgeAccepts === jud).length;
  // A false accept is the expensive cell: the judge cleared something a human rejected, so
  // it would have aired. A false revert only costs a skin.
  const falseAccepts = agreementItems.filter((i) => !i.reviewerAccepts && i.judgeAccepts);
  const falseReverts = agreementItems.filter((i) => i.reviewerAccepts && !i.judgeAccepts);
  // Raw agreement flatters a LOPSIDED judge: one that passes nearly everything scores well
  // against reviewers who also accept most things, purely by chance. Cohen's kappa corrects
  // for that, and it is the number to read when the two sides have very different accept
  // rates - which is exactly the regime a permissive judge creates.
  const n = agreementItems.length;
  const observed = (cell(true, true) + cell(false, false)) / n;
  const pJudge = (cell(true, true) + cell(false, true)) / n;
  const pReviewer = (cell(true, true) + cell(true, false)) / n;
  const expected = pJudge * pReviewer + (1 - pJudge) * (1 - pReviewer);
  agreement = {
    items: n,
    agreed: cell(true, true) + cell(false, false),
    observedAgreement: observed,
    kappa: expected < 1 ? (observed - expected) / (1 - expected) : null,
    matrix: {
      bothAccept: cell(true, true), reviewerAcceptJudgeReject: cell(true, false),
      reviewerRejectJudgeAccept: cell(false, true), bothReject: cell(false, false),
    },
    falseAccepts, falseReverts, detail: agreementItems,
  };
}

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
  if (r.skinJudge) {
    const means = Object.entries(r.skinJudge.meanScores)
      .map(([axis, mean]) => `${axis} ${mean === null ? 'n/a' : mean.toFixed(1)}`).join(', ');
    console.log(
      `  skin judge: ${pct(r.skinJudge.passRate)} of ${r.skinJudge.judged} passed, `
      + `${r.skinJudge.reverted} reverted${r.skinJudge.erroredOpen ? `, ${r.skinJudge.erroredOpen} errored open` : ''}; mean ${means}`,
    );
  }
}

// Reviewer notes are the fixable findings behind the numbers - print them per item.
const noted = [...judgements.entries()]
  .flatMap(([key, list]) => list.filter((j) => j.note).map((j) => ({ key, reviewer: j.reviewer, note: j.note })));
if (noted.length) {
  console.log('\nReviewer notes:');
  for (const { key, reviewer, note } of noted) console.log(`- ${key} [${reviewer}]: ${note}`);
}
if (agreement) {
  const m = agreement.matrix;
  console.log(`\nJudge vs reviewer, per item (${agreement.items} item(s) carry both verdicts):`);
  console.log('                    judge accept   judge revert');
  console.log(`  reviewer accept   ${String(m.bothAccept).padStart(8)}   ${String(m.reviewerAcceptJudgeReject).padStart(12)}`);
  console.log(`  reviewer reject   ${String(m.reviewerRejectJudgeAccept).padStart(8)}   ${String(m.bothReject).padStart(12)}`);
  console.log(`  agreement ${agreement.agreed}/${agreement.items}`
    + (agreement.kappa === null ? '' : ` (kappa ${agreement.kappa.toFixed(2)} after chance correction)`));
  if (agreement.kappa !== null && agreement.kappa < 0.4) {
    console.log('  Kappa is WEAK: the raw count above is mostly chance, not agreement.');
  }
  for (const i of agreement.falseAccepts) {
    console.log(`  FALSE ACCEPT (would have aired): ${i.key}`);
    console.log(`    reviewer "${i.note ?? i.decision}" vs judge ${JSON.stringify(i.judgeScores)}`);
  }
  for (const i of agreement.falseReverts) {
    console.log(`  false revert (cost a skin): ${i.key} - reviewer ${i.decision}, judge ${JSON.stringify(i.judgeScores)}`);
  }
  // Coin-flip agreement is the norm at these sample sizes; say so rather than letting a
  // reader treat a small majority as calibration.
  if (agreement.items < 20) {
    console.log(`  Too few items to set AI_LITE_JUDGE_THRESHOLD - blind-review more of the gallery first.`);
  }
} else {
  console.log('\nNo item carries both a reviewer decision and a judge verdict - the threshold is uncalibrated.');
}
if (consistency) {
  console.log(`\nReviewer self-consistency: ${pct(consistency.decisionAgreement)} decision agreement, ` +
    `mean score delta ${consistency.meanScoreDelta === null ? 'n/a (unscored)' : consistency.meanScoreDelta.toFixed(2)} `
    + `over ${consistency.repeats} planted repeats.`);
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

await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), report, consistency, agreement, notes: noted, sameness }, null, 2), 'utf8');
console.log(`Wrote ${path.join(OUT, 'report.json')}`);
