#!/usr/bin/env node
// THE NoaCG PRO PHASE 0 SPIKE RUNNER (docs/NOACG_PRO_PLAN.md §0).
//
//   node scripts/pro-spike.mjs --control                  # FREE. Run this FIRST, and again
//                                                         # after ANY change to the wrapper.
//   node scripts/pro-spike.mjs --generate --route=vercel:<model> --max-cost=8
//                                                         # PAID. Spends real money.
//   node scripts/pro-spike.mjs --generate --route=… --arms=exemplar
//   node scripts/pro-spike.mjs --control news-public       # a subset by brief id
//
// THE CONTROL RUN IS THE POINT OF THE FIRST MODE. It pushes one known-good hand-authored
// lower third - plus the gallery's anchors - through the COMPLETE wrapper: the scaffold
// contract, the deterministic gates, the 1920x1080 render set, the virtual-clock motion
// strips, and the gallery. It spends nothing and calls no model. If the control looks
// broken, the harness is broken, and a paid round would measure the harness. Two paid rounds
// have already been mis-read as model failure when the platform was at fault
// (docs/AI_ATTEMPTS.md), and every deterministic gate stayed green through both - which is
// why this is a picture a human looks at, not an assertion.
//
// THE RUN PROTOCOL (§0.1): the 12-brief bank, every brief in TWO arms (two or three
// hand-vetted complete exemplars retrieved through shortlistFor / no exemplars at all), one
// candidate each, one or at most two pinned open-weight checkpoints, decoding pinned in
// benchmarks/pro/v1/spike/decoding.json, the shared two-round repair loop,
// productionSpxValidator, composeDocument at 1920x1080, and an ANCHOR-MIXED BLINDED gallery.
//
// THE GALLERY IS BLIND ON PURPOSE (§0.2). review.html shows opaque ids and no verdict, no
// arm and no checkpoint. Human notes are written into notes.md BEFORE anything is revealed;
// `--reveal` then writes key.html, which joins the ids back to their arm, checkpoint,
// validator verdict and cost. A green machine result must not get the chance to frame a
// broken graphic as a success.
//
// ROUTES ARE POLICED by scripts/harness-route-policy.mjs, like every other paid runner here.
//
// Requires the dev server on this checkout's port. From a worktree, compose the environment
// first: `node scripts/bench-env.mjs --profile=pro`, then start the bench dev server.

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';
import { readEnvFile } from './ai-bench-server.mjs';
import { requireAllowedRoute } from './harness-route-policy.mjs';

const BASE = `http://localhost:${devPort()}`;
// ONE OUT-DIR PER CHECKPOINT. Records are keyed by `<brief>.<arm>`, and so are the frames on
// disk, so running a second checkpoint into the same directory silently overwrites the first
// one's images while its ledger rows survive - a gallery that shows one checkpoint's pictures
// under another's key, with nothing anywhere reporting the swap. `--out=` is how the second
// checkpoint gets its own round. It is read before the flag helpers below only because OUT is
// needed by the --rebuild and --reveal branches at the top of this file.
const OUT = path.resolve(
  process.argv.slice(2).find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? 'pro-spike-out',
);
const BANK = path.resolve('benchmarks/pro/v1/briefs.json');
const DECODING = path.resolve('benchmarks/pro/v1/spike/decoding.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const only = args.find((a) => !a.startsWith('--'))?.split(',').filter(Boolean) ?? null;

const control = flag('control');
const paid = flag('generate');
const reveal = flag('reveal');
// Keep the generations a previous run already captured and attempt only what is missing.
//
// This is not "best of two" and must not become it: a brief is resumed only when it produced
// NO result at all - a transport failure, a skipped ceiling - so every candidate in the final
// ledger is still one initial call under the same pinned decoding. A brief that produced a
// bad-but-complete result is left exactly as it is, because re-rolling that would be picking
// the sample the reviewer prefers, which is a different experiment.
const resume = flag('resume');

if (!control && !paid && !reveal && !flag('rebuild')) {
  console.error('Pick a mode: --control (free, run this first), --generate (PAID), --rebuild or --reveal.');
  process.exit(1);
}
if (control && paid) {
  console.error('--control and --generate are separate runs: the control must pass before tokens burn.');
  process.exit(1);
}

const ARMS = (value('arms') ?? 'exemplar,none').split(',').filter(Boolean);
for (const arm of ARMS) {
  if (arm !== 'exemplar' && arm !== 'none') {
    console.error(`Unknown arm "${arm}" - the arms are exemplar and none.`);
    process.exit(1);
  }
}

// ── --rebuild: regenerate the gallery from the ledger, FREE ────────────────────────────
//
// A presentation fix to the gallery must never require re-running a paid round. This reads
// results.json, re-copies the blind frames and rewrites review.html, calling no model and
// touching no capture. It is how the blinding fix reached a round that was already paid for.
if (flag('rebuild')) {
  const ledger = JSON.parse(await readFile(path.join(OUT, 'results.json'), 'utf8'));
  await blindTheFrames(ledger.results);
  await writeFile(path.join(OUT, 'results.json'), `${JSON.stringify(ledger, null, 2)}\n`);
  await writeFile(path.join(OUT, 'review.html'), reviewHtml(ledger.results));
  await writeNotesTemplate(path.join(OUT, 'notes.md'), ledger.results);
  console.log(`Rebuilt ${path.join(OUT, 'review.html')} from ${ledger.results.length} record(s). No tokens spent.`);
  process.exit(0);
}

// ── --reveal: join the blind ids back to what produced them ────────────────────────────
if (reveal) {
  const ledger = JSON.parse(await readFile(path.join(OUT, 'results.json'), 'utf8'));
  await writeFile(path.join(OUT, 'key.html'), keyHtml(ledger));
  console.log(`Key written: ${path.join(OUT, 'key.html')}`);
  console.log('Read it only AFTER the notes are written (docs/NOACG_PRO_PLAN.md §0.2).');
  process.exit(0);
}

const route = value('route');
const maxCost = Number(value('max-cost') ?? 0);
let frontierReason = null;

if (paid) {
  if (!route) {
    console.error('PAID mode needs an explicit --route=<provider>:<model> - the checkpoint under test.');
    process.exit(1);
  }
  const checked = requireAllowedRoute(route, { flag: 'route', reason: value('frontier-reason') });
  frontierReason = checked.frontierReason;
  if (!Number.isFinite(maxCost) || maxCost <= 0) {
    console.error('--max-cost must be a positive number of dollars. This run spends real money.');
    process.exit(1);
  }
  console.log(`PAID run: ${route}, arms ${ARMS.join(' + ')}, ceiling $${maxCost.toFixed(2)}. This spends real tokens.`);
}

const decoding = JSON.parse(await readFile(DECODING, 'utf8'));
const bank = JSON.parse(await readFile(BANK, 'utf8'));
const briefs = bank.briefs.filter((entry) => !only || only.includes(entry.id));
if (!briefs.length) {
  console.error('No briefs matched.');
  process.exit(1);
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
// The wizard auto-opens on a fresh visit and would sit over every screenshot taken from the
// page rather than from inside the capture frame.
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

if (paid) {
  // A managed key only counts for a SIGNED-IN caller once a backend is configured, and a
  // fresh Playwright context has no session (the ai-bench.mjs lesson).
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
  } else {
    console.log('No E2E credentials found - continuing signed out (BYO cookie or open self-host only).');
  }
}

// Every in-page import below is cache-busted (`'?t=' + Date.now()`) because a dev server can
// serve a stale module after many edits, and an `import()` in an eval context can then
// resolve a DIFFERENT module instance than the running app (the "ghost store" gotcha in the
// root AGENTS.md).

/**
 * Mount one template's SETTLED HOLD through composeDocument at 1920x1080 and leave it up for
 * the driver to screenshot. Separate from the motion capture on purpose: the hold is the
 * preview compose path (what the editor and every other bench show), the strips are the
 * render compose path (the only place a virtual clock exists).
 */
async function captureHold(item) {
  await page.evaluate(async ({ template, data }) => {
    const bust = '?t=' + Date.now();
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    document.getElementById('spike-hold-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'spike-hold-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const win = frame.contentWindow;
    win.update(JSON.stringify(data));
    win.play();
    await win.document.fonts.ready;   // real glyphs or nothing
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }, item);
  const file = `${item.slug}.hold.png`;
  await page.frameLocator('#spike-hold-frame').locator('body').screenshot({ path: path.join(OUT, file) });
  await page.evaluate(() => document.getElementById('spike-hold-frame')?.remove());
  return file;
}

/** The same hold, driven with the STRESS values §0.2 asks the human to review beside it. */
async function captureStressHold(item) {
  const stressed = { ...item, data: item.stressData };
  const file = await captureHold({ ...stressed, slug: `${item.slug}.stress` });
  return file;
}

// ── The MOTION strips: entrance, update and exit, through the VIRTUAL CLOCK ─────────────
//
// This is the one piece of the wrapper that is new build rather than reuse, and the plan says
// why (§0.1, §0.2): a spike that inspects only settled holds has not reviewed motion, headless
// GSAP does not visibly tick on requestAnimationFrame, and deterministic timeline scrubbing
// exists today only in the RENDER compose path.
//
// It is new WIRING, not a new clock. The clock is src/render/runtimeScript.ts exactly as the
// renderer drives it: composeRenderDocument injects the virtual runtime before GSAP and the
// detach snippet after it, the graphic then executes its REAL lifecycle (update -> play ->
// stop) against time we own, and seek(t) fires due timers at their deadlines and drives
// gsap.updateRoot(t). A second scrubber built for the bench is how the bench and the renderer
// come to disagree about what a template does.
//
// IT LIVES IN THE DRIVER, NOT IN src/. `src/ai` may not import `src/render`
// (docs/ARCHITECTURE.md §3, enforced by .dependency-cruiser.cjs), and a bench rig is a bad
// reason to widen a layering rule permanently - this script is outside the module graph and is
// the composition root that is allowed to reach any domain, which is the same way
// pro-bench.mjs reaches pro/, litePipeline and preview/ in one evaluate.
//
// FOUR THINGS IT HAS TO GET RIGHT, all load-bearing:
//   1. SEEKS ARE MONOTONIC - the runtime throws on a backward seek, so sample times are
//      produced already sorted and the host never rewinds inside one capture.
//   2. PAINT SETTLES ON THE HOST'S CLOCK. requestAnimationFrame inside the render document is
//      virtualized, so awaiting it there would never resolve; the host page's real double-rAF
//      is what proves a frame is painted (render-worker/remotion/NoaCGGraphic.tsx).
//   3. COLOR SCHEME MUST MATCH THE HOST PAGE. Chromium paints a scheme-mismatched iframe
//      opaque; the app declares dark, so the document is composed dark here where the renderer
//      composes it light for its own light host.
//   4. A CONTINUOUS PHASE reports a duration of 0 (runtimeScript's CONTINUOUS_S rule), so its
//      strip is sampled over a fixed window - a looping entrance is motion, and collapsing it
//      to one frame would hide the thing the strip exists to show.

/** A fixed virtual wall clock, so a clock-reading graphic renders the same frame every run. */
const CAPTURE_EPOCH_MS = Date.UTC(2026, 0, 1, 20, 0, 0);
const CAPTURE_FPS = 50;
const SAMPLES_PER_STRIP = 5;

/**
 * Mount one graphic in a virtual-clock document, register its cues, and return the sample plan.
 * The frames are then taken one at a time from OUTSIDE the page - a screenshot cannot be
 * returned from `evaluate` cheaply - so the capture is a cursor the driver advances.
 */
async function startCapture(item) {
  return page.evaluate(async ({ template, data, stressData, epochMs, fps, samples }) => {
    const bust = '?t=' + Date.now();
    const { composeRenderDocument } = await import('/src/render/composeRenderDocument.ts' + bust);
    const { RENDER_RUNTIME_VERSION } = await import('/src/render/manifest.ts' + bust);

    document.getElementById('spike-capture-frame')?.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'spike-capture-frame';
    iframe.style.cssText = `position:fixed;left:0;top:0;width:${template.resolution.width}px;`
      + `height:${template.resolution.height}px;border:0;z-index:99999;background:#333;color-scheme:dark;`;
    iframe.srcdoc = await composeRenderDocument(template, { colorScheme: 'dark' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('spike capture: document load timed out')), 30_000);
      iframe.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
      document.body.appendChild(iframe);
    });

    const runtime = iframe.contentWindow?.__noacgRender;
    if (!runtime) throw new Error('spike capture: __noacgRender missing from the render document');
    if (runtime.version !== RENDER_RUNTIME_VERSION) {
      throw new Error(`spike capture: runtime version ${runtime.version} !== ${RENDER_RUNTIME_VERSION}`);
    }

    const measured = await runtime.prepare({ epochMs, fps, data });

    // Each phase is sampled at its OWN natural length, which is what makes a slow considered
    // entrance and a fast snap both readable. computeSchedule (the render path's HOLD model) is
    // deliberately not used: it exists to fit measured phases into a chosen TOTAL duration, and
    // the spike has no total to fit.
    const CONTINUOUS_WINDOW_MS = 1500;
    const HOLD_BEFORE_UPDATE_MS = 700;
    const UPDATE_WINDOW_MS = 900;
    const HOLD_AFTER_UPDATE_MS = 500;
    const inMs = measured.continuous.in ? CONTINUOUS_WINDOW_MS : Math.max(measured.inMs, 1);
    const outMs = measured.continuous.out ? CONTINUOUS_WINDOW_MS : Math.max(measured.outMs, 1);
    const updateAt = inMs + HOLD_BEFORE_UPDATE_MS;
    const stopAt = updateAt + UPDATE_WINDOW_MS + HOLD_AFTER_UPDATE_MS;

    const spread = (strip, from, to) => {
      if (to - from < 1) return [{ strip, index: 0, atMs: from }];
      const step = (to - from) / (samples - 1);
      return Array.from({ length: samples }, (_, i) => ({ strip, index: i, atMs: from + step * i }));
    };
    const plan = {
      measured,
      samples: [
        ...spread('entrance', 0, inMs),
        ...spread('update', updateAt, updateAt + UPDATE_WINDOW_MS),
        ...spread('exit', stopAt, stopAt + outMs),
      ],
      note: [
        measured.hasBuilders ? null
          : 'no buildInTimeline/buildOutTimeline - the strips show a static graphic, not motion',
        measured.continuous.in ? `entrance loops forever - sampled over ${CONTINUOUS_WINDOW_MS} ms` : null,
        measured.continuous.out ? `exit loops forever - sampled over ${CONTINUOUS_WINDOW_MS} ms` : null,
      ].filter(Boolean).join('; ') || null,
    };

    runtime.setSchedule([
      { atMs: 0, action: 'play' },
      ...(stressData ? [{ atMs: updateAt, action: 'update', payload: JSON.stringify(stressData) }] : []),
      { atMs: stopAt, action: 'stop' },
    ]);

    let cursor = 0;
    window.__spikeCapture = {
      plan,
      next: async () => {
        if (cursor >= plan.samples.length) return null;
        const sample = plan.samples[cursor++];
        runtime.seek(sample.atMs);
        await Promise.resolve();  // flush the asset shim's MutationObserver microtasks
        // The HOST's real rAF - the document's own is virtualized and would never resolve.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return sample;
      },
      errors: () => runtime.getErrors(),
      dispose: () => iframe.remove(),
    };
    return plan;
  }, {
    template: item.template,
    data: item.data,
    stressData: item.stressData,
    epochMs: CAPTURE_EPOCH_MS,
    fps: CAPTURE_FPS,
    samples: SAMPLES_PER_STRIP,
  });
}

async function captureMotion(item) {
  const plan = await startCapture(item);
  const frames = [];
  for (;;) {
    const sample = await page.evaluate(() => window.__spikeCapture.next());
    if (!sample) break;
    const file = `${item.slug}.${sample.strip}-${sample.index}.png`;
    await page.frameLocator('#spike-capture-frame').locator('body').screenshot({ path: path.join(OUT, file) });
    frames.push({ ...sample, file });
  }
  const errors = await page.evaluate(() => {
    const list = window.__spikeCapture.errors();
    window.__spikeCapture.dispose();
    delete window.__spikeCapture;
    return list;
  });
  return { plan, frames, errors };
}

/** Everything a human looks at, for one item. */
async function captureSet(item) {
  const hold = await captureHold(item);
  const stressHold = await captureStressHold(item);
  const motion = await captureMotion(item);
  return { hold, stressHold, ...motion };
}

// ── The run ────────────────────────────────────────────────────────────────────────────
/** A previous run's captured candidates, when resuming. Keyed by slug (`<brief>.<arm>`). */
const kept = new Map();
let carriedSpendUsd = 0;
if (resume) {
  try {
    const prior = JSON.parse(await readFile(path.join(OUT, 'results.json'), 'utf8'));
    for (const record of prior.results ?? []) {
      // Only COMPLETE candidates are kept. An error, a skip or a control/anchor row is
      // re-derived: the free items are recaptured every run anyway, and a failed brief is
      // exactly what resuming exists to retry.
      if (record.kind === 'candidate' && !record.error && !record.skipped) kept.set(record.slug, record);
    }
    carriedSpendUsd = prior.spentUsd ?? 0;
    console.log(`Resuming: ${kept.size} candidate(s) kept from the previous run`
      + ` (~$${carriedSpendUsd.toFixed(3)} already spent).`);
  } catch {
    console.log('Nothing to resume from - running the whole plan.');
  }
}

const results = [];
let spentUsd = carriedSpendUsd;
let blindCounter = 0;
/** Opaque, stable-per-run ids. Sequential rather than hashed so a human can call one out in
 *  a note ("B-07 is the one with the collapsed strap") without transcribing a hash. */
const blindId = () => `B-${String(++blindCounter).padStart(2, '0')}`;

/** The zero-token control and the gallery's anchors. Both are captured in EVERY mode: the
 *  anchors are what make the paid gallery's blind read possible, and re-capturing the
 *  control beside them is the cheapest proof the wrapper did not drift between runs. */
console.log('\n── control + anchors (zero token) ──');
const freeItems = await page.evaluate(async () => {
  const bust = '?t=' + Date.now();
  const spikeAnchors = await import('/src/ai/spike/anchors.ts' + bust);
  const control = spikeAnchors.controlAnchor();
  const anchors = await spikeAnchors.galleryAnchors();
  return [control, ...anchors].map((a) => ({
    id: a.id,
    kind: a.kind,
    provenance: a.provenance,
    template: a.template,
    data: a.data,
    stressData: a.stressData,
  }));
});

for (const item of freeItems) {
  const started = Date.now();
  const slug = item.id;
  const captured = await captureSet({ ...item, slug });
  const record = {
    blindId: blindId(),
    slug,
    kind: item.kind,
    provenance: item.provenance,
    ...captured,
    ms: Date.now() - started,
  };
  results.push(record);
  const flat = record.plan.measured.hasBuilders ? '' : ' · NO TIMELINE BUILDERS';
  console.log(`  ${slug} · in ${record.plan.measured.inMs} ms · out ${record.plan.measured.outMs} ms`
    + ` · ${record.frames.length} motion frames${flat}`
    + `${record.errors.length ? ` · ${record.errors.length} runtime error(s)` : ''}`);
  for (const error of record.errors) console.log(`    ✗ ${error}`);
}

// ── The paid arms ──────────────────────────────────────────────────────────────────────
if (paid) {
  for (const entry of briefs) {
    for (const arm of ARMS) {
      const started = Date.now();
      const slug = `${entry.id}.${arm}`;
      console.log(`\n── ${slug} ──`);
      const priorRecord = kept.get(slug);
      if (priorRecord) {
        // Re-issue the blind id so the gallery's ordering is this run's, not a stale one; the
        // frames on disk are already correct and are not recaptured.
        results.push({ ...priorRecord, blindId: blindId() });
        console.log(`  kept from the previous run · $${(priorRecord.costUsd ?? 0).toFixed(4)}`);
        continue;
      }
      if (spentUsd >= maxCost) {
        console.log(`  SKIPPED: the $${maxCost.toFixed(2)} ceiling is spent ($${spentUsd.toFixed(3)}).`);
        results.push({ blindId: blindId(), slug, kind: 'candidate', arm, skipped: 'cost-ceiling' });
        continue;
      }

      let outcome;
      try {
        outcome = await page.evaluate(async (input) => {
          const bust = '?t=' + Date.now();
          const spikeRun = await import('/src/ai/spike/run.ts' + bust);
          const spikeAnchors = await import('/src/ai/spike/anchors.ts' + bust);
          const { productionSpxValidator } = await import('/src/ai/litePipeline.ts' + bust);
          const [provider, ...model] = input.route.split(':');
          const result = await spikeRun.runSpikeBrief({
            brief: input.brief,
            arm: input.arm,
            route: { provider, model: model.join(':') },
            decoding: input.decoding,
            validate: productionSpxValidator(),
          });
          return {
            template: result.template,
            validation: {
              ok: result.validation.ok,
              errors: result.validation.errors.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
              warnings: result.validation.warnings.map((e) => `${e.rule}: ${e.message.slice(0, 200)}`),
            },
            repairRounds: result.repairRounds,
            exemplarIds: result.exemplarIds,
            exemplarReason: result.exemplarReason,
            costUsd: result.costUsd,
            usage: result.usage,
            model: result.model,
            emitted: result.emitted,
            data: spikeAnchors.dataFor(input.brief),
            stressData: spikeAnchors.stressFor(input.brief),
          };
        }, { brief: entry.brief, arm, route, decoding });
      } catch (error) {
        // A failed emit still cost tokens where the call was served; there is no cost to read
        // back off a throw here, so it is recorded as unknown rather than as zero.
        console.log(`  FAILED: ${error.message.split('\n')[0]}`);
        results.push({
          blindId: blindId(),
          slug,
          kind: 'candidate',
          arm,
          error: error.message.slice(0, 500),
          costUsd: null,
          ms: Date.now() - started,
        });
        await page.evaluate(() => {
          document.getElementById('spike-hold-frame')?.remove();
          document.getElementById('spike-capture-frame')?.remove();
        }).catch(() => undefined);
        await writeLedger();
        continue;
      }

      spentUsd += outcome.costUsd ?? 0;

      // The FIELD CONTRACT, deterministic - §0.3's "preserve the scaffold and live-field
      // contract" condition. Kept separate from the validator verdict because it is a
      // different question: the validator asks whether the template is sound, this asks
      // whether it is still the graphic that was requested.
      const fields = outcome.template.fields;
      const textFields = fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea').length;
      const expected = entry.expect?.textFields ?? 2;
      // EDITABILITY IS DEMOTED HERE FOR THE SAME REASON THE REPAIR LOOP DEMOTES IT, and the
      // first paid brief is what showed the gate disagreeing with the pipeline: a fresh build
      // whose ANIMATION region the converter cannot read still plays, still exports, and only
      // loses its visual timeline, so the product path treats it as a warning. Counting it as
      // a scaffold failure would fail §0.3's "preserve the scaffold and live-field contract"
      // on a criterion that condition never meant - a gate scoring stricter than the pipeline
      // it measures, which is the same shape of bug as pro-bench discarding the compiler's own
      // warnings (docs/AI_ATTEMPTS.md). It is reported, never silently dropped.
      const EDITABILITY_RULE = 'bench-editability';
      const blockingErrors = outcome.validation.errors.filter((e) => !e.startsWith(`${EDITABILITY_RULE}:`));
      const contract = {
        textFields,
        expectedTextFields: expected,
        fieldsOk: textFields >= expected,
        logoExpected: Boolean(entry.expect?.logo ?? entry.brief.includeLogo),
        logoSlot: fields.some((f) => f.ftype === 'filelist'),
        blockingErrors,
        editabilityDemoted: outcome.validation.errors.length !== blockingErrors.length,
      };
      contract.scaffoldOk = blockingErrors.length === 0 && contract.fieldsOk
        && (!contract.logoExpected || contract.logoSlot);

      const captured = await captureSet({ ...outcome, slug });
      const record = {
        blindId: blindId(),
        slug,
        kind: 'candidate',
        arm,
        route,
        model: outcome.model,
        provenance: `${route} · ${arm} arm · exemplars [${outcome.exemplarIds.join(', ') || 'none'}]`,
        exemplarIds: outcome.exemplarIds,
        exemplarReason: outcome.exemplarReason,
        validation: outcome.validation,
        repairRounds: outcome.repairRounds,
        contract,
        costUsd: outcome.costUsd,
        usage: outcome.usage,
        ...captured,
        ms: Date.now() - started,
      };
      results.push(record);
      console.log(`  ${contract.scaffoldOk ? 'CONTRACT OK' : 'CONTRACT FAIL'} · fields ${textFields}`
        + `${contract.editabilityDemoted ? ' · read-only timeline' : ''}`
        + ` · repairs ${record.repairRounds} · $${(record.costUsd ?? 0).toFixed(4)}`
        + ` · ${record.frames.length} motion frames · ${record.ms} ms`);
      for (const error of contract.blockingErrors) console.log(`    ✗ ${error}`);
      if (contract.editabilityDemoted) {
        console.log('    · editability demoted to a warning (fresh build) - it plays and exports,'
          + ' its timeline is read-only');
      }
      await writeLedger();
    }
  }
}

// CARRY FORWARD EVERY KEPT RECORD THE CURRENT PLAN DID NOT COVER.
//
// Without this, `--resume` with a brief SUBSET rebuilds the ledger from the subset alone and
// silently drops every other brief's record - their frames stay on disk, orphaned, and their
// verdicts, costs and exemplar ids are gone. That happened on this round and cost ten paid
// generations' worth of metadata: resuming a few briefs is exactly when a subset gets passed,
// so the two features broke each other the first time they were used together. Resume means
// ADD TO what exists, never rebuild only what was named.
const handled = new Set(results.map((r) => r.slug));
for (const [slug, record] of kept) {
  if (handled.has(slug)) continue;
  results.push({ ...record, blindId: blindId() });
  console.log(`  carried forward (outside this run's brief list): ${slug}`);
}

await writeLedger();
// Mode-scoped for the same reason the ledger is: a control rerun after a paid round would
// otherwise replace the blind gallery and the notes template - the two artifacts the human
// review actually happens in - with a control-only version, and notes already written into
// notes.md would go with them.
const reviewFile = path.join(OUT, paid ? 'review.html' : 'control-review.html');
const notesFile = path.join(OUT, paid ? 'notes.md' : 'control-notes.md');
await blindTheFrames(results);
await writeFile(reviewFile, reviewHtml(results));
await writeNotesTemplate(notesFile, results);

const candidates = results.filter((r) => r.kind === 'candidate' && !r.skipped && !r.error);
console.log(`\n${candidates.length} candidate(s) captured, ${results.length - candidates.length} control/anchor/failed`
  + `${paid ? ` · spent ~$${spentUsd.toFixed(3)} of the $${maxCost.toFixed(2)} ceiling` : ''}`);
console.log(`Blind gallery: ${reviewFile}`);
console.log(`Write notes into ${notesFile} BEFORE running --reveal.`);
await browser.close();

/**
 * THE CONTROL RUN MUST NEVER OVERWRITE A PAID LEDGER.
 *
 * `results.json` carries the round's cumulative spend, and `--resume` reads it to know what
 * has already been paid for. The control mode used to write the same file, so the mandatory
 * "rerun the control after any wrapper change" step silently reset the paid ledger to zero -
 * and the next `--resume` found nothing to keep, regenerated all 24 briefs, and walked the
 * round straight past its approved cost cap. The ceiling was never breached WITHIN a run; the
 * number it counts from was destroyed between runs.
 *
 * A free run therefore writes its own file. Nothing is lost - the control's frames are named
 * per item on disk exactly as before - and the paid ledger is the one artifact a free run
 * cannot touch.
 */
// A function DECLARATION, not a const arrow: `writeLedger` is called from the capture loop
// far above this point, and a const in temporal dead zone throws there instead of writing.
function ledgerPath() {
  return path.join(OUT, paid ? 'results.json' : 'control-results.json');
}

/**
 * COPY EVERY FRAME THE GALLERY SHOWS TO A BLIND FILENAME.
 *
 * The captures are named after the brief and the arm - `sports-live.exemplar.hold.png` - and
 * the gallery referenced them directly, so the one artifact whose entire purpose is to hide
 * the arm, the checkpoint and the verdict announced all of it in every `img src`. A reviewer
 * would not even have to look for it: the browser shows a filename on hover, on right-click,
 * and in the network panel.
 *
 * §0.2 is explicit that the human notes are written before the arm and checkpoint are
 * revealed, and a leak here does not merely weaken that - it silently converts a blind read
 * into an informed one, which is the failure mode the whole anchor-mixing design exists to
 * prevent. Copies rather than renames, so the by-slug originals stay for the key and for
 * anything that has to be re-examined after the reveal.
 */
async function blindTheFrames(all) {
  const dir = path.join(OUT, 'blind');
  await mkdir(dir, { recursive: true });
  for (const record of all) {
    if (record.skipped || record.error) continue;
    const copy = async (file, name) => {
      if (!file) return null;
      const blindName = `${record.blindId}.${name}.png`;
      await copyFile(path.join(OUT, file), path.join(dir, blindName)).catch(() => undefined);
      return `blind/${blindName}`;
    };
    record.blindHold = await copy(record.hold, 'hold');
    record.blindStressHold = await copy(record.stressHold, 'stress');
    for (const frame of record.frames ?? []) {
      frame.blindFile = await copy(frame.file, `${frame.strip}-${frame.index}`);
    }
  }
}

async function writeLedger() {
  await writeFile(ledgerPath(), `${JSON.stringify({
    base: BASE,
    mode: paid ? 'paid' : 'control',
    route: paid ? route : null,
    frontierReason,
    arms: paid ? ARMS : [],
    decoding,
    spentUsd,
    maxCost: paid ? maxCost : null,
    results,
  }, null, 2)}\n`);
}

// ── The galleries ──────────────────────────────────────────────────────────────────────

/** The BLIND gallery: opaque ids, no verdict, no arm, no checkpoint, everything shuffled by
 *  blind id rather than by run order - run order alone would leak the arms, since the two
 *  arms of one brief are produced back to back. */
function reviewHtml(all) {
  const shown = [...all].filter((r) => !r.skipped && !r.error).sort((a, b) => hash(a.blindId) - hash(b.blindId));
  const sections = shown.map((r) => {
    const strips = ['entrance', 'update', 'exit'].map((strip) => {
      const frames = (r.frames ?? []).filter((f) => f.strip === strip);
      if (!frames.length) return '';
      return `<h3>${strip}</h3><div class="strip">${frames
        .map((f) => `<figure><img src="${f.blindFile ?? f.file}"><figcaption>${Math.round(f.atMs)} ms</figcaption></figure>`)
        .join('')}</div>`;
    }).join('');
    const note = r.plan?.note ? `<p class="note">${r.plan.note}</p>` : '';
    return `<section id="${r.blindId}">
  <h2>${r.blindId}</h2>
  ${note}
  <h3>settled hold</h3>
  <div class="holds">
    <figure><img src="${r.blindHold ?? r.hold}"><figcaption>normal text</figcaption></figure>
    <figure><img src="${r.blindStressHold ?? r.stressHold}"><figcaption>stress text</figcaption></figure>
  </div>
  ${strips}
</section>`;
  }).join('\n');

  return `<!doctype html><meta charset="utf-8">
<title>NoaCG Pro Phase 0 - blind review</title>
<style>
body{background:#101216;color:#e8e9ec;font:14px/1.5 system-ui;padding:24px;max-width:1600px;margin:0 auto}
h1{font-size:20px} h2{font-size:16px;border-top:1px solid #2a2d34;padding-top:18px;margin-top:32px}
h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9aa0ab;margin:14px 0 6px}
img{border:1px solid #2a2d34;background:#000;display:block}
.holds img{width:640px} .strip{display:flex;gap:8px;overflow-x:auto} .strip img{width:300px}
figure{margin:0} figcaption{color:#9aa0ab;font-size:11px;margin-top:2px}
.note{color:#f6a623} .lead{color:#9aa0ab;max-width:70ch}
</style>
<h1>NoaCG Pro Phase 0 - blind review</h1>
<p class="lead">Every item below is shown WITHOUT its arm, checkpoint, cost or validator verdict,
and the anchors (adapt-first outputs and strong catalog graphics) are mixed in among the
candidates. Write your notes in <code>notes.md</code> first, then run
<code>node scripts/pro-spike.mjs --reveal</code>.</p>
<p class="lead">Read each one for: deliberate hierarchy, proportion, spacing and composition;
whether it looks like a real broadcast graphic rather than a tutorial component; whether the
motion supports the composition; and whether local CSS/SVG polish would finish it or a
designer would have to start over.</p>
${sections}`;
}

/** A stable small hash, so the blind order is deterministic per run without Math.random. */
function hash(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Write the notes template ONLY when no notes file exists at all.
 *
 * The rule is deliberately that blunt, because the clever version destroyed a human's review.
 * The first guard tested whether the file "looked like an unfilled template" by searching for
 * a literal bullet string - and the owner's notes were written in prose that never contained
 * it, so a free `--rebuild` (run to fix an unrelated presentation bug) silently replaced their
 * verbatim §0.2 read with blank headings. It was recoverable only because the round had been
 * archived minutes earlier.
 *
 * A notes file is a human artifact this script cannot reconstruct, so it does not get to
 * decide when one is disposable. Existence is the whole test: delete the file to regenerate.
 */
async function writeNotesTemplate(file, all) {
  const exists = await readFile(file, 'utf8').then(() => true).catch(() => false);
  if (exists) {
    console.log(`Kept the existing ${path.basename(file)} - delete it if you want a fresh template.`);
    return;
  }
  await writeFile(file, notesTemplate(all));
}

function notesTemplate(all) {
  const shown = [...all].filter((r) => !r.skipped && !r.error).sort((a, b) => hash(a.blindId) - hash(b.blindId));
  return `# Phase 0 human review notes

Written BEFORE reading key.html (docs/NOACG_PRO_PLAN.md §0.2). One block per item, in the
gallery's order.

For each: deliberate composition? real broadcast graphic or tutorial component? transformed
its references or copied one? does the motion support the composition? would local polish
finish it, or is it a redesign?

${shown.map((r) => `## ${r.blindId}

- composition:
- broadcast or tutorial:
- copied or transformed:
- motion:
- polish or redesign:
- airable / one localized repair away / redesign away:
`).join('\n')}`;
}

/** The key, read only after the notes exist. */
function keyHtml(ledger) {
  const rows = ledger.results.map((r) => `<tr>
  <td>${r.blindId}</td>
  <td>${r.kind}${r.arm ? ` · ${r.arm}` : ''}</td>
  <td>${r.provenance ?? r.slug}</td>
  <td>${r.skipped ? `skipped (${r.skipped})` : r.error ? 'ERROR'
    : r.contract ? `${r.contract.scaffoldOk ? 'contract OK' : 'contract FAIL'}${
      r.contract.editabilityDemoted ? '<br><small>read-only timeline (demoted)</small>' : ''}` : '-'}</td>
  <td>${r.contract ? (r.contract.blockingErrors.length ? r.contract.blockingErrors.join('<br>') : 'valid')
    : r.validation ? (r.validation.ok ? 'valid' : r.validation.errors.join('<br>')) : '-'}</td>
  <td>${r.repairRounds ?? '-'}</td>
  <td>${typeof r.costUsd === 'number' ? `$${r.costUsd.toFixed(4)}` : '-'}</td>
</tr>`).join('\n');
  return `<!doctype html><meta charset="utf-8">
<title>NoaCG Pro Phase 0 - key</title>
<style>body{background:#101216;color:#e8e9ec;font:13px/1.5 system-ui;padding:24px}
table{border-collapse:collapse;width:100%} td,th{border:1px solid #2a2d34;padding:6px 8px;vertical-align:top;text-align:left}
th{color:#9aa0ab;font-weight:600}</style>
<h1>Key - ${ledger.mode} run${ledger.route ? ` · ${ledger.route}` : ''}</h1>
<p>Spent $${(ledger.spentUsd ?? 0).toFixed(4)}${ledger.maxCost ? ` of a $${ledger.maxCost.toFixed(2)} ceiling` : ''}.
Decoding: temperature ${ledger.decoding.temperature}, seed ${ledger.decoding.seed}.</p>
<table>
<tr><th>id</th><th>kind</th><th>provenance</th><th>contract</th><th>validation</th><th>repairs</th><th>cost</th></tr>
${rows}
</table>`;
}
