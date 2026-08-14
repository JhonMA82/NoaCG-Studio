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
import {
  BASE, killTree, providerAllowlistFor, readEnvFile, settlePort, startServer, tokenMinter,
  waitForReady,
} from './ai-bench-server.mjs';
import { printPreflightReport, runTaskPreflight } from './ai-task-preflight.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const has = (name) => args.includes(`--${name}`);
const OUT = path.resolve(args.find((a) => !a.startsWith('--')) || './vision-bench-out');
const ARM = flag('arm') ?? 'gold';
const MODEL = flag('model') ?? '';
const INCLUDE_HOLDOUT = has('holdout');
const CONFIRMED = has('confirm-spend');
// The COST cap is the real stop; the call cap only catches an absurd sweep (a full
// candidate set over the whole dataset is legitimately in the low hundreds).
const MAX_CALLS = 250;
const MAX_COST_USD = 1.0;

const all = (await readFile(path.join(OUT, 'ground-truth.jsonl'), 'utf8'))
  .split('\n').filter(Boolean).map((line) => JSON.parse(line));
const LIMIT = Number(flag('limit')) || 0;
const selected = all.filter((r) => (INCLUDE_HOLDOUT ? true : r.split === 'dev'));
// A limited run is for DIAGNOSIS, never for a scorecard - it is announced so a truncated
// set cannot be mistaken for the suite.
const records = LIMIT ? selected.slice(0, LIMIT) : selected;
if (LIMIT) console.log(`LIMIT ${LIMIT}: diagnostic subset of ${selected.length}, not a scorecard.`);
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

/** Real pixel size straight from the PNG header (IHDR width/height are big-endian at byte
 *  16). Deriving it from the recorded aspect assumed a 1080-high frame, which is wrong for
 *  every portrait and ultra-wide case in the set - and telling a vision model the wrong
 *  dimensions of the image it is looking at is not a fair test of the model. */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function modelPrediction(record, token) {
  const file = await readFile(path.join(OUT, record.image));
  const { width, height } = pngSize(file);
  const base64 = file.toString('base64');
  const response = await fetch(`${BASE}/api/ai/tasks/import-analysis`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      idempotencyKey: `${record.id}-${Date.now()}`,
      image: { base64, mediaType: 'image/png', width, height },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? `HTTP ${response.status}`);
    error.code = body?.error?.code ?? `http_${response.status}`;
    throw error;
  }
  // Cost rides usage.estimatedCost - the endpoint never returns a bare costUsd, so the
  // old read silently reported every run as free.
  return {
    analysis: body.analysis,
    costUsd: body.usage?.estimatedCost?.amount ?? 0,
    latencyMs: body.usage?.latencyMs ?? null,
  };
}

// ── Run ─────────────────────────────────────────────────────────────────────

const pct = (x) => (x === null || x === undefined ? '-' : `${Math.round(x * 100)}%`);
const num = (x) => (x === null || x === undefined ? '-' : x.toFixed(3));

async function runArm(arm, token) {
  const rows = [];
  let totalCost = 0;
  for (const [index, record] of records.entries()) {
    let prediction = null;
    let costUsd = 0;
    let error = null;
    try {
      if (arm === 'gold') prediction = goldPrediction(record);
      else if (arm === 'floor') prediction = floorPrediction(record, index);
      else {
        const result = await modelPrediction(record, token);
        prediction = result.analysis;
        costUsd = result.costUsd;
        totalCost += costUsd;
        if (totalCost > MAX_COST_USD) throw new Error('cost ceiling reached');
      }
    } catch (e) {
      error = e?.code ?? String(e.message ?? e);
    }
    const score = scoreAnalysis(record, prediction);
    rows.push({
      id: record.id, source: record.source, split: record.split, error, costUsd, ...score,
      // Kept for the model arm only: without the prediction beside the score there is no
      // way to tell a weak model from a misaligned harness, which is exactly the question
      // a low precision number raises first.
      ...(arm === 'model' ? { prediction } : {}),
    });
  }
  return { rows, totalCost };
}

function summarize(arm, label, rows, totalCost) {
  const mean = (key) => {
    const xs = rows.map((r) => r[key]).filter((x) => typeof x === 'number');
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const tripwires = records.filter((r) => !r.truth.hasEditableText);
  const hallucinated = rows.filter((r, i) => !records[i].truth.hasEditableText && r.hallucinatedRegions > 0);
  return {
    suite: 'import-analysis-v1',
    arm,
    model: label || null,
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
}

function printSummary(s) {
  console.log(`\nimport-analysis-v1 | arm=${s.arm}${s.model ? ` (${s.model})` : ''} | `
    + `${s.records} record(s)${INCLUDE_HOLDOUT ? ' INCLUDING HOLDOUT' : ' (dev split)'}\n`);
  console.log(`  schema ok            ${pct(s.schemaSuccessRate)}`);
  console.log(`  graphic type         ${pct(s.graphicTypeAccuracy)}`);
  console.log(`  region precision     ${pct(s.meanPrecision)}`);
  console.log(`  region recall        ${pct(s.meanRecall)}`);
  console.log(`  mean IoU (matched)   ${num(s.meanIou)}`);
  console.log(`  role accuracy        ${pct(s.roleAccuracy)}`);
  console.log(`  font class accuracy  ${pct(s.fontClassAccuracy)}`);
  console.log(`  bundled font pick    ${pct(s.fontIdAccuracy)}`);
  console.log(`  mean colour delta    ${num(s.meanColorDelta)}  (0 = exact)`);
  console.log(`  mean edits required  ${num(s.meanEditsRequired)}  (regions a user must fix)`);
  console.log(`  no-text tripwires    ${s.tripwiresHallucinated}/${s.tripwires} hallucinated`);
  if (s.arm === 'model') console.log(`  cost                 $${s.totalCostUsd.toFixed(4)}`);
  const failed = s.rows.filter((r) => r.error);
  if (failed.length) {
    console.log(`  ${failed.length} failed: ${[...new Set(failed.map((r) => r.error))].join(', ')}`);
  }
  if (s.arm === 'gold' && s.meanPrecision !== null
    && (s.meanPrecision < 1 || s.meanRecall < 1 || s.graphicTypeAccuracy < 1)) {
    console.log('\n  GOLD IS NOT PERFECT - the scorer or the dataset is wrong, not a model.');
    console.log('  Every model number measured against this ceiling is unreadable until it is 1.0.');
  }
}

const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').slice(0, 48);

if (ARM !== 'model') {
  const { rows, totalCost } = await runArm(ARM, '');
  const s = summarize(ARM, MODEL, rows, totalCost);
  await writeFile(path.join(OUT, `vision-report-${ARM}.json`), JSON.stringify(s, null, 2), 'utf8');
  printSummary(s);
  console.log(`\nWrote ${path.join(OUT, `vision-report-${ARM}.json`)}`);
} else {
  // Every candidate needs its own server, because the analysis route is server
  // configuration - the runner never names a model (see ai-bench-server.mjs).
  const candidates = (flag('candidates') ?? MODEL).split(',').map((c) => c.trim()).filter(Boolean);
  if (!candidates.length) {
    console.error('Name candidates: --candidates=<model,model,...> (each must be catalog-approved).');
    process.exit(1);
  }
  if (records.length * candidates.length > MAX_CALLS) {
    console.error(`${records.length} records x ${candidates.length} candidates exceeds the ${MAX_CALLS}-call cap.`);
    process.exit(1);
  }
  const fileEnv = await readEnvFile();
  const minter = tokenMinter(fileEnv);

  // Resolved BEFORE anything else: an empty allowlist leaves the route unconfigured, which
  // fails closed after the server is already up and looks like a server fault - and a
  // candidate with NO structured-output endpoint at all fails every call identically, the
  // uniform wall the 2026-07-29 round could not diagnose. Every candidate resolves up front
  // so one broken arm is found before its neighbours are paid for.
  const allowlists = {};
  for (const model of candidates) {
    try {
      allowlists[model] = await providerAllowlistFor(model);
    } catch (e) {
      console.error(`\n${model}: ${e.message}`);
      console.error('This candidate would fail every image. Fix the plan before spending.');
      process.exit(1);
    }
  }

  // The FREE profile preflight (api/_lib/aiBenchPreflight.ts): resolve every arm through
  // the real import-analysis profile and registry under EXACTLY the environment this
  // runner will inject, so an unapproved route, a silent override, or a mis-injected flag
  // is caught here rather than read as model character afterwards.
  const preflight = await runTaskPreflight({
    task: 'import-analysis',
    candidates,
    ambient: fileEnv,
    requireEvalIdentity: true,
    includeIncumbent: false,
    armEnvExtra: Object.fromEntries(candidates.map((model) => [
      model,
      { AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS: allowlists[model] },
    ])),
  });
  console.log('');
  const preflightOk = printPreflightReport(preflight);
  if (!preflightOk) {
    console.error('\nPreflight FAILED - nothing spent. Each failure above produces a');
    console.error('complete, plausible-looking, worthless result set.');
    process.exit(1);
  }

  console.log(`\nPlan: ${candidates.length} candidate(s) x ${records.length} image(s) = `
    + `${candidates.length * records.length} vision call(s). Cap $${MAX_COST_USD}.`);
  console.log(minter.canMint
    ? 'Token: minted fresh per candidate from the .env test account.'
    : 'Token: hand-supplied - a long run may outlive it.');
  if (!CONFIRMED) {
    console.log('\nDRY RUN - preflight OK, nothing spent. Re-run with --confirm-spend to execute.');
    process.exit(0);
  }

  const scorecards = [];
  for (const model of candidates) {
    console.log(`\n=== ${model}`);
    const providers = allowlists[model];
    console.log(`  provider allowlist: ${providers}`);
    const server = startServer({
      AI_TASK_IMPORT_ANALYSIS_ENABLED: '1',
      AI_IMPORT_ANALYSIS_PROVIDER: 'vercel',
      AI_IMPORT_ANALYSIS_MODEL: model,
      AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS: providers,
      // The task's own quotas are sized for a USER (10 successes a day). A bench sweeps the
      // whole set in one go, so raise them here rather than reading a quota refusal as a
      // model failure - the hard stop that matters is the cost cap above.
      AI_IMPORT_ANALYSIS_DAILY_SUCCESSES: String(records.length * 2),
      AI_IMPORT_ANALYSIS_DAILY_STARTS: String(records.length * 3),
      AI_IMPORT_ANALYSIS_MONTHLY_SUCCESSES: String(records.length * candidates.length * 2),
      AI_IMPORT_ANALYSIS_MONTHLY_STARTS: String(records.length * candidates.length * 3),
    });
    try {
      const token = await minter.freshToken((process.env.NOACG_VISION_BEARER_TOKEN ?? '').trim());
      await waitForReady('/api/ai/tasks/import-analysis-status', token);
      console.log('  server ready');
      const { rows, totalCost } = await runArm('model', token);
      const s = summarize('model', model, rows, totalCost);
      await writeFile(path.join(OUT, `vision-report-${slug(model)}.json`), JSON.stringify(s, null, 2), 'utf8');
      printSummary(s);
      scorecards.push(s);
    } catch (error) {
      console.error(`  FAILED: ${error.message}`);
      scorecards.push({ arm: 'model', model, error: String(error.message ?? error) });
    } finally {
      killTree(server);
      await settlePort();
    }
  }

  const spent = scorecards.reduce((sum, s) => sum + (s.totalCostUsd ?? 0), 0);
  console.log(`\n\nScorecard (dev split, ${records.length} images) - total spend $${spent.toFixed(4)}\n`);
  console.log('  model                                     type  prec  recall  role  edits  halluc  cost');
  for (const s of scorecards) {
    if (s.error) { console.log(`  ${s.model.padEnd(41)} FAILED (${s.error})`); continue; }
    console.log(`  ${s.model.padEnd(41)} ${pct(s.graphicTypeAccuracy).padStart(4)} `
      + `${pct(s.meanPrecision).padStart(5)} ${pct(s.meanRecall).padStart(6)} `
      + `${pct(s.roleAccuracy).padStart(5)} ${num(s.meanEditsRequired).padStart(6)} `
      + `${`${s.tripwiresHallucinated}/${s.tripwires}`.padStart(6)} $${(s.totalCostUsd ?? 0).toFixed(4)}`);
  }
  console.log('\nRead against the calibration arms: gold is the ceiling this scorer can award,');
  console.log('floor is what guessing scores. A model near the floor learned nothing from the pixels.');
  console.log('No launch decision follows from the dev split alone - the holdout is the overfitting check.');
}
if (!INCLUDE_HOLDOUT) console.log('\nHoldout excluded (dev split only) - pass --holdout deliberately, at decision time.');
