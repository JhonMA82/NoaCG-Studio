#!/usr/bin/env node
// The E2E TIME BUDGET - the tripwire that makes suite growth visible while it happens.
//
//   node scripts/e2e-budget.mjs <merged-report.json> [--max-avg-ms N]
//
// It reads a Playwright JSON report (the nightly merges its eight shard blobs into one) and
// answers two DIFFERENT questions that a single "total time" number conflates:
//
//   ADDING TESTS is healthy. A pack that ships a spec is doing the right thing, and a budget
//   that fails on it teaches everyone to raise the budget - which is how a gate becomes a
//   formality. So the total is REPORTED, never enforced.
//
//   TESTS GETTING SLOWER is the regression. That shows up as the mean per-test duration
//   rising, independently of how many there are, and that is what this ENFORCES.
//
// Measured 2026-07-31 on the first green nightly: 615 tests, 41.4 min aggregate, 4.04 s mean.
// (591 tests / 45.5 min / 4.62 s the day before - more tests, less time, because the preview
// debounce dropped from 350 ms to 50 ms under test.) The ceiling below sits ~24% above the
// current mean: far enough that runner-to-runner variance cannot trip it, close enough that a
// real slowdown does.
//
// RAISING IT IS A DELIBERATE ACT. If this fails, the question is "what got slower", and the
// slowest-files table below is the first place to look. Bumping the number is the answer only
// when the work genuinely costs more per test and everyone agrees to pay it - say so in the
// commit.
const DEFAULT_MAX_AVG_MS = 5000;

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const reportPath = args.find((a) => !a.startsWith('--'));
const maxAvgArg = args.indexOf('--max-avg-ms');
const maxAvg = maxAvgArg >= 0 ? Number(args[maxAvgArg + 1]) : DEFAULT_MAX_AVG_MS;

if (!reportPath) {
  console.error('usage: node scripts/e2e-budget.mjs <merged-report.json> [--max-avg-ms N]');
  process.exit(2);
}

/** Every test's total duration, flattened out of Playwright's nested suites. A test that
 *  retried would sum its attempts; this suite runs with retries: 0, so it is one result. */
function collect(report) {
  const out = [];
  const walk = (suite, file) => {
    for (const spec of suite.specs ?? []) {
      const ms = (spec.tests ?? [])
        .flatMap((t) => t.results ?? [])
        .reduce((a, r) => a + (r.duration ?? 0), 0);
      out.push({ file: file ?? suite.file ?? '(unknown)', title: spec.title, ms });
    }
    for (const child of suite.suites ?? []) walk(child, file ?? suite.file);
  };
  for (const suite of report.suites ?? []) walk(suite, suite.file);
  return out;
}

const tests = collect(JSON.parse(readFileSync(reportPath, 'utf8')));
if (tests.length === 0) {
  console.error('e2e-budget: the report contains no tests - refusing to report a budget on nothing.');
  process.exit(2);
}

const totalMs = tests.reduce((a, t) => a + t.ms, 0);
const avgMs = totalMs / tests.length;

const byFile = new Map();
for (const t of tests) {
  const cur = byFile.get(t.file) ?? { n: 0, ms: 0 };
  cur.n += 1;
  cur.ms += t.ms;
  byFile.set(t.file, cur);
}
const slowest = [...byFile.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10);

console.log('E2E time budget');
console.log(`  tests            ${tests.length}`);
console.log(`  aggregate        ${(totalMs / 60000).toFixed(1)} min   (reported, never enforced)`);
console.log(`  mean per test    ${(avgMs / 1000).toFixed(2)} s   (ceiling ${(maxAvg / 1000).toFixed(2)} s)`);
console.log('  slowest spec files:');
for (const [file, v] of slowest) {
  console.log(
    `    ${(v.ms / 60000).toFixed(2).padStart(6)} min  ${String(v.n).padStart(4)} tests  ${(v.ms / v.n / 1000).toFixed(1).padStart(5)} s/test  ${file}`,
  );
}

if (avgMs > maxAvg) {
  console.error(
    `\n::error title=E2E budget::Mean per-test time is ${(avgMs / 1000).toFixed(2)} s, over the ${(maxAvg / 1000).toFixed(2)} s ceiling. ` +
      'Tests got SLOWER - this does not fire merely because the suite grew. Start with the slowest files above.',
  );
  process.exit(1);
}
console.log('\nWithin budget.');
