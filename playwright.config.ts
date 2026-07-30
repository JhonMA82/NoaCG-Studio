import { defineConfig, devices } from '@playwright/test';
import { devPort } from './scripts/dev-port.mjs';

// End-to-end UI-flow tests. These drive the real dev server, so they verify the app the way a
// user experiences it. Run with `npm run test:e2e`.
// The port comes from scripts/dev-port.mjs (5174 in the main checkout, a stable per-worktree
// port in a linked worktree), so parallel worktrees never reuse each other's servers.
const base = `http://localhost:${devPort()}`;
const isCi = Boolean(process.env.CI);
export default defineConfig({
  testDir: './e2e',
  // The authed community flows live in e2e/configured and run under playwright.live.config.ts (a
  // configured, signed-in backend). The exhaustive catalog calibration tripwire lives in
  // e2e/catalog and runs under playwright.catalog.config.ts (npm run test:e2e:catalog) - it is a
  // catalog-wide quality gate, not a feature-flow test, so it stays out of the default merge-gate
  // suite the same way the authed flows do.
  testIgnore: ['**/configured/**', '**/catalog/**'],
  // 60 s, not Playwright's 30 s default, because this suite's tests are much fatter than that
  // default assumes. Measured over a full run on an otherwise idle box (569 tests, 4 workers):
  // 47 tests take 18 s or more, and nine of them sit between 24 s and 38 s - a wizard walk, a
  // video generation with its live probe, or a Monaco mount is seconds of real work, and the
  // heaviest legitimate test (three complete wizard walks) needs 38 s all by itself. At a 30 s
  // budget that whole band was a coin toss, which is exactly what "a different test in the same
  // file fails each run" looked like. The budget was the false deadline, not the app.
  //
  // This is not a retry in disguise: a test still gets exactly one attempt, and the failure it
  // reports is still the first one. What changed is that the deadline now sits above the work
  // rather than through the middle of it. `expect` stays at 7 s - that one bounds a RENDER, and
  // a wrong assertion should still report in seconds; the few waits that bound a download or a
  // generation instead say so at the call site.
  timeout: 60_000,
  expect: { timeout: 7_000 },
  // The looser budget must not become a place for tests to quietly get slower. Anything past
  // 45 s is named in the report, so growth shows up as a listed slow test rather than as a
  // random red six months later.
  reportSlowTests: { max: 10, threshold: 45_000 },
  // The suite is parallel-safe: every test gets a fresh browser context (isolated storage),
  // the dev server is stateless in the pinned offline mode, and the render specs stub their
  // API per-page. fullyParallel spreads the big spec files (timeline-v2 is ~40 tests) across
  // workers instead of leaving the largest file as the serial critical path.
  // 4 workers is the measured sweet spot on a 16-core dev box. GitHub's smaller runners use
  // one worker each and scale across eight independent shards instead: more than the same
  // aggregate concurrency, without four browsers and one Vite server fighting over a single
  // runner. Sharding is per-TEST, not per-file (verified against run 30539377062: of 97 spec
  // files, exactly the 3 sitting on a shard boundary were split), so no single fat spec file
  // can become the critical path however high the shard count goes.
  fullyParallel: true,
  workers: isCi ? 1 : 4,
  retries: 0,
  // Blob reports make independently sharded runs mergeable. Keep a line reporter too so a
  // failure is readable in the live Actions log without downloading the combined report,
  // and the github reporter so each failing test lands as an annotation on the commit/PR.
  reporter: isCi ? [['line'], ['github'], ['blob']] : [['list']],
  // Refuses to run against an already-running dev server that is not offline-pinned. The
  // webServer.env below only applies when Playwright STARTS the server; reuseExistingServer
  // adopts an existing one as-is, silently skipping every pin. See e2e/_offline-guard.ts.
  globalSetup: './e2e/_offline-guard.ts',
  use: {
    baseURL: base,
    // There are deliberately no retries to disguise flakes, so collect diagnostics on the
    // first failure rather than waiting for a retry that will never happen.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: base,
    reuseExistingServer: true,
    timeout: 60_000,
    // Pin the suite to OFFLINE mode regardless of the developer's local .env (which may hold real
    // Supabase creds for live testing). Env vars set here take priority over .env files in Vite,
    // so these empty values win and the app behaves as the no-backend tool the specs assume.
    // Auth/sync live paths are verified separately (supabase/README.md checklist).
    // VITE_RENDER_API is pinned ON: the render section is part of the offline surface the
    // suite covers (the local executor renders with zero backend — the self-host mode).
    // Render specs stub /api/render/* with page.route, so no real render runs in CI.
    // Every managed AI key is pinned EMPTY so AI-adjacent specs exercise the offline
    // stub providers deterministically. Gateway-backed specs mock /api/ai/generate.
    // NOTE: none of this applies when reuseExistingServer adopts a server someone else
    // already started - that path is guarded by globalSetup above, not by this env block.
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
