import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  buildApiRuntime,
  isolatedTestEnvironment,
  projectRoot,
} from './api-runtime-build.mjs';

const ENTRYPOINTS = [
  'api/ai/config.ts',
  'api/ai/credentials.ts',
  'api/ai/generate.ts',
];

async function artifactFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? artifactFiles(filePath) : [filePath];
  }));
  return nested.flat();
}

const smokeSource = String.raw`
  import assert from 'node:assert/strict';

  const [configUrl, credentialsUrl, generateUrl] = process.argv.slice(1);
  const [
    { default: configHandler },
    { default: credentialsHandler },
    { default: generateHandler },
  ] = await Promise.all([
    import(configUrl),
    import(credentialsUrl),
    import(generateUrl),
  ]);

  const configResponse = await configHandler.fetch(
    new Request('https://noacg.test/api/ai/config'),
  );
  assert.equal(configResponse.status, 200);
  const config = await configResponse.json();
  assert.deepEqual(Object.keys(config).sort(), ['keyStorageAvailable', 'providers']);
  assert.equal(config.keyStorageAvailable, true);
  assert.deepEqual(
    config.providers.map((provider) => ({
      id: provider.id,
      userKey: provider.userKey,
      managedKey: provider.managedKey,
      available: provider.available,
      requiresSignIn: provider.requiresSignIn,
    })),
    ['anthropic', 'openai', 'openrouter'].map((id) => ({
      id,
      userKey: false,
      managedKey: true,
      available: true,
      requiresSignIn: false,
    })),
  );
  assert.equal(JSON.stringify(config).includes('provider-key-placeholder'), false);

  const credentialsResponse = await credentialsHandler.fetch(
    new Request('https://noacg.test/api/ai/credentials', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        origin: 'https://noacg.test',
      },
      body: JSON.stringify({
        provider: 'openrouter',
        key: 'user-key-placeholder',
      }),
    }),
  );
  assert.equal(credentialsResponse.status, 200);
  assert.deepEqual(await credentialsResponse.json(), {
    ok: true,
    provider: 'openrouter',
    configured: true,
  });

  const generateResponse = await generateHandler.fetch(
    new Request('https://noacg.test/api/ai/generate'),
  );
  assert.equal(generateResponse.status, 405);
`;

test('Vercel-style JavaScript artifacts load and execute every Creative AI function', async (t) => {
  const runtime = await buildApiRuntime(ENTRYPOINTS);
  t.after(() => runtime.cleanup());

  const files = await artifactFiles(runtime.outputDir);
  assert.equal(
    files.some((filePath) => /\.(?:cts|mts|tsx?)$/i.test(filePath)),
    false,
    'the serverless artifact must not depend on TypeScript source files',
  );

  for (const filePath of files.filter((candidate) => /\.(?:c|m)?js$/i.test(candidate))) {
    const source = await readFile(filePath, 'utf8');
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\s*\()['"][^'"]+\.tsx?['"]/,
      `emitted module specifier still points at TypeScript: ${path.relative(projectRoot, filePath)}`,
    );
  }

  const entryUrls = ENTRYPOINTS.map((entrypoint) => pathToFileURL(
    path.join(runtime.outputDir, entrypoint.replace(/\.ts$/, '.js')),
  ).href);
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', smokeSource, ...entryUrls],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: isolatedTestEnvironment({
        AI_KEY_ENCRYPTION_SECRET: 'test-encryption-secret-with-at-least-32-characters',
        ANTHROPIC_API_KEY: 'provider-key-placeholder-anthropic',
        OPENAI_API_KEY: 'provider-key-placeholder-openai',
        OPENROUTER_API_KEY: 'provider-key-placeholder-openrouter',
      }),
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
