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
  'api/_lib/aiLite.test.ts',
  'api/_lib/entitlements.test.ts',
]);

try {
  const testFiles = [
    path.join(runtime.outputDir, 'api/_lib/aiGateway.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiGenerate.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiModelDiscovery.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiTaskRegistry.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiLite.test.js'),
    path.join(runtime.outputDir, 'api/_lib/entitlements.test.js'),
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
