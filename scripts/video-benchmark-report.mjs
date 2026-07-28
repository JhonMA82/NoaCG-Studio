// Build a deterministic leaderboard from machine checks plus optional, separate human
// scores. Missing human review stays explicit and never turns an automated pass into a
// subjective quality claim.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const input = path.resolve(
  process.argv.find((arg) => arg.startsWith('--input='))?.slice('--input='.length)
    ?? process.argv[2]
    ?? 'video-benchmark-out',
);
const results = JSON.parse(await readFile(path.join(input, 'benchmark-results.json'), 'utf8'));
const human = JSON.parse(
  await readFile(path.join(input, 'human-scores.json'), 'utf8').catch(() => '{"scores":{}}'),
);

const scored = results.cases.map((item) => {
  const machine = machineScore(item);
  const fields = Object.values(human.scores?.[item.caseId] ?? {}).filter(Number.isFinite);
  const humanScore = fields.length ? fields.reduce((sum, value) => sum + value, 0) / fields.length * 10 : null;
  return {
    ...item,
    machineScore: machine,
    humanScore,
    overallScore: humanScore === null ? machine : machine * 0.4 + humanScore * 0.6,
  };
});

const grouped = new Map();
for (const item of scored) {
  const key = `${item.provider}:${item.model}`;
  const group = grouped.get(key) ?? {
    key,
    provider: item.provider,
    model: item.model,
    classes: item.modelClass ?? [],
    cases: [],
  };
  group.cases.push(item);
  grouped.set(key, group);
}
const models = [...grouped.values()].map((group) => {
  const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const costKnown = group.cases.every((item) => item.estimatedCostUsd !== null);
  const cost = costKnown
    ? group.cases.reduce((sum, item) => sum + item.estimatedCostUsd, 0)
    : null;
  const overall = average(group.cases.map((item) => item.overallScore));
  return {
    ...group,
    overall,
    machine: average(group.cases.map((item) => item.machineScore)),
    human: group.cases.every((item) => item.humanScore === null)
      ? null
      : average(group.cases.filter((item) => item.humanScore !== null).map((item) => item.humanScore)),
    cost,
    value: cost === null ? null : overall / Math.max(0.001, cost),
    firstPass: group.cases.filter((item) => item.ok && item.repairRounds === 0).length / group.cases.length,
    remotion: average(group.cases.filter((item) => item.engine === 'remotion').map((item) => item.overallScore)),
    hyperframes: average(group.cases.filter((item) => item.engine === 'hyperframes').map((item) => item.overallScore)),
  };
});

const rankings = {
  quality: rank(models, (item) => item.overall),
  value: rank(models.filter((item) => item.value !== null), (item) => item.value),
  free: rank(models.filter((item) =>
    item.classes.includes('free') || item.cases.some((entry) => entry.modelMetadata?.free),
  ), (item) => item.overall),
  remotion: rank(models, (item) => item.remotion),
  hyperframes: rank(models, (item) => item.hyperframes),
  firstPass: rank(models, (item) => item.firstPass),
};

await writeFile(path.join(input, 'leaderboard.json'), `${JSON.stringify({
  schemaVersion: 1,
  benchmarkVersion: results.benchmarkVersion,
  generatedAt: new Date().toISOString(),
  humanReviewComplete: scored.every((item) => item.humanScore !== null),
  models,
  rankings: Object.fromEntries(
    Object.entries(rankings).map(([key, value]) => [key, value.map((item) => item.key)]),
  ),
}, null, 2)}\n`);
await writeFile(path.join(input, 'leaderboard.html'), html(results, models, rankings, scored));
console.log(`Leaderboard -> ${path.join(input, 'leaderboard.html')}`);

function machineScore(item) {
  let score = 0;
  if (item.ok) score += 20;
  if (item.gate?.ok) score += 20;
  if (item.gate?.probed) score += 10;
  if (!(item.issues ?? []).length) score += 15;
  if (!(item.deadVars ?? []).length) score += 10;
  if (item.render?.attempted && item.render.ok) score += 10;
  score += Math.max(0, 15 - (item.repairRounds ?? 0) * 7.5);
  return score;
}

function rank(items, score) {
  return [...items].sort((a, b) => score(b) - score(a));
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function ranking(title, items, metric) {
  const content = items.length
    ? `<ol>${items.map((item) =>
        `<li><strong>${escape(item.model)}</strong> <span>${escape(metric(item))}</span></li>`,
      ).join('')}</ol>`
    : '<p>No measured data in this run.</p>';
  return `<section><h2>${escape(title)}</h2>${content}</section>`;
}

function html(meta, modelRows, rankSets, cases) {
  const reviewed = cases.every((item) => item.humanScore !== null);
  const rows = modelRows.sort((a, b) => b.overall - a.overall).map((item) => `<tr>
    <td>${escape(item.model)}</td><td>${escape(item.provider)}</td>
    <td>${item.overall.toFixed(1)}</td><td>${item.machine.toFixed(1)}</td>
    <td>${item.human === null ? 'Pending' : item.human.toFixed(1)}</td>
    <td>${(item.firstPass * 100).toFixed(0)}%</td><td>${item.cost === null ? 'Unknown' : `$${item.cost.toFixed(4)}`}</td>
  </tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>NoaCG video model benchmark</title>
<style>
body{margin:0;padding:32px;background:#10141b;color:#e8ecf2;font:14px/1.5 system-ui}
h1{font-size:24px}h2{font-size:16px}p,span{color:#98a3b3}
.notice{padding:12px;border:1px solid #76551f;background:#241d11;border-radius:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
section{padding:14px 16px;border:1px solid #283140;border-radius:10px;background:#171d26}
li{margin:6px 0}li span{float:right}table{width:100%;border-collapse:collapse;margin:20px 0}
th,td{text-align:left;padding:9px;border-bottom:1px solid #283140}th{color:#f6ad45}
</style>
<h1>NoaCG video benchmark ${escape(meta.benchmarkVersion)}</h1>
<p>Runtime ${escape(meta.runtimeCommit)} - ${cases.length} cases - machine checks and human review remain separate.</p>
${reviewed ? '' : '<p class="notice">Human visual scoring is incomplete. Overall scores currently equal deterministic machine scores and are provisional.</p>'}
<table><thead><tr><th>Model</th><th>Provider</th><th>Overall</th><th>Machine</th><th>Human</th><th>First pass</th><th>Cost</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="grid">
${ranking('Best quality', rankSets.quality, (item) => item.overall.toFixed(1))}
${ranking('Best value', rankSets.value, (item) => item.value.toFixed(1))}
${ranking('Best free model', rankSets.free, (item) => item.overall.toFixed(1))}
${ranking('Best Remotion model', rankSets.remotion, (item) => item.remotion.toFixed(1))}
${ranking('Best HyperFrames model', rankSets.hyperframes, (item) => item.hyperframes.toFixed(1))}
${ranking('Best first-pass reliability', rankSets.firstPass, (item) => `${(item.firstPass * 100).toFixed(0)}%`)}
</div>`;
}
