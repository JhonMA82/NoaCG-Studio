#!/usr/bin/env node
// CHECKPOINT SELECTION for the NoaCG Pro Phase 0 spike (docs/NOACG_PRO_PLAN.md §0.1, §14).
//
//   node scripts/spike-checkpoint-probe.mjs --list            # FREE: what the gateway carries
//   node scripts/spike-checkpoint-probe.mjs --probe=a,b,c     # ~CENTS: one real call each
//
// WHY THIS IS A PROBE AND NOT A LISTING READ. A listing describes a model; the thing that
// decides whether a checkpoint can author for NoaCG is a property of the ENDPOINT serving it.
// `alibaba/qwen3.7-flash` is the precedent (docs/AI_ATTEMPTS.md): cheapest text route on the
// gateway, 991k context, listed as capable - and it downgrades `response_format: json_schema`
// to `json_object` and then refuses the call. Zero of six briefs reached a model. The entry's
// RETRY WHEN line is explicit that the re-check must be a probe against the actual schema,
// "never by a listing", and that it is re-run on any endpoint change.
//
// The Phase 0 call is a FORCED `emit_template` tool call returning three long code strings.
// Three things have to be true, and only the last two need real tokens:
//
//   1. LICENCE - the weights are open AND commercially usable. Read from the listing plus
//      this file's own table, then RESTATED in the output for a human to confirm: a bench
//      script is not a licence oracle, and the spike's whole premise is an OPEN specialist.
//   2. TOOL CAPABILITY - the endpoint advertises `tools`, and more importantly actually
//      serves a forced tool call that validates against the real schema.
//   3. OUTPUT ROOM - the endpoint accepts the spike's output budget and returns three
//      populated files without truncating. A checkpoint that runs out of room mid-CSS looks
//      exactly like a checkpoint with no taste.
//
// THE PROBE USES THE ROUND'S REAL PROMPT, and the first version did not. It sent a short
// hand-written brief with a small output budget, and both originally-pinned checkpoints passed
// in about 30 s. Against the actual prompt - the shipped coder system prompt, a 38,500-token
// exemplar block, a 17,000-token budget - `zai/glm-5.2` spent the ENTIRE budget on reasoning
// tokens and emitted nothing at all, twice, while `moonshotai/kimi-k3` took 235 s. A probe
// that measures a smaller question than the round asks certifies a checkpoint the round cannot
// use, which is the failure this whole script exists to prevent (docs/AI_ATTEMPTS.md).
//
// It still asks for a SMALL DESIGN - the probe is not judging taste - but the prompt shape,
// the exemplar volume and the output budget are the round's own.
//
// SELECTION RULE (owner decision 2026-08-11): the STRONGEST open-weight checkpoint wins.
// Cheap is not a criterion here. The probe therefore ranks nothing by price; it reports price
// so a round can be budgeted, and refuses candidates that cannot serve the contract at all.
//
// Requires the dev server on this checkout's port for --probe (the call goes through the
// app's own gateway client, never a hand-rolled request - a probe that reimplements the
// transport certifies a path the product does not use).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';
import { readEnvFile } from './ai-bench-server.mjs';
import { requireAllowedRoute } from './harness-route-policy.mjs';

/** The round's own pinned decoding, so the probe measures the call the round will make. */
const decoding = JSON.parse(await readFile(path.resolve('benchmarks/pro/v1/spike/decoding.json'), 'utf8'));

const BASE = `http://localhost:${devPort()}`;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const GATEWAY_MODELS = 'https://ai-gateway.vercel.sh/v1/models';

/**
 * Slug prefixes whose weights are published under a licence that permits commercial use.
 *
 * This is a HUMAN-MAINTAINED table and it is stated as one: the gateway listing does not
 * carry a licence field, and inferring "open" from a vendor name is how a proprietary model
 * ends up in an open-weight experiment. Anything not listed is reported as UNKNOWN and needs
 * a human answer before it can be a candidate - unknown is not a refusal, it is a question.
 */
const OPEN_WEIGHT_PREFIXES = [
  { prefix: 'alibaba/qwen', licence: 'Apache-2.0 (most Qwen releases; per-model check)' },
  { prefix: 'qwen/', licence: 'Apache-2.0 (most Qwen releases; per-model check)' },
  { prefix: 'deepseek/', licence: 'MIT / DeepSeek licence (per-model check)' },
  { prefix: 'openai/gpt-oss', licence: 'Apache-2.0' },
  { prefix: 'moonshotai/', licence: 'Modified MIT (Kimi)' },
  { prefix: 'zai/', licence: 'MIT (GLM)' },
  { prefix: 'z-ai/', licence: 'MIT (GLM)' },
  { prefix: 'meta-llama/', licence: 'Llama Community Licence - commercial use with conditions' },
  { prefix: 'mistral/', licence: 'Apache-2.0 for the open releases; several are NOT open' },
  { prefix: 'mistralai/', licence: 'Apache-2.0 for the open releases; several are NOT open' },
  { prefix: 'google/gemma', licence: 'Gemma Terms of Use - commercial use with conditions' },
];

/**
 * Slugs whose FAMILY prefix is open but whose own weights are NOT published. A prefix table
 * alone recommends these as Apache-2.0, and a proprietary checkpoint in an open-weight
 * feasibility spike does not answer the spike's question - it answers a different one and
 * looks like a result.
 *
 * `-max` is the whole reason this list exists: Alibaba publishes weights for the Qwen dense
 * and MoE releases and does NOT publish them for the Qwen-Max line, which sits at the top of
 * the gateway's price list and would therefore have been the first thing a "strongest wins"
 * reading reached for. Mistral's Medium/Magistral-Medium/Large tiers are the same shape.
 */
const NOT_OPEN_PATTERNS = [
  { test: /^alibaba\/qwen.*-max/, why: 'Qwen-Max is Alibaba\'s proprietary tier - no published weights' },
  { test: /^mistral\/mistral-medium/, why: 'Mistral Medium is proprietary - no published weights' },
  { test: /^mistral\/mistral-large/, why: 'Mistral Large is proprietary - no published weights' },
  { test: /^mistral\/magistral-medium/, why: 'Magistral Medium is proprietary - no published weights' },
  { test: /^mistral\/ministral/, why: 'Ministral is proprietary - no published weights' },
];

function notOpen(id) {
  return NOT_OPEN_PATTERNS.find((e) => e.test.test(id)) ?? null;
}

function licenceFor(id) {
  if (notOpen(id)) return null;
  const hit = OPEN_WEIGHT_PREFIXES.find((e) => id.startsWith(e.prefix));
  return hit ? hit.licence : null;
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

// ── --list: what the gateway carries, annotated ────────────────────────────────────────
if (flag('list') || args.length === 0) {
  const listing = await getJson(GATEWAY_MODELS);
  const models = (listing.data ?? [])
    .filter((m) => (m.type ?? 'language') === 'language')
    .map((m) => ({
      id: m.id,
      context: m.context_window ?? null,
      inputPerMillion: m.pricing?.input ? Number(m.pricing.input) * 1e6 : null,
      outputPerMillion: m.pricing?.output ? Number(m.pricing.output) * 1e6 : null,
      licence: licenceFor(m.id),
    }))
    .filter((m) => m.licence)
    .sort((a, b) => (b.outputPerMillion ?? 0) - (a.outputPerMillion ?? 0));

  console.log('Open-weight language models on the Vercel AI Gateway, dearest output first.');
  console.log('Price is a BUDGETING number, not a selection criterion (owner decision 2026-08-11:');
  console.log('the strongest checkpoint wins; cheap is not a criterion for this spike).\n');
  for (const m of models) {
    const price = m.inputPerMillion === null
      ? 'price unlisted'
      : `$${m.inputPerMillion.toFixed(2)}/$${m.outputPerMillion.toFixed(2)} per Mtok`;
    console.log(`  ${m.id.padEnd(42)} ${String(m.context ?? '?').padStart(9)} ctx  ${price}`);
    console.log(`  ${' '.repeat(42)} licence: ${m.licence}`);
  }
  const excluded = (listing.data ?? [])
    .filter((m) => (m.type ?? 'language') === 'language')
    .map((m) => ({ id: m.id, ruling: notOpen(m.id) }))
    .filter((m) => m.ruling);
  if (excluded.length) {
    console.log('\nExcluded as NOT open-weight despite an open-looking family prefix:');
    for (const m of excluded) console.log(`  ${m.id.padEnd(42)} ${m.ruling.why}`);
  }

  console.log(`\n${models.length} candidate(s). A listing is not capability - probe before pinning:`);
  console.log('  node scripts/spike-checkpoint-probe.mjs --probe=vercel:<id>,vercel:<id>');
  process.exit(0);
}

// ── --probe: one real forced tool call per candidate ───────────────────────────────────
const candidates = (value('probe') ?? '').split(',').filter(Boolean);
if (!candidates.length) {
  console.error('--probe needs at least one <provider>:<model> route.');
  process.exit(1);
}
for (const candidate of candidates) {
  requireAllowedRoute(candidate, { flag: 'probe', reason: value('frontier-reason') });
}

console.log(`PAID probe: ${candidates.length} candidate(s), one small forced tool call each.`);
console.log('Expect a few cents in total.\n');

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
  process.exit(1);
}

// The BRAND round's condition rides the probe too: a probe must ask the round's question at
// the round's size (the Phase 0 lesson - an undersized probe passed a checkpoint the real
// prompt broke). The first fixture brand stands in; its mark is probed in the page like the
// runner does.
const BRANDS = path.resolve('benchmarks/pro/v1/spike/brands.json');
const brandsFixture = JSON.parse(await readFile(BRANDS, 'utf8'));
const probeBrandRaw = brandsFixture.brands[0];
const markFile = path.resolve(path.dirname(BRANDS), probeBrandRaw.mark);
const markBytes = await readFile(markFile);
const markExt = path.extname(markFile).toLowerCase();
const markMime = markExt === '.svg' ? 'image/svg+xml' : markExt === '.png' ? 'image/png' : 'image/jpeg';
const probeBrandInput = {
  ...probeBrandRaw,
  markFileName: path.basename(markFile),
  markDataUrl: `data:${markMime};base64,${markBytes.toString('base64')}`,
};

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

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
    console.log('Signed in for the managed route.\n');
  } catch (error) {
    console.error(`Sign-in failed (${error.message?.split('\n')[0]}) - continuing signed out.\n`);
  }
}

const findings = [];
for (const candidate of candidates) {
  const [provider, ...model] = candidate.split(':');
  const modelId = model.join(':');
  process.stdout.write(`── ${candidate}\n`);
  const result = await page.evaluate(async (input) => {
    const bust = '?t=' + Date.now();
    const { callModelDetailed } = await import('/src/ai/modelGateway.ts' + bust);
    const { TEMPLATE_TOOL } = await import('/src/ai/claudeProvider.ts' + bust);
    const { outputBudget } = await import('/src/ai/modelTypes.ts' + bust);
    const started = Date.now();
    try {
      // THE PROMPT NAMES THE WHOLE PAYLOAD, and the first version did not. It said "emit the
      // three files", so both candidates returned html/css/js and omitted name/type/summary -
      // a schema miss the runner reported as REFUSED, which reads identically to an endpoint
      // that cannot serve structured output at all. A probe that asks for less than the schema
      // requires measures its own wording. (Found via NOACG_DEBUG_STRUCTURED=1, which prints
      // the rejected paths server-side: `$.name:required,$.type:required,$.summary:required`.)
      // THE ROUND'S OWN SYSTEM PROMPT, EXEMPLAR BLOCK AND OUTPUT BUDGET - see the header. The
      // brief stays small because the probe is not judging design, but everything that decides
      // whether the endpoint can SERVE the call is the real thing.
      const spikeRun = await import('/src/ai/spike/run.ts' + bust);
      const spikeExemplars = await import('/src/ai/spike/exemplars.ts' + bust);
      const { probeMark } = await import('/src/assets/assetInfo.ts' + bust);
      const probeBrief = {
        brief: 'A plain two-line lower third: a dark panel, one accent bar, a simple entrance and exit.',
        name: 'Alexandra Riva',
        title: 'Chief Political Correspondent',
      };
      // The round is BRAND-conditioned now, so the probe is too (same size, same demands):
      // the brand block, the measured mark facts and the slot contract all ride the message.
      const probe = await probeMark({
        path: `images/${input.brand.markFileName}`,
        data: input.brand.markDataUrl,
      });
      if (!probe) throw new Error(`probeMark could not read ${input.brand.markFileName}`);
      const brand = {
        id: input.brand.id,
        name: input.brand.name,
        world: input.brand.world,
        typeface: input.brand.typeface,
        palette: input.brand.palette,
        mark: { path: `images/${input.brand.markFileName}`, dataUrl: input.brand.markDataUrl, probe },
      };
      const selection = spikeExemplars.exemplarsFor(probeBrief.brief);
      const answer = await callModelDetailed({
        system: spikeRun.spikeSystemPrompt(),
        messages: [{
          role: 'user',
          content: spikeRun.spikeUserMessage(probeBrief, spikeExemplars.exemplarBlock(selection.variants), brand),
        }],
        tool: TEMPLATE_TOOL,
        route: { provider: input.provider, model: input.modelId },
        // The same surface the round itself uses, so the probe measures the transport the
        // round will actually run on. A probe on a different transport certifies nothing.
        surface: 'spike',
        maxTokens: outputBudget(input.expectedOutputTokens),
        temperature: input.temperature,
      });
      const out = answer.output ?? {};
      return {
        ok: true,
        ms: Date.now() - started,
        model: answer.model,
        costUsd: answer.usage?.estimatedCost?.amount ?? null,
        outputTokens: answer.usage?.outputTokens ?? null,
        // Truncation is the failure that reads as "no taste": a schema-valid answer whose css
        // stops mid-rule still validates as a string.
        sizes: {
          html: String(out.html ?? '').length,
          css: String(out.css ?? '').length,
          js: String(out.js ?? '').length,
        },
        // The three checks that decide whether this checkpoint can author at all.
        emittedAllFiles: Boolean(out.html && out.css && out.js),
        htmlLooksComplete: /<\/html>\s*$/i.test(String(out.html ?? '').trim()),
        jsHasLifecycle: ['update', 'play', 'stop'].every((fn) => String(out.js ?? '').includes(`function ${fn}`)),
      };
    } catch (error) {
      return { ok: false, ms: Date.now() - started, error: String(error?.message ?? error).slice(0, 400) };
    }
  }, { provider, modelId, brand: probeBrandInput, ...decoding });

  const licence = licenceFor(modelId);
  const verdict = { candidate, licence: licence ?? 'UNKNOWN - needs a human answer', ...result };
  findings.push(verdict);

  if (!result.ok) {
    // WHICH REFUSAL IS THIS? The standing instruction in docs/AI_ATTEMPTS.md exists because
    // "the endpoint cannot serve the contract" and "we asked it the wrong way" look identical
    // from here, and this script asserted the first for both until it cost a diagnosis. A
    // request the SERVER rejected never reached a model at all.
    const ours = /invalid|surface|unsupported|not configured|missing key|authentication/i.test(result.error);
    console.log(`   REFUSED: ${result.error}`);
    if (ours) {
      console.log('   OUR REQUEST was refused before a model saw it - this measures the harness,');
      console.log('   not the checkpoint. Fix the request and re-probe; draw no conclusion here.');
    } else {
      console.log('   The endpoint did not serve the contract - the same class as the qwen3.7-flash');
      console.log('   json_schema downgrade. Confirm with NOACG_DEBUG_STRUCTURED=1, which prints the');
      console.log('   rejected schema paths server-side, before ruling the checkpoint out.');
    }
    console.log('');
    continue;
  }
  const serves = result.emittedAllFiles && result.htmlLooksComplete && result.jsHasLifecycle;
  console.log(`   ${serves ? 'SERVES THE CONTRACT' : 'INCOMPLETE'} · ${result.ms} ms`
    + ` · html ${result.sizes.html} / css ${result.sizes.css} / js ${result.sizes.js} chars`
    + `${typeof result.costUsd === 'number' ? ` · $${result.costUsd.toFixed(4)}` : ''}`);
  if (!result.emittedAllFiles) console.log('   ✗ one or more of html/css/js came back empty');
  if (!result.htmlLooksComplete) console.log('   ✗ the html does not end in </html> - truncated or partial');
  if (!result.jsHasLifecycle) console.log('   ✗ the js is missing one of update/play/stop');
  console.log(`   licence: ${verdict.licence}\n`);
}

await browser.close();

console.log('── summary ──');
for (const f of findings) {
  const state = !f.ok ? 'REFUSED' : (f.emittedAllFiles && f.htmlLooksComplete && f.jsHasLifecycle)
    ? 'candidate' : 'incomplete';
  console.log(`  ${f.candidate.padEnd(44)} ${state}`);
}
console.log('\nConfirm the licence line for any candidate you pin - this script reports what its');
console.log('own table says, and a table is not a licence oracle. Two checkpoints are the Phase 0');
console.log('ceiling (plan §0.3); a third requires a new planning decision.');
