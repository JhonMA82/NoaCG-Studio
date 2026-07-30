// Stage 2 of the NoaCG Lite model DISCOVERY FUNNEL (docs/AI_PLATFORM_PLAN.md §8): take
// bench:discover's shortlist and check each candidate against the POLICY gates a free Lite
// route must satisfy before anyone spends a token on it.
//
//   npm run bench:qualify [-- out-dir] [max-candidates]
//
// SPENDS NO TOKENS. Reads the public ZDR-filtered listing plus each candidate's endpoints.
//
// The gates mirror the Lite OpenRouter policy (docs/AI_TASK_REGISTRY.md): zero-data
// retention, a pinnable endpoint that really supports structured output, a confirmed price
// under the per-call ceiling, and endpoint stability. Provider PINNING matters as much as
// the model id - docs/AI_LITE_PROMOTION.md makes candidate identity model + endpoint +
// revision + parameters, because results from a different endpoint (a different
// quantization, most of all) are not interchangeable just because the public name matches.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || './lite-bench-out');
const MAX_CANDIDATES = Math.max(1, Number(process.argv[3]) || 24);
const PER_CALL_CEILING_USD = 0.007;
const EST_INPUT_TOKENS = 2000;
const EST_OUTPUT_TOKENS = 1200;
const MIN_UPTIME = 95;
// Below this, the endpoint is a materially different model from the one that was
// benchmarked elsewhere - the promotion doc treats it as a separate candidate identity.
const TRUSTED_QUANTIZATIONS = new Set(['fp32', 'fp16', 'bf16', 'fp8', 'unknown', null]);

const key = (process.env.OPENROUTER_API_KEY ?? '').trim();
const headers = key ? { authorization: `Bearer ${key}` } : {};

async function getJson(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

const discover = JSON.parse(await readFile(path.join(OUT, 'discover.json'), 'utf8'));

// ZDR is a LISTING-level fact on OpenRouter, not an endpoint field: the zdr=true filter is
// the authoritative answer to "can this model be routed with zero data retention".
const zdrListing = await getJson('https://openrouter.ai/api/v1/models?supported_parameters=structured_outputs&zdr=true');
const zdrIds = new Set((zdrListing.data ?? []).map((model) => model.id));
console.log(`${zdrIds.size} structured-output models offer zero-data-retention routing.`);

// Rank before truncating, and say what was dropped - a silent cap reads as full coverage.
const ranked = [...discover.items].sort((a, b) => {
  if (a.openWeights !== b.openWeights) return a.openWeights ? -1 : 1; // §15.1 preference
  return a.estimatedCallUsd - b.estimatedCallUsd;
});
const considered = ranked.filter((c) => zdrIds.has(c.route.model));
const droppedForZdr = ranked.length - considered.length;
const examined = considered.slice(0, MAX_CANDIDATES);
console.log(`${droppedForZdr} of ${ranked.length} shortlisted candidates fail the ZDR gate outright.`);
if (considered.length > examined.length) {
  console.log(`Examining the top ${examined.length} of ${considered.length} ZDR-capable candidates ` +
    `(open-weight first, then cheapest). Raise the cap: npm run bench:qualify -- <dir> <n>.`);
}

const results = [];
for (const candidate of examined) {
  const row = { ...candidate, gates: {}, endpoints: [], pinned: null };
  row.gates.zdr = true; // considered[] is already ZDR-filtered
  try {
    const detail = await getJson(`https://openrouter.ai/api/v1/models/${candidate.route.model}/endpoints`);
    const endpoints = (detail.data?.endpoints ?? []).map((endpoint) => ({
      provider: endpoint.provider_name,
      tag: endpoint.tag ?? null,
      quantization: endpoint.quantization ?? null,
      contextLength: endpoint.context_length ?? null,
      maxCompletionTokens: endpoint.max_completion_tokens ?? null,
      structuredOutput: (endpoint.supported_parameters ?? []).includes('structured_outputs'),
      supportsSeed: (endpoint.supported_parameters ?? []).includes('seed'),
      uptime1d: endpoint.uptime_last_1d ?? null,
      inputPerMillion: Number(endpoint.pricing?.prompt ?? 0) * 1_000_000,
      outputPerMillion: Number(endpoint.pricing?.completion ?? 0) * 1_000_000,
    }));
    row.endpoints = endpoints;

    // The pinned endpoint is the cheapest one that clears every structural gate - that
    // exact endpoint is what confirm and compare must route to, and what the promotion
    // recommendation names.
    const usable = endpoints.filter((endpoint) =>
      endpoint.structuredOutput
      && (endpoint.uptime1d === null || endpoint.uptime1d >= MIN_UPTIME)
      && TRUSTED_QUANTIZATIONS.has(endpoint.quantization));
    const perCall = (endpoint) =>
      (endpoint.inputPerMillion * EST_INPUT_TOKENS + endpoint.outputPerMillion * EST_OUTPUT_TOKENS) / 1_000_000;
    const affordable = usable.filter((endpoint) => perCall(endpoint) <= PER_CALL_CEILING_USD);
    affordable.sort((a, b) => perCall(a) - perCall(b));

    row.gates.structuredOutputEndpoint = endpoints.some((e) => e.structuredOutput);
    row.gates.stableEndpoint = usable.length > 0;
    row.gates.withinCostCeiling = affordable.length > 0;
    if (affordable[0]) {
      row.pinned = { ...affordable[0], estimatedCallUsd: Number(perCall(affordable[0]).toFixed(6)) };
    }
  } catch (error) {
    row.gates.endpointsReadable = false;
    row.error = String(error.message ?? error);
  }
  row.qualified = Object.values(row.gates).every(Boolean) && Boolean(row.pinned);
  results.push(row);
}

// Re-rank on the PINNED endpoint's price, not the listing estimate they were selected by:
// the endpoint a candidate would actually be routed to can price differently from the
// model's headline figure, and the pinned number is the one a promotion would quote.
results.sort((a, b) =>
  (a.pinned?.estimatedCallUsd ?? a.estimatedCallUsd) - (b.pinned?.estimatedCallUsd ?? b.estimatedCallUsd));

const qualified = results.filter((r) => r.qualified);
await mkdir(OUT, { recursive: true });
const summary = {
  type: 'qualify-summary',
  stage: 'qualify',
  at: new Date().toISOString(),
  shortlisted: ranked.length,
  zdrCapable: considered.length,
  examined: examined.length,
  qualified: qualified.length,
  gates: { minUptime: MIN_UPTIME, perCallCeilingUsd: PER_CALL_CEILING_USD, trustedQuantizations: [...TRUSTED_QUANTIZATIONS] },
  items: results,
};
const file = path.join(OUT, 'qualify.json');
await writeFile(file, JSON.stringify(summary, null, 2), 'utf8');

console.log(`\n${qualified.length} of ${examined.length} examined candidates qualify:\n`);
console.log('  est/call | open | vision | pinned endpoint | model');
for (const row of results) {
  const failed = Object.entries(row.gates).filter(([, ok]) => !ok).map(([name]) => name);
  const mark = row.qualified ? ' ' : '✗';
  const pin = row.pinned ? `${row.pinned.provider} (${row.pinned.quantization ?? 'n/a'})` : '-';
  console.log(
    `${mark} $${(row.pinned?.estimatedCallUsd ?? row.estimatedCallUsd).toFixed(5)}`
    + ` | ${row.openWeights ? 'yes ' : 'no  '} | ${row.vision ? 'yes   ' : 'no    '} | ${pin} | ${row.route.model}`
    + (failed.length ? `  [fails: ${failed.join(', ')}]` : '')
    + (!failed.length && !row.pinned ? '  [no affordable endpoint]' : ''),
  );
}
console.log(`\nWrote ${file}`);
console.log('\nThese are POLICY-qualified only - nothing here says a model produces good');
console.log('graphics. That is what the paid stages measure, and only the product owner');
console.log('promotes a route (docs/AI_LITE_PROMOTION.md).');
console.log('\nCheapest-first ordering will surface general-purpose and creative-writing');
console.log('models that have no chance on a constrained design-spec task. That is not a');
console.log('bug to filter away here - the gates are POLICY gates, and guessing which');
console.log('models "look serious" is exactly the judgement the benchmark exists to replace.');
console.log('Cut the list by hand before spending on bench:confirm.');
