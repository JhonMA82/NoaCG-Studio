import { test, expect } from '@playwright/test';

// The downloadable graphics pack (src/packs/graphicsPack.ts): a shipped .noacgpack.json
// installs from the Productions section as one ready production — graphics pooled, layers
// set, the prepared cue rundown seeded — and a non-pack file is refused with a reason.
// The Uutishuone pack (public/packs/uutishuone.noacgpack.json) is both the shipped product
// and this spec's fixture, so the spec also pins that the pack itself stays importable.

test('the shipped Uutishuone pack installs as a ready production', async ({ page }) => {
  await page.goto('/app#/home/productions');

  // The import card lists the shipped pack (public/packs/index.json).
  const card = page.getByTestId('import-pack-card');
  await expect(card).toBeVisible();
  const install = card.getByTestId('install-pack-uutishuone.noacgpack.json');
  await expect(install).toBeVisible();
  await install.click();

  // Install parses, validates every graphic through the export gate, saves the set and
  // lands on the production page — a failure would surface on the card instead.
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('production-page')).toContainText('Uutishuone');

  // The prepared rundown arrived whole: 1 opener + 3 name straps + 3 headlines + 1 ticker
  // + 1 bug + 1 endboard = 10 cues.
  const cueRows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cueRows).toHaveCount(10);
  await expect(page.getByTestId('cue-list')).toContainText('Avaus — UUTISET');
  await expect(page.getByTestId('cue-list')).toContainText('Anna Virtanen — toimittaja');
  await expect(page.getByTestId('cue-list')).toContainText('Uutisnauha');
  await expect(page.getByTestId('cue-list')).toContainText('Lopetus');

  // The ticker cue's headline list is ONE textarea (the repeating-data rule) carrying the
  // pack's Finnish sample items, and its label field holds the label block's word.
  await cueRows.filter({ hasText: 'Uutisnauha' }).click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue(/Hallitus neuvottelee budjetista/);
  await expect(page.getByTestId('cue-field-f0')).toHaveValue(/Kirjastojen lainausmäärät/);
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('UUTISET');

  // The local cue preview renders the ticker's label block from the cue's values.
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  await expect(preview.locator('#f1')).toHaveText('UUTISET');

  // Editing the headline list stays a plain field edit — type, and the cue holds it.
  await page.getByTestId('cue-field-f1').fill('SUORA');
  await expect(preview.locator('#f1')).toHaveText('SUORA');
});

test('a JSON file that is not a pack is refused with a reason', async ({ page }) => {
  await page.goto('/app#/home/productions');
  const card = page.getByTestId('import-pack-card');
  await card.getByTestId('import-pack-file').setInputFiles({
    name: 'not-a-pack.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"just":"json"}'),
  });
  await expect(card.locator('.status-bad')).toContainText('not a NoaCG graphics pack');
  // Nothing was created — the section still shows its empty state.
  await expect(page.getByTestId('no-productions')).toBeVisible();
});
