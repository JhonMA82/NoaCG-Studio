import { test, expect, type Page } from '@playwright/test';

// ADVANCED MODE (docs/GOALS.md "Student release" step 4). The DEFAULT studio shows no editor
// doors: the wizard is the full-screen creation surface, a close lands on Home, and a saved
// graphic opens onto its CONTROL page. The Settings toggle restores every door, and a direct
// #/graphic link opens the editor in either mode. Editor-walking specs opt into Advanced via
// the e2e/_create.ts bootstrap; THIS file is the one that must not, because its subject is
// the default experience.

/** Seed one saved library graphic without touching any UI (the control page needs a record). */
async function seedGraphic(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const template = variantsFor('lower-third')[0].create({});
    const { doc, error } = createGraphic(template, { name: 'Seeded lower third', packageId: null });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    return doc.id;
  });
}

test('default studio: fresh visit = full-screen wizard; closing it lands on Home, never the editor', async ({ page }) => {
  await page.goto('/app');
  const wizard = page.getByTestId('creation-wizard');
  await expect(wizard).toBeVisible();
  await expect(page).toHaveURL(/#\/new/);

  // FULL-SCREEN is the contract, not a big modal: the surface fills the viewport.
  const box = (await wizard.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 2);
  expect(box.height).toBeGreaterThanOrEqual(viewport.height - 2);

  // The Blank card's only outcome is the code editor, so default mode does not offer it.
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(page.locator('[data-entry="blank"]')).toHaveCount(0);

  // ✕ close: Home, with no editor door in its topbar.
  await wizard.locator('.gallery-close').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('home-continue-editing')).toHaveCount(0);
});

test('default studio: a saved graphic opens onto its control page, not the editor', async ({ page }) => {
  await page.goto('/app');
  await seedGraphic(page);
  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await expect(page.getByTestId('home-page')).toBeVisible();

  await page.getByTestId('home-nav-graphics').click();
  await page.locator('.pk-graphic', { hasText: 'Seeded lower third' }).getByTestId('open-graphic').click();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
});

test('the Settings toggle restores the editor doors without a reload', async ({ page }) => {
  await page.goto('/app');
  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await expect(page.getByTestId('home-page')).toBeVisible();

  // Settings is reachable from Home WITHOUT an account (the gear is not auth UI).
  await page.getByTestId('home-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('advanced-mode-toggle').check();
  await page.getByTestId('settings').locator('.gallery-close').click();

  // The doors return live: Continue editing in the topbar, Blank in the wizard.
  await expect(page.getByTestId('home-continue-editing')).toBeVisible();
  await page.getByTestId('home-new-project').click();
  await expect(page.locator('[data-entry="blank"]')).toBeVisible();
});

test('a direct #/graphic link opens the editor in the default mode too', async ({ page }) => {
  await page.goto('/app');
  const id = await seedGraphic(page);
  await page.goto(`/app#/graphic/${id}`);
  // The editor shell, holding the linked record: the save status reads Saved.
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(page.locator('.tpl-name')).toHaveText('Seeded lower third');
});
