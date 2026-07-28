// Synchronize the live OpenRouter and Hugging Face catalogs through the same normalizer the
// product API uses. The resulting snapshot freezes availability, capabilities, pricing, and
// revision metadata for reproducible benchmark runs.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime, projectRoot } from './api-runtime-build.mjs';

const out = path.resolve(
  projectRoot,
  process.argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length)
    ?? 'benchmarks/video/model-catalog.json',
);
const runtime = await buildApiRuntime(['api/_lib/aiModelCatalog.ts']);
try {
  const moduleUrl = pathToFileURL(path.join(runtime.outputDir, 'api/_lib/aiModelCatalog.js')).href;
  const { discoverProviderModels } = await import(moduleUrl);
  const [openrouter, huggingface] = await Promise.all([
    discoverProviderModels('openrouter', process.env.OPENROUTER_API_KEY),
    discoverProviderModels(
      'huggingface',
      process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN,
    ),
  ]);
  const snapshot = {
    schemaVersion: 1,
    syncedAt: new Date().toISOString(),
    sources: {
      openrouter: 'https://openrouter.ai/api/v1/models',
      huggingface: 'https://router.huggingface.co/v1/models',
    },
    providers: { openrouter, huggingface },
  };
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Synced ${openrouter.models.length} OpenRouter and ${huggingface.models.length} Hugging Face models -> ${path.relative(projectRoot, out)}`,
  );
} finally {
  await runtime.cleanup();
}
