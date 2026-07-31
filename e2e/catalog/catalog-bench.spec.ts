import { test, expect } from '@playwright/test';
import { toApp, HELPERS } from '../_bench';

// The CALIBRATION TRIPWIRE: every catalog variant's create() output must pass its own runtime
// bench (src/validation/runtimeBench.ts) - the house catalog is the ground truth the thresholds
// are tuned against, so a bench change that fails the catalog is a bench bug, not a catalog bug.
// This is a CATALOG-WIDE quality gate, not a feature-flow test: it does not run as part of the
// default `npm run test:e2e` merge-gate suite (excluded via playwright.config.ts's testIgnore,
// same as e2e/configured/). Run it explicitly with `npm run test:e2e:catalog` after any change to
// the catalog itself or to the bench, same as `node scripts/type-floor.mjs` and
// `node scripts/overflow-sweep.mjs` - see AGENTS.md's "Catalog quality gates" section.

const CATEGORIES = [
  'lower-third',
  'info-card',
  'end-credits',
  'ticker',
  'starting-soon',
  'game-timer',
  'scoreboard',
  'corner-bug',
  'infographic',
  'versus',
  'quiz',
  'frame',
  'transition',
  'alert',
  'public-info',
  'esports-score',
  'matchup',
  'results-board',
  'reveal',
  'poll',
  'audience',
  'stream-notification',
] as const;

test.describe('catalog calibration tripwire', () => {
  for (const category of CATEGORIES) {
    test(`every ${category} variant passes the bench`, async ({ page }) => {
      test.setTimeout(120_000);
      await toApp(page);
      const rows = await page.evaluate(`(async (category) => { ${HELPERS}
        const { CATALOG } = await import('/src/templates/catalog.ts');
        const out = [];
        for (const v of CATALOG[category] || []) {
          const res = await bench(v.create());
          out.push({ id: v.id, ok: res.ok, errors: res.errors.map((e) => e.rule + ': ' + e.message) });
        }
        return out;
      })(${JSON.stringify(category)})`);
      const failed = (rows as { id: string; ok: boolean; errors: string[] }[]).filter((r) => !r.ok);
      expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    });
  }
});
