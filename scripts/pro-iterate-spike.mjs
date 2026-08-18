#!/usr/bin/env node
// THE ITERATE-ARM RUNNER - render, measure, feed back, repeat (src/ai/spike/iterate.ts,
// docs/NOACG_PRO_PLAN.md §20.1's custom-lane experiment).
//
//   node scripts/pro-iterate-spike.mjs --control                 # FREE. Run FIRST - proves the
//                                                                # loop's findings collection on
//                                                                # a known-good and a known-bad
//                                                                # template, no model call.
//   node scripts/pro-iterate-spike.mjs --generate --route=vercel:<model> --max-cost=2 \
//       --out=pro-iterate-out-<model> [--max-iterations=4] [--no-vision] [--resume] [briefs]
//
// WHAT THE LOOP IS. First emit = byte-identical protocol to the one-shot `none` arm (same
// prompt, tool, decoding, grounding), so round 0 is comparable with the four-checkpoint round.
// Then, up to --max-iterations times: mount the REAL rendered hold, run every instrument the
// paid rounds are scored by, and hand the model the findings plus (unless --no-vision) a
// downscaled screenshot of its own frame. Stop when the frame measures CLEAN - or stop dirty
// and say so: `deliverable: false` is a first-class result, because the owner's rule is that
// an unfinished graphic never ships as a success.
//
// A SEPARATE RUNNER ON PURPOSE: pro-spike.mjs is the one-shot protocol and another live
// session is editing it; this file duplicates the small capture core rather than entangling
// the two. No motion strips here - the iteration signal is the settled frame, and the round's
// blind page is stills (stated on it, not hidden).
//
// Records land results.json-compatible with the spike ledger (hold/stressHold/usage/costUsd/
// contract/instrument reports), so pro-freeform-compare-gallery.mjs and
// pro-freeform-columns.mjs read an iterate round unchanged.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';
import { readEnvFile } from './ai-bench-server.mjs';
import { requireAllowedRoute } from './harness-route-policy.mjs';

const BASE = `http://localhost:${devPort()}`;
const BANK = path.resolve('benchmarks/pro/v1/briefs.json');
const DECODING = path.resolve('benchmarks/pro/v1/spike/decoding.json');
const BRANDS = path.resolve('benchmarks/pro/v1/spike/brands.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const only = args.find((a) => !a.startsWith('--'))?.split(',').filter(Boolean) ?? null;

const control = flag('control');
const paid = flag('generate');
const resume = flag('resume');
const vision = !flag('no-vision');
const MAX_ITERATIONS = Number(value('max-iterations') ?? 4);
const OUT = path.resolve(value('out') ?? 'pro-iterate-out');

if (!control && !paid) {
  console.error('Pick a mode: --control (free, run this first) or --generate (PAID).');
  process.exit(1);
}

const route = value('route');
const maxCost = Number(value('max-cost') ?? 0);
let frontierReason = null;
if (paid) {
  if (!route) {
    console.error('PAID mode needs --route=<provider>:<model>.');
    process.exit(1);
  }
  const checked = requireAllowedRoute(route, { flag: 'route', reason: value('frontier-reason') });
  frontierReason = checked.frontierReason;
  if (!Number.isFinite(maxCost) || maxCost <= 0) {
    console.error('--max-cost must be a positive number of dollars. This run spends real money.');
    process.exit(1);
  }
  console.log(`PAID iterate run: ${route}, max ${MAX_ITERATIONS} iteration(s), vision ${vision ? 'on' : 'off'},`
    + ` ceiling $${maxCost.toFixed(2)}. This spends real tokens.`);
}

const decoding = JSON.parse(await readFile(DECODING, 'utf8'));
const bank = JSON.parse(await readFile(BANK, 'utf8'));
const briefs = bank.briefs.filter((entry) => !only || only.includes(entry.id));
const brandsFixture = JSON.parse(await readFile(BRANDS, 'utf8'));

const rawBrands = [];
for (const brand of brandsFixture.brands) {
  const file = path.resolve(path.dirname(BRANDS), brand.mark);
  const bytes = await readFile(file);
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'image/jpeg';
  rawBrands.push({
    ...brand,
    markFileName: path.basename(file),
    markDataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
  });
}

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.log('  pageerror:', error.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

// Probe the marks in the page (measured, never hand-written - pro-spike.mjs says why).
const brands = [];
{
  const probes = await page.evaluate(async (input) => {
    const bust = '?t=' + Date.now();
    const { probeMark } = await import('/src/assets/assetInfo.ts' + bust);
    const out = {};
    for (const brand of input) {
      out[brand.id] = await probeMark({ path: `images/${brand.markFileName}`, data: brand.markDataUrl });
    }
    return out;
  }, rawBrands.map((b) => ({ id: b.id, markFileName: b.markFileName, markDataUrl: b.markDataUrl })));
  for (const raw of rawBrands) {
    if (!probes[raw.id]) {
      console.error(`Brand "${raw.id}": probeMark could not read ${raw.markFileName}.`);
      process.exit(1);
    }
    brands.push({
      id: raw.id,
      name: raw.name,
      world: raw.world,
      typeface: raw.typeface,
      palette: raw.palette,
      mark: { path: `images/${raw.markFileName}`, dataUrl: raw.markDataUrl, probe: probes[raw.id] },
    });
  }
}
const brandById = new Map(brands.map((b) => [b.id, b]));

if (paid) {
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

/** Mount the settled hold, measure every instrument, screenshot it. The same compose path,
 *  wait and instrument set as the spike runner's hold capture. */
async function captureAndMeasure(template, data, markFieldId, markProbe, file) {
  const playError = await page.evaluate(async ({ template, data }) => {
    const bust = '?t=' + Date.now();
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    document.getElementById('iterate-hold-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'iterate-hold-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const win = frame.contentWindow;
    let error = null;
    try {
      win.update(JSON.stringify(data));
      win.play();
    } catch (e) {
      error = String(e?.message ?? e).slice(0, 300);
    }
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1800));
    return error;
  }, { template, data });
  const measured = await page.evaluate(async ({ markFieldId, markProbe }) => {
    const bust = '?t=' + Date.now();
    const { measureRenderedMark } = await import('/src/ai/spike/brand.ts' + bust);
    const { measureAxes } = await import('/src/ai/spike/axisCheck.ts' + bust);
    const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts' + bust);
    const { measureProportion } = await import('/src/ai/spike/proportionCheck.ts' + bust);
    const { measureDevice } = await import('/src/ai/spike/deviceCheck.ts' + bust);
    const doc = document.getElementById('iterate-hold-frame')?.contentDocument;
    if (!doc) return null;
    const base = { markFieldId: markFieldId ?? null };
    return {
      axis: measureAxes(doc),
      spacing: measureSpacing(doc, base),
      proportion: measureProportion(doc, base),
      device: measureDevice(doc),
      mark: markFieldId && markProbe ? measureRenderedMark(doc, markFieldId, markProbe) : null,
    };
  }, { markFieldId: markFieldId ?? null, markProbe: markProbe ?? null });
  const shot = await page.frameLocator('#iterate-hold-frame').locator('body')
    .screenshot({ path: path.join(OUT, file) });
  await page.evaluate(() => document.getElementById('iterate-hold-frame')?.remove());
  return { playError, measured, shot };
}

/** Everything the loop feeds back, as teaching strings. The device instrument is deliberately
 *  ABSENT - a plain panel is a legal answer; this loop repairs defects, it does not demand
 *  novelty. */
const EDITABILITY_RULE = 'bench-editability';
function collectFindings(validation, playError, measured) {
  const findings = [];
  for (const e of validation.errors) {
    if (!e.startsWith(`${EDITABILITY_RULE}:`)) findings.push(`platform check failed - ${e}`);
  }
  if (playError) findings.push(`the template threw at play(): ${playError}`);
  for (const f of measured?.spacing?.findings ?? []) findings.push(`spacing (${f.code}): ${f.detail}`);
  for (const escape of measured?.spacing?.escapes ?? []) {
    if (escape.isText) findings.push(`live text paints outside its panel: ${escape.desc} by ${escape.px}px past the ${escape.side} edge`);
  }
  for (const f of measured?.proportion?.findings ?? []) findings.push(`proportion (${f.code}): ${f.detail}`);
  for (const miss of measured?.axis?.nearMisses ?? []) {
    findings.push(`alignment near-miss: ${miss.a.el} and ${miss.b.el} are ${miss.gapPx}px from sharing the ${miss.side} edge - align them exactly or separate them deliberately`);
  }
  for (const f of measured?.mark?.findings ?? []) findings.push(`brand mark: ${f}`);
  return findings.slice(0, 14);
}

/** Downscale the 1920x1080 hold to a model-sized JPEG inside the page. */
async function downscale(shotBuffer) {
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
  }), shotBuffer.toString('base64'));
}

// ── --control: prove the findings collection, no model ─────────────────────────────────
if (control) {
  const anchor = await page.evaluate(async () => {
    const bust = '?t=' + Date.now();
    const spikeAnchors = await import('/src/ai/spike/anchors.ts' + bust);
    const a = spikeAnchors.controlAnchor();
    return { template: a.template, data: a.data };
  });
  const clean = await captureAndMeasure(anchor.template, anchor.data, null, null, 'control-clean.hold.png');
  const cleanFindings = collectFindings({ errors: [] }, clean.playError, clean.measured);
  console.log(`control (known-good): ${cleanFindings.length} finding(s)`);
  for (const f of cleanFindings) console.log(`  - ${f}`);

  // The MUTATION: pull the supporting line's MASK up over the primary line. Moving the field
  // itself is absorbed by the mask's own overflow clip (the first version of this check
  // proved that by failing) - the mask is the painted box, so the mask is what must move.
  // A loop whose collector cannot see a forced overlap would iterate on nothing.
  const broken = {
    ...anchor.template,
    css: `${anchor.template.css}\n/* control mutation - forced overlap */\n[class*="-mask"]:has(#f1) { margin-top: -52px; }`,
  };
  const bad = await captureAndMeasure(broken, anchor.data, null, null, 'control-broken.hold.png');
  const badFindings = collectFindings({ errors: [] }, bad.playError, bad.measured);
  console.log(`control (forced overlap): ${badFindings.length} finding(s)`);
  for (const f of badFindings) console.log(`  - ${f}`);

  await browser.close();
  if (badFindings.length === 0) {
    console.error('\nMUTATION CHECK FAILED: the forced overlap produced no findings - do not pay for a round on this loop.');
    process.exit(1);
  }
  console.log('\nControl PASSED: the collector is quiet on the known-good frame and loud on the broken one.');
  process.exit(0);
}

// ── The paid loop ──────────────────────────────────────────────────────────────────────
const kept = new Map();
if (resume) {
  try {
    const prior = JSON.parse(await readFile(path.join(OUT, 'results.json'), 'utf8'));
    for (const r of prior.results ?? []) {
      if (r.kind === 'candidate' && !r.error) kept.set(r.slug, r);
    }
    console.log(`Resuming: ${kept.size} candidate(s) kept.`);
  } catch { /* nothing to resume */ }
}

const results = [];
let spentUsd = 0;
const ledgerPath = path.join(OUT, 'results.json');
async function writeLedger() {
  await writeFile(ledgerPath, `${JSON.stringify({
    base: BASE,
    capturedAt: new Date().toISOString(),
    route,
    frontierReason,
    maxIterations: MAX_ITERATIONS,
    vision,
    maxCost,
    spentUsd,
    decoding,
    results,
  }, null, 2)}\n`);
}

for (const entry of briefs) {
  const brand = brandById.get(brandsFixture.assignment[entry.id]);
  const slug = `${entry.id}.${brand.id}.iterate`;
  if (kept.has(slug)) {
    results.push(kept.get(slug));
    continue;
  }
  if (spentUsd >= maxCost) {
    console.log(`  SKIPPED ${slug}: the $${maxCost.toFixed(2)} ceiling is spent ($${spentUsd.toFixed(3)}).`);
    results.push({ slug, kind: 'candidate', arm: 'iterate', skipped: true });
    continue;
  }
  console.log(`\n── ${slug} ──`);
  const started = Date.now();
  const totals = { input: 0, output: 0, reasoning: 0 };
  let cost = 0;
  const iterationLog = [];
  let current = null;      // { template, emitted, validation, fill }
  let lastCapture = null;
  let previous = null;     // what the next round is told
  let deliverable = false;
  let error = null;

  try {
    for (let round = 0; round <= MAX_ITERATIONS; round += 1) {
      const emitRes = await page.evaluate(async (input) => {
        const bust = '?t=' + Date.now();
        const { iterateEmit } = await import('/src/ai/spike/iterate.ts' + bust);
        const { productionSpxValidator } = await import('/src/ai/litePipeline.ts' + bust);
        const [provider, ...model] = input.route.split(':');
        const result = await iterateEmit({
          brief: input.brief,
          route: { provider, model: model.join(':') },
          decoding: input.decoding,
          validate: productionSpxValidator(null, [input.brand.mark.path]),
          brand: input.brand,
          previous: input.previous ?? undefined,
        });
        return {
          template: result.template,
          emitted: { name: result.emitted?.name, type: result.emitted?.type, summary: result.emitted?.summary },
          validation: {
            ok: result.validation.ok,
            errors: result.validation.errors.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
            warnings: result.validation.warnings.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
          },
          fill: result.fill ?? null,
          usage: result.usage,
          costUsd: result.costUsd,
          model: result.model,
        };
      }, { brief: entry.brief, route, decoding, brand, previous });

      totals.input += emitRes.usage.input;
      totals.output += emitRes.usage.output;
      totals.reasoning += emitRes.usage.reasoning;
      cost += emitRes.costUsd;
      spentUsd += emitRes.costUsd;
      current = emitRes;

      // Save the code the moment it exists (the Phase 0 lesson), one directory per round.
      const codeDir = path.join(OUT, 'code', slug, `round-${round}`);
      await mkdir(codeDir, { recursive: true });
      await Promise.all([
        writeFile(path.join(codeDir, 'index.html'), emitRes.template.html),
        writeFile(path.join(codeDir, 'template.css'), emitRes.template.css),
        writeFile(path.join(codeDir, 'template.js'), emitRes.template.js),
      ]);

      const data = await page.evaluate(async ({ briefEntry, fill }) => {
        const bust = '?t=' + Date.now();
        const spikeAnchors = await import('/src/ai/spike/anchors.ts' + bust);
        const values = spikeAnchors.dataFor(briefEntry);
        if (fill?.slotFieldId && fill.path) values[fill.slotFieldId] = fill.path;
        return values;
      }, { briefEntry: entry.brief, fill: emitRes.fill });

      const capture = await captureAndMeasure(
        emitRes.template, data, emitRes.fill?.slotFieldId ?? null, brand.mark.probe,
        `${slug}.round-${round}.hold.png`,
      );
      lastCapture = { ...capture, data, round };

      const findings = collectFindings(emitRes.validation, capture.playError, capture.measured);
      iterationLog.push({
        round,
        findings,
        usage: emitRes.usage,
        costUsd: emitRes.costUsd,
      });
      console.log(`  round ${round}: ${findings.length} finding(s)`
        + ` · ${emitRes.usage.input} in / ${emitRes.usage.output} out · $${emitRes.costUsd.toFixed(4)}`);
      for (const f of findings.slice(0, 6)) console.log(`    - ${f.slice(0, 140)}`);

      if (findings.length === 0) {
        deliverable = true;
        break;
      }
      if (round === MAX_ITERATIONS) break;
      if (spentUsd >= maxCost) {
        console.log('  ceiling reached mid-loop - stopping dirty.');
        break;
      }
      const screenshot = vision ? await downscale(capture.shot) : null;
      previous = {
        template: emitRes.template,
        findings,
        ...(screenshot ? { screenshot: { mediaType: 'image/jpeg', base64: screenshot } } : {}),
      };
    }
  } catch (e) {
    error = String(e?.message ?? e).slice(0, 500);
    console.log(`  FAILED: ${error.split('\n')[0]}`);
  }

  if (error && !current) {
    results.push({ slug, kind: 'candidate', arm: 'iterate', error, costUsd: cost || null, ms: Date.now() - started });
    await writeLedger();
    continue;
  }

  // Final frames under the ledger names the galleries expect.
  const holdFile = `${slug}.hold.png`;
  await writeFile(path.join(OUT, holdFile), lastCapture.shot);
  const stressData = await page.evaluate(async ({ briefEntry, fill }) => {
    const bust = '?t=' + Date.now();
    const spikeAnchors = await import('/src/ai/spike/anchors.ts' + bust);
    const values = spikeAnchors.stressFor(briefEntry);
    if (fill?.slotFieldId && fill.path) values[fill.slotFieldId] = fill.path;
    return values;
  }, { briefEntry: entry.brief, fill: current.fill });
  const stress = await captureAndMeasure(
    current.template, stressData, current.fill?.slotFieldId ?? null, brand.mark.probe, `${slug}.stress.hold.png`,
  );

  const blockingErrors = current.validation.errors.filter((e) => !e.startsWith(`${EDITABILITY_RULE}:`));
  const fields = current.template.fields;
  const textFields = fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea').length;
  const record = {
    slug,
    kind: 'candidate',
    arm: 'iterate',
    brand: brand.id,
    route,
    model: current.model,
    provenance: `${route} · iterate arm (${iterationLog.length} round(s), vision ${vision ? 'on' : 'off'}) · brand ${brand.id}`,
    iterations: iterationLog.length - 1,
    iterationLog,
    deliverable,
    ...(error ? { error } : {}),
    validation: current.validation,
    repairRounds: iterationLog.length - 1,
    contract: {
      textFields,
      expectedTextFields: entry.expect?.textFields ?? 2,
      fieldsOk: textFields >= (entry.expect?.textFields ?? 2),
      logoExpected: true,
      logoSlot: Boolean(current.fill?.slotFieldId),
      blockingErrors,
      scaffoldOk: blockingErrors.length === 0 && textFields >= (entry.expect?.textFields ?? 2) && Boolean(current.fill?.slotFieldId),
    },
    fill: current.fill,
    emitted: current.emitted,
    hold: holdFile,
    stressHold: `${slug}.stress.hold.png`,
    ...(lastCapture.playError ? { playError: lastCapture.playError } : {}),
    ...(lastCapture.measured?.spacing ? { spacingReport: lastCapture.measured.spacing } : {}),
    ...(lastCapture.measured?.proportion ? { proportionReport: lastCapture.measured.proportion } : {}),
    ...(lastCapture.measured?.device ? { deviceReport: lastCapture.measured.device } : {}),
    ...(lastCapture.measured?.mark ? { markReport: lastCapture.measured.mark } : {}),
    ...(stress.playError ? { stressPlayError: stress.playError } : {}),
    usage: totals,
    costUsd: cost,
    frames: [],
    ms: Date.now() - started,
  };
  results.push(record);
  console.log(`  ${deliverable ? 'DELIVERABLE (clean)' : 'NOT DELIVERABLE (stopped dirty)'}`
    + ` · ${iterationLog.length} round(s) · tokens ${totals.input} in / ${totals.output} out`
    + `${totals.reasoning ? ` (${totals.reasoning} reasoning)` : ''} · $${cost.toFixed(4)} · ${record.ms} ms`);
  await writeLedger();
}

await browser.close();
const done = results.filter((r) => !r.error && !r.skipped);
console.log(`\n${done.length} candidate(s), ${done.filter((r) => r.deliverable).length} clean,`
  + ` ${done.filter((r) => !r.deliverable).length} stopped dirty · spent ~$${spentUsd.toFixed(3)} of $${maxCost.toFixed(2)}.`);
console.log(`Ledger: ${ledgerPath}`);
