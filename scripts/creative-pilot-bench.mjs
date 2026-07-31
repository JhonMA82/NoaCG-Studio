// The Creative Mode PILOT bench (docs/CREATIVE_MODE_PLAN.md §8, §10, §11): run the four
// ablation arms over the pilot brief bank and report the objective half of the go/no-go
// sheet. The ranking that counts is the pairwise human review - this rig produces the
// artifacts that review needs (a hold frame and the three code files per result) plus the
// free gates: structural satisfaction, engineering validity, concept diversity, cost and
// latency.
//
//   node scripts/creative-pilot-bench.mjs --route=<provider>:<model> \
//     [--arms=A,B,C,D] [--only=id,id,…|count] [--category=lower-third|versus|bracket] \
//     [--critique-route=<provider>:<model>] [--out=dir] [--max-cost=usd] [--label=name]
//
// SPENDS REAL TOKENS - more than any other rig here, because it runs a whole generation per
// arm. The route is EXPLICIT and fails closed (no env, no saved settings), the model must be
// priced in scripts/ai-bench-prices.json, and the run prints its worst legal spend BEFORE the
// first call and stops at --max-cost (default $1.00) mid-run.
//
// Run the FREE gates first, so a paid run measures the pipeline and not a stale expectation:
//   npx playwright test e2e/creative-pilot.spec.ts e2e/creative-routing.spec.ts
//
// Requirements: the dev-bench server on this checkout's port (`npm run dev:bench`), started
// with the server-side key for the chosen provider. Never CI.

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const ARGS = process.argv.slice(2);
const flag = (name) => ARGS.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const ROUTE = flag('route') ?? '';
const CRITIQUE_ROUTE = flag('critique-route') ?? '';
const OUT = path.resolve(flag('out') || './creative-pilot-out');
const FILTER = flag('only') ?? '';
const CATEGORY = flag('category') ?? '';
const MAX_COST = Number(flag('max-cost') ?? '1');
const LABEL = flag('label') || 'pilot';
const ARMS = (flag('arms') || 'A,B,C,D').split(',').map((a) => a.trim().toUpperCase()).filter((a) => 'ABCD'.includes(a));

const [provider, ...modelParts] = ROUTE.split(':');
const model = modelParts.join(':');
if (!provider || !model) {
  console.error('This bench SPENDS TOKENS and requires an explicit route: --route=<provider>:<model id>.');
  process.exit(1);
}
if (!ARMS.length) {
  console.error('--arms must name at least one of A,B,C,D.');
  process.exit(1);
}
if (!Number.isFinite(MAX_COST) || MAX_COST <= 0) {
  console.error(`--max-cost must be a positive USD amount, got "${flag('max-cost')}".`);
  process.exit(1);
}
const critiqueModel = CRITIQUE_ROUTE ? CRITIQUE_ROUTE.split(':').slice(1).join(':') : '';
if (ARMS.includes('D') && !critiqueModel) {
  console.error('Arm D looks at a rendered frame, so it needs a vision model: --critique-route=<provider>:<model id>.');
  process.exit(1);
}

const prices = JSON.parse(readFileSync(new URL('./ai-bench-prices.json', import.meta.url), 'utf8'));
const price = prices[model];
if (!price || typeof price.in !== 'number' || typeof price.out !== 'number') {
  console.error(`No price entry for "${model}" in scripts/ai-bench-prices.json - add it (bench:discover) before spending.`);
  process.exit(1);
}
const critiquePrice = critiqueModel ? prices[critiqueModel] : null;
if (critiqueModel && !critiquePrice) {
  console.error(`No price entry for the critique model "${critiqueModel}" - add it (bench:discover) before spending.`);
  process.exit(1);
}

const costOf = (usage, p = price) =>
  ((usage?.inputTokens ?? 0) * p.in + (usage?.outputTokens ?? 0) * p.out) / 1e6;

// The WORST legal spend per arm, per brief. Arm A carries the ~18.3k-token catalog digest
// plus the coder's example, which is why its input bound dwarfs the others'.
const ARM_MAX = {
  A: { in: 95_000, out: 20_000 },
  B: { in: 45_000, out: 20_000 },
  C: { in: 50_000, out: 16_000 },
  D: { in: 62_000, out: 20_000 },
};
// The intent stage, once per brief, shared by every arm.
const INTENT_MAX = { in: 5_000, out: 2_000 };

const bank = JSON.parse(readFileSync(new URL('../benchmarks/creative/v1/briefs.json', import.meta.url), 'utf8'));
let selected = bank.briefs;
if (CATEGORY) selected = selected.filter((b) => b.category === CATEGORY);
if (/^[a-z0-9-]+(,[a-z0-9-]+)*$/.test(FILTER)) selected = selected.filter((b) => FILTER.split(',').includes(b.id));
else if (Number(FILTER)) selected = selected.slice(0, Number(FILTER));
if (!selected.length) {
  console.error('No briefs selected.');
  process.exit(1);
}

const perBriefMax =
  (INTENT_MAX.in * price.in + INTENT_MAX.out * price.out) / 1e6 +
  ARMS.reduce((sum, arm) => sum + (ARM_MAX[arm].in * price.in + ARM_MAX[arm].out * price.out) / 1e6, 0);
const estMax = perBriefMax * selected.length;
console.log(`Route: ${provider}:${model} — arms ${ARMS.join('')} × ${selected.length} brief(s)${CATEGORY ? ` (${CATEGORY})` : ''}`);
if (critiqueModel) console.log(`Critique (arm D) route: ${CRITIQUE_ROUTE}`);
console.log(
  `Estimated MAXIMUM cost: $${estMax.toFixed(4)} (price $${price.in}/$${price.out} per M). ` +
  `Ceiling: $${MAX_COST.toFixed(2)}. Typical runs land well below the maximum.`,
);
if (estMax > MAX_COST) {
  console.error(`Estimated maximum ($${estMax.toFixed(4)}) exceeds the ceiling - raise --max-cost deliberately or select fewer briefs/arms.`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

// The page renders a template; only Node can screenshot it. This binding is the bridge the
// injected FrameCapture calls once the graphic has settled.
await page.exposeFunction('__pilotScreenshot', async () => (await page.screenshot()).toString('base64'));

try {
  await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
} catch {
  console.error(`No dev-bench server on ${BASE} - start it with \`npm run dev:bench\` (nothing was spent).`);
  await browser.close();
  process.exit(1);
}

const pinned = await page.evaluate(async ({ provider, model }) => {
  const { refreshAiConfiguration, saveAiSettings, aiConfigured } = await import('/src/ai/settings.ts');
  await refreshAiConfiguration();
  saveAiSettings({ provider, model, fallbacks: [] });
  return aiConfigured();
}, { provider, model });
if (!pinned) {
  console.error(`No server-managed route available for ${provider}:${model}. Start the dev-bench server with the matching key.`);
  await browser.close();
  process.exit(1);
}

let spent = 0;
let stoppedAtCeiling = false;
const results = [];

for (const brief of selected) {
  if (spent + perBriefMax > MAX_COST) {
    stoppedAtCeiling = true;
    console.error(`Ceiling reached after $${spent.toFixed(4)} - stopping before "${brief.id}" (partial results are written).`);
    break;
  }
  console.log(`\n▸ ${brief.id} (${brief.category})`);

  // Stage 1 once per brief: the arms compare GENERATION, so they share one classification.
  let intent;
  try {
    const intentRun = await page.evaluate(async (text) => {
      const { INTENT_TOOL, intentSystemPrompt, normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { callModelDetailed } = await import('/src/ai/modelGateway.ts');
      const result = await callModelDetailed({
        system: intentSystemPrompt(),
        messages: [{ role: 'user', content: [{ type: 'text', text: `Create a broadcast graphics template.\n\nUser brief: ${text}` }] }],
        tool: INTENT_TOOL,
        maxTokens: 2000,
      });
      return { intent: normalizeIntent(result.output), usage: result.usage ?? null };
    }, brief.brief);
    intent = intentRun.intent;
    spent += costOf(intentRun.usage);
  } catch (e) {
    console.log(`  intent stage FAILED: ${String(e?.message ?? e).split('\n')[0]} — skipping the brief.`);
    results.push({ brief: brief.id, category: brief.category, arm: null, error: 'intent-stage-failed' });
    continue;
  }

  for (const arm of ARMS) {
    process.stdout.write(`  arm ${arm} … `);
    const started = Date.now();
    let row;
    try {
      row = await page.evaluate(async ({ brief, intent, arm, critiqueModel }) => {
        const { runCreativeArm } = await import('/src/ai/creative/pipeline.ts');
        const { productionSpxValidator } = await import('/src/ai/litePipeline.ts');
        const { benchStructuralIntent } = await import('/src/validation/structuralIntentCheck.ts');
        const { composeDocument } = await import('/src/preview/composeDocument.ts');
        const { parseAnimData } = await import('/src/blocks/animData.ts');

        // The injected frame capture: mount, fill, play, settle, and let Node take the shot.
        const capture = async (template) => {
          document.body.innerHTML = '';
          document.body.style.cssText =
            'margin:0;width:1920px;height:1080px;overflow:hidden;' +
            'background:radial-gradient(circle at 35% 20%,#334155,#111827 58%,#05070a)';
          const frame = document.createElement('iframe');
          frame.id = 'pilot-frame';
          frame.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;border:0;background:transparent';
          await new Promise((resolve) => {
            frame.onload = resolve;
            frame.srcdoc = composeDocument(template);
            document.body.appendChild(frame);
          });
          const win = frame.contentWindow;
          try {
            win.update?.(JSON.stringify(Object.fromEntries(template.fields.map((f) => [f.field, f.value ?? '']))));
            win.play?.();
          } catch { /* a template that throws here is the validator's finding, not the capture's */ }
          const anim = parseAnimData(template.js);
          const entranceMs = anim ? (anim.steps[0].duration / anim.speed) * 1000 : 2000;
          await new Promise((r) => setTimeout(r, entranceMs + 400));
          const shot = await window.__pilotScreenshot();
          return shot;
        };

        const context = {
          images: [],
          palette: null,
          resolution: { width: 1920, height: 1080, label: '1080p' },
          fps: 25,
        };
        const result = await runCreativeArm(arm, {
          brief,
          intent,
          context,
          validate: productionSpxValidator(),
          structuralCheck: benchStructuralIntent,
          ...(arm === 'D' ? { capture, critiqueModel } : {}),
        });

        // Capture the FINAL frame for the gallery and the sameness proxy, whatever the arm.
        const hold = result.template ? await capture(result.template) : null;
        return {
          ok: result.ok,
          error: result.error ?? null,
          errorRules: (result.validation?.errors ?? []).map((e) => e.rule),
          warningRules: (result.validation?.warnings ?? []).map((w) => w.rule),
          structural: result.structural.map((f) => f.message),
          concepts: result.concepts,
          spec: result.spec,
          styleApplied: result.styleApplied,
          critique: result.critique ?? null,
          critiqueRepairApplied: result.critiqueRepairApplied ?? null,
          repairRounds: result.repairRounds,
          stages: result.stages,
          totalMs: result.totalMs,
          template: result.template
            ? { name: result.template.name, html: result.template.html, css: result.template.css, js: result.template.js, fields: result.template.fields.length }
            : null,
          hold,
        };
      }, { brief: brief.brief, intent, arm, critiqueModel });
    } catch (e) {
      console.log(`ERROR ${String(e?.message ?? e).split('\n')[0]}`);
      results.push({ brief: brief.id, category: brief.category, arm, error: String(e?.message ?? e), latencyMs: Date.now() - started });
      continue;
    }

    const armCost = row.stages.reduce(
      (sum, s) => sum + costOf(s.usage, s.stage === 'critique' && critiquePrice ? critiquePrice : price),
      0,
    );
    spent += armCost;

    const dir = path.join(OUT, arm);
    mkdirSync(dir, { recursive: true });
    const stem = `${LABEL}-${arm}-${brief.id}`;
    let holdFile = null;
    if (row.hold) {
      holdFile = `${stem}-hold.png`;
      writeFileSync(path.join(dir, holdFile), Buffer.from(row.hold, 'base64'));
    }
    if (row.template) {
      writeFileSync(path.join(dir, `${stem}.html`), row.template.html);
      writeFileSync(path.join(dir, `${stem}.css`), row.template.css);
      writeFileSync(path.join(dir, `${stem}.js`), row.template.js);
    }

    // The frame and the code are on disk now; the row keeps their paths, not their bytes.
    const rest = { ...row };
    const template = rest.template;
    delete rest.hold;
    delete rest.template;
    results.push({
      brief: brief.id,
      category: brief.category,
      arm,
      ...rest,
      templateName: template?.name ?? null,
      fieldCount: template?.fields ?? null,
      files: { hold: holdFile ? `${arm}/${holdFile}` : null, html: template ? `${arm}/${stem}.html` : null },
      costUsd: Number(armCost.toFixed(6)),
      latencyMs: Date.now() - started,
    });
    console.log(
      `${row.ok ? 'valid' : `INVALID (${row.errorRules.join(', ') || row.error})`}` +
      `${row.structural.length ? `, ${row.structural.length} structural gap(s)` : ', structurally complete'}` +
      `${row.styleApplied ? ', style landed' : ''} — ${(row.totalMs / 1000).toFixed(1)}s, $${armCost.toFixed(4)}`,
    );
  }
}

await browser.close();

// ── The report: the free half of the §11 sheet ───────────────────────────────

const armRows = (arm) => results.filter((r) => r.arm === arm && !r.error);
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : 'n/a');
const distinct = (concepts) => {
  const differs = (a, b) =>
    a.compositionFamily.toLowerCase() !== b.compositionFamily.toLowerCase() &&
    a.hierarchyOrder.join('>').toLowerCase() !== b.hierarchyOrder.join('>').toLowerCase();
  return concepts.filter((c, i) => concepts.some((o, j) => i !== j && differs(c, o))).length;
};

const summary = {};
for (const arm of ARMS) {
  const rows = armRows(arm);
  const attempted = results.filter((r) => r.arm === arm).length;
  const conceptRows = rows.filter((r) => (r.concepts ?? []).length === 3);
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const at = (p) => latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))] ?? null;
  const families = rows.map((r) => r.spec?.layout?.family).filter(Boolean);
  const topFamily = families.length
    ? [...families.reduce((m, f) => m.set(f, (m.get(f) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0]
    : null;
  summary[arm] = {
    attempted,
    completed: rows.length,
    // Criterion 3 - REPORTED, never ranked on (the two-scorecard rule).
    engineeringValidity: pct(rows.filter((r) => r.ok).length, rows.length),
    // Criterion 2 - the brief-satisfaction gate.
    structurallyComplete: pct(rows.filter((r) => (r.structural ?? []).length === 0).length, rows.length),
    styleLanded: arm === 'C' || arm === 'D' ? pct(rows.filter((r) => r.styleApplied).length, rows.length) : 'n/a',
    // Criterion 5 - concept diversity plus the cross-brief sameness tripwire.
    conceptDiversity: conceptRows.length
      ? pct(conceptRows.filter((r) => distinct(r.concepts) >= 2).length, conceptRows.length)
      : 'n/a',
    topFamilyShare: topFamily ? `${topFamily[0]} ${pct(topFamily[1], families.length)}` : 'n/a',
    repairRounds: rows.reduce((s, r) => s + (r.repairRounds ?? 0), 0),
    // Criterion 7 - cost and latency.
    costPerAttemptUsd: rows.length ? Number((rows.reduce((s, r) => s + r.costUsd, 0) / rows.length).toFixed(5)) : null,
    costPerValidUsd: rows.filter((r) => r.ok).length
      ? Number((rows.reduce((s, r) => s + r.costUsd, 0) / rows.filter((r) => r.ok).length).toFixed(5))
      : null,
    latencyMs: { p50: at(0.5), p90: at(0.9) },
    ...(arm === 'D'
      ? {
          critiqueFoundSomething: pct(rows.filter((r) => (r.critique?.findings ?? []).length > 0).length, rows.length),
          critiqueRepairLanded: pct(rows.filter((r) => r.critiqueRepairApplied).length, rows.length),
        }
      : {}),
  };
}

const report = {
  label: LABEL,
  route: { provider, model },
  critiqueRoute: CRITIQUE_ROUTE || null,
  when: new Date().toISOString(),
  arms: ARMS,
  briefs: selected.map((b) => b.id),
  summary,
  cost: { spentUsd: Number(spent.toFixed(6)), ceilingUsd: MAX_COST, stoppedAtCeiling, pricePerM: price },
  results,
  note:
    'Engineering validity is REPORTED, never ranked on (plan §11, the two-scorecard rule). ' +
    'The ranking that decides the pilot is the pairwise human review over the hold frames in ' +
    'this directory; nearest-catalog similarity (criterion 6) is `npm run bench:sameness -- ' +
    '<out> --house=<catalog refs>` over the same frames.',
};
writeFileSync(path.join(OUT, 'pilot.json'), JSON.stringify(report, null, 2));

// The sameness rig reads *-metrics.json rows with a hold capture - write one per arm so
// criterion 6 needs no second capture pass.
for (const arm of ARMS) {
  const rows = armRows(arm).filter((r) => r.files.hold);
  if (!rows.length) continue;
  writeFileSync(
    path.join(OUT, arm, `${LABEL}-${arm}-metrics.json`),
    JSON.stringify({
      candidate: `${LABEL}-${arm}`,
      rows: rows.map((r) => ({ fixtureId: r.brief, phaseFiles: { hold: path.basename(r.files.hold) }, skinApplied: r.styleApplied })),
    }, null, 2),
  );
}

console.log('\nPer arm:');
for (const arm of ARMS) console.log(` ${arm}:`, JSON.stringify(summary[arm]));
console.log(`\n$${spent.toFixed(4)} spent${stoppedAtCeiling ? ' (stopped at the ceiling)' : ''}. Written to ${OUT}/pilot.json`);
console.log('The pairwise human review over the hold frames is what decides the pilot - these numbers are the gates, not the ranking.');
