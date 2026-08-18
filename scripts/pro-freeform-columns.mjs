#!/usr/bin/env node
// THE MACHINE COLUMNS for a multi-checkpoint free-form coder round. FREE - it reads each
// round's `results.json` and calls nothing.
//
//   node scripts/pro-freeform-columns.mjs <round> <round> [...] [--out=<file.md>]
//
// The shape follows pro-language-diff.mjs: counts, rates and dollars only, NO verdict
// anywhere in the output. It sits beside the blind gallery, on the other side of the
// blinding line - a human writes notes against the pictures first, and these columns join
// the conversation only at reveal.
//
// WHAT IT ANSWERS, per checkpoint:
//   1. CONTRACT + VALIDATION - how many cells completed, passed the field contract, and
//      carried blocking errors after repair.
//   2. DEVICE-PROXY RATE - how many rendered frames carry a device (deviceCheck.ts): the two
//      live lines distinguishable by fill, radius, shape or axis, and which channels. A round
//      whose device rate is ~0 across every checkpoint is measuring the SPINE, not the models
//      (docs/MODEL_VS_HARNESS_STUDY.md §6).
//   3. TOKENS AND MONEY - input / output / reasoning per cell, the reasoning share of output,
//      cost per graphic and per 100 graphics. This is the four-way answer to "rate is not
//      cost": a checkpoint billing a lower rate can out-spend one billing triple, and only
//      the volumes say which (docs/NOACG_PRO_PLAN.md §19.3-19.4).
//      `usage.reasoning` exists only on rounds captured after 2026-08-17; where a round
//      predates it the column says "not recorded" rather than printing a zero, because a
//      missing measurement and a measured zero are different facts.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const rounds = args.filter((a) => !a.startsWith('--'));

// `--price=<roundName>=<inPerM>/<outPerM>` - price a round's cells from usage where the
// gateway reported no cost (the anthropic route reports none, so its ledger holds honest
// zeros). The §19.4 precedent: a cost settled by arithmetic beats a blank, and the column
// says `(priced)` so a reader knows which rule produced the number.
const priceOverrides = new Map(args.filter((a) => a.startsWith('--price='))
  .map((a) => {
    const [name, rates] = a.slice('--price='.length).split('=');
    const [inRate, outRate] = (rates ?? '').split('/').map(Number);
    return [name, { inRate, outRate }];
  }));

if (rounds.length < 2) {
  console.error('usage: node scripts/pro-freeform-columns.mjs <round> <round> [...] [--out=file.md]');
  process.exit(1);
}

const fmt = (n, dp = 0) => (Number.isFinite(n) ? n.toFixed(dp) : '-');

async function summarize(dir) {
  const ledger = JSON.parse(await readFile(path.resolve(dir, 'results.json'), 'utf8'));
  const cells = (ledger.results ?? []).filter((r) => r.kind === 'candidate' && !r.skipped);
  const done = cells.filter((r) => !r.error);
  const sum = (pick) => done.reduce((t, r) => t + (pick(r) ?? 0), 0);

  const reasoningRecorded = done.some((r) => typeof r.usage?.reasoning === 'number');
  const input = sum((r) => r.usage?.input);
  const output = sum((r) => r.usage?.output);
  const reasoning = reasoningRecorded ? sum((r) => r.usage?.reasoning) : null;
  const name = path.basename(path.resolve(dir));
  const override = priceOverrides.get(name);
  const reported = sum((r) => r.costUsd);
  const priced = override && !reported
    ? (input * override.inRate + output * override.outRate) / 1e6
    : null;
  const cost = priced ?? reported;

  const withDevice = done.filter((r) => r.deviceReport);
  const devicePresent = withDevice.filter((r) => r.deviceReport.present);
  const channelCounts = {};
  for (const r of devicePresent) {
    for (const c of r.deviceReport.channels) channelCounts[c.channel] = (channelCounts[c.channel] ?? 0) + 1;
  }

  return {
    name,
    priced: priced !== null,
    model: done[0]?.model ?? ledger.route ?? '?',
    planned: cells.length,
    completed: done.length,
    failed: cells.length - done.length,
    contractOk: done.filter((r) => r.contract?.scaffoldOk).length,
    blocking: done.filter((r) => (r.contract?.blockingErrors ?? []).length > 0).length,
    repairs: sum((r) => r.repairRounds),
    deviceMeasured: withDevice.length,
    devicePresent: devicePresent.length,
    channels: Object.entries(channelCounts).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`).join(', ') || '-',
    inputPerCell: input / Math.max(1, done.length),
    outputPerCell: output / Math.max(1, done.length),
    reasoningPerCell: reasoning === null ? null : reasoning / Math.max(1, done.length),
    reasoningShare: reasoning === null || !output ? null : reasoning / output,
    costPerCell: cost / Math.max(1, done.length),
    costPer100: (cost / Math.max(1, done.length)) * 100,
    spentUsd: cost,
  };
}

/** Per-TYPE columns (the custom-lane type sweep): deliverable rate, loop depth, what the
 *  paint instruments caught, drivability (from custom-lane-drive-spike.mjs' report where one
 *  was run), and money - per graphic type, because "does the loop generalize past lower
 *  thirds" is a per-type question a round total cannot answer. */
async function summarizeTypes(dir) {
  const ledger = JSON.parse(await readFile(path.resolve(dir, 'results.json'), 'utf8'));
  const done = (ledger.results ?? []).filter((r) => r.kind === 'candidate' && !r.skipped && !r.error);
  if (!done.some((r) => r.type)) return null;
  let drive = null;
  try {
    drive = JSON.parse(await readFile(path.resolve(dir, 'drive-report.json'), 'utf8'));
  } catch { /* the drive proof runs separately; absent = not run */ }
  const byType = new Map();
  for (const r of done) {
    const t = r.type ?? '-';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(r);
  }
  const rows = [];
  for (const [type, cells] of byType) {
    const paintCatches = cells.reduce((n, r) => n + (r.iterationLog ?? [])
      .reduce((m, it) => m + (it.findings ?? []).filter((f) => f.startsWith('field paint')).length, 0), 0);
    const driven = (drive?.report ?? []).filter((d) => cells.some((c) => c.slug === d.slug));
    rows.push({
      type,
      n: cells.length,
      deliverable: cells.filter((r) => r.deliverable).length,
      iterations: cells.reduce((n, r) => n + (r.iterations ?? 0), 0) / cells.length,
      paintCatches,
      drivable: driven.length ? `${driven.filter((d) => d.drivable).length} of ${driven.length}` : '-',
      costPerCell: cells.reduce((n, r) => n + (r.costUsd ?? 0), 0) / cells.length,
    });
  }
  return { name: path.basename(path.resolve(dir)), rows };
}

const summaries = [];
for (const dir of rounds) summaries.push(await summarize(dir));

const lines = [];
lines.push('# Free-form coder round - the machine columns');
lines.push('');
lines.push('Counts, rates and dollars only. No verdict on this page; the blind notes carry those.');
lines.push('');
const header = ['', ...summaries.map((s) => s.name)];
const row = (label, pick) => `| ${label} | ${summaries.map(pick).join(' | ')} |`;
lines.push(`| ${header.join(' | ')} |`);
lines.push(`|${header.map(() => '---').join('|')}|`);
lines.push(row('model', (s) => s.model));
lines.push(row('cells completed / planned', (s) => `${s.completed} / ${s.planned}`));
lines.push(row('contract ok', (s) => `${s.contractOk} of ${s.completed}`));
lines.push(row('cells with blocking errors', (s) => `${s.blocking}`));
lines.push(row('repair rounds fired (total)', (s) => `${s.repairs}`));
lines.push(row('device present', (s) => `${s.devicePresent} of ${s.deviceMeasured}`));
lines.push(row('device channels', (s) => s.channels));
lines.push(row('input tokens / graphic', (s) => fmt(s.inputPerCell)));
lines.push(row('output tokens / graphic', (s) => fmt(s.outputPerCell)));
lines.push(row('reasoning tokens / graphic', (s) => (s.reasoningPerCell === null ? 'not recorded' : fmt(s.reasoningPerCell))));
lines.push(row('reasoning share of output', (s) => (s.reasoningShare === null ? 'not recorded' : `${fmt(s.reasoningShare * 100)}%`)));
lines.push(row('cost / graphic', (s) => `$${fmt(s.costPerCell, 4)}${s.priced ? ' (priced)' : ''}`));
lines.push(row('cost / 100 graphics', (s) => `$${fmt(s.costPer100, 2)}${s.priced ? ' (priced)' : ''}`));
lines.push(row('round spend', (s) => `$${fmt(s.spentUsd, 4)}${s.priced ? ' (priced)' : ''}`));
lines.push('');

for (const dir of rounds) {
  const t = await summarizeTypes(dir);
  if (!t) continue;
  lines.push(`## Per-type - ${t.name}`);
  lines.push('');
  lines.push('| type | cells | delivered clean | iterations avg | unpainted-field catches | drivable | cost / graphic |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of t.rows) {
    lines.push(`| ${r.type} | ${r.n} | ${r.deliverable} of ${r.n} | ${fmt(r.iterations, 1)} | ${r.paintCatches} | ${r.drivable} | $${fmt(r.costPerCell, 4)} |`);
  }
  lines.push('');
}

const text = lines.join('\n');
console.log(text);
const outFile = value('out');
if (outFile) {
  await writeFile(path.resolve(outFile), `${text}`);
  console.log(`Written: ${outFile}`);
}
