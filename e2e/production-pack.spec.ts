import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createProject } from './_create';
import { settleDurableWrites } from './_durable';

// The production PACKAGE round trip (model/productionPack.ts, docs/FIGHT_NIGHT_PACK_PLAN.md §3):
// a whole production as one .noacgpack.json - graphics, layers, cue rundown - exported from the
// export dialog and imported back from Home's Productions grid. Everything here runs offline.

test('a production exports as a package and imports back with its rundown intact', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  // A production with one graphic and one edited cue - the data the round trip must carry.
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Pack Origin');
  await page.getByTestId('new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('add-graphic-pick').selectOption({ label: 'Anchor L3' });
  await page.getByTestId('add-graphic').click();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(1);
  await page.getByTestId('cue-label').fill('Anna Pack');
  await page.getByTestId('cue-note').fill('after the intro');
  await page.getByTestId('cue-field-f0').fill('Anna Andersson');
  await expect(page.getByTestId('cue-list').locator('.pd-cue').first()).toContainText('Anna Pack');

  // Cue edits are a DRAFT that debounces into the Show record - the export reads the
  // RECORD, so wait until the typed value has actually landed before leaving the page.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { loadShows } = await import('/src/model/shows.ts');
        return loadShows().find((s) => s.name === 'Pack Origin')?.cues?.[0]?.values.f0 ?? null;
      }),
    )
    .toBe('Anna Andersson');

  // Back to the grid; the durable store must land the cue edits before the page goes away.
  await settleDurableWrites(page);
  await page.getByTestId('production-back').click();
  await page.getByTestId('home-nav-productions').click();

  // Export the package from the export dialog.
  await page.getByTestId('export-production-row').click();
  await expect(page.getByTestId('production-export-dialog')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('prod-export-pack').click(),
  ]);
  expect(download.suggestedFilename()).toBe('pack-origin.noacgpack.json');
  const packPath = await download.path();
  const packText = readFileSync(packPath, 'utf8');
  const pack = JSON.parse(packText);
  expect(pack.format).toBe('noacg-production-pack');
  expect(pack.v).toBe(1);
  expect(pack.graphics).toHaveLength(1);
  expect(pack.cues).toHaveLength(1);
  expect(pack.cues[0].values.f0).toBe('Anna Andersson');
  await page.getByRole('button', { name: 'Close' }).click();

  // Import it back. The name collides with the original, so the copy suffixes.
  await page.getByTestId('import-production-file').setInputFiles({
    name: 'pack-origin.noacgpack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(packText),
  });
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(1);
  await expect(page.getByTestId('cue-list').locator('.pd-cue').first()).toContainText('Anna Pack');

  const imported = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === 'Pack Origin 2');
    if (!show) return null;
    return {
      graphics: show.graphics.length,
      graphicName: show.graphics[0]?.name,
      linked: Boolean(show.graphics[0]?.graphicId),
      cueLabel: show.cues?.[0]?.label,
      cueNote: show.cues?.[0]?.note,
      f0: show.cues?.[0]?.values.f0,
    };
  });
  expect(imported).toEqual({
    graphics: 1,
    graphicName: 'Anchor L3',
    linked: true, // the imported graphic landed as an editable LIBRARY record
    cueLabel: 'Anna Pack',
    cueNote: 'after the intro',
    f0: 'Anna Andersson',
  });
});

test('the bundled Fight Night sample imports whole: 12 graphics through the validation gate, 19 cues', async ({ page }) => {
  // This is the pack's real gate: import runs publishGate (validateTemplate + bench)
  // over every graphic in public/packs/fight-night.noacgpack.json - a graphic that
  // fails validation refuses the whole import, so this test failing names the culprit.
  await page.goto('/app#/home/productions');
  await page.getByTestId('import-sample-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(19);

  const imported = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === 'Fight Night');
    if (!show) return null;
    return {
      graphics: show.graphics.length,
      layers: show.graphics.map((g) => g.layer),
      firstCue: show.cues?.[0]?.label,
      bugCues: (show.cues ?? []).filter((c) => c.label.includes('bug up')).length,
    };
  });
  expect(imported).toEqual({
    graphics: 12,
    layers: [5, 6, 7, 8, 9, 10, 12, 14, 15, 16, 17, 19],
    firstCue: 'Opening slate',
    bugCues: 2, // two cues over ONE fight-bug pool graphic - the cue model
  });
});

test('a broken or too-new package is refused with a readable message', async ({ page }) => {
  await page.goto('/app#/home/productions');
  await expect(page.getByTestId('import-production')).toBeVisible();

  // Not JSON at all.
  await page.getByTestId('import-production-file').setInputFiles({
    name: 'not-a-pack.noacgpack.json',
    mimeType: 'application/json',
    buffer: Buffer.from('hello'),
  });
  await expect(page.getByTestId('import-production-error')).toContainText('Not a readable file');

  // A pack from a NEWER format version refuses honestly instead of guessing (rule 6).
  await page.getByTestId('import-production-file').setInputFiles({
    name: 'future.noacgpack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'noacg-production-pack', v: 99, name: 'X', graphics: [] })),
  });
  await expect(page.getByTestId('import-production-error')).toContainText('newer NoaCG');
});
