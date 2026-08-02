import { test, expect } from '@playwright/test';
import { createProject } from './_create';

// Cloud playout (docs/CLOUD_PLAYOUT.md): the Productions area + the production page's cue
// rundown + the output renderer's offline honesty. The wire paths (publish, the log, the
// hosted pages, the live renderer) are backend features covered by the maintainer's
// live-verify checklist (§8) — this suite pins everything that runs offline.

test('a production page manages cues: auto-cue on add, edit, duplicate, reorder, preview', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });

  // Add the current graphic to a new production from the editor's control panel.
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill('Evening News');
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await expect(section.locator('.status-ok')).toContainText('is in the production');

  // The panel links straight to the production page.
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();

  // Adding a graphic auto-created its first cue, seeded from the template's defaults (§2).
  const cueRows = page.getByTestId('cue-list').locator('.control-entry');
  await expect(cueRows).toHaveCount(1);
  await expect(cueRows.first()).toContainText('Hairline');

  // Edit the cue: label, note, and a field value.
  await page.getByTestId('cue-label').fill('Anna Andersson');
  await page.getByTestId('cue-note').fill('after the intro');
  await page.getByTestId('cue-field-f0').fill('Anna Andersson');
  await expect(cueRows.first()).toContainText('Anna Andersson');
  await expect(cueRows.first()).toContainText('after the intro');

  // The LOCAL preview settles with the cue's values (debounced 350 ms; the locator retries).
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  await expect(preview.locator('#f0')).toHaveText('Anna Andersson');

  // A second cue on the SAME pool graphic — the point of the cue model (§2).
  await page.getByTestId('add-cue').click();
  await expect(cueRows).toHaveCount(2);
  await page.getByTestId('cue-label').fill('Ben Berg');

  // Reorder: Ben moves above Anna; order is the rundown.
  const rows = page.getByTestId('cue-list').locator('.control-entry');
  await rows.nth(1).getByTitle('Move up').click();
  await expect(rows.nth(0)).toContainText('Ben Berg');
  await expect(rows.nth(1)).toContainText('Anna Andersson');

  // Duplicate keeps the values and appends.
  await rows.nth(0).getByTitle('Duplicate this cue').click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('Ben Berg copy');

  // Offline: the verbs are disabled (no published log to drive) and publishing says why.
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await expect(page.getByTestId('production-publish')).toBeDisabled();
  await expect(page.locator('.control-page-main')).toContainText('runs offline');

  // The cue survives a reload (persisted on the Show record).
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.control-entry')).toHaveCount(3);
});

test('Home Productions creates a production and opens its page; removing a graphic removes its cues', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  // Save to the library so the production page's "add from library" list has a row.
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Morning Show');
  await page.getByTestId('new-production').click();

  // Creating lands straight on the production page.
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('no-cues')).toBeVisible();

  // Add the saved graphic from the library; its auto-cue appears.
  await page.getByTestId('add-graphic-pick').selectOption({ label: 'Anchor L3' });
  await page.getByTestId('add-graphic').click();
  const rows = page.getByTestId('cue-list').locator('.control-entry');
  await expect(rows).toHaveCount(1);

  // Removing the pool graphic takes its cues with it — a cue over nothing cannot air.
  await page.locator('[data-testid^="pool-"]').getByTitle(/Remove this graphic/).click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByTestId('no-cues')).toBeVisible();
});

test('the /output page answers honestly offline and builds a stage from a payload', async ({ page }) => {
  // The offline build: the renderer names its state instead of spinning (never on real air —
  // this state only exists for a wrong URL or a build with no backend).
  await page.goto('/output?production=abc&debug=1');
  await expect(page.locator('body')).toContainText('Output not available');
  await expect(page.locator('body')).toContainText('runs offline');
  await page.goto('/output');
  await expect(page.locator('body')).toContainText('missing its');

  // The STAGE is testable without a backend: build it from a payload in the page context —
  // one sandboxed iframe per graphic, resolution-exact, scaled to the viewport.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { createOutputStage } = await import('/src/output/stage.ts');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const graphic = (key: string) => ({
      key,
      html: `<div id="f0"></div>`,
      css: 'body { margin: 0; }',
      js: 'function update(d){ document.getElementById("f0").textContent = JSON.parse(d).f0 || ""; } function play(){} function stop(){}',
      assets: [],
      resolution: { width: 1920, height: 1080, label: 'Full HD 1080p' },
      fps: 50,
    });
    const stage = createOutputStage(root, {
      v: 1,
      resolution: { width: 1920, height: 1080, label: 'Full HD 1080p' },
      graphics: [graphic('Lower third'), graphic('Ticker')],
      cues: [],
    });
    const iframes = [...root.querySelectorAll('iframe')];
    const out = {
      graphics: stage.graphics,
      count: iframes.length,
      sandboxes: iframes.map((f) => f.getAttribute('sandbox')),
      widths: iframes.map((f) => f.style.width),
      transform: (root.firstElementChild as HTMLElement).style.transform,
      transparent: (root.firstElementChild as HTMLElement).style.background,
    };
    stage.destroy();
    return out;
  });
  expect(result.graphics).toEqual(['Lower third', 'Ticker']);
  expect(result.count).toBe(2);
  // The sandbox posture is load-bearing (published template code must never reach the origin).
  expect(result.sandboxes).toEqual(['allow-scripts', 'allow-scripts']);
  expect(result.widths).toEqual(['1920px', '1920px']);
  expect(result.transform).toContain('scale(');
  expect(result.transparent).toBe('transparent');
});
