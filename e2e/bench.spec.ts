import { test, expect } from '@playwright/test';
import { toApp, HELPERS, rules } from './_bench';

// The runtime bench (src/validation/runtimeBench.ts) - the deterministic half of the AI
// harness's quality gate. Fast checks only:
//  1. Detection fixtures: hand-built bad templates must trip the exact rule they violate.
//  2. Design adjustments: an AI-adjusted assembly must still pass the bench.
// The exhaustive per-catalog-variant calibration tripwire lives in
// e2e/catalog/catalog-bench.spec.ts (npm run test:e2e:catalog) - it does not run as part of the
// default merge-gate suite because it only needs to run when the catalog or the bench itself
// changes, same as type-floor.mjs/overflow-sweep.mjs/l3-sweep.mjs.

test.describe('runtime bench detection fixtures', () => {
  test('two overlapping text elements trip bench-overlap', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:200px;top:200px;font-size:48px;color:#fff;">Alpha headline text</div>' +
          '<div style="position:absolute;left:210px;top:210px;font-size:48px;color:#fff;">Beta headline text</div>' +
          '</div>'),
        js: FIXTURE_JS,
      });
      return bench(tpl, { houseContract: false });
    })()`);
    expect((res as { ok: boolean }).ok).toBe(false);
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-overlap');
  });

  test('a coincident same-text layer (karaoke wipe) is allowed; a misaligned one is not', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const layered = (offset) => fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:400px;top:800px;font-size:44px;color:#555;">Sing the same line here</div>' +
          '<div style="position:absolute;left:' + (400 + offset) + 'px;top:800px;font-size:44px;color:#fc3;">Sing the same line here</div>' +
          '</div>'),
        js: FIXTURE_JS,
      });
      const coincident = await bench(layered(0), { houseContract: false });
      const misaligned = await bench(layered(30), { houseContract: false });
      return { coincident, misaligned };
    })()`);
    const { coincident, misaligned } = res as {
      coincident: { ok: boolean; errors: { rule: string }[] };
      misaligned: { errors: { rule: string }[] };
    };
    expect(rules(coincident.errors)).not.toContain('bench-overlap');
    expect(coincident.ok).toBe(true);
    expect(rules(misaligned.errors)).toContain('bench-overlap');
  });

  test('text escaping the canvas trips bench-overflow', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:-300px;top:400px;width:500px;font-size:40px;color:#fff;">Half off the canvas</div>' +
          '</div>'),
        js: FIXTURE_JS,
      });
      return bench(tpl, { houseContract: false });
    })()`);
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-overflow');
  });

  test('a fixed box that clips doubled text trips bench-stress (and passes with defaults)', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx">' +
          '<div style="position:absolute;left:200px;top:800px;width:260px;overflow:hidden;white-space:nowrap;">' +
          '<span id="f0" style="font-size:32px;color:#fff;">Short</span>' +
          '</div></div>'),
        js: FIXTURE_JS,
        fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Short' }],
      });
      return bench(tpl, { houseContract: false });
    })()`);
    const errs = (res as { errors: { rule: string }[] }).errors;
    expect(rules(errs)).toContain('bench-stress');
    // The default value fits - the failure must come from the stress pass only.
    expect(rules(errs)).not.toContain('bench-overflow');
    expect(rules(errs)).not.toContain('bench-binding');
  });

  test('a graphic that never hides on stop trips bench-hidden', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx"><div style="position:absolute;left:200px;top:200px;font-size:40px;color:#fff;">Always on air</div></div>'),
        js: FIXTURE_JS.replace("window.stop = function () { document.querySelector('.fx').style.visibility = 'hidden'; };",
                               'window.stop = function () {};'),
      });
      return bench(tpl, { houseContract: false });
    })()`);
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-hidden');
  });

  test('update() that ignores a field trips bench-binding', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx"><span id="f0" style="position:absolute;left:200px;top:200px;font-size:40px;color:#fff;">Static</span></div>'),
        js: FIXTURE_JS.replace('window.update = function (data) {', 'window.update = function (data) { return; '),
        fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Static' }],
      });
      return bench(tpl, { houseContract: false });
    })()`);
    expect(rules((res as { errors: { rule: string }[] }).errors)).toContain('bench-binding');
  });

  test('the house editability contract is enforced by default and waivable for imports', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const tpl = fixture({
        html: doc('<div class="fx"><div style="position:absolute;left:200px;top:200px;font-size:40px;color:#fff;">Plain graphic</div></div>'),
        js: FIXTURE_JS,
      });
      const strict = await bench(tpl);
      const waived = await bench(tpl, { houseContract: false });
      return { strict, waived };
    })()`);
    const { strict, waived } = res as {
      strict: { errors: { rule: string }[] };
      waived: { ok: boolean; errors: { rule: string }[] };
    };
    expect(rules(strict.errors)).toContain('bench-editability');
    expect(rules(waived.errors)).not.toContain('bench-editability');
    expect(waived.ok).toBe(true);
  });
});

test.describe('design adjustments', () => {
  test('an aggressively adjusted grounded assembly still passes the bench', async ({ page }) => {
    test.setTimeout(60_000);
    await toApp(page);
    const res = await page.evaluate(`(async () => { ${HELPERS}
      const { specToTemplate } = await import('/src/ai/designSpec.ts');
      const { applyDesignAdjustments } = await import('/src/ai/designAdjust.ts');
      const spec = {
        fit: 'catalog', reason: 'test', name: 'Adjusted Strap',
        summary: 'test', category: 'lower-third', variantId: 'lt01',
        lines: [{ title: 'Name', sample: 'Ada Lovelace' }, { title: 'Title', sample: 'Chief Analyst' }],
        typography: { scaleRatio: 2.4, headingWeight: 'black', tracking: 'wide', kickerCase: 'caps' },
        density: 'airy', alignment: 'center',
        shape: { corner: 'round', accentForm: 'none', panel: 'none' },
      };
      const assembled = specToTemplate(spec);
      const adjusted = applyDesignAdjustments(assembled.template, spec);
      const res = await bench(adjusted);
      return { ok: res.ok, errors: res.errors, changed: adjusted.css !== assembled.template.css };
    })()`);
    const { ok, errors, changed } = res as { ok: boolean; errors: { rule: string; message: string }[]; changed: boolean };
    expect(changed).toBe(true); // the parameters genuinely reshaped the CSS
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    expect(ok).toBe(true);
  });
});
