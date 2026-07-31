#!/usr/bin/env node
// The NoaCG Pro lower-third benchmark (docs/NOACG_PRO_PLAN.md §9).
//
//   node scripts/pro-bench.mjs                       # FREE: fixtures (or the stub) only
//   node scripts/pro-bench.mjs --generate --image-route=openrouter:<model> --max-cost=1
//                                                    # PAID: real concept + interpretation
//   node scripts/pro-bench.mjs --save-fixtures       # (with --generate) write results back
//                                                    # as fixtures for future free runs
//   node scripts/pro-bench.mjs news-public,long-name # run a subset by id
//
// FREE is the default and the regression mode: every brief runs the real normalizer,
// compiler, and production validator (static + live runtime bench) against a checked-in
// fixture - a previously generated concept + interpretation under benchmarks/pro/v1/
// fixtures/<id>/ - or, where no fixture exists, the deterministic stub. No network, no
// tokens, no cost. PAID mode SPENDS REAL MONEY on the caller's own keys and is therefore
// explicit: it refuses to run without --generate, a named --image-route, and a --max-cost
// ceiling it enforces cumulatively mid-run.
//
// Deterministic structural checks (scored here) stay separate from subjective visual
// quality (the review gallery, a human read). Requires the dev server on this checkout's
// port (npm run dev - with your own .env for paid mode).

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';
import { readEnvFile } from './ai-bench-server.mjs';

const BASE = `http://localhost:${devPort()}`;
const OUT = path.resolve('pro-bench-out');
const BANK = path.resolve('benchmarks/pro/v1/briefs.json');
const FIXTURES = path.resolve('benchmarks/pro/v1/fixtures');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const only = args.find((a) => !a.startsWith('--'))?.split(',').filter(Boolean) ?? null;

const paid = flag('generate');
const saveFixtures = flag('save-fixtures');
const maxCost = Number(value('max-cost') ?? (paid ? Number.NaN : 0));
const imageRoute = value('image-route');
// The interpretation call rides the SESSION model, so paid mode must pin a VISION-capable
// route - the default session model is a text coder and would be handed an image.
const interpretRoute = value('interpret-route');

if (paid) {
  if (!imageRoute?.startsWith('openrouter:')) {
    console.error('PAID mode needs an explicit --image-route=openrouter:<model> (the gateway\'s image adapter).');
    process.exit(1);
  }
  if (!interpretRoute?.includes(':')) {
    console.error('PAID mode needs an explicit --interpret-route=<provider>:<vision model> for the interpretation call.');
    process.exit(1);
  }
  if (!Number.isFinite(maxCost) || maxCost <= 0) {
    console.error('PAID mode needs an explicit --max-cost=<usd> ceiling. This run spends real money.');
    process.exit(1);
  }
  console.log(`PAID run: image ${imageRoute}, interpretation ${interpretRoute}, ceiling $${maxCost.toFixed(2)}. This spends real tokens.`);
}

const bank = JSON.parse(await readFile(BANK, 'utf8'));
const briefs = bank.briefs.filter((entry) => !only || only.includes(entry.id));
if (briefs.length === 0) {
  console.error('No briefs matched.');
  process.exit(1);
}

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first (npm run dev).`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.log('  pageerror:', error.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();

if (paid) {
  // A managed key only counts for a SIGNED-IN caller once a backend is configured, and a
  // fresh Playwright context has no session - the ai-bench.mjs lesson. Credentials come
  // from the environment or .env (the dedicated e2e test account).
  const fileEnv = await readEnvFile();
  const creds = {
    email: (process.env.E2E_EMAIL ?? fileEnv.E2E_EMAIL ?? '').trim(),
    password: (process.env.E2E_PASSWORD ?? fileEnv.E2E_PASSWORD ?? '').trim(),
  };
  if (creds.email && creds.password) {
    try {
      await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 });
      await page.keyboard.press('Escape');
      await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 });
      await page.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 10_000 });
      await page.locator('#auth-email').fill(creds.email);
      await page.locator('#auth-pass').fill(creds.password);
      await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.locator('.auth-status').waitFor({ state: 'visible', timeout: 20_000 });
      console.log('Signed in for the managed route.');
    } catch (error) {
      console.error(`Sign-in failed (${error.message?.split('\n')[0]}) - continuing signed out.`);
    }
  } else {
    console.log('No E2E credentials found - continuing signed out (BYO cookie or open self-host only).');
  }
  // Pin the interpretation route as the session model, fallbacks cleared so a failing
  // route can never be rescued by another and credited with the result.
  const pinned = await page.evaluate(async (route) => {
    const { refreshAiConfiguration, saveAiSettings, aiConfigured } = await import('/src/ai/settings.ts');
    await refreshAiConfiguration();
    const [provider, ...model] = route.split(':');
    saveAiSettings({ provider, model: model.join(':'), fallbacks: [] });
    return aiConfigured();
  }, interpretRoute);
  if (!pinned) {
    console.error(`No server key is available for the ${interpretRoute.split(':')[0]} provider - refusing to start a paid run.`);
    await browser.close();
    process.exit(1);
  }
}

/** Fixture for one brief: { concept: dataUrl, interpretation } or null. */
async function fixtureFor(id) {
  const dir = path.join(FIXTURES, id);
  try {
    await access(path.join(dir, 'interpretation.json'));
    const interpretation = JSON.parse(await readFile(path.join(dir, 'interpretation.json'), 'utf8'));
    const png = await readFile(path.join(dir, 'concept.png'));
    return { concept: `data:image/png;base64,${png.toString('base64')}`, interpretation };
  } catch {
    return null;
  }
}

const results = [];
let spentUsd = 0;

for (const entry of briefs) {
  const started = Date.now();
  console.log(`\n── ${entry.id} ──`);
  if (paid && spentUsd >= maxCost) {
    console.log(`  SKIPPED: the $${maxCost.toFixed(2)} ceiling is spent ($${spentUsd.toFixed(3)}).`);
    results.push({ id: entry.id, skipped: 'cost-ceiling' });
    continue;
  }
  const fixture = paid ? null : await fixtureFor(entry.id);

  let outcome;
  try {
    outcome = await page.evaluate(async (input) => {
      const bust = `?t=${Date.now()}`;
      const { stubProConcept } = await import(`/src/ai/pro/stub.ts${bust}`);
      const { generateProConcept, compileProConcept } = await import(`/src/ai/pro/pipeline.ts${bust}`);
      const { normalizeProInterpretation } = await import(`/src/ai/pro/normalize.ts${bust}`);
      const { compileProPlan } = await import(`/src/ai/pro/compile.ts${bust}`);
      const { productionSpxValidator } = await import(`/src/ai/litePipeline.ts${bust}`);
      const { uuid } = await import(`/src/model/id.ts${bust}`);

      const measure = (dataUrl) => new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve({ width: el.naturalWidth, height: el.naturalHeight });
        el.onerror = () => reject(new Error('fixture concept undecodable'));
        el.src = dataUrl;
      });

      const validate = productionSpxValidator();
      let result;
      let conceptCost = null;
      let interpretCost = null;
      if (input.paid) {
        const [provider, ...modelParts] = input.imageRoute.split(':');
        const concept = await generateProConcept(input.brief, { provider, model: modelParts.join(':') });
        conceptCost = concept.costUsd;
        // A failed interpretation must not lose the concept's PAID cost with the throw -
        // the first paid round spent ~$0.80 on twelve concepts and reported $0.000,
        // because the whole evaluate threw before the cost was returned.
        try {
          result = await compileProConcept(input.brief, concept, { validate });
        } catch (error) {
          return { failedAfterConcept: String(error).slice(0, 300), conceptCost };
        }
        // The interpretation's provider-reported cost lands on the telemetry ring's stage
        // record; read it back so the ceiling counts the whole brief, not just the image.
        const { exportAiRuns } = await import(`/src/ai/telemetry.ts${bust}`);
        const runs = JSON.parse(exportAiRuns());
        const last = runs.filter((run) => run.kind === 'pro-generate').at(-1);
        interpretCost = last?.stages?.find((stage) => stage.name === 'interpret')?.usage?.estimatedCost?.amount ?? null;
      } else if (input.fixture) {
        const size = await measure(input.fixture.concept);
        const concept = { dataUrl: input.fixture.concept, mediaType: 'image/png', ...size, model: 'fixture', costUsd: 0 };
        const plan = normalizeProInterpretation(input.fixture.interpretation, size, uuid);
        const compiled = await compileProPlan(plan, concept, input.brief, {});
        result = { ...compiled, validation: await validate(compiled.template), concept };
      } else {
        const { stubCompilePro } = await import(`/src/ai/pro/stub.ts${bust}`);
        const concept = await stubProConcept(input.brief);
        result = await stubCompilePro(input.brief, concept, { validate });
      }

      // ── Deterministic structural checks ──────────────────────────────────────────
      const t = result.template;
      const fieldValues = t.fields.map((f) => String(f.value ?? ''));
      const textFieldCount = t.fields.filter((f) => f.ftype === 'textfield').length;
      const hasLogoSlot = t.fields.some((f) => f.ftype === 'filelist');
      const checks = {
        compiled: true,
        validationOk: result.validation.ok,
        validationErrors: result.validation.errors.map((e) => `${e.rule}: ${e.message.slice(0, 140)}`),
        textFields: textFieldCount,
        expectedTextFields: input.expect.textFields ?? 2,
        nameCarried: fieldValues.some((v) => v === input.brief.name),
        titleCarried: fieldValues.some((v) => v === input.brief.title),
        logoExpected: Boolean(input.expect.logo),
        logoSlot: hasLogoSlot,
        editability: result.report.editability,
        panelsRebuilt: result.report.panelsRebuilt,
        flattened: result.report.flattened,
        artDropped: result.report.artDropped,
        reportWarnings: result.report.warnings,
      };
      checks.pass = checks.validationOk
        && checks.textFields >= checks.expectedTextFields
        && checks.nameCarried && checks.titleCarried
        && (!checks.logoExpected || checks.logoSlot);

      // ── The compiled HOLD frame, for the gallery ─────────────────────────────────
      const { composeDocument } = await import(`/src/preview/composeDocument.ts${bust}`);
      const frame = document.createElement('iframe');
      frame.id = 'pro-bench-frame';
      frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;z-index:99999;background:#333;';
      document.body.appendChild(frame);
      frame.srcdoc = composeDocument(t);
      await new Promise((resolve) => { frame.onload = resolve; });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const win = frame.contentWindow;
      win.update(JSON.stringify(Object.fromEntries(t.fields.map((f) => [f.field, f.value ?? '']))));
      win.play();
      // Real glyphs or nothing: wait the fonts out before the frame is photographed.
      await win.document.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 1800));

      return {
        checks,
        conceptCost,
        interpretCost,
        conceptDataUrl: input.paid || input.saveFixtures ? result.concept.dataUrl : null,
        interpretation: result.interpretation ?? null,
      };
    }, {
      paid,
      imageRoute,
      saveFixtures,
      brief: entry.brief,
      expect: entry.expect ?? {},
      fixture,
    });
  } catch (error) {
    console.log(`  FAILED: ${error.message.split('\n')[0]}`);
    results.push({ id: entry.id, error: error.message.slice(0, 400), ms: Date.now() - started });
    await page.evaluate(() => document.getElementById('pro-bench-frame')?.remove()).catch(() => undefined);
    continue;
  }
  if (outcome.failedAfterConcept) {
    if (typeof outcome.conceptCost === 'number') spentUsd += outcome.conceptCost;
    console.log(`  FAILED after the paid concept ($${(outcome.conceptCost ?? 0).toFixed(3)}): ${outcome.failedAfterConcept.split('\n')[0]}`);
    results.push({
      id: entry.id,
      error: outcome.failedAfterConcept,
      conceptCostUsd: outcome.conceptCost,
      ms: Date.now() - started,
    });
    await writeFile(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, paid, spentUsd, results }, null, 2));
    continue;
  }

  const shot = path.join(OUT, `${entry.id}.png`);
  // Screenshot from INSIDE the frame: an element screenshot of the iframe node captures
  // whatever the app stacks over it (the wizard auto-opens on a fresh visit), while the
  // frame's own body is only ever the graphic over the frame background.
  await page.frameLocator('#pro-bench-frame').locator('body').screenshot({ path: shot });
  await page.evaluate(() => document.getElementById('pro-bench-frame')?.remove());

  if (outcome.conceptDataUrl) {
    const conceptPng = Buffer.from(outcome.conceptDataUrl.split(',')[1], 'base64');
    await writeFile(path.join(OUT, `${entry.id}.concept.png`), conceptPng);
    if (saveFixtures && outcome.interpretation) {
      const dir = path.join(FIXTURES, entry.id);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'concept.png'), conceptPng);
      await writeFile(path.join(dir, 'interpretation.json'), `${JSON.stringify(outcome.interpretation, null, 2)}\n`);
      console.log(`  fixture written to ${path.relative(process.cwd(), dir)}`);
    }
  }
  if (typeof outcome.conceptCost === 'number') spentUsd += outcome.conceptCost;
  if (typeof outcome.interpretCost === 'number') spentUsd += outcome.interpretCost;

  const record = {
    id: entry.id,
    source: paid ? 'generated' : fixture ? 'fixture' : 'stub',
    ...outcome.checks,
    conceptCostUsd: outcome.conceptCost,
    interpretCostUsd: outcome.interpretCost,
    ms: Date.now() - started,
  };
  results.push(record);
  console.log(`  ${record.pass ? 'PASS' : 'FAIL'} · ${record.source} · fields ${record.textFields} · editability ${record.editability.toFixed(2)} · ${record.ms} ms`);
  if (!record.validationOk) for (const err of record.validationErrors) console.log(`    ✗ ${err}`);
  await writeFile(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, paid, spentUsd, results }, null, 2));
}

// ── The review gallery: deterministic verdicts beside the frames a human judges ────────
const rows = results.map((r) => `
  <section>
    <h2>${r.id} <small>${r.skipped ? `skipped (${r.skipped})` : r.error ? 'ERROR' : r.pass ? 'PASS' : 'FAIL'}${r.source ? ` · ${r.source}` : ''}</small></h2>
    ${r.error ? `<pre>${r.error}</pre>` : ''}
    <div class="frames">
      ${r.conceptCostUsd !== undefined && r.conceptCostUsd !== null ? `<p>concept cost $${r.conceptCostUsd.toFixed(4)}</p>` : ''}
      <figure><img src="${r.id}.concept.png" onerror="this.parentElement.remove()"><figcaption>concept</figcaption></figure>
      <figure><img src="${r.id}.png" onerror="this.parentElement.remove()"><figcaption>compiled hold frame</figcaption></figure>
    </div>
    ${r.checks !== undefined || r.textFields !== undefined ? `<pre>${JSON.stringify({
      textFields: r.textFields, editability: r.editability, panelsRebuilt: r.panelsRebuilt,
      flattened: r.flattened, artDropped: r.artDropped, warnings: r.reportWarnings,
    }, null, 1)}</pre>` : ''}
  </section>`).join('\n');
await writeFile(path.join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8">
<title>NoaCG Pro bench review</title>
<style>body{background:#101216;color:#e8e9ec;font:14px system-ui;padding:24px}img{max-width:46vw;border:1px solid #333}
.frames{display:flex;gap:12px}figure{margin:0}figcaption{color:#9aa0ab;font-size:12px}small{color:#9aa0ab}pre{color:#9aa0ab;white-space:pre-wrap}</style>
<h1>NoaCG Pro — lower-third bench (${paid ? 'PAID' : 'free'})</h1>
<p>Deterministic verdicts are scored in results.json; these frames are the SUBJECTIVE half — judge hierarchy, spacing, legibility, brief fit.</p>
${rows}`);

const scored = results.filter((r) => !r.skipped && !r.error);
console.log(`\n${scored.filter((r) => r.pass).length}/${scored.length} pass · ${results.length - scored.length} skipped/errored${paid ? ` · spent ~$${spentUsd.toFixed(3)}` : ''}`);
console.log(`Review: ${path.join(OUT, 'review.html')}`);
await browser.close();
