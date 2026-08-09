#!/usr/bin/env node
// Diagnostic probe for the Pro INTERPRETATION call alone (docs/NOACG_PRO_PLAN.md §7a).
//
//   node scripts/pro-interpret-probe.mjs <fixture-id> [repeats]
//
// Replays a checked-in fixture CONCEPT through compileProConcept, so the expensive image
// call is never made: the only paid call is the interpretation itself (~$0.002). It exists
// because a paid round lost 5 of 12 concepts to interpretation failures, and diagnosing that
// by re-running the full pipeline costs $0.067 a try.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';
import { readEnvFile } from './ai-bench-server.mjs';
import { requireAllowedRoute } from './harness-route-policy.mjs';

const BASE = `http://localhost:${devPort()}`;
const id = process.argv[2] ?? 'news-public';
const repeats = Number(process.argv[3] ?? 1);
const route = process.argv[4] ?? 'vercel:google/gemini-2.5-flash';
// Gateway routes only, unless the run says why (scripts/harness-route-policy.mjs). This probe
// takes its route POSITIONALLY, so the reason rides an env var rather than a flag.
requireAllowedRoute(route, { source: 'the route argument', reason: process.env.NOACG_FRONTIER_REASON });

const bank = JSON.parse(await readFile(path.resolve('benchmarks/pro/v1/briefs.json'), 'utf8'));
const entry = bank.briefs.find((b) => b.id === id);
if (!entry) {
  console.error(`No brief "${id}" in the bank.`);
  process.exit(1);
}
const png = await readFile(path.resolve('benchmarks/pro/v1/fixtures', id, 'concept.png'));
const conceptDataUrl = `data:image/png;base64,${png.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();

const fileEnv = await readEnvFile();
const creds = {
  email: (process.env.E2E_EMAIL ?? fileEnv.E2E_EMAIL ?? '').trim(),
  password: (process.env.E2E_PASSWORD ?? fileEnv.E2E_PASSWORD ?? '').trim(),
};
if (creds.email && creds.password) {
  await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 });
  await page.keyboard.press('Escape');
  await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 10_000 });
  await page.locator('#auth-email').fill(creds.email);
  await page.locator('#auth-pass').fill(creds.password);
  await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('.auth-status').waitFor({ state: 'visible', timeout: 20_000 });
  console.log('Signed in.');
}
await page.evaluate(async (r) => {
  const { refreshAiConfiguration, saveAiSettings } = await import('/src/ai/settings.ts');
  await refreshAiConfiguration();
  const [provider, ...model] = r.split(':');
  saveAiSettings({ provider, model: model.join(':'), fallbacks: [] });
}, route);

let ok = 0;
let spent = 0;
for (let i = 0; i < repeats; i += 1) {
  const outcome = await page.evaluate(async (input) => {
    const bust = `?t=${Date.now()}`;
    const { compileProConcept } = await import(`/src/ai/pro/pipeline.ts${bust}`);
    const measure = (dataUrl) => new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve({ width: el.naturalWidth, height: el.naturalHeight });
      el.onerror = () => reject(new Error('undecodable'));
      el.src = dataUrl;
    });
    const size = await measure(input.conceptDataUrl);
    const concept = { dataUrl: input.conceptDataUrl, mediaType: 'image/png', ...size, model: 'fixture', costUsd: 0 };
    try {
      const result = await compileProConcept(input.brief, concept, {});
      return {
        ok: true,
        regions: result.interpretation?.regions?.length ?? 0,
        costUsd: result.interpretCostUsd,
      };
    } catch (error) {
      // A failed interpretation was still served and billed; ProCompileError carries what it
      // cost, which is the half a spend ceiling most needs and most easily loses.
      return { ok: false, error: String(error).slice(0, 300), costUsd: error?.costUsd ?? null };
    }
  }, { brief: entry.brief, conceptDataUrl });
  if (outcome.ok) ok += 1;
  if (typeof outcome.costUsd === 'number') spent += outcome.costUsd;
  const cost = typeof outcome.costUsd === 'number' ? ` · $${outcome.costUsd.toFixed(4)}` : ' · cost UNREPORTED';
  console.log(`  ${i + 1}: ${outcome.ok ? `OK (${outcome.regions} regions)` : `FAIL ${outcome.error}`}${cost}`);
}
console.log(`${ok}/${repeats} interpretations succeeded on ${route} · spent $${spent.toFixed(4)}.`);
await browser.close();
