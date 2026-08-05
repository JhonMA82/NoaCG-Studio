import { test, expect, type Page } from '@playwright/test';

// PRODUCTION DEPENDABILITY (docs/GOALS.md "Student release" step 6): a production must
// survive everything a class throws at it - closing and reopening, a browser refresh
// mid-edit, republishing - and the operator must always be able to answer "what is
// selected, what am I editing, what is live" from the screen. The wire half (real publish,
// real slugs) is backend-gated and lives on the live checklist; what THIS file pins is
// every promise the record and the page make locally.

/** Seed a production with one pooled catalog graphic + its auto-seeded cue, off the UI. */
async function seedProduction(page: Page, name = 'Class Show'): Promise<string> {
  await page.goto('/app');
  return page.evaluate(async (showName) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow } = await import('/src/model/shows.ts');
    const template = variantsFor('lower-third')[0].create({});
    const { doc, error } = createGraphic(template, { name: 'Guest Strap', packageId: null });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    const show = createShowNamed(showName);
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    return show.id;
  }, name);
}

/** The rundown's rows (the cue list's entries - selection, reorder, duplicate live here). */
function cueRows(page: Page) {
  return page.getByTestId('cue-list').locator('.pd-cue');
}

test('the rundown lifecycle persists: rename, duplicate, reorder, values - close, reopen, reload', async ({ page }) => {
  const id = await seedProduction(page);
  await page.goto(`/app#/production/${id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();

  // Rename the seeded cue and give it a value + note.
  await page.getByTestId('cue-label').fill('Anna Andersson');
  await page.getByTestId('cue-note').fill('after the intro');
  await page.getByTestId('cue-field-f0').fill('Anna Andersson');
  // Duplicate it, then rename the copy - two distinct rundown rows.
  await cueRows(page).first().getByTestId('cue-menu').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(cueRows(page)).toHaveCount(2);
  await cueRows(page).nth(1).getByTestId('select-cue').click();
  await page.getByTestId('cue-label').fill('Ben Berg');
  // Reorder: move Ben above Anna.
  await cueRows(page).nth(1).dragTo(cueRows(page).nth(0));
  await expect(cueRows(page).first()).toContainText('Ben Berg');

  // Close (Home) and reopen: everything held.
  await page.getByTestId('production-back').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('open-production').click();
  await expect(cueRows(page)).toHaveCount(2);
  await expect(cueRows(page).first()).toContainText('Ben Berg');

  // A full reload restores the same page with the same rundown (the route carries the id).
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(cueRows(page)).toHaveCount(2);
  await cueRows(page).filter({ hasText: 'Anna Andersson' }).getByTestId('select-cue').click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Anna Andersson');
  await expect(page.getByTestId('cue-note')).toHaveValue('after the intro');
});

test('a refresh mid-edit loses nothing once the draft has settled', async ({ page }) => {
  const id = await seedProduction(page);
  await page.goto(`/app#/production/${id}`);
  await page.getByTestId('cue-field-f0').fill('Typed just before the crash');
  // The cue draft flushes on a 300 ms idle; give it that and refresh like a dropped laptop.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Typed just before the crash');
});

test('operator clarity: the editor says which cue it edits and where those edits go', async ({ page }) => {
  const id = await seedProduction(page);
  await page.goto(`/app#/production/${id}`);

  // The head answers "what am I editing, and what happens to it" without inference
  // (docs/PLAYOUT_DASHBOARD.md §2). Before a take that is the PREVIEW cue.
  const editor = page.getByTestId('cue-editor');
  await expect(editor).toContainText('EDITING PREVIEW CUE');
  await expect(page.getByTestId('cue-label')).toHaveValue('Guest Strap'); // seeded label
  await expect(editor).toContainText('changes air on ⟳ Take');
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  // Update is meaningless until something of this layer is on air, and says so by being dead.
  await expect(page.getByTestId('verb-update')).toBeDisabled();

  // Take: the editor follows the cue onto air and changes what it promises about edits.
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('Guest Strap');
  await expect(editor).toContainText('EDITING ON-AIR CUE');
  await expect(editor).toContainText('changes push live on ✎ Update');
  await expect(page.getByTestId('verb-update')).toBeEnabled();

  // Out clears the layer; the tally returns to honest silence and the editor to a draft.
  await page.getByTestId('verb-out').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await expect(editor).toContainText('EDITING PREVIEW CUE');
});

test('the record survives republish-shaped edits: slugs stay, the unpublished-changes hint tells the truth', async ({ page }) => {
  const id = await seedProduction(page);
  // Simulate a published production (the RPC half is backend-gated; the RECORD contract -
  // slugs survive edits, publishedAt vs updatedAt drives the hint - is local and pinned here).
  await page.evaluate(async (showId) => {
    const { setShowHostedSlug, setShowOutputSlug } = await import('/src/model/shows.ts');
    // Output LAST: it stamps publishedAt, so the record starts CLEAN (published == updated).
    setShowHostedSlug(showId, 'test-hosted-slug');
    setShowOutputSlug(showId, 'test-output-slug');
  }, id);
  await page.goto(`/app#/production/${id}`);

  // Both capability links render from the stored slugs, and a freshly published record
  // carries no divergence warning.
  await page.getByTestId('production-links-toggle').click();
  const links = page.getByTestId('production-links');
  await expect(links).toContainText('/output?production=test-output-slug');
  await expect(links).toContainText('?control=test-hosted-slug');
  await expect(links).not.toContainText('changed after the last publish');

  // An edit AFTER publish: the hint must say the renderer runs an older snapshot...
  await page.getByTestId('cue-label').fill('Edited after publish');
  await page.waitForTimeout(600); // the draft flush stamps updatedAt past publishedAt
  await expect(links).toContainText('changed after the last publish');

  // ...and the slugs survive the edit (URLs are persistent by contract).
  const after = await page.evaluate(async (showId) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.id === showId);
    return { hosted: s?.hostedSlug, output: s?.outputSlug };
  }, id);
  expect(after).toEqual({ hosted: 'test-hosted-slug', output: 'test-output-slug' });
});
