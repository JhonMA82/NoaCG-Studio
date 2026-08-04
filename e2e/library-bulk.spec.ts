import { test, expect, type Page } from '@playwright/test';

// The Graphics section's organisation layer (acceptance-round asks): multi-select with a
// bulk bar, and FLAT folders — GraphicDoc.folder, one level, additive-optional (no version
// bump), deliberately not the retired packages. Everything here drives the real UI over the
// real model layer; the seeds go through createGraphic like any save.

async function seedLibrary(page: Page, names: string[]): Promise<void> {
  await page.goto('/app#/home/graphics');
  await page.keyboard.press('Escape');
  await page.evaluate(async (list: string[]) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const tpl = variantsFor('lower-third')[0].create({});
    for (const name of list) createGraphic(tpl, { name });
  }, names);
  await page.goto('/app#/home/graphics');
  await expect(page.getByTestId('home-page')).toBeVisible();
}

test('multi-select: checkbox + shift-click range, select all, and one-confirm bulk delete', async ({ page }) => {
  await seedLibrary(page, ['Alpha', 'Bravo', 'Charlie', 'Delta']);
  const boxes = page.getByTestId('select-graphic');
  await expect(boxes).toHaveCount(4);

  // Plain click selects one; shift-click extends over the VISIBLE order.
  await boxes.nth(0).click();
  await expect(page.getByTestId('bulk-bar')).toContainText('1 selected');
  await boxes.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('bulk-bar')).toContainText('3 selected');

  // Select all covers the rest.
  await page.getByTestId('bulk-bar').getByText('Select all 4').click();
  await expect(page.getByTestId('bulk-bar')).toContainText('4 selected');

  // Delete is armed (two-step), then removes every selected row in one write.
  await page.getByTestId('bulk-delete').click();
  await expect(page.getByTestId('bulk-delete')).toContainText('Delete 4?');
  await page.getByTestId('bulk-delete').click();
  await expect(page.getByTestId('select-graphic')).toHaveCount(0);
  await expect(page.getByTestId('bulk-note')).toContainText('Deleted 4');
});

test('flat folders: bulk move, chips filter, unfile, and the folder view becomes a production', async ({ page }) => {
  await seedLibrary(page, ['Strap A', 'Strap B', 'Ticker C']);
  const boxes = page.getByTestId('select-graphic');

  // Move two into a NEW folder from the bulk bar.
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await page.getByTestId('bulk-move-folder').click();
  await page.getByTestId('bulk-new-folder-name').fill('Match Night');
  await page.getByTestId('bulk-new-folder').click();

  // Chips derive from the data; the folder chip filters the list.
  await expect(page.getByTestId('folder-chips')).toBeVisible();
  await page.getByTestId('folder-chip-Match Night').click();
  await expect(page.getByTestId('select-graphic')).toHaveCount(2);

  // The folder survives a reload (additive-optional field, persisted with the record).
  await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('folder-chip-Match Night').click();
  await expect(page.getByTestId('select-graphic')).toHaveCount(2);

  // A folder view is one click from a production carrying exactly its graphics.
  await page.getByTestId('folder-to-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.locator('[data-testid^="pool-"]')).toHaveCount(2);

  // Back on the section: unfiling empties the folder and its chip disappears with the data.
  await page.goto('/app#/home/graphics');
  await page.getByTestId('folder-chip-Match Night').click();
  await page.getByTestId('select-graphic').nth(0).click();
  await page.getByTestId('select-graphic').nth(1).click({ modifiers: ['Shift'] });
  await page.getByTestId('bulk-move-folder').click();
  await page.getByTestId('bulk-unfile').click();
  await expect(page.getByTestId('folder-chips')).toHaveCount(0);
});

test('bulk add to a NEW production pools the selection and lands on its page', async ({ page }) => {
  await seedLibrary(page, ['One', 'Two', 'Three']);
  const boxes = page.getByTestId('select-graphic');
  await boxes.nth(0).click();
  await boxes.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('bulk-bar')).toContainText('3 selected');

  await page.getByTestId('bulk-add-production').click();
  await page.getByTestId('bulk-new-production-name').fill('Evening Bulletin');
  await page.getByTestId('bulk-new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.locator('[data-testid^="pool-"]')).toHaveCount(3);
});
