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
  // Same memory-bound reasoning as playwright.config.ts, and this is the gate that needs it
  // most: it benches every catalog variant, so it runs longest and holds the machine hostage
  // for the whole of it. Overridable with E2E_WORKERS on a box with more RAM.
  workers: process.env.CI ? 4 : Number(process.env.E2E_WORKERS) || 3,
  retries: 0,
  reporter: [['list']],
  // Also the cross-checkout queue: two suites on one 16 GB laptop exhaust it rather than
  // sharing it, and this one overlapping anything else is the worst case of that.
  globalSetup: './e2e/_offline-guard.ts',
  use: {
    baseURL: base,
    // `retries: 0` above means on-first-retry never fires, so this costs nothing either way -
    // it is left as the honest description of when a trace would be wanted.
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: base,
    reuseExistingServer: true,
    timeout: 60_000,
    // The SAME offline pin as playwright.config.ts, including the managed AI keys - the
    // offline guard reads the server's real env, so a checkout with a local .env fails the
    // guard under any shorter list (found the day a worktree first carried one).
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_RENDER_API: '1',
      VITE_AI_PROVIDER: '',
      VITE_AI_MODEL: '',
      VITE_AI_PROXY_URL: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      OPENROUTER_API_KEY: '',
      HUGGINGFACE_API_KEY: '',
      HF_TOKEN: '',
      AI_KEY_ENCRYPTION_SECRET: '',
    },
  },
});
