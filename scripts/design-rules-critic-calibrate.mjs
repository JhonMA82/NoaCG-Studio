#!/usr/bin/env node
// THE VISION-CRITIC CALIBRATION (docs/DESIGN_RULES_PLAN.md §4, R2) - a cheap rubric judge
// answering BINARY defect questions over the ARCHIVED 49 blind items, scored per question
// against the owner's verdicts before anything is wired into the loop.
//
//   node scripts/design-rules-critic-calibrate.mjs --route=vercel:google/gemini-3.7-flash \
//       --max-cost=0.5 [--out=<dir>] [--archive=C:/claude/noacg-lite-eval-archive] [X-01,X-02]
//
// WHY OFFLINE CALIBRATION IS POSSIBLE AT ALL: the owner read all 49 items blind and the
// frames are archived, so precision/recall per question costs ~$0.30 once instead of a paid
// round per hypothesis. The Lite judge precedent (3/6 = chance) was an AESTHETICS judge; this
// one answers defect questions a human can verify on the frame. The wiring rule is the
// plan's: only a question with strong PRECISION enters the loop, as ADVISORY - a critic that
// stops airable graphics is worse than no critic. If it calibrates at chance, it stays out.
//
// GROUND TRUTH is hand-coded from the owner's own notes (notes.md, transcribed verbatim in
// the round archive): each question lists the X-ids whose note names that defect class. That
// is a judgement call made visible - the table is in this file, beside the questions, so a
// reviewer can dispute a row by reading the note.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';
import { readEnvFile } from './ai-bench-server.mjs';
import { requireAllowedRoute } from './harness-route-policy.mjs';

const BASE = `http://localhost:${devPort()}`;
const args = process.argv.slice(2);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const only = args.find((a) => !a.startsWith('--'))?.split(',').filter(Boolean) ?? null;

const ARCHIVE = value('archive') ?? 'C:/claude/noacg-lite-eval-archive';
const BLIND = path.join(ARCHIVE, 'typesweep-blind-final-2026-08-18', 'blind');
const KEY = path.join(ARCHIVE, 'typesweep-blind-final-2026-08-18', 'key.html');
const NOTES = path.resolve('benchmarks/pro/evidence/round-2026-08-18-typesweep/notes.md');
const OUT = path.resolve(value('out') ?? 'benchmarks/design-rules');
const route = value('route');
const maxCost = Number(value('max-cost') ?? 0);
if (!route || !Number.isFinite(maxCost) || maxCost <= 0) {
  console.error('Needs --route=<provider>:<model> and --max-cost=<dollars>. This run spends real money.');
  process.exit(1);
}
requireAllowedRoute(route, { flag: 'route', reason: value('frontier-reason') });
console.log(`PAID critic calibration: ${route}, ceiling $${maxCost.toFixed(2)}.`);

/** The rubric - BINARY defect questions only, no aesthetics. Each carries the X-ids whose
 *  owner note names that defect (the ground truth this run is scored against). */
const QUESTIONS = [
  {
    id: 'lineOnText',
    ask: 'Is any accent line, rule or bar drawn ON TOP of text (overlapping the letters)?',
    truth: ['X-11', 'X-14', 'X-38', 'X-39', 'X-42'],
  },
  {
    id: 'logoBroken',
    ask: 'Is there a logo that breaks the composition - sitting on a mismatched plate/box, floating detached from the design, oversized, off-centre in its space, or pushing the layout sideways?',
    truth: ['X-01', 'X-14', 'X-17', 'X-23', 'X-28', 'X-31', 'X-32', 'X-33', 'X-36', 'X-37', 'X-39', 'X-42'],
  },
  {
    id: 'tooSmall',
    ask: 'Is any informational text (a value, name, score or label a viewer must read) too small to read comfortably on a TV screen?',
    truth: ['X-18', 'X-24', 'X-38', 'X-40', 'X-41'],
  },
  {
    id: 'textCutOff',
    ask: 'Is any text cut off, truncated, overlapping other text, or overflowing its container in ANY of the frames?',
    truth: ['X-15', 'X-20', 'X-35', 'X-37', 'X-46', 'X-48'],
  },
  {
    id: 'emptyBroken',
    ask: 'Does the graphic look empty, unfinished, or visually broken (missing content, nothing rendered, a state with no function)?',
    truth: ['X-13', 'X-19', 'X-22', 'X-44'],
  },
  {
    id: 'boxMisaligned',
    ask: 'Are any panels or boxes visibly misaligned with each other, off-centre against their background, or overflowing the background shape?',
    truth: ['X-09', 'X-25', 'X-45'],
  },
  {
    id: 'lowContrast',
    ask: 'Is any text hard to read because of low contrast against its background colour?',
    truth: ['X-21', 'X-24'],
  },
];

const RUBRIC_TOOL = {
  name: 'report_defects',
  description: 'Report the binary defect answers for this broadcast graphic.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: QUESTIONS.map((q) => q.id),
    properties: Object.fromEntries(QUESTIONS.map((q) => [q.id, {
      type: 'boolean',
      description: q.ask,
    }])),
  },
};

// The verdict join, for the report's airability columns.
const notes = await readFile(NOTES, 'utf8');
const verdicts = new Map();
for (const m of notes.matchAll(/^- \*\*X-(\d+)\*\* - ([A-Z*/]+(?:\s*\(soft\))?)/gm)) {
  verdicts.set(`X-${m[1]}`, { word: m[2], airable: m[2].startsWith('AIR') || m[2].startsWith('OK*') });
}
const keyHtml = await readFile(KEY, 'utf8');
const items = [...keyHtml.matchAll(/<tr><td>(X-\d+)<\/td>/g)].map((m) => m[1])
  .filter((id) => !only || only.includes(id));

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
  process.exit(1);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.keyboard.press('Escape');

// The managed route is metered through the signed-in test account (the iterate runner's shape).
{
  const fileEnv = await readEnvFile();
  const email = (process.env.E2E_EMAIL ?? fileEnv.E2E_EMAIL ?? '').trim();
  const password = (process.env.E2E_PASSWORD ?? fileEnv.E2E_PASSWORD ?? '').trim();
  if (email && password) {
    try {
      await page.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 10_000 });
      await page.locator('#auth-email').fill(email);
      await page.locator('#auth-pass').fill(password);
      await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.locator('.auth-status').waitFor({ state: 'visible', timeout: 20_000 });
      console.log('Signed in for the managed route.');
    } catch (error) {
      console.error(`Sign-in failed (${error.message?.split('\n')[0]}) - continuing signed out.`);
    }
  }
}

/** Downscale a PNG buffer to a model-sized JPEG inside the page (the iterate runner's shape). */
async function downscale(buffer) {
  return page.evaluate(async (pngB64) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 540;
      canvas.getContext('2d').drawImage(img, 0, 0, 960, 540);
      resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    };
    img.onerror = () => resolve(null);
    img.src = 'data:image/png;base64,' + pngB64;
  }), buffer.toString('base64'));
}

const { readdirSync } = await import('node:fs');
const blindFiles = readdirSync(BLIND);
const results = [];
let spentUsd = 0;
await mkdir(OUT, { recursive: true });

for (const id of items) {
  if (spentUsd >= maxCost) {
    console.log(`ceiling reached ($${spentUsd.toFixed(3)}) - stopping.`);
    break;
  }
  // The exact frames the owner judged: the hold, the stress frame, up to two step frames.
  const files = blindFiles.filter((f) => f.startsWith(`${id}.`)).sort().slice(0, 4);
  const images = [];
  for (const f of files) {
    const jpeg = await downscale(await readFile(path.join(BLIND, f)));
    if (jpeg) images.push({ label: f.replace(`${id}.`, '').replace('.png', ''), jpeg });
  }
  if (!images.length) {
    results.push({ id, error: 'no frames' });
    continue;
  }
  const call = await page.evaluate(async ({ route, images, questions, tool }) => {
    const bust = '?t=' + Date.now();
    const { callModelDetailed } = await import('/src/ai/modelGateway.ts' + bust);
    const [provider, ...model] = route.split(':');
    const content = [
      {
        type: 'text',
        text: `These are rendered frames of ONE broadcast graphic at 1920x1080 (labels: ${images.map((i) => i.label).join(', ')} - "stress" carries long test values, "step-N" is a later operator state). Answer every question strictly from what is visible. A defect present in ANY frame counts.\n\n${questions.map((q) => `- ${q.id}: ${q.ask}`).join('\n')}`,
      },
      ...images.map((i) => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: i.jpeg },
      })),
    ];
    try {
      const result = await callModelDetailed({
        system: 'You inspect broadcast graphics for objective visual defects. Answer binary questions strictly from the frames shown; never guess a defect you cannot see.',
        messages: [{ role: 'user', content }],
        tool,
        route: { provider, model: model.join(':') },
        surface: 'spike',
        temperature: 0,
        maxTokens: 1200,
      });
      return {
        answers: result.output,
        costUsd: result.usage?.estimatedCost?.amount ?? 0,
        model: result.model,
      };
    } catch (e) {
      return { error: String(e?.message ?? e).slice(0, 300) };
    }
  }, { route, images, questions: QUESTIONS.map(({ id, ask }) => ({ id, ask })), tool: RUBRIC_TOOL });
  if (call.error) {
    console.log(`${id}: ERROR ${call.error}`);
    results.push({ id, error: call.error });
    continue;
  }
  spentUsd += call.costUsd ?? 0;
  const verdict = verdicts.get(id);
  results.push({ id, verdict: verdict?.word, airable: verdict?.airable, answers: call.answers, costUsd: call.costUsd });
  console.log(`${id}: ${QUESTIONS.filter((q) => call.answers[q.id]).map((q) => q.id).join(', ') || 'clean'} · $${(call.costUsd ?? 0).toFixed(4)} (${verdict?.word})`);
}
await browser.close();

// ── Scoring ────────────────────────────────────────────────────────────────────────────
const judged = results.filter((r) => !r.error);
const scored = QUESTIONS.map((q) => {
  const truth = new Set(q.truth.filter((id) => judged.some((r) => r.id === id)));
  let tp = 0; let fp = 0; let fn = 0; let tn = 0;
  const fpIds = []; const fnIds = [];
  for (const r of judged) {
    const said = Boolean(r.answers[q.id]);
    const is = truth.has(r.id);
    if (said && is) tp += 1;
    else if (said && !is) { fp += 1; fpIds.push(r.id); }
    else if (!said && is) { fn += 1; fnIds.push(r.id); }
    else tn += 1;
  }
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  return { id: q.id, truthCount: truth.size, tp, fp, fn, tn, precision, recall, fpIds, fnIds };
});

const payload = { capturedAt: new Date().toISOString(), route, spentUsd, results, scored };
await writeFile(path.join(OUT, 'critic-calibration.json'), JSON.stringify(payload, null, 1));

const pct = (v) => (v === null ? '-' : `${Math.round(v * 100)}%`);
const lines = [];
lines.push('# Vision-critic calibration - binary rubric vs the owner\'s 49 blind verdicts');
lines.push('');
lines.push(`Run ${new Date().toISOString().slice(0, 10)}, \`${route}\`, ${judged.length} of ${items.length} items judged, $${spentUsd.toFixed(3)} spent`
  + ' (`scripts/design-rules-critic-calibrate.mjs`). Ground truth = the defect classes the'
  + ' owner\'s own notes name per item (the table in the script, disputable line by line).');
lines.push('');
lines.push('| question | truth n | TP | FP | FN | precision | recall | verdict |');
lines.push('|---|---|---|---|---|---|---|---|');
for (const s of scored) {
  const wire = s.precision !== null && s.precision >= 0.7 && s.tp > 0 ? 'WIRE (advisory)' : 'stays out';
  lines.push(`| ${s.id} | ${s.truthCount} | ${s.tp} | ${s.fp} | ${s.fn} | ${pct(s.precision)} | ${pct(s.recall)} | ${wire} |`);
}
lines.push('');
lines.push('False positives / misses per question (dispute against the frames):');
lines.push('');
for (const s of scored) {
  lines.push(`- ${s.id}: FP ${s.fpIds.join(', ') || 'none'} · missed ${s.fnIds.join(', ') || 'none'}`);
}
lines.push('');
lines.push('The wiring rule (docs/DESIGN_RULES_PLAN.md §4): only strong-precision questions enter the');
lines.push('loop, as ADVISORY, and a question at chance stays out. The R3 round runs no model-placed');
lines.push('logos, so `logoBroken` is calibration evidence only this round.');
await writeFile(path.join(OUT, 'CRITIC-CALIBRATION-2026-08-19.md'), `${lines.join('\n')}\n`);
console.log(`\n$${spentUsd.toFixed(3)} spent · ${path.join(OUT, 'CRITIC-CALIBRATION-2026-08-19.md')}`);
