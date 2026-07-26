// Bounded NoaCG Lite evaluation runner. This calls the trusted managed endpoint,
// compiles each returned DesignSpec through the real deterministic catalog path, runs the
// static and live benches, and captures synthetic-fixture screenshots for blind review.
//
// It never receives or stores a provider key, model id, route, full DesignSpec, template,
// generated code, or provider body. The bearer token must identify a real server-validated
// development/admin user. Configure the candidate route only on the server, restart it,
// then run this script with a neutral label such as candidate-a.
//
//   NOACG_LITE_EVAL_BEARER_TOKEN=... node scripts/ai-lite-eval.mjs \
//     [out-dir] [candidate-label] [count]
//
// SPENDS REAL TOKENS. Hard stops: 40 calls or USD 1.50 of provider-reported cost.

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const OUT = path.resolve(process.argv[2] || './lite-eval-out');
const LABEL = String(process.argv[3] || 'candidate').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40);
const REQUESTED = Math.min(40, Math.max(1, Number(process.argv[4]) || 10));
const TOKEN = (process.env.NOACG_LITE_EVAL_BEARER_TOKEN ?? '').trim();
const MAX_CALLS = 40;
const MAX_COST_USD = 1.5;

if (!TOKEN) {
  console.error('NOACG_LITE_EVAL_BEARER_TOKEN is required. Aborting before spending anything.');
  process.exit(1);
}

const FIXTURES = [
  ['news-lower-third', 'A restrained public-news lower third for a reporter name and role. Dark editorial palette, clear hierarchy, calm entrance.'],
  ['esports-lower-third', 'An energetic esports lower third for a player nickname and team. Sharp hierarchy, fast controlled entrance, excellent legibility.'],
  ['university-lower-third', 'A university lecture lower third for a speaker name and academic role. Modern, credible, calm, and accessible.'],
  ['title-card', 'A full-frame programme title card with a short kicker, large title, and supporting line. Premium public-broadcast tone.'],
  ['information-card', 'A multi-line information card for three public transport updates. Clear ordering, calm editorial layout, strong text capacity.'],
  ['ticker', 'A continuous news ticker with an editable label and headline text. Precise, unobtrusive, and readable over live video.'],
  ['countdown', 'A basic event countdown timer with an editable event label. Strong numeric typography and a confident entrance and exit.'],
  ['scoreboard', 'A simple two-team football scoreboard with editable team names and scores. Energetic but highly legible.'],
  ['statistics', 'A compact statistics panel showing one headline value and two supporting facts. Intentional hierarchy and restrained motion.'],
  ['catalog-variation', 'A minimal editorial variation of a NoaCG lower third: warmer accent, more whitespace, tighter supporting text, calmer motion.'],
];

const headers = {
  'content-type': 'application/json',
  authorization: `Bearer ${TOKEN}`,
};

async function json(response) {
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value?.error?.message ?? `HTTP ${response.status}`);
  return value;
}

const status = await json(await fetch(`${BASE}/api/ai/lite/status`, { headers }));
if (!status.available) {
  console.error(`NoaCG Lite is not available for the evaluation identity (${status.reason ?? 'unknown'}).`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 0.5 });
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });

const rows = [];
let totalCostUsd = 0;
let calls = 0;
for (const [fixtureId, prompt] of FIXTURES.slice(0, REQUESTED)) {
  if (calls >= MAX_CALLS || totalCostUsd >= MAX_COST_USD) break;
  const started = Date.now();
  process.stdout.write(`- ${fixtureId}: `);
  try {
    calls += 1;
    const generated = await json(await fetch(`${BASE}/api/ai/lite/generations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: `eval-${LABEL}-${fixtureId}-${crypto.randomUUID()}`,
        prompt,
        resolution: { width: 1920, height: 1080 },
        fps: 50,
      }),
    }));
    const costUsd = Number(generated.usage?.estimatedCost?.amount ?? 0);
    totalCostUsd += costUsd;
    if (totalCostUsd > MAX_COST_USD) throw new Error('Evaluation cost ceiling reached.');
    if (generated.decision.status !== 'ready') {
      rows.push({
        fixtureId,
        candidate: LABEL,
        status: 'unsupported',
        latencyMs: Date.now() - started,
        costUsd,
        inputTokens: generated.usage?.inputTokens ?? 0,
        outputTokens: generated.usage?.outputTokens ?? 0,
        attempts: generated.attemptCount ?? 0,
        repairs: generated.repairCount ?? 0,
      });
      console.log('unsupported');
      continue;
    }

    const measured = await page.evaluate(async ({ spec }) => {
      const { specToTemplate } = await import('/src/ai/designSpec.ts');
      const { applyDesignAdjustments } = await import('/src/ai/designAdjust.ts');
      const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
      const { benchTemplateRuntime, mergeResults } = await import('/src/validation/runtimeBench.ts');
      const context = {
        images: [],
        palette: null,
        resolution: { width: 1920, height: 1080, label: '1080p' },
        fps: 50,
      };
      const assembled = specToTemplate(spec, context);
      const template = applyDesignAdjustments(assembled.template, spec);
      const validation = mergeResults(validateTemplate(template), await benchTemplateRuntime(template));
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      document.body.innerHTML = '';
      document.body.style.cssText = 'margin:0;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(circle at 35% 20%,#334155,#111827 58%,#05070a)';
      const frame = document.createElement('iframe');
      frame.id = 'lite-eval-frame';
      frame.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;border:0;background:transparent';
      await new Promise((resolve) => {
        frame.onload = resolve;
        frame.srcdoc = composeDocument(template);
        document.body.appendChild(frame);
      });
      frame.contentWindow.play();
      return {
        ok: validation.ok,
        ruleCodes: validation.errors.map((error) => error.rule),
        category: spec.category,
        variantId: spec.variantId,
        fieldCount: template.fields.length,
      };
    }, { spec: generated.decision.spec });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `${LABEL}-${fixtureId}.png`) });
    await fetch(`${BASE}/api/ai/lite/outcome`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        generationId: generated.generationId,
        action: measured.ok ? 'usable' : 'validation-failed',
        resolvedCategory: measured.category,
        validationRuleCodes: measured.ruleCodes,
        runtimeMs: Date.now() - started,
      }),
    });
    rows.push({
      fixtureId,
      candidate: LABEL,
      status: measured.ok ? 'machine-usable' : 'invalid',
      category: measured.category,
      variantId: measured.variantId,
      fieldCount: measured.fieldCount,
      ruleCodes: measured.ruleCodes,
      latencyMs: Date.now() - started,
      costUsd,
      inputTokens: generated.usage?.inputTokens ?? 0,
      outputTokens: generated.usage?.outputTokens ?? 0,
      cachedInputTokens: generated.usage?.cachedInputTokens ?? 0,
      reasoningTokens: generated.usage?.reasoningTokens ?? 0,
      attempts: generated.attemptCount ?? 0,
      repairs: generated.repairCount ?? 0,
    });
    console.log(measured.ok ? 'machine-usable' : `invalid (${measured.ruleCodes.join(', ')})`);
  } catch (error) {
    rows.push({
      fixtureId,
      candidate: LABEL,
      status: 'failed',
      latencyMs: Date.now() - started,
      errorCode: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    });
    console.log('failed');
  }
}
await browser.close();

const summary = {
  version: 1,
  candidate: LABEL,
  calls,
  totalCostUsd,
  maxCalls: MAX_CALLS,
  maxCostUsd: MAX_COST_USD,
  machineUsable: rows.filter((row) => row.status === 'machine-usable').length,
  rows,
};
await writeFile(path.join(OUT, `${LABEL}-metrics.json`), JSON.stringify(summary, null, 2), 'utf8');
console.log(`Wrote ${rows.length} synthetic-fixture results. Cost reported: $${totalCostUsd.toFixed(4)}.`);
