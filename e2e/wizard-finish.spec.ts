import { test, expect, type Page } from '@playwright/test';

// The wizard's FINISH step and the standalone export window.
//
// What is pinned here is the branch: everything before Finish configures the graphic, and
// Finish asks the only remaining question — work on it, or ship it. The export door has to
// reach a real package WITHOUT the editor, and it has to leave the graphic somewhere the user
// can find again, or a wizard session ends with a download and nothing else.

/** Walk Entry → Browse → pick a design, then Next through to the Finish step. */
async function toFinishStep(page: Page, variantName = 'Hairline') {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-variant', { hasText: variantName }).first().click();
  // Fields → Style → Animation → Finish. The rail is 1:1 with the step index, so walking it
  // with Next is what a user does and what proves the new step is reachable.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next ›' }).click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
}

test('finish: the step is the last one and offers both doors', async ({ page }) => {
  await toFinishStep(page);

  await expect(page.locator('.wz-dot').last()).toHaveText(/Finish/);
  await expect(page.getByTestId('wz-finish-editor')).toBeVisible();
  await expect(page.getByTestId('wz-finish-export')).toBeVisible();
  // The footer's quiet "Create project" shortcut stands down here — the two cards ARE the
  // actions, and a third button meaning the same as one of them muddies the branch.
  await expect(page.getByRole('button', { name: 'Create project' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next ›' })).toHaveCount(0);

  // The read-back names what was actually chosen, so the branch is taken in full view.
  await expect(page.locator('.wz-finish-summary')).toContainText('Hairline');
  await expect(page.locator('.wz-finish-summary')).toContainText('1920×1080');
});

test('finish: the editor door creates the project and leaves saving to the user', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Studio Guest Strap');
  await page.getByTestId('wz-finish-editor').click();

  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  // The name reaches the template itself, so the topbar and a later Save agree with it.
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Studio Guest Strap');
  // Nothing was written to the library: this door hands over to the editor, where Save is
  // the user's move — exactly as it was before the step existed.
  const saved = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().length;
  });
  expect(saved).toBe(0);
});

test('finish: the export door saves the graphic and opens the export window on Home', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Match Day Strap');
  await page.getByTestId('wz-finish-export').click();

  // The editor is never revealed: the wizard closes onto the library.
  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible();
  await expect(win.locator('h2')).toContainText('Match Day Strap');
  await expect(page).toHaveURL(/#\/home\/graphics/);

  // Every zip target is offered, and the gate is green for a catalog design.
  await expect(win.locator('input[name="export-target"]')).toHaveCount(6);
  await expect(win.locator('.status-ok')).toContainText('valid and ready to export');

  // The graphic survives the session — an export-only creation that vanished would cost the
  // user every wizard choice to get the same package back.
  const names = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().map((g) => g.name);
  });
  expect(names).toEqual(['Match Day Strap']);

  // Closing the window leaves the user in the library, holding what they just made.
  await win.locator('.gallery-close').click();
  await expect(win).toBeHidden();
  await expect(page.locator('.pk-graphic')).toContainText('Match Day Strap');
});

test('finish: the name reaches the exported package folder', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Match Day Strap');
  await page.getByTestId('wz-finish-export').click();
  await expect(page.getByTestId('export-window')).toBeVisible();

  // The point of the name field. For SPX and CasparCG the slug is the TEMPLATE FOLDER inside
  // the zip — what the operator picks from in the playout server. Without it every package
  // shipped under the design's catalog name ('hairline/index.html').
  const files = await page.evaluate(async () => {
    const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
    const { loadGraphics } = await import('/src/model/library.ts');
    const spx = EXPORT_TARGETS.find((t) => t.id === 'spx')!;
    const zip = await spx.build(loadGraphics()[0].template, { sampleData: {} });
    return Object.keys(zip.files);
  });
  expect(files).toContain('match_day_strap/index.html');
  expect(files.some((f) => f.startsWith('hairline/'))).toBe(false);
});

test('export window: a saved graphic exports from Home without opening the editor', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Match Day Strap');
  await page.getByTestId('wz-finish-export').click();
  await page.getByTestId('export-window').locator('.gallery-close').click();
  await expect(page.getByTestId('export-window')).toBeHidden();

  await page.getByTestId('export-graphic').first().click();
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible();
  await expect(win.locator('h2')).toContainText('Match Day Strap');
  await expect(win.locator('.status-ok')).toContainText('valid and ready to export');
  // Still on Home — this door never routes into the editor.
  await expect(page).toHaveURL(/#\/home/);
});

test('export window: navigating away closes it rather than stranding it over another page', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-export').click();
  await expect(page.getByTestId('export-window')).toBeVisible();

  // The window holds a snapshot of ONE graphic; Back is how it would otherwise outlive the
  // surface it was opened from. The wizard's own create→navigate→open hop happens in a single
  // batched tick and must NOT trip this.
  await page.goBack();
  await expect(page.getByTestId('export-window')).toBeHidden();
});

test('style step: size and position collapse behind a disclosure', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-variant').first().click();
  await page.getByRole('button', { name: 'Next ›' }).click(); // Fields
  await page.getByRole('button', { name: 'Next ›' }).click(); // Style

  const more = page.locator('.wz-style-more');
  await expect(more).toBeVisible();
  // A closed <details> is defeated by ANY author rule setting `display` on its children, and
  // both wizard disclosures wrap flex rows — so assert the CONTENT is really collapsed rather
  // than trusting the open attribute. `toBeVisible` cannot see this; the box can.
  const zones = page.locator('.wz-zones');
  expect(await zones.evaluate((el) => el.getBoundingClientRect().height)).toBe(0);

  await more.locator('summary').click();
  expect(await zones.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(0);

  // Choices made in there are named on the collapsed summary, so nothing set is ever hidden
  // without a trace.
  await page.locator('.wz-zone').first().click();
  await expect(more.locator('summary')).toContainText('top left');
});

test('browse step: More filters actually collapses', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();

  const more = page.locator('.wz-browse-more');
  const rows = more.locator('.wz-filter-row');
  // Regression: these rows rendered permanently, disclosure or not — which is exactly the
  // stacked-height problem the disclosure was added to solve.
  expect(await rows.first().evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
  await more.locator('summary').click();
  expect(await rows.first().evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(0);
});

test('browse step: canvas format stays reachable with the mobile filter drawer shut', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();

  // Aspect/Resolution/FPS narrow NOTHING (browseTemplates never reads them), so they must not
  // sit behind a control labelled "Filters" — a phone user going vertical would have to open
  // a filter drawer to make a decision that filters nothing.
  await expect(page.locator('.wz-browse-drawer-btn')).toBeVisible();
  await expect(page.locator('.wz-browse-filters')).toBeHidden();
  const format = page.locator('.wz-browse-format');
  await expect(format).toBeVisible();
  await expect(format.locator('select').first()).toBeVisible();
  await format.locator('select').first().selectOption('9:16');
  await expect(format.locator('select').nth(1)).toContainText('Vertical');
});
