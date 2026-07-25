import { defineConfig, devices } from '@playwright/test';
import { devPort } from './scripts/dev-port.mjs';

// The catalog-wide quality gate: e2e/catalog/catalog-bench.spec.ts's calibration tripwire benches
// every catalog variant across every category. It's excluded from the default offline suite
// (playwright.config.ts's testIgnore) because it only needs to run when the catalog or the
// runtime bench itself changes - same reasoning as scripts/type-floor.mjs and
// scripts/overflow-sweep.mjs, which are also NOT part of the default merge-gate suite.
//
// Run with `npm run test:e2e:catalog`. Same offline pinning as the default suite (no backend,
// no AI provider) - the tripwire only exercises src/validation/runtimeBench.ts against
// src/templates/catalog.ts, so it needs nothing else from the app.
const base = `http://localhost:${devPort()}`;
export default defineConfig({
  testDir: './e2e/catalog',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/_offline-guard.ts',
  use: {
    baseURL: base,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: base,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_RENDER_API: '1', VITE_ANTHROPIC_API_KEY: '', VITE_AI_MODEL: '', VITE_AI_PROXY_URL: '' },
  },
});
