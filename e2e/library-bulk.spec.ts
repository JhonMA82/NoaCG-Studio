import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';

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
  // Accepted is not landed, and the goto below tears the page down (e2e/_durable.ts) — which
  // is why this seed used to come back short by a graphic every other run.
  await settleDurableWrites(page);
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
  // Folders are CARDS in the card grid and CHIPS in the table (re-design/handoff.md §5b/§5c);
  // this walk is the chip half, so it starts by switching the view.
  await page.getByTestId('library-view-list').click();
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

  // The folder survives a reload (additive-optional field, persisted with the record). So
  // does the VIEW — it is a device preference (model/prefs.ts), not session state.
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

test('folder CARDS: name one, drag a graphic into it, filter by it, and rename it', async ({ page }) => {
  await seedLibrary(page, ['Strap A', 'Strap B', 'Ticker C']);

  // A folder is only a name on its graphics, so an empty one has nothing to persist — the
  // dashed card names it and holds it until something lands in it. The band stands with no
  // folders at all, because that card is how the first one is made.
  await expect(page.getByTestId('folder-cards')).toBeVisible();
  await expect(page.locator('[data-testid^="folder-card-"]')).toHaveCount(0);
  await page.getByTestId('new-folder').click();
  await page.getByTestId('new-folder-name').fill('Match Night');
  await page.getByTestId('new-folder-name').press('Enter');
  const card = page.getByTestId('folder-card-Match Night');
  await expect(card).toContainText('0 graphics');

  // Drag a card onto it. ONE DataTransfer carries the gesture, so the row's real dragstart
  // handler is what writes the id the drop then reads — Playwright's dragTo carries no
  // payload, and a hand-written payload would test the drop against a fiction.
  const source = page.locator('.lib-row--grid').first();
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer: dt });
  await card.dispatchEvent('drop', { dataTransfer: dt });
  await expect(card).toContainText('1 graphic');
  await expect(page.getByTestId('bulk-note')).toContainText('Moved 1');

  // The card filters, exactly as the chip does.
  await card.click();
  await expect(page.locator('.lib-row--grid')).toHaveCount(1);
  await expect(page.getByTestId('folder-to-production')).toBeVisible();
  await card.click(); // clicking the active folder clears the filter
  await expect(page.locator('.lib-row--grid')).toHaveCount(3);

  // Renaming a folder rewrites the name on its members — there is no folder record.
  await card.getByTestId('row-menu').click();
  await page.getByTestId('rename-folder').click();
  await page.getByTestId('folder-rename-input').fill('Cup Final');
  await page.getByTestId('folder-rename-input').press('Enter');
  await expect(page.getByTestId('folder-card-Cup Final')).toContainText('1 graphic');
  await page.reload();
  await expect(page.getByTestId('folder-card-Cup Final')).toContainText('1 graphic');
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
