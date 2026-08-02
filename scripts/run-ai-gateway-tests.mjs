import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  buildApiRuntime,
  isolatedTestEnvironment,
  projectRoot,
} from './api-runtime-build.mjs';

const runtime = await buildApiRuntime([
  'api/_lib/aiGateway.test.ts',
  'api/_lib/aiGenerate.test.ts',
  'api/_lib/aiModelDiscovery.test.ts',
  'api/_lib/aiTaskRegistry.test.ts',
  'api/_lib/aiBenchPreflight.test.ts',
  'api/_lib/aiLite.test.ts',
  'api/_lib/funnelEvents.test.ts',
  'api/_lib/feedbackStore.test.ts',
  'api/_lib/entitlements.test.ts',
  'api/_lib/adminAuth.test.ts',
  'api/_lib/templateVisibility.test.ts',
  'api/_lib/admin/periods.test.ts',
  'api/_lib/admin/eligibility.test.ts',
  'api/_lib/admin/usage.test.ts',
]);

try {
  const testFiles = [
    path.join(runtime.outputDir, 'api/_lib/aiGateway.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiGenerate.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiModelDiscovery.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiTaskRegistry.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiBenchPreflight.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiLite.test.js'),
    path.join(runtime.outputDir, 'api/_lib/funnelEvents.test.js'),
    path.join(runtime.outputDir, 'api/_lib/feedbackStore.test.js'),
    path.join(runtime.outputDir, 'api/_lib/entitlements.test.js'),
    path.join(runtime.outputDir, 'api/_lib/adminAuth.test.js'),
    path.join(runtime.outputDir, 'api/_lib/templateVisibility.test.js'),
    path.join(runtime.outputDir, 'api/_lib/admin/periods.test.js'),
    path.join(runtime.outputDir, 'api/_lib/admin/eligibility.test.js'),
    path.join(runtime.outputDir, 'api/_lib/admin/usage.test.js'),
  ];
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: projectRoot,
    env: isolatedTestEnvironment(),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await runtime.cleanup();
}
