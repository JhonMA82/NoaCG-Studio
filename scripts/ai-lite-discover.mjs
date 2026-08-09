// Stage 1 of the NoaCG Lite model DISCOVERY FUNNEL (docs/AI_PLATFORM_PLAN.md §8):
// narrow the whole live OpenRouter listing down to the models that could legally serve a
// free Lite route at all.
//
//   npm run bench:discover [-- out-dir]
//
// SPENDS NO TOKENS. This reads the public Models listing only - it is a LISTING, never an
// approval (docs/AI_TASK_REGISTRY.md). Nothing here promotes anything: the output is a
// candidate shortlist for bench:qualify, and only the product owner promotes a route.
//
// The normalizer is imported from api/_lib/aiModelDiscovery.ts rather than reimplemented,
// so the funnel and GET /api/ai/models can never disagree about what a listing means.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime } from './api-runtime-build.mjs';
import { outDir } from './out-dir.mjs';

const OUT = path.resolve(outDir(process.argv[2], './lite-bench-out', 'Usage: node scripts/ai-lite-discover.mjs [out-dir]'));

// The per-million ceilings are the FUNDED-ROUTE gate itself (api/_lib/aiModelCatalog.ts),
// not a second opinion about it: a candidate the registry would refuse to fund has no
// business appearing on a shortlist. Lite's own per-call ceiling of $0.007 comes from
// docs/AI_LITE_PROMOTION.md; a Lite call measures roughly 2k in / 1.2k out.
const EST_INPUT_TOKENS = 2000;
const EST_OUTPUT_TOKENS = 1200;
const PER_CALL_CEILING_USD = 0.007;

const runtime = await buildApiRuntime(['api/_lib/aiModelDiscovery.ts', 'api/_lib/aiModelCatalog.ts']);
try {
  const load = (rel) => import(pathToFileURL(path.join(runtime.outputDir, rel)).href);
  const discovery = await load('api/_lib/aiModelDiscovery.js');
  const catalog = await load('api/_lib/aiModelCatalog.js');

  const key = (process.env.AI_GATEWAY_API_KEY ?? '').trim() || undefined;
  const listing = await discovery.discoverProviderModels('vercel', key);
  const approved = new Set(
    catalog.APPROVED_MODEL_CATALOG.map((entry) => catalog.modelRouteKey(entry.route)),
  );

  const estimatedCall = (model) =>
    ((model.inputPerMillion ?? 0) * EST_INPUT_TOKENS
      + (model.outputPerMillion ?? 0) * EST_OUTPUT_TOKENS) / 1_000_000;

  const rejected = new Map();
  const reject = (reason) => { rejected.set(reason, (rejected.get(reason) ?? 0) + 1); };

  const candidates = [];
  for (const model of listing.models) {
    if (!model.available) { reject('unavailable'); continue; }
    if (!model.supportsStructuredOutput) { reject('no structured output'); continue; }
    // A free route must be PRICED - an unpriced listing cannot be reserved against, and
    // Lite reserves worst-case cost up front.
    if (model.inputPerMillion === null || model.outputPerMillion === null) { reject('unpriced'); continue; }
    // ':free' variants are rate-limited promotional routes, not something a product can
    // build a quota on. They are excluded deliberately, not overlooked.
    if (model.free) { reject('promotional :free route'); continue; }
    if (!catalog.fundedRoutePrice({
      inputPerMillion: model.inputPerMillion,
      outputPerMillion: model.outputPerMillion,
    })) { reject('over the funded-route price ceiling'); continue; }
    const perCall = estimatedCall(model);
    if (perCall > PER_CALL_CEILING_USD) { reject('estimated call over $0.007'); continue; }
    candidates.push({
      route: { provider: 'vercel', model: model.id },
      name: model.name,
      openWeights: model.openWeight,
      alreadyApproved: approved.has(`vercel:${model.id}`),
      vision: model.inputModalities.includes('image'),
      contextLength: model.contextLength,
      maxOutputTokens: model.maxOutputTokens,
      supportsSeed: model.supportsSeed,
      price: { inputPerMillion: model.inputPerMillion, outputPerMillion: model.outputPerMillion },
      estimatedCallUsd: Number(perCall.toFixed(6)),
      revision: model.revision,
    });
  }

  // Cheapest first - cost per accepted result is the top-ranked promotion criterion.
  candidates.sort((a, b) => a.estimatedCallUsd - b.estimatedCallUsd);

  await mkdir(OUT, { recursive: true });
  const summary = {
    type: 'discover-summary',
    stage: 'discover',
    syncedAt: listing.syncedAt,
    listed: listing.models.length,
    candidates: candidates.length,
    openWeightCandidates: candidates.filter((c) => c.openWeights).length,
    visionCandidates: candidates.filter((c) => c.vision).length,
    ceilings: {
      fundedRoute: catalog.FUNDED_ROUTE_PRICE_CEILING,
      perCallUsd: PER_CALL_CEILING_USD,
      estimatedTokens: { input: EST_INPUT_TOKENS, output: EST_OUTPUT_TOKENS },
    },
    rejected: Object.fromEntries([...rejected].sort((a, b) => b[1] - a[1])),
    items: candidates,
  };
  const file = path.join(OUT, 'discover.json');
  await writeFile(file, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`Listed ${listing.models.length} structured-output OpenRouter models.`);
  console.log(`Rejected: ${[...rejected].map(([why, n]) => `${why} ×${n}`).join(', ') || 'none'}`);
  console.log(`\n${candidates.length} candidate(s) inside the Lite cost envelope ` +
    `(${summary.openWeightCandidates} open-weight, ${summary.visionCandidates} vision):\n`);
  console.log('  est/call | in/out per M | open | vision | model');
  for (const c of candidates.slice(0, 40)) {
    console.log(
      `  $${c.estimatedCallUsd.toFixed(5)} | ${c.price.inputPerMillion.toFixed(2)}/${c.price.outputPerMillion.toFixed(2)}`
      + ` | ${c.openWeights ? 'yes ' : 'no  '} | ${c.vision ? 'yes   ' : 'no    '} | ${c.route.model}`
      + `${c.alreadyApproved ? '  [already approved]' : ''}`,
    );
  }
  if (candidates.length > 40) console.log(`  … and ${candidates.length - 40} more (see discover.json)`);
  console.log(`\nWrote ${file}`);
  console.log('Next: npm run bench:qualify -- ' + OUT + '  (still free - checks ZDR, endpoints, pinning)');
} finally {
  await runtime.cleanup();
}

