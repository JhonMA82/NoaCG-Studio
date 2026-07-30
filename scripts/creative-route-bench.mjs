// Creative Mode routing bench (docs/CREATIVE_MODE_PLAN.md §11 criterion 1): run the INTENT
// stage + the deterministic route decision for every brief in the pilot bank and score the
// decisions against the expected-route table. Routing only - no design call, no coder, no
// bench - so a full pass costs one small structured call per brief.
//
//   node scripts/creative-route-bench.mjs [out-dir] [id,id,… | count]
//
// Requirements: the dev server (this checkout's port) started with a server-side key for
// whichever provider VITE_AI_PROVIDER names. SPENDS REAL TOKENS (~1.5-2k input / ~300
// output per brief - cents per full pass at funded-route prices). Never CI.
//
// The free half of the table's upkeep - re-verifying every catalogAnchor against the
// current catalog (the brief-bank decay rule) - lives in e2e/creative-routing.spec.ts and
// costs nothing; run it BEFORE spending here, so a stale expectation is fixed rather than
// measured.

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const OUT = process.argv[2] || './creative-route-out';
const FILTER = process.argv[3] ?? '';
mkdirSync(OUT, { recursive: true });

const bank = JSON.parse(readFileSync(new URL('../benchmarks/creative/v1/briefs.json', import.meta.url), 'utf8'));
const selected = /^[a-z0-9-]+(,[a-z0-9-]+)*$/.test(FILTER)
  ? bank.briefs.filter((b) => FILTER.split(',').includes(b.id))
  : bank.briefs.slice(0, Number(FILTER) || Infinity);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });

// Pin the env route and clear fallbacks, exactly like scripts/ai-bench.mjs: saved settings
// outrank env, and a rescued fallback would be credited with the routing decision.
const route = await page.evaluate(async () => {
  const { refreshAiConfiguration, saveAiSettings, loadAiSettings, aiConfigured } = await import('/src/ai/settings.ts');
  await refreshAiConfiguration();
  const env = loadAiSettings();
  saveAiSettings({ provider: env.provider, model: env.model, fallbacks: [] });
  return { ok: aiConfigured(), provider: env.provider, model: env.model };
});
if (!route.ok) {
  console.error(`No server-managed route available for ${route.provider}:${route.model}. Start the dev server with the matching key.`);
  await browser.close();
  process.exit(1);
}
console.log(`Route: ${route.provider}:${route.model} — ${selected.length} brief(s)`);

const results = [];
for (const brief of selected) {
  process.stdout.write(`▸ ${brief.id} … `);
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
          usage: result.usage ?? null,
          model: result.model ?? null,
        };
      },
      { text: brief.brief, mode: brief.mode },
    );
    const match = brief.expectedRoute === 'either' || r.route === brief.expectedRoute;
    results.push({ ...brief, actual: r, match });
    console.log(`${r.route} (${r.kind}${r.id ? `:${r.id}` : ''}, ${r.confidence}) ${match ? '✓' : `✗ expected ${brief.expectedRoute}`}`);
  } catch (e) {
    results.push({ ...brief, actual: null, match: false, error: String(e?.message ?? e) });
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
writeFileSync(`${OUT}/routes.json`, JSON.stringify({ route, when: new Date().toISOString(), summary, results }, null, 2));
console.log('\nPer category:', summary);
console.log(`Written to ${OUT}/routes.json`);
