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

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const only = args.find((a) => !a.startsWith('--'))?.split(',').filter(Boolean) ?? null;

// The TYPE SWEEP (docs/NOACG_PRO_PLAN.md §21.2 follow-on) runs the same loop over the custom
// bank: `--bank=benchmarks/pro/v1/custom/briefs.json --brands=benchmarks/pro/v1/custom/brands.json`.
const BANK = path.resolve(value('bank') ?? 'benchmarks/pro/v1/briefs.json');
const DECODING = path.resolve('benchmarks/pro/v1/spike/decoding.json');
const BRANDS = path.resolve(value('brands') ?? 'benchmarks/pro/v1/spike/brands.json');

const control = flag('control');
const anchors = flag('anchors');
const paid = flag('generate');
const resume = flag('resume');
const vision = !flag('no-vision');
const MAX_ITERATIONS = Number(value('max-iterations') ?? 4);
const OUT = path.resolve(value('out') ?? 'pro-iterate-out');
/** 'feed' = readability findings drive the loop; 'report' = ledger-only. The control mode's
 *  catalog calibration is what decides which is honest (an instrument whose false positives
 *  are good designs gets ignored - the mark-gap lesson). */
const READABILITY_MODE = value('readability') ?? 'feed';

// ── The sweep's type table ─────────────────────────────────────────────────────────────
// Instrument thresholds exist calibrated for exactly two of the seven types: the lower third
// (the calibration baseline) and the countdown (PRO_GRAPHICS.countdown, measured on the
// shipped timers). Every OTHER type runs spacing/proportion with the lower-third defaults and
// its findings are fed as ADVISORY - shown to the model with a judgement note, never counted
// against deliverability, because an uncalibrated threshold must not bully a scoreboard.
const CALIBRATED_PRO_TYPE = { 'lower-third': 'lower-third', countdown: 'countdown' };
const sweepType = (entry) => entry.type ?? 'lower-third';
const proInstrumentType = (entry) => CALIBRATED_PRO_TYPE[sweepType(entry)] ?? null;
const instrumentsAdvisory = (entry) => !CALIBRATED_PRO_TYPE[sweepType(entry)];
const declaredSteps = (entry) => Math.min(entry.brief.steps?.length ?? 0, 6);
/** fieldPaints composes into the loop's VALIDATOR (the Lite pattern) only where its one-state
 *  read is the whole answer: no declared steps, and every field expected to paint verbatim.
 *  Steppers and transform fields (a countdown's seconds, a quiz's answer index) get the
 *  runner's own sentinel step-walk instead - a sentinel that legitimately reaches no pixels
 *  must not read as a defect. */
const validatorFieldPaints = (entry) => {
  if (!entry.brief.fields) return true;
  return declaredSteps(entry) === 0 && entry.brief.fields.every((f) => f.paintExpected !== false);
};

if (!control && !paid && !anchors) {
  console.error('Pick a mode: --control (free, run this first), --anchors (free, per-type catalog baselines) or --generate (PAID).');
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
 *  wait and instrument set as the spike runner's hold capture. `opts.proType` selects a
 *  calibrated per-type instrument override (PRO_GRAPHICS); `opts.steps` > 0 additionally
 *  drives next() through the declared steps and shoots each settled step frame under
 *  `opts.stepPrefix`. */
async function captureAndMeasure(template, data, markFieldId, markProbe, file, opts = {}) {
  const steps = opts.steps ?? 0;
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
  const measured = await page.evaluate(async ({ markFieldId, markProbe, proType }) => {
    const bust = '?t=' + Date.now();
    const { measureRenderedMark } = await import('/src/ai/spike/brand.ts' + bust);
    const { measureAxes } = await import('/src/ai/spike/axisCheck.ts' + bust);
    const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts' + bust);
    const { measureProportion } = await import('/src/ai/spike/proportionCheck.ts' + bust);
    const { measureDevice } = await import('/src/ai/spike/deviceCheck.ts' + bust);
    const { measureReadability } = await import('/src/ai/spike/readabilityCheck.ts' + bust);
    const doc = document.getElementById('iterate-hold-frame')?.contentDocument;
    if (!doc) return null;
    // The per-type thresholds are PRO_GRAPHICS' own (measured, docs/NOACG_PRO_PLAN.md §21.2
    // pre-flight d) - imported rather than copied, so they cannot drift from the product's.
    let spacingOpts = {};
    let proportionOpts = {};
    if (proType) {
      const { PRO_GRAPHICS } = await import('/src/ai/pro/language/graphics.ts' + bust);
      const inst = PRO_GRAPHICS[proType]?.instruments ?? {};
      spacingOpts = { ...(inst.spacing ?? {}) };
      proportionOpts = { ...(inst.proportion ?? {}) };
    }
    const base = { markFieldId: markFieldId ?? null };
    return {
      axis: measureAxes(doc),
      spacing: measureSpacing(doc, { ...spacingOpts, ...base }),
      proportion: measureProportion(doc, { ...proportionOpts, ...base }),
      device: measureDevice(doc),
      mark: markFieldId && markProbe ? measureRenderedMark(doc, markFieldId, markProbe) : null,
      readability: measureReadability(doc),
    };
  }, { markFieldId: markFieldId ?? null, markProbe: markProbe ?? null, proType: opts.proType ?? null });
  const shot = await page.frameLocator('#iterate-hold-frame').locator('body')
    .screenshot({ path: path.join(OUT, file) });

  // STEP CAPTURE: drive next() along the DECLARED default path, shoot each settled frame.
  // next() returning nothing before the declared count is a finding - the graphic does not
  // implement its own step contract - and so is a missing next() entirely.
  const stepFrames = [];
  const stepFindings = [];
  for (let k = 1; k <= steps; k += 1) {
    const press = await page.evaluate(async () => {
      const win = document.getElementById('iterate-hold-frame')?.contentWindow;
      if (!win) return { error: 'frame gone' };
      if (typeof win.next !== 'function') return { missing: true };
      try {
        const out = win.next();
        return { returnedNull: out === null || out === undefined };
      } catch (e) {
        return { error: String(e?.message ?? e).slice(0, 200) };
      }
    });
    if (press.missing) {
      stepFindings.push(`the template declares ${steps} operator step(s) but window.next() does not exist`);
      break;
    }
    if (press.error) {
      stepFindings.push(`next() threw at step ${k} of ${steps}: ${press.error}`);
      break;
    }
    if (press.returnedNull && k <= steps) {
      stepFindings.push(`next() returned nothing at step ${k} of ${steps} - the graphic does not advance through its declared steps`);
      break;
    }
    await page.waitForTimeout(1400);
    const stepFile = `${opts.stepPrefix ?? file.replace(/\.png$/, '')}.step-${k}.png`;
    await page.frameLocator('#iterate-hold-frame').locator('body')
      .screenshot({ path: path.join(OUT, stepFile) });
    stepFrames.push(stepFile);
  }

  await page.evaluate(() => document.getElementById('iterate-hold-frame')?.remove());
  return { playError, measured, shot, stepFrames, stepFindings };
}

/**
 * THE SENTINEL STEP-WALK - does every paint-expected field reach the screen in SOME state
 * along the declared default path? The fieldPaint technique (validation/fieldPaint.ts -
 * sentinels driven through update(), the frame re-read), walked with next() instead of the
 * machine snap, because an emitted stepper's next() is hand-written JS with no machine to
 * snap. Runs only where the validator's one-state fieldPaints read is not the whole answer.
 */
async function paintWalk(template, entry) {
  const fields = (entry.brief.fields ?? []).filter((f) => f.paintExpected !== false);
  if (!fields.length) return [];
  const steps = declaredSteps(entry);
  return page.evaluate(async ({ template, fields, steps }) => {
    const bust = '?t=' + Date.now();
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    const { sentinelFor, visibleText, TEXT_FTYPES } = await import('/src/validation/fieldPaint.ts' + bust);
    document.getElementById('iterate-paint-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'iterate-paint-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99998;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const win = frame.contentWindow;
    const doc = win.document;
    const findings = [];
    try {
      // Sentinels for the CONTRACT's paint-expected fields, driven through the fields the
      // template actually declares (sentinelFor needs the declared ftype). A contract field
      // the template does not declare at all is its own finding.
      const declared = new Map((template.fields ?? []).map((f) => [f.field, f]));
      const driven = [];
      for (const [i, f] of fields.entries()) {
        const tf = declared.get(f.id);
        if (!tf) {
          findings.push(`the field contract declares ${f.id} (${f.title}) and the template's SPX definition does not carry it`);
          continue;
        }
        if (!TEXT_FTYPES.has(tf.ftype)) continue; // an image or colour field cannot be measured this way
        driven.push({ id: f.id, title: f.title, sentinel: sentinelFor(tf, i) });
      }
      if (!driven.length) { frame.remove(); return findings; }
      try {
        win.update(JSON.stringify(Object.fromEntries(driven.map((d) => [d.id, d.sentinel]))));
        win.play();
      } catch {
        frame.remove(); return findings; // a throwing template is the capture's finding, not ours
      }
      await new Promise((resolve) => setTimeout(resolve, 1600));
      const shows = (sentinel, painted) =>
        sentinel.split(/[\s|\n]+/).some((part) => part && painted.includes(part));
      let missing = driven.filter((d) => !shows(d.sentinel, visibleText(doc, win)));
      for (let k = 1; k <= steps && missing.length; k += 1) {
        try {
          if (typeof win.next !== 'function' || win.next() == null) break;
        } catch { break; }
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const painted = visibleText(doc, win);
        missing = missing.filter((d) => !shows(d.sentinel, painted));
      }
      for (const d of missing) {
        findings.push(`live field ${d.title} (${d.id}) paints NOTHING in any state along the default path - its value never reaches the screen`);
      }
    } finally {
      frame.remove();
    }
    return findings;
  }, { template, fields, steps });
}

/** Everything the loop feeds back, as teaching strings - split into BLOCKING (counts against
 *  deliverability) and ADVISORY (shown to the model with a judgement note, never counted:
 *  spacing/proportion thresholds on a type they were never calibrated for). The device
 *  instrument is deliberately ABSENT - a plain panel is a legal answer; this loop repairs
 *  defects, it does not demand novelty. */
const EDITABILITY_RULE = 'bench-editability';
const UNPAINTED_RULE = 'bench-field-unpainted';
function collectFindings(validation, playError, measured, ctx = {}) {
  const blocking = [];
  const advisory = [];
  const instruments = ctx.advisoryInstruments ? advisory : blocking;
  for (const e of validation.errors) {
    if (!e.startsWith(`${EDITABILITY_RULE}:`)) blocking.push(`platform check failed - ${e}`);
  }
  // The validator's one-state field-paint read (productionSpxValidator fieldPaints - the Lite
  // lesson) surfaces as a warning; here it is the owner's "never ship a field that paints
  // nothing" rule, so it blocks.
  for (const w of validation.warnings ?? []) {
    if (w.startsWith(`${UNPAINTED_RULE}:`)) blocking.push(`field paint - ${w}`);
  }
  if (playError) blocking.push(`the template threw at play(): ${playError}`);
  for (const f of ctx.stepFindings ?? []) blocking.push(`step contract: ${f}`);
  for (const f of ctx.paintFindings ?? []) blocking.push(`field paint: ${f}`);
  for (const f of measured?.spacing?.findings ?? []) instruments.push(`spacing (${f.code}): ${f.detail}`);
  for (const escape of measured?.spacing?.escapes ?? []) {
    if (escape.isText) blocking.push(`live text paints outside its panel: ${escape.desc} by ${escape.px}px past the ${escape.side} edge`);
  }
  for (const f of measured?.proportion?.findings ?? []) instruments.push(`proportion (${f.code}): ${f.detail}`);
  for (const miss of measured?.axis?.nearMisses ?? []) {
    blocking.push(`alignment near-miss: ${miss.a.el} and ${miss.b.el} are ${miss.gapPx}px from sharing the ${miss.side} edge - align them exactly or separate them deliberately`);
  }
  for (const f of measured?.mark?.findings ?? []) blocking.push(`brand mark: ${f}`);
  const readability = measured?.readability?.findings ?? [];
  const readabilityTarget = READABILITY_MODE === 'feed' ? blocking : null;
  if (readabilityTarget) {
    for (const f of readability) readabilityTarget.push(`readability (${f.code}): ${f.detail}`);
  }
  return { blocking: blocking.slice(0, 14), advisory: advisory.slice(0, 6) };
}

/** What the model is shown: the blocking findings as the contract, the advisory ones behind a
 *  judgement note - stated as uncalibrated so an instrument cannot bully a type it has never
 *  measured. */
function feedFindings({ blocking, advisory }) {
  return [
    ...blocking,
    ...advisory.map((a) => `ADVISORY, use your judgement (this threshold was calibrated on lower thirds, not this graphic type - fix it only if the frame genuinely reads wrong): ${a}`),
  ];
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
  let failed = false;
  const anchor = await page.evaluate(async () => {
    const bust = '?t=' + Date.now();
    const spikeAnchors = await import('/src/ai/spike/anchors.ts' + bust);
    const a = spikeAnchors.controlAnchor();
    return { template: a.template, data: a.data };
  });
  const clean = await captureAndMeasure(anchor.template, anchor.data, null, null, 'control-clean.hold.png');
  const cleanFindings = collectFindings({ errors: [], warnings: [] }, clean.playError, clean.measured);
  console.log(`control (known-good): ${cleanFindings.blocking.length} blocking finding(s)`);
  for (const f of cleanFindings.blocking) console.log(`  - ${f}`);

  // The MUTATION: pull the supporting line's MASK up over the primary line. Moving the field
  // itself is absorbed by the mask's own overflow clip (the first version of this check
  // proved that by failing) - the mask is the painted box, so the mask is what must move.
  // A loop whose collector cannot see a forced overlap would iterate on nothing.
  const broken = {
    ...anchor.template,
    css: `${anchor.template.css}\n/* control mutation - forced overlap */\n[class*="-mask"]:has(#f1) { margin-top: -52px; }`,
  };
  const bad = await captureAndMeasure(broken, anchor.data, null, null, 'control-broken.hold.png');
  const badFindings = collectFindings({ errors: [], warnings: [] }, bad.playError, bad.measured);
  console.log(`control (forced overlap): ${badFindings.blocking.length} blocking finding(s)`);
  for (const f of badFindings.blocking) console.log(`  - ${f}`);
  if (badFindings.blocking.length === 0) {
    console.error('MUTATION CHECK FAILED: the forced overlap produced no findings.');
    failed = true;
  }

  // ── READABILITY CALIBRATION: three shipped catalog designs. An instrument whose false
  // positives are good designs gets ignored (the mark-gap lesson), so the floor is trusted
  // only if the catalog is quiet under it. Murky = rerun the round with --readability=report.
  const calibration = await page.evaluate(async () => {
    const bust = '?t=' + Date.now();
    const { variantById } = await import('/src/templates/catalog.ts' + bust);
    const out = [];
    for (const id of ['lt11', 'lt27', 'lt08']) {
      const variant = variantById(id);
      if (!variant) { out.push({ id, error: 'gone from the catalog' }); continue; }
      out.push({
        id,
        template: variant.create({
          lines: [
            { title: 'Name', sample: 'Alexandra Riva' },
            { title: 'Role', sample: 'Chief Political Correspondent' },
          ],
        }),
      });
    }
    return out;
  });
  let calibrationFindings = 0;
  for (const c of calibration) {
    if (c.error) { console.error(`  readability calibration: ${c.id} ${c.error}`); failed = true; continue; }
    const cap = await captureAndMeasure(c.template, { f0: 'Alexandra Riva', f1: 'Chief Political Correspondent' }, null, null, `control-readability-${c.id}.hold.png`);
    const report = cap.measured?.readability ?? { findings: [], readings: [] };
    calibrationFindings += report.findings.length;
    console.log(`readability calibration ${c.id}: ${report.findings.length} finding(s); readings: ${report.readings.map((r) => `${r.fontPx}px${r.contrast ? `/${r.contrast}:1` : ''}`).join(', ')}`);
    for (const f of report.findings) console.log(`  - ${f.code}: ${f.detail}`);
  }
  if (calibrationFindings > 0) {
    console.error(`READABILITY CALIBRATION MURKY: ${calibrationFindings} finding(s) on shipped designs - run the paid round with --readability=report.`);
  }

  // ── READABILITY MUTATION: a deliberately grey-on-grey, undersized supporting line must be
  // loud, or the floor is measuring nothing.
  const greyOnGrey = {
    ...anchor.template,
    css: `${anchor.template.css}\n/* control mutation - grey-on-grey undersized */\n#f1 { color: #3c4046 !important; font-size: 14px !important; }`,
  };
  const grey = await captureAndMeasure(greyOnGrey, anchor.data, null, null, 'control-grey.hold.png');
  const greyFindings = grey.measured?.readability?.findings ?? [];
  console.log(`control (grey-on-grey 14px): ${greyFindings.length} readability finding(s)`);
  for (const f of greyFindings) console.log(`  - ${f.code}: ${f.detail}`);
  if (greyFindings.length === 0) {
    console.error('READABILITY MUTATION FAILED: the grey-on-grey undersized line produced no findings.');
    failed = true;
  }

  // ── ONE KNOWN-GOOD CATALOG CELL PER NEW TYPE, through the EXTENDED capture: if step
  // capture or the field-paint validator misfires on a shipped scoreboard or quiz, the
  // harness is broken - fix it before paying (the Phase 0 lesson, standing).
  const TYPE_CELLS = [
    { type: 'scoreboard', variant: 'sb01' },
    { type: 'quiz-board', variant: 'qz01' },
    { type: 'ticker', variant: 'tk01' },
    { type: 'stat-panel', variant: 'ig01' },
    { type: 'countdown', variant: 'gt05' },
    { type: 'podium-score', variant: 'sb21' },
  ];
  for (const cell of TYPE_CELLS) {
    const made = await page.evaluate(async ({ variantId }) => {
      const bust = '?t=' + Date.now();
      const { variantById } = await import('/src/templates/catalog.ts' + bust);
      const variant = variantById(variantId);
      if (!variant) return { error: `variant ${variantId} is gone from the catalog` };
      const template = variant.create({});
      const values = Object.fromEntries(
        template.fields
          .filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea' || f.ftype === 'number')
          .map((f) => [f.field, String(f.value ?? '')]),
      );
      const presses = Math.max(0, (parseInt(template.settings.steps, 10) || 1) - 1);
      return { template, values, presses };
    }, { variantId: cell.variant });
    if (made.error) {
      console.error(`  type cell ${cell.type}: ${made.error}`);
      failed = true;
      continue;
    }
    const cap = await captureAndMeasure(
      made.template, made.values, null, null, `control-type-${cell.type}.hold.png`,
      { steps: Math.min(made.presses, 6), stepPrefix: `control-type-${cell.type}` },
    );
    // The validator's field-paint read, exactly as a paid cell composes it (machine-aware:
    // unreachableFields walks a shipped type's explicit machine).
    const paint = await page.evaluate(async ({ template }) => {
      const bust = '?t=' + Date.now();
      const { productionSpxValidator } = await import('/src/ai/litePipeline.ts' + bust);
      const validate = productionSpxValidator(null, [], { fieldPaints: true });
      const v = await validate(template);
      return v.warnings.filter((w) => w.rule === 'bench-field-unpainted').map((w) => w.message.slice(0, 160));
    }, { template: made.template });
    const loud = [
      ...(cap.playError ? [`play() threw: ${cap.playError}`] : []),
      ...cap.stepFindings.map((f) => `step: ${f}`),
      ...paint.map((p) => `unpainted: ${p}`),
    ];
    console.log(`type cell ${cell.type} (${cell.variant}): steps ${cap.stepFrames.length}/${Math.min(made.presses, 6)}, ${loud.length} harness finding(s)`);
    for (const f of loud) console.log(`  - ${f}`);
    if (loud.length > 0) failed = true;
  }

  await browser.close();
  if (failed) {
    console.error('\nCONTROL FAILED - do not pay for a round on this harness.');
    process.exit(1);
  }
  console.log('\nControl PASSED: quiet on known-good frames (all seven types), loud on both mutations.');
  process.exit(0);
}

// ── --anchors: per-type CATALOG baselines for the blind page, free ─────────────────────
// The real create() output of a shipped variant, driven with the type's first brief's own
// words, so the read has a professional baseline per type (the §0.2 anchor rule, applied
// per type). The slug borrows that brief's id - a slug naming "anchor" would answer the
// question before the reviewer looks.
if (anchors) {
  const ANCHOR_VARIANTS = {
    'lower-third': 'lt27',
    scoreboard: 'sb01',
    'quiz-board': 'qz01',
    ticker: 'tk01',
    'stat-panel': 'ig01',
    countdown: 'gt05',
    'podium-score': 'sb21',
  };
  const seen = new Set();
  const anchorResults = [];
  for (const entry of briefs) {
    const type = sweepType(entry);
    if (seen.has(type) || !ANCHOR_VARIANTS[type]) continue;
    seen.add(type);
    const variantId = ANCHOR_VARIANTS[type];
    const made = await page.evaluate(async ({ variantId, brief }) => {
      const bust = '?t=' + Date.now();
      const { variantById } = await import('/src/templates/catalog.ts' + bust);
      const spikeAnchors = await import('/src/ai/spike/anchors.ts' + bust);
      const variant = variantById(variantId);
      if (!variant) return { error: `variant ${variantId} is gone from the catalog` };
      const template = variant.create({});
      // The brief's own words onto the design's text fields, by order - the same driveData
      // idea the §0.2 anchors use, across a type whose field count may differ.
      const sample = Object.values(spikeAnchors.dataFor(brief));
      const stressVals = Object.values(spikeAnchors.stressFor(brief));
      const text = template.fields.filter((f) => ['textfield', 'textarea', 'number'].includes(f.ftype));
      const map = (vals) => Object.fromEntries(
        text.map((f, i) => [f.field, vals[i] ?? String(f.value ?? '')]),
      );
      return {
        template,
        variantName: variant.name,
        values: map(sample),
        stressValues: map(stressVals),
        presses: Math.max(0, (parseInt(template.settings.steps, 10) || 1) - 1),
      };
    }, { variantId, brief: entry.brief });
    if (made.error) {
      console.error(`anchor ${type}: ${made.error}`);
      continue;
    }
    const brandId = brandsFixture.assignment[entry.id] ?? brands[0].id;
    const slug = `${entry.id}.${brandId}.catalog`;
    const cap = await captureAndMeasure(
      made.template, made.values, null, null, `${slug}.hold.png`,
      { steps: Math.min(made.presses, 6), stepPrefix: slug, proType: proInstrumentType(entry) },
    );
    const stressCap = await captureAndMeasure(
      made.template, made.stressValues, null, null, `${slug}.stress.hold.png`,
    );
    anchorResults.push({
      slug,
      kind: 'candidate',
      arm: 'catalog-anchor',
      type,
      brand: brandId,
      model: 'catalog',
      provenance: `catalog design ${variantId} "${made.variantName}" via its real create(), driven with the ${entry.id} brief's words`,
      deliverable: true,
      iterations: 0,
      contract: { scaffoldOk: true, blockingErrors: [] },
      hold: `${slug}.hold.png`,
      stressHold: `${slug}.stress.hold.png`,
      ...(cap.stepFrames.length ? { stepFrames: cap.stepFrames } : {}),
      ...(cap.playError ? { playError: cap.playError } : {}),
      ...(stressCap.playError ? { stressPlayError: stressCap.playError } : {}),
      costUsd: 0,
    });
    console.log(`anchor ${type}: ${variantId} · ${cap.stepFrames.length} step frame(s)${cap.playError ? ` · PLAY ERROR ${cap.playError}` : ''}`);
  }
  await writeFile(path.join(OUT, 'results.json'), `${JSON.stringify({
    base: BASE,
    capturedAt: new Date().toISOString(),
    bank: path.relative(process.cwd(), BANK),
    kind: 'catalog-anchors',
    results: anchorResults,
  }, null, 2)}\n`);
  await browser.close();
  console.log(`\n${anchorResults.length} catalog anchor(s) · ${path.join(OUT, 'results.json')}`);
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
    bank: path.relative(process.cwd(), BANK),
    brands: path.relative(process.cwd(), BRANDS),
    readabilityMode: READABILITY_MODE,
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
          // fieldPaints composed into the LOOP'S validator (the Lite pattern - §21.2 escape
          // 2) wherever its one-state read is the whole answer; steppers get the runner's
          // sentinel step-walk instead.
          validate: productionSpxValidator(null, [input.brand.mark.path], input.benchOptions),
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
      }, {
        brief: entry.brief,
        route,
        decoding,
        brand,
        previous,
        benchOptions: validatorFieldPaints(entry) ? { fieldPaints: true } : {},
      });

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
        // The whole SpxTemplate, so the control-drive proof can load the exact emitted
        // graphic into the shipped panel without re-importing from the three files.
        writeFile(path.join(codeDir, 'template.json'), `${JSON.stringify(emitRes.template, null, 2)}\n`),
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
        {
          proType: proInstrumentType(entry),
          steps: declaredSteps(entry),
          stepPrefix: `${slug}.round-${round}`,
        },
      );
      // The sentinel step-walk covers what the validator's one-state read cannot (steppers,
      // transform fields) - a quiz that never reveals its answer must fail the loop.
      const paintFindings = validatorFieldPaints(entry) ? [] : await paintWalk(emitRes.template, entry);
      lastCapture = { ...capture, data, round };

      const split = collectFindings(emitRes.validation, capture.playError, capture.measured, {
        advisoryInstruments: instrumentsAdvisory(entry),
        stepFindings: capture.stepFindings,
        paintFindings,
      });
      const findings = feedFindings(split);
      iterationLog.push({
        round,
        findings: split.blocking,
        advisory: split.advisory,
        usage: emitRes.usage,
        costUsd: emitRes.costUsd,
      });
      console.log(`  round ${round}: ${split.blocking.length} blocking / ${split.advisory.length} advisory finding(s)`
        + ` · ${emitRes.usage.input} in / ${emitRes.usage.output} out · $${emitRes.costUsd.toFixed(4)}`);
      for (const f of split.blocking.slice(0, 6)) console.log(`    - ${f.slice(0, 140)}`);

      if (split.blocking.length === 0) {
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
    { proType: proInstrumentType(entry) },
  );

  const blockingErrors = current.validation.errors.filter((e) => !e.startsWith(`${EDITABILITY_RULE}:`));
  const fields = current.template.fields;
  const textFields = fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea').length;
  const record = {
    slug,
    kind: 'candidate',
    arm: 'iterate',
    type: sweepType(entry),
    brand: brand.id,
    route,
    model: current.model,
    provenance: `${route} · iterate arm (${iterationLog.length} round(s), vision ${vision ? 'on' : 'off'}) · ${sweepType(entry)} · brand ${brand.id}`,
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
    ...(lastCapture.measured?.readability ? { readabilityReport: lastCapture.measured.readability } : {}),
    ...(lastCapture.stepFrames?.length ? { stepFrames: lastCapture.stepFrames } : {}),
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
