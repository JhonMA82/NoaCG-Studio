import { test, expect, type Page } from '@playwright/test';

// WHAT HAPPENS WHEN BROWSER STORAGE IS FULL.
//
// The acceptance pass of 2026-08-06 hit this as a total blocker: after an evening of creating
// graphics, "add to production" silently opened the canvas instead. The cause was a swallowed
// error — `saveGraphicAs` returned {ok:false}, the handler returned early, and by then
// `applyDraftProject` had already replaced the route with the editor's, which closes the wizard.
// The user was left standing in the canvas with no production, no saved graphic and nothing
// said.
//
// So these specs exhaust the REAL quota rather than stubbing `setItem`: the failure under test
// is the browser refusing a write, and a stub would also have to be injected into the preview
// iframe to be faithful. What is pinned is not the wording — it is that a failed write is always
// ANNOUNCED, and that the announcement says where the work went.

/**
 * Fill localStorage until the browser refuses even a tiny write.
 *
 * The step-down is not decoration and the first version of this helper was wrong without it: a
 * single chunk size stops at the first failure, which can leave nearly a whole chunk of
 * HEADROOM behind — and a lower third serialises to well under 256 KB, so the save under test
 * simply succeeded and the spec failed against working code. Filling to the last few bytes is
 * what makes "storage is full" mean the same thing here as it does after an evening of saving.
 */
async function fillStorage(page: Page): Promise<void> {
  const remaining = await page.evaluate(() => {
    let written = 0;
    for (const size of [256 * 1024, 32 * 1024, 4 * 1024, 512, 64]) {
      const chunk = 'x'.repeat(size);
      for (let i = 0; i < 400; i += 1) {
        try {
          localStorage.setItem(`__e2e-fill-${size}-${i}`, chunk);
          written += size;
        } catch {
          break;
        }
      }
    }
    if (written === 0) throw new Error('localStorage refused the very first write — nothing to measure');
    // How much is still writable: 0 means the next real save has nowhere to go.
    try {
      localStorage.setItem('__e2e-probe', 'x'.repeat(4096));
      localStorage.removeItem('__e2e-probe');
      return 4096;
    } catch {
      return 0;
    }
  });
  expect(remaining, 'the fill left room for a real save — the spec would pass vacuously').toBe(0);
}

/** Walk Entry → Browse → pick a design → Finish, exactly as wizard-finish.spec.ts does. */
async function toFinishStep(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-variant', { hasText: 'Hairline' }).first().click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next ›' }).click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
}

test('a full quota never parks the user in the canvas silently: add-to-production says so', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Clean Clock');
  await page.getByTestId('wz-finish-production-name').fill('Friday Show');

  // Fill AFTER the wizard has done its own writes, so the failure lands on the create itself —
  // which is exactly the shape of the reported bug (an evening's worth of graphics already
  // saved, the next one refused).
  await fillStorage(page);

  await page.getByTestId('wz-finish-production-go').click();

  // THE FIX: the failure is announced, by name, with what the storage layer actually reported.
  const alert = page.getByTestId('storage-alert');
  await expect(alert).toBeVisible();
  await expect(page.getByTestId('storage-alert-action')).toContainText('Clean Clock');
  await expect(page.getByTestId('storage-alert-error')).toContainText(/storage is full/i);
  // And it says where the work is, so "it opened the canvas" is a described outcome rather than
  // an unexplained one.
  await expect(alert).toContainText(/still open/i);

  // It also names what is taking up the room — a "storage is full" message with no candidates
  // leaves the user nothing to do.
  await expect(page.getByTestId('storage-alert-total')).toContainText(/MB|KB/);

  // Nothing half-built was left behind: no production was created for a graphic that never saved.
  const shows = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().map((s) => s.name);
  });
  expect(shows).not.toContain('Friday Show');
});

test('a full quota never parks the user in the canvas silently: the export door says so too', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Guest Strap');
  await fillStorage(page);

  await page.getByTestId('wz-finish-export').click();

  // The export door deliberately still opens (the files are the point and they need no storage),
  // but the failed save is no longer invisible behind it.
  await expect(page.getByTestId('storage-alert')).toBeVisible();
  await expect(page.getByTestId('storage-alert-action')).toContainText('Guest Strap');
});

test('a full quota never parks the user in the canvas silently: Home’s + Production says so', async ({ page }) => {
  // Save a graphic the ordinary way first, then fill the quota and try to pool it from Home.
  await page.goto('/app');
  await page.evaluate(async () => {
    const { createGraphic } = await import('/src/model/library.ts');
    const { createDefaultTemplate } = await import('/src/model/defaultTemplate.ts');
    createGraphic(createDefaultTemplate(), { name: 'Match Board' });
    window.location.hash = '#/home/graphics';
  });
  const row = page.locator('.lib-row', { hasText: 'Match Board' }).first();
  await expect(row).toBeVisible();

  await fillStorage(page);

  await row.getByTestId('add-to-production').click();
  await page.getByTestId('add-to-new-production-name').fill('Saturday Show');
  await page.getByTestId('add-to-new-production').click();

  // Before this branch the button simply did nothing — the owner's "I can't add anything to
  // even ongoing productions".
  await expect(page.getByTestId('storage-alert')).toBeVisible();
  await expect(page.getByTestId('storage-alert-error')).toContainText(/storage is full/i);
});
