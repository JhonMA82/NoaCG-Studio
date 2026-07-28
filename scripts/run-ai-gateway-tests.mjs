import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  buildApiRuntime,
  isolatedTestEnvironment,
  projectRoot,
} from './api-runtime-build.mjs';

const runtime = await buildApiRuntime([
  'api/_lib/aiGateway.test.ts',
  'api/_lib/aiModelCatalog.test.ts',
  'api/_lib/aiLite.test.ts',
]);

try {
  const testFiles = [
    path.join(runtime.outputDir, 'api/_lib/aiGateway.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiModelCatalog.test.js'),
    path.join(runtime.outputDir, 'api/_lib/aiLite.test.js'),
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
