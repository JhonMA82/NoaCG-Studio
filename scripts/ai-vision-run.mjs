// Run the import-analysis vision suite and score it (docs/AI_PLATFORM_PLAN.md §8).
//
//   npm run bench:vision -- <out-dir> --arm=gold|floor|model [--model=<id>]
//                           [--holdout] [--confirm-spend]
//
// Arms:
//   gold   - the ground truth fed back as the prediction. Costs nothing and measures the
//            SCORER, not a model: anything below a perfect score here is a bug in the
//            metric or the dataset, and a ceiling that is not 1.0 makes every model number
//            below it unreadable.
//   floor  - a seeded, schema-valid analysis produced with no sight of the image. The
//            zero-knowledge baseline. A model that cannot clear the floor has learned
//            nothing from the pixels, and the floor is never zero because guessing the
//            common case (a lower third with a name) is sometimes right.
//   model  - the real paid call through /api/ai/tasks/import-analysis. SPENDS REAL MONEY
//            and refuses to start without --confirm-spend.
//
// HOLDOUT: excluded unless --holdout is passed, so a development report cannot quietly
// include the cases that exist to catch overfitting.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scoreAnalysis } from './ai-vision-bench/groundTruth.mjs';
import { devPort } from './dev-port.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const has = (name) => args.includes(`--${name}`);
const OUT = path.resolve(args.find((a) => !a.startsWith('--')) || './vision-bench-out');
const ARM = flag('arm') ?? 'gold';
const MODEL = flag('model') ?? '';
const INCLUDE_HOLDOUT = has('holdout');
const CONFIRMED = has('confirm-spend');
const MAX_CALLS = 60;
const MAX_COST_USD = 1.0;

const all = (await readFile(path.join(OUT, 'ground-truth.jsonl'), 'utf8'))
  .split('\n').filter(Boolean).map((line) => JSON.parse(line));
const records = all.filter((r) => (INCLUDE_HOLDOUT ? true : r.split === 'dev'));
if (!records.length) {
  console.error('No records for this split. Generate the dataset first (bench:vision:dataset + bench:vision:hostile).');
  process.exit(1);
}

// ── Arms ────────────────────────────────────────────────────────────────────

/** Ground truth as a prediction, translated into the CONTRACT's field names - the analysis
 *  calls it suggestedFontId where ground truth calls it fontId, and a ceiling that quietly
 *  compared a field against itself under two names would hide a real scoring bug. */
function goldPrediction(record) {
  return {
    version: 1,
    graphicType: record.truth.graphicType,
    graphicTypeConfidence: 1,
    canvas: record.truth.canvas,
    regions: record.truth.regions.map((r) => ({
      kind: r.kind,
      bbox: r.bbox,
      confidence: 1,
      role: r.role ?? undefined,
      sampleText: r.sampleText,
      typography: r.typography
        ? {
            classification: r.typography.classification,
            matchQuality: 'similar-available',
            suggestedFontId: r.typography.fontId,
            approxWeight: r.typography.approxWeight,
            fontSizeNorm: r.typography.fontSizeNorm,
            color: r.typography.color,
          }
        : undefined,
    })),
    warnings: [],
  };
}

/** Deterministic PRNG so the floor is reproducible: a baseline that moves between runs
 *  cannot anchor anything. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES = ['lower-third', 'title-card', 'scoreboard', 'info-graphic', 'quote-card', 'name-strap', 'other'];
const ROLES = ['person-name', 'person-role', 'organization', 'team-name', 'story-headline',
  'event-name', 'location', 'score', 'time', 'supporting-context', 'other'];
const FONTS = ['inter', 'space-grotesk', 'jetbrains-mono', 'manrope', 'archivo', 'oswald', 'bebas-neue'];

function floorPrediction(record, index) {
  const rand = mulberry32(0x5eed + index * 977);
  // Weighted to the common case rather than uniform: a floor that guesses absurdly is too
  // easy to beat and flatters every model above it.
  const graphicType = rand() < 0.5 ? 'lower-third' : TYPES[Math.floor(rand() * TYPES.length)];
  const count = 1 + Math.floor(rand() * 3);
  const regions = Array.from({ length: count }, () => {
    const w = 0.15 + rand() * 0.4;
    const h = 0.03 + rand() * 0.06;
    return {
      kind: 'text',
      bbox: { x: rand() * (1 - w), y: 0.6 + rand() * (0.35 - h), w, h },
      confidence: 0.5,
      role: ROLES[Math.floor(rand() * ROLES.length)],
      sampleText: 'Sample',
      typography: {
        classification: 'sans',
        matchQuality: 'general-classification',
        suggestedFontId: FONTS[Math.floor(rand() * FONTS.length)],
        color: '#ffffff',
      },
    };
  });
  return { version: 1, graphicType, graphicTypeConfidence: 0.3, canvas: record.truth.canvas, regions, warnings: [] };
}

async function modelPrediction(record) {
  const base64 = (await readFile(path.join(OUT, record.image))).toString('base64');
  const response = await fetch(`http://localhost:${devPort()}/api/ai/tasks/import-analysis`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${(process.env.NOACG_VISION_BEARER_TOKEN ?? '').trim()}`,
    },
    body: JSON.stringify({
      idempotencyKey: `${record.id}-${Date.now()}`,
      image: {
        base64,
        mediaType: 'image/png',
        width: Math.round(record.truth.canvas.aspect * 1080),
        height: 1080,
      },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? `HTTP ${response.status}`);
    error.code = body?.error?.code ?? `http_${response.status}`;
    throw error;
  }
  return { analysis: body.analysis, costUsd: body.costUsd ?? 0, latencyMs: body.latencyMs ?? null };
}

// ── Run ─────────────────────────────────────────────────────────────────────

if (ARM === 'model') {
  if (!CONFIRMED) {
    console.log(`DRY RUN: ${records.length} image(s) would be analyzed by ${MODEL || 'the configured route'}.`);
    console.log('Re-run with --confirm-spend to execute. Caps: '
      + `${MAX_CALLS} calls / $${MAX_COST_USD}.`);
    process.exit(0);
  }
  if (records.length > MAX_CALLS) {
    console.error(`${records.length} records exceeds the ${MAX_CALLS}-call cap.`);
    process.exit(1);
  }
}

const rows = [];
let totalCost = 0;
for (const [index, record] of records.entries()) {
  let prediction = null;
  let costUsd = 0;
  let error = null;
  try {
    if (ARM === 'gold') prediction = goldPrediction(record);
    else if (ARM === 'floor') prediction = floorPrediction(record, index);
    else {
      const result = await modelPrediction(record);
      prediction = result.analysis;
      costUsd = result.costUsd;
      totalCost += costUsd;
      if (totalCost > MAX_COST_USD) throw new Error('cost ceiling reached');
    }
  } catch (e) {
    error = e?.code ?? String(e.message ?? e);
  }
  const score = scoreAnalysis(record, prediction);
  rows.push({ id: record.id, source: record.source, split: record.split, error, costUsd, ...score });
}

const mean = (key) => {
  const xs = rows.map((r) => r[key]).filter((x) => typeof x === 'number');
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};
const pct = (x) => (x === null ? '-' : `${Math.round(x * 100)}%`);
const num = (x) => (x === null ? '-' : x.toFixed(3));

const tripwires = records.filter((r) => !r.truth.hasEditableText);
const hallucinated = rows.filter((r, i) => !records[i].truth.hasEditableText && r.hallucinatedRegions > 0);

const summary = {
  suite: 'import-analysis-v1',
  arm: ARM,
  model: MODEL || null,
  includedHoldout: INCLUDE_HOLDOUT,
  records: rows.length,
  schemaSuccessRate: rows.filter((r) => r.schemaOk).length / rows.length,
  graphicTypeAccuracy: rows.filter((r) => r.graphicTypeCorrect).length / rows.length,
  meanPrecision: mean('precision'),
  meanRecall: mean('recall'),
  meanIou: mean('meanIou'),
  roleAccuracy: mean('roleAccuracy'),
  fontClassAccuracy: mean('fontClassAccuracy'),
  fontIdAccuracy: mean('fontIdAccuracy'),
  meanColorDelta: mean('meanColorDelta'),
  meanEditsRequired: mean('editsRequired'),
  tripwires: tripwires.length,
  tripwiresHallucinated: hallucinated.length,
  totalCostUsd: totalCost,
  rows,
};
await writeFile(path.join(OUT, `vision-report-${ARM}.json`), JSON.stringify(summary, null, 2), 'utf8');

console.log(`\nimport-analysis-v1 | arm=${ARM}${MODEL ? ` (${MODEL})` : ''} | `
  + `${rows.length} record(s)${INCLUDE_HOLDOUT ? ' INCLUDING HOLDOUT' : ' (dev split)'}\n`);
console.log(`  schema ok            ${pct(summary.schemaSuccessRate)}`);
console.log(`  graphic type         ${pct(summary.graphicTypeAccuracy)}`);
console.log(`  region precision     ${pct(summary.meanPrecision)}`);
console.log(`  region recall        ${pct(summary.meanRecall)}`);
console.log(`  mean IoU (matched)   ${num(summary.meanIou)}`);
console.log(`  role accuracy        ${pct(summary.roleAccuracy)}`);
console.log(`  font class accuracy  ${pct(summary.fontClassAccuracy)}`);
console.log(`  bundled font pick    ${pct(summary.fontIdAccuracy)}`);
console.log(`  mean colour delta    ${num(summary.meanColorDelta)}  (0 = exact)`);
console.log(`  mean edits required  ${num(summary.meanEditsRequired)}  (regions a user must fix)`);
console.log(`  no-text tripwires    ${summary.tripwiresHallucinated}/${summary.tripwires} hallucinated`);
if (ARM === 'model') console.log(`  cost                 $${totalCost.toFixed(4)}`);

const failed = rows.filter((r) => r.error);
if (failed.length) {
  console.log(`\n  ${failed.length} failed: ${[...new Set(failed.map((r) => r.error))].join(', ')}`);
}
if (ARM === 'gold' && summary.meanPrecision !== null
  && (summary.meanPrecision < 1 || summary.meanRecall < 1 || summary.graphicTypeAccuracy < 1)) {
  console.log('\n  GOLD IS NOT PERFECT - the scorer or the dataset is wrong, not a model.');
  console.log('  Every model number measured against this ceiling is unreadable until it is 1.0.');
}
console.log(`\nWrote ${path.join(OUT, `vision-report-${ARM}.json`)}`);
if (!INCLUDE_HOLDOUT) console.log('Holdout excluded (dev split only) - pass --holdout deliberately, at decision time.');
