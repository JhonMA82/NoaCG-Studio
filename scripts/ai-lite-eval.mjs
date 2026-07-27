// Bounded NoaCG Lite evaluation runner. This calls the trusted managed endpoint,
// compiles each returned DesignSpec through the real deterministic catalog path, runs the
// static and live benches, and captures native-resolution lifecycle media for blind review.
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
import { spawn } from 'node:child_process';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { devPort } from './dev-port.mjs';
import {
  LITE_LOWER_THIRD_FIXTURES,
  LITE_LOWER_THIRD_FIXTURE_VERSION,
} from './ai-lite-lower-third-fixtures.mjs';

const BASE = `http://localhost:${devPort()}`;
const OUT = path.resolve(process.argv[2] || './lite-eval-out');
const LABEL = String(process.argv[3] || 'candidate').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40);
const REQUESTED = Math.min(40, Math.max(1, Number(process.argv[4]) || LITE_LOWER_THIRD_FIXTURES.length));
const TOKEN = (process.env.NOACG_LITE_EVAL_BEARER_TOKEN ?? '').trim();
const MAX_PROVIDER_CALLS = Math.min(40, Math.max(1, Number(process.env.NOACG_LITE_EVAL_MAX_CALLS) || 40));
const MAX_COST_USD = Math.min(5, Math.max(0.01, Number(process.env.NOACG_LITE_EVAL_MAX_COST_USD) || 1.5));
const FIXTURE_IDS = new Set(
  (process.env.NOACG_LITE_EVAL_FIXTURES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const SELECTED_FIXTURES = (FIXTURE_IDS.size
  ? LITE_LOWER_THIRD_FIXTURES.filter(([fixtureId]) => FIXTURE_IDS.has(fixtureId))
  : LITE_LOWER_THIRD_FIXTURES
).slice(0, REQUESTED);
const RAW_VIDEO_DIR = path.join(OUT, '.raw-video');
const FFMPEG = (process.env.FFMPEG_PATH ?? 'ffmpeg').trim() || 'ffmpeg';

if (!TOKEN) {
  console.error('NOACG_LITE_EVAL_BEARER_TOKEN is required. Aborting before spending anything.');
  process.exit(1);
}
if (SELECTED_FIXTURES.length === 0) {
  console.error('No requested Lite evaluation fixture ids exist. Aborting before spending anything.');
  process.exit(1);
}

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
await mkdir(RAW_VIDEO_DIR, { recursive: true });
const browser = await chromium.launch();

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function trimMotionVideo(rawPath, finalPath, startSeconds) {
  try {
    await run(FFMPEG, [
      '-y',
      '-ss', Math.max(0, startSeconds - 0.12).toFixed(3),
      '-i', rawPath,
      '-t', '12',
      '-an',
      '-c:v', 'libvpx-vp9',
      '-crf', '22',
      '-b:v', '0',
      finalPath,
    ]);
    await unlink(rawPath).catch(() => {});
  } catch {
    await unlink(finalPath).catch(() => {});
    await rename(rawPath, finalPath);
  }
}

async function waitForMotionToSettle(page) {
  let previous = '';
  let stableSamples = 0;
  for (let sample = 0; sample < 50; sample += 1) {
    const signature = await page.evaluate(() => {
      const frame = document.querySelector('#lite-eval-frame');
      const root = frame?.contentDocument?.body.firstElementChild;
      if (!root) return '';
      return [root, ...root.querySelectorAll('*')].map((element) => {
        const rect = element.getBoundingClientRect();
        const style = frame.contentWindow.getComputedStyle(element);
        return [
          rect.x, rect.y, rect.width, rect.height,
          style.transform, style.opacity, style.clipPath,
        ].join('|');
      }).join('\n');
    });
    if (signature && signature === previous) stableSamples += 1;
    else stableSamples = 0;
    if (stableSamples >= 4) return;
    previous = signature;
    await page.waitForTimeout(100);
  }
  throw new Error('Rendered motion did not settle within 5 seconds.');
}

async function measureAndCapture(spec, fixtureId) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: RAW_VIDEO_DIR,
      size: { width: 1920, height: 1080 },
    },
  });
  const page = await context.newPage();
  const video = page.video();
  const recordingStarted = Date.now();
  try {
    await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
    const measured = await page.evaluate(async ({ spec: designSpec }) => {
      const { specToTemplate } = await import('/src/ai/designSpec.ts');
      const { applyDesignAdjustments } = await import('/src/ai/designAdjust.ts');
      const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
      const { benchTemplateRuntime, mergeResults } = await import('/src/validation/runtimeBench.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const context = {
        images: [],
        palette: null,
        resolution: { width: 1920, height: 1080, label: '1080p' },
        fps: 50,
      };
      const assembled = specToTemplate(designSpec, context);
      const template = applyDesignAdjustments(assembled.template, designSpec);
      const validation = mergeResults(validateTemplate(template), await benchTemplateRuntime(template));
      const animData = parseAnimData(template.js);
      const entranceDurationMs = animData
        ? (animData.steps[0].duration / animData.speed) * 1000
        : 3000;
      const exitDurationMs = animData
        ? (animData.steps.at(-1).duration / animData.speed) * 1000
        : 1500;
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
      return {
        ok: validation.ok,
        ruleCodes: validation.errors.map((error) => error.rule),
        category: designSpec.category,
        variantId: designSpec.variantId,
        fieldCount: template.fields.length,
        zone: designSpec.zone ?? null,
        animationPreset: designSpec.animation?.presetId ?? null,
        entranceDurationMs,
        exitDurationMs,
        initialData: Object.fromEntries(designSpec.lines.map((line, index) => [`f${index}`, line.sample])),
        updateData: Object.fromEntries(designSpec.lines.map((line, index) => {
          const replacements = {
            'person-name': 'Alexandra Chen-Williams',
            'person-role': 'Senior Correspondent, International Desk',
            organization: 'Coastal Resilience Research Institute',
            'team-name': 'Northbridge United',
            'story-headline': 'Regional rail services return to normal',
            'event-name': 'Closing Plenary and Awards',
            location: 'Central Convention Hall',
            'social-handle': '@updated_handle',
            'call-to-action': 'Watch the full briefing',
            'supporting-context': 'Live update',
          };
          return [`f${index}`, replacements[line.role] ?? line.sample];
        })),
      };
    }, { spec });
    await page.evaluate((initialData) => {
      document.querySelector('#lite-eval-frame')?.contentWindow?.update(JSON.stringify(initialData));
    }, measured.initialData);
    await page.waitForTimeout(120);
    const motionStarted = Date.now();
    await page.evaluate(() => document.querySelector('#lite-eval-frame')?.contentWindow?.play());
    await page.waitForTimeout(220);
    const entranceFile = `${LABEL}-${fixtureId}-entrance.png`;
    await page.screenshot({ path: path.join(OUT, entranceFile) });
    await page.waitForTimeout(Math.max(0, measured.entranceDurationMs + 250 - (Date.now() - motionStarted)));
    await waitForMotionToSettle(page);
    await page.waitForTimeout(80);
    const holdFile = `${LABEL}-${fixtureId}-hold.png`;
    await page.screenshot({ path: path.join(OUT, holdFile) });
    await page.evaluate((updateData) => {
      document.querySelector('#lite-eval-frame')?.contentWindow?.update(JSON.stringify(updateData));
    }, measured.updateData);
    await page.waitForTimeout(180);
    const updateFile = `${LABEL}-${fixtureId}-update.png`;
    await page.screenshot({ path: path.join(OUT, updateFile) });
    await page.waitForTimeout(420);
    const exitStarted = Date.now();
    await page.evaluate(() => document.querySelector('#lite-eval-frame')?.contentWindow?.stop());
    await page.waitForTimeout(220);
    const exitFile = `${LABEL}-${fixtureId}-exit.png`;
    await page.screenshot({ path: path.join(OUT, exitFile) });
    await page.waitForTimeout(Math.max(0, measured.exitDurationMs + 250 - (Date.now() - exitStarted)));
    await waitForMotionToSettle(page);
    await page.close();
    await context.close();
    const motionFile = `${LABEL}-${fixtureId}.webm`;
    if (video) {
      await trimMotionVideo(
        await video.path(),
        path.join(OUT, motionFile),
        (motionStarted - recordingStarted) / 1000,
      );
    }
    return {
      ok: measured.ok,
      ruleCodes: measured.ruleCodes,
      category: measured.category,
      variantId: measured.variantId,
      fieldCount: measured.fieldCount,
      zone: measured.zone,
      animationPreset: measured.animationPreset,
      entranceDurationMs: measured.entranceDurationMs,
      exitDurationMs: measured.exitDurationMs,
      phaseFiles: { entrance: entranceFile, hold: holdFile, update: updateFile, exit: exitFile },
      ...(video ? { motionFile } : {}),
    };
  } finally {
    if (!page.isClosed()) await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function writeReviewPage() {
  const files = (await readdir(OUT)).filter((file) => file.endsWith('-metrics.json')).sort();
  const summaries = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(path.join(OUT, file), 'utf8'));
    if (parsed.fixtureVersion === LITE_LOWER_THIRD_FIXTURE_VERSION) summaries.push(parsed);
  }
  const cards = SELECTED_FIXTURES.map(([fixtureId, prompt]) => {
    const candidates = summaries
      .map((summary) => summary.rows.find((row) => row.fixtureId === fixtureId))
      .filter((row) => row?.status === 'machine-usable')
      .map((row) => `
        <article>
          <h3>${escapeHtml(row.candidate)}</h3>
          ${row.motionFile ? `<video controls muted loop preload="metadata" src="${escapeHtml(row.motionFile)}"></video>` : ''}
          <div class="phases">
            ${Object.entries(row.phaseFiles ?? {}).map(([phase, file]) => `
              <figure>
                <a href="${escapeHtml(file)}"><img loading="lazy" src="${escapeHtml(file)}" alt="${escapeHtml(`${row.candidate} ${fixtureId} ${phase}`)}"></a>
                <figcaption>${escapeHtml(phase)}</figcaption>
              </figure>
            `).join('')}
          </div>
        </article>
      `).join('');
    return `
      <section>
        <h2>${escapeHtml(fixtureId)}</h2>
        <p>${escapeHtml(prompt)}</p>
        <div class="grid">${candidates || '<p>No machine-usable results yet.</p>'}</div>
      </section>
    `;
  }).join('');
  await writeFile(path.join(OUT, 'review.html'), `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NoaCG Lite blind lower-third review</title>
<style>
  :root{color-scheme:dark;font-family:system-ui,sans-serif;background:#090b0f;color:#e8edf2}
  body{margin:0 auto;max-width:1800px;padding:32px}
  header,section{margin:0 0 48px}
  h1,h2,h3{margin:0 0 10px} p{max-width:960px;color:#aeb7c3;line-height:1.5}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:24px}
  article{padding:16px;background:#12161d;border:1px solid #29313d;border-radius:10px}
  img,video{display:block;width:100%;height:auto;background:#05070a;border-radius:6px}
  video{margin-bottom:12px}
  .phases{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  figure{margin:0} figcaption{padding-top:5px;color:#aeb7c3;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
</style>
<body>
  <header>
    <h1>NoaCG Lite blind lower-third review</h1>
    <p>Candidate labels are intentionally neutral. Every still is captured at 1920x1080 for entrance, hold, update, and exit. Review at 100% for typography, spacing, hierarchy, fit, and sharpness. Use the clips to judge the full lifecycle choreography and settling. The clips are review proxies; runtime validation still uses the live browser graphic.</p>
  </header>
  ${cards}
</body>
</html>`, 'utf8');
}

const rows = [];
let totalCostUsd = 0;
let providerCalls = 0;
let sessions = 0;
for (const [fixtureId, prompt] of SELECTED_FIXTURES) {
  if (providerCalls >= MAX_PROVIDER_CALLS || totalCostUsd >= MAX_COST_USD) break;
  const started = Date.now();
  process.stdout.write(`- ${fixtureId}: `);
  let sent = false;
  let attemptAccounted = false;
  try {
    sessions += 1;
    sent = true;
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
    providerCalls += Math.max(1, Number(generated.attemptCount) || 0);
    attemptAccounted = true;
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

    const measured = await measureAndCapture(generated.decision.spec, fixtureId);
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
      intentKind: generated.decision.spec.intent?.kind,
      fieldCount: measured.fieldCount,
      zone: measured.zone,
      animationPreset: measured.animationPreset,
      entranceDurationMs: measured.entranceDurationMs,
      exitDurationMs: measured.exitDurationMs,
      ruleCodes: measured.ruleCodes,
      latencyMs: Date.now() - started,
      costUsd,
      inputTokens: generated.usage?.inputTokens ?? 0,
      outputTokens: generated.usage?.outputTokens ?? 0,
      cachedInputTokens: generated.usage?.cachedInputTokens ?? 0,
      reasoningTokens: generated.usage?.reasoningTokens ?? 0,
      attempts: generated.attemptCount ?? 0,
      repairs: generated.repairCount ?? 0,
      phaseFiles: measured.phaseFiles,
      motionFile: measured.motionFile,
    });
    console.log(measured.ok ? 'machine-usable' : `invalid (${measured.ruleCodes.join(', ')})`);
  } catch (error) {
    if (sent && !attemptAccounted) providerCalls += 1;
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
  fixtureVersion: LITE_LOWER_THIRD_FIXTURE_VERSION,
  candidate: LABEL,
  calls: providerCalls,
  sessions,
  totalCostUsd,
  maxCalls: MAX_PROVIDER_CALLS,
  maxCostUsd: MAX_COST_USD,
  machineUsable: rows.filter((row) => row.status === 'machine-usable').length,
  rows,
};
await writeFile(path.join(OUT, `${LABEL}-metrics.json`), JSON.stringify(summary, null, 2), 'utf8');
await writeReviewPage();
console.log(`Wrote ${rows.length} synthetic-fixture results. Cost reported: $${totalCostUsd.toFixed(4)}.`);
