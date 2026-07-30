// Creative Mode routing bench (docs/CREATIVE_MODE_PLAN.md §11 criterion 1): run the INTENT
// stage + the deterministic route decision for every brief in the pilot bank and score the
// decisions against the expected-route table. Routing only - no design call, no coder, no
// bench - so a full pass costs one small structured call per brief.
//
//   node scripts/creative-route-bench.mjs --route=<provider>:<model> [--out=dir] \
//     [--only=id,id,…|count] [--max-cost=usd]
//
// SPENDS REAL TOKENS. The route is EXPLICIT and fails closed: there is no fallback to env
// or saved settings, so an expensive proprietary model is only ever a deliberate choice.
// The model must have a price entry in scripts/ai-bench-prices.json (refreshed by
// bench:discover) - the script prints the resolved route and the estimated maximum cost
// BEFORE spending, and stops at the --max-cost ceiling (default $1.00) mid-run.
//
// Measured usage (2026-07-30, claude-sonnet-5 over the 29-brief bank): ~3.0k input /
// ~0.65k output per brief - ~87k in / ~18k out for a full pass. Budget from these, not
// the old ~1.5-2k/300 guess.
//
// Requirements: the dev-bench server on this checkout's port (`npm run dev:bench` - it
// blanks the backend vars so the anonymous bench browser can reach the managed keys),
// started with the server-side key for the chosen provider. Never CI.
//
// The free half of the table's upkeep - re-verifying every catalogAnchor against the
// current catalog (the brief-bank decay rule) - lives in e2e/creative-routing.spec.ts and
// costs nothing; run it BEFORE spending here, so a stale expectation is fixed rather than
// measured.

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const ARGS = process.argv.slice(2);
const flag = (name) => ARGS.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const ROUTE = flag('route') ?? '';
const OUT = flag('out') || './creative-route-out';
const FILTER = flag('only') ?? '';
const MAX_COST = Number(flag('max-cost') ?? '1');

const [provider, ...modelParts] = ROUTE.split(':');
const model = modelParts.join(':');
if (!provider || !model) {
  console.error('This bench SPENDS TOKENS and requires an explicit route: --route=<provider>:<model id>.');
  process.exit(1);
}
if (!Number.isFinite(MAX_COST) || MAX_COST <= 0) {
  console.error(`--max-cost must be a positive USD amount, got "${flag('max-cost')}".`);
  process.exit(1);
}

// The hard ceiling needs a price to enforce, so an unpriced model refuses to run rather
// than spending blind. Add the model to ai-bench-prices.json (bench:discover) first.
const prices = JSON.parse(readFileSync(new URL('./ai-bench-prices.json', import.meta.url), 'utf8'));
const price = prices[model];
if (!price || typeof price.in !== 'number' || typeof price.out !== 'number') {
  console.error(`No price entry for "${model}" in scripts/ai-bench-prices.json - add it (bench:discover) before spending.`);
  process.exit(1);
}
const costOf = (usage) => ((usage?.inputTokens ?? 0) * price.in + (usage?.outputTokens ?? 0) * price.out) / 1e6;

const bank = JSON.parse(readFileSync(new URL('../benchmarks/creative/v1/briefs.json', import.meta.url), 'utf8'));
const selected = /^[a-z0-9-]+(,[a-z0-9-]+)*$/.test(FILTER)
  ? bank.briefs.filter((b) => FILTER.split(',').includes(b.id))
  : bank.briefs.slice(0, Number(FILTER) || Infinity);

// Print the route and the worst legal spend BEFORE the first call. Per-brief maximum:
// generous input bound (measured p50 ~3k) + the call's own maxTokens output cap.
const PER_BRIEF_MAX = { in: 5000, out: 2000 };
const perBriefMaxCost = (PER_BRIEF_MAX.in * price.in + PER_BRIEF_MAX.out * price.out) / 1e6;
const estMax = perBriefMaxCost * selected.length;
const estTypical = ((3000 * price.in + 650 * price.out) / 1e6) * selected.length;
console.log(`Route: ${provider}:${model} — ${selected.length} brief(s)`);
console.log(
  `Estimated cost: ~$${estTypical.toFixed(4)} typical, $${estMax.toFixed(4)} max ` +
  `(price $${price.in}/$${price.out} per M). Ceiling: $${MAX_COST.toFixed(2)}.`,
);
if (estMax > MAX_COST) {
  console.error(`Estimated maximum ($${estMax.toFixed(4)}) exceeds the ceiling - raise --max-cost deliberately or select fewer briefs.`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });

// Pin the EXPLICIT route and clear fallbacks: saved settings outrank env, and a rescued
// fallback would be credited with the routing decision.
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
  if (spent + perBriefMaxCost > MAX_COST) {
    stoppedAtCeiling = true;
    console.error(`Ceiling reached after $${spent.toFixed(4)} - stopping before "${brief.id}" (partial results are written).`);
    break;
  }
  process.stdout.write(`▸ ${brief.id} … `);
  const started = Date.now();
  try {
    const r = await page.evaluate(
      async ({ text, mode }) => {
        const { INTENT_TOOL, intentSystemPrompt, normalizeIntent, routeIntent } = await import('/src/ai/structuralIntent.ts');
        const { callModelDetailed } = await import('/src/ai/modelGateway.ts');
        const result = await callModelDetailed({
          system: intentSystemPrompt(),
          messages: [{ role: 'user', content: [{ type: 'text', text: `Create a broadcast graphics template.\n\nUser brief: ${text}` }] }],
          tool: INTENT_TOOL,
          maxTokens: 2000,
        });
        const intent = normalizeIntent(result.output);
        const decision = routeIntent(intent, mode);
        return {
          route: decision.route,
          reason: decision.reason,
          kind: intent.kind,
          id: intent.typeId ?? intent.families?.[0] ?? null,
          confidence: intent.confidence,
          originality: intent.originalityRequested,
          beyondScope: intent.beyondScope ?? false,
          scopeEvidence: intent.scopeEvidence ?? null,
          usage: result.usage ?? null,
          model: result.model ?? null,
        };
      },
      { text: brief.brief, mode: brief.mode },
    );
    const latencyMs = Date.now() - started;
    spent += costOf(r.usage);
    const match = brief.expectedRoute === 'either' || r.route === brief.expectedRoute;
    results.push({ ...brief, actual: r, latencyMs, match });
    console.log(
      `${r.route} (${r.kind}${r.id ? `:${r.id}` : ''}, ${r.confidence}${r.beyondScope ? ', beyond-scope' : ''}) ` +
      `${(latencyMs / 1000).toFixed(1)}s ${match ? '✓' : `✗ expected ${brief.expectedRoute}`}`,
    );
  } catch (e) {
    results.push({ ...brief, actual: null, latencyMs: Date.now() - started, match: false, error: String(e?.message ?? e) });
    console.log(`ERROR ${String(e?.message ?? e).split('\n')[0]}`);
  }
}
await browser.close();

const byCategory = {};
for (const r of results) {
  const c = (byCategory[r.category] ??= { total: 0, matched: 0, either: 0 });
  c.total += 1;
  if (r.expectedRoute === 'either') c.either += 1;
  else if (r.match) c.matched += 1;
}
const summary = Object.fromEntries(
  Object.entries(byCategory).map(([cat, c]) => [
    cat,
    `${c.matched}/${c.total - c.either} scored (${c.either} 'either' unscored)`,
  ]),
);
const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))] ?? null;
const usageTotal = results.reduce(
  (t, r) => ({ in: t.in + (r.actual?.usage?.inputTokens ?? 0), out: t.out + (r.actual?.usage?.outputTokens ?? 0) }),
  { in: 0, out: 0 },
);
const report = {
  route: { provider, model },
  when: new Date().toISOString(),
  summary,
  cost: { spentUsd: Number(spent.toFixed(6)), ceilingUsd: MAX_COST, stoppedAtCeiling, pricePerM: price },
  usage: usageTotal,
  latencyMs: { p50: pct(0.5), p90: pct(0.9) },
  results,
};
writeFileSync(`${OUT}/routes.json`, JSON.stringify(report, null, 2));
console.log('\nPer category:', summary);
console.log(`Tokens: ${usageTotal.in} in / ${usageTotal.out} out — $${spent.toFixed(4)} spent. Latency p50 ${report.latencyMs.p50}ms / p90 ${report.latencyMs.p90}ms.`);
console.log(`Written to ${OUT}/routes.json`);
