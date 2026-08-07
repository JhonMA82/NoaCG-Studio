import { test, expect, type Page } from '@playwright/test';
import { enableAdvancedMode, finishIntoEditor, startNewProject } from './_create';

// The Browse step's faceted discovery (docs/TEMPLATE_TAXONOMY_PROPOSAL.md §12-13): category
// tiles + field buckets + style chips narrow the grid (facets AND together), programme
// selection RANKS into "Best for" / "Also works" without hiding anything, search reaches
// templates through aliases, and the zero-result state offers its own escape hatches.
// Counts derive from the live metadata so the assertions track catalog growth; the
// RELATIONSHIPS are what this spec guards, never absolute totals.

async function toBrowseStep(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await expect(page.locator('.wz-browse-search')).toBeVisible();
}

async function catalogCounts(page: Page) {
  return page.evaluate(async () => {
    const { allTemplateMeta } = await import('/src/templates/templateMeta.ts');
    const all = allTemplateMeta().map(({ meta }) => meta);
    const lt = all.filter((m) => m.category === 'lower-third');
    return {
      total: all.length,
      lowerThirds: lt.length,
      ltGlass: lt.filter((m) => m.styleFamily === 'glass').length,
      ltGlassLogo: lt.filter((m) => m.styleFamily === 'glass' && m.capabilities.includes('logo-upload')).length,
      repeating: all.filter((m) => m.fieldCounts.repeating > 0).length,
    };
  });
}

test('category, style, and capability facets AND together; clear-all restores the catalog', async ({ page }) => {
  await toBrowseStep(page);
  const n = await catalogCounts(page);
  const cards = page.locator('.wz-variant');
  await expect(cards).toHaveCount(n.total);

  // Category tile narrows to that category's templates.
  await page.locator('.wz-browse-tiles .wz-cat', { hasText: 'Lower thirds' }).click();
  await expect(cards).toHaveCount(n.lowerThirds);

  // Style: the glass family keeps exactly the glass designs.
  await page.locator('.wz-filter', { hasText: 'Elegant & glass' }).click();
  await expect(cards).toHaveCount(n.ltGlass);

  // Capabilities live behind the Filters disclosure and are STRICT (has logo upload = has it).
  // ONE disclosure now, at every width — the specialist facets used to sit in a `More filters`
  // details nested inside a phone-only drawer.
  await page.locator('.wz-browse-drawer-btn').click();
  await page.locator('.wz-browse-more .wz-filter', { hasText: 'Logo upload' }).click();
  await expect(cards).toHaveCount(n.ltGlassLogo);
  await expect(page.locator('.wz-variant', { hasText: 'Frosted Card' })).toBeVisible();

  // Clear all brings the whole catalog back.
  await page.locator('.wz-filter-clear').click();
  await expect(cards).toHaveCount(n.total);

  // The repeating bucket keeps only templates with a repeating list field.
  await page.getByRole('button', { name: '↻ Repeating' }).click();
  await expect(cards).toHaveCount(n.repeating);
});

test('programme selection ranks into Best for / Also works without hiding anything', async ({ page }) => {
  await toBrowseStep(page);
  const n = await catalogCounts(page);
  // The programme selects live behind the Filters disclosure, collapsed by default at every
  // width now — only search, the type strip and the style chips lead the step.
  await page.locator('.wz-browse-drawer-btn').click();
  await page.locator('.wz-browse-programme select').last().selectOption('church-service');
  // Ranking, never exclusion: every template still shows, split across the two sections.
  await expect(page.locator('.wz-browse-section', { hasText: 'Best for church service' })).toBeVisible();
  await expect(page.locator('.wz-browse-section', { hasText: 'Also works' })).toBeVisible();
  await expect(page.locator('.wz-variant')).toHaveCount(n.total);
});

test('search reaches templates through aliases and field semantics', async ({ page }) => {
  await toBrowseStep(page);
  const n = await catalogCounts(page);
  // "name graphic" is an alias for lower thirds — no template carries those words.
  await page.locator('.wz-browse-search').fill('name graphic');
  await expect(page.locator('.wz-variant')).toHaveCount(n.lowerThirds);
  await page.locator('.wz-browse-search').fill('countdown');
  // Countdown fans out across timers AND holding screens (the alias set).
  await expect(page.locator('.wz-variant', { hasText: 'Quiet Hold' })).toBeVisible();
  await expect(page.locator('.wz-variant', { hasText: 'Clean Clock' })).toBeVisible();
});

test('an impossible combination shows the honest empty state with its escape hatches', async ({ page }) => {
  await toBrowseStep(page);
  // A lower third is a name-and-title strap; it structurally never carries a repeating list
  // field (that belongs to tickers, credits and agendas). This pairing therefore matches
  // nothing AND stays empty however the catalog grows — unlike the old "Bold & on-air + logo
  // slot", which a new noacg design (lt53 House Board, lt54 House Ident) filled exactly.
  await page.locator('.wz-browse-tiles .wz-cat', { hasText: 'Lower thirds' }).click();
  // The field-count buckets are behind the Filters disclosure now.
  await page.locator('.wz-browse-drawer-btn').click();
  await page.getByRole('button', { name: '↻ Repeating' }).click();
  await expect(page.locator('.wz-variant')).toHaveCount(0);
  await expect(page.locator('.wz-browse-empty')).toBeVisible();
  // The escape hatches: drop the most limiting filter, or hand the brief to Create with AI.
  await expect(page.locator('.wz-browse-empty button', { hasText: 'Create it with AI' })).toBeVisible();
  await page.locator('.wz-browse-empty button', { hasText: 'Remove the most limiting filter' }).click();
  await expect(page.locator('.wz-variant').first()).toBeVisible();
});

test('on a phone the facets collapse into the filter drawer; results stay one flick away', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await toBrowseStep(page);
  // Closed by default: the controls are hidden, the toggle and the results are not.
  const drawer = page.locator('.wz-browse-filters');
  const toggle = page.locator('.wz-browse-drawer-btn');
  await expect(toggle).toBeVisible();
  await expect(drawer).toBeHidden();
  await expect(page.locator('.wz-browse-search')).toBeVisible();
  await expect(page.locator('.wz-variant').first()).toBeVisible();
  // Open it, filter by a category tile — the tile is OUTSIDE the drawer now, because "what
  // kind of graphic" is the step's first question — then close: the filter holds and the
  // badge counts it.
  await toggle.click();
  await expect(drawer).toBeVisible();
  await page.locator('.wz-browse-tiles .wz-cat', { hasText: 'Lower thirds' }).click();
  await toggle.click();
  await expect(drawer).toBeHidden();
  await expect(toggle).toContainText('(1)');
  const n = await catalogCounts(page);
  await expect(page.locator('.wz-variant')).toHaveCount(n.lowerThirds);
});

test('a card\'s ⓘ opens its full detail without picking the template', async ({ page }) => {
  await toBrowseStep(page);
  await page.locator('.wz-browse-tiles .wz-cat', { hasText: 'Scoreboards' }).click();
  const cell = page.locator('.wz-variant-cell').first();
  await cell.locator('.wz-variant-info').click();
  const detail = cell.locator('.wz-variant-detail');
  // Everything the card's strict info budget leaves out (proposal §12.3).
  await expect(detail).toContainText('Editable fields');
  await expect(detail).toContainText('f0');
  await expect(detail).toContainText('Score controls');
  await expect(detail).toContainText('Sports broadcast');
  // Opening details is NOT picking: no card is selected and the wizard stays on Browse.
  await expect(page.locator('.wz-variant.selected')).toHaveCount(0);
  await expect(page.locator('.wz-browse-search')).toBeVisible();
  // One panel at a time, and the button closes its own.
  await page.locator('.wz-variant-cell').nth(1).locator('.wz-variant-info').click();
  await expect(detail).toBeHidden();
  await expect(page.locator('.wz-variant-detail')).toHaveCount(1);
});

test('the brand toggle ranks the package siblings first without filtering anything out', async ({ page }) => {
  // Create a glass graphic so the saved project brand is the glass family, then reopen the
  // wizard and turn on "Use current project's colors & typeface" (proposal §13.3). The create
  // rides the Advanced editor door (the footer shortcut is Skip to finish since step 6).
  await enableAdvancedMode(page);
  await toBrowseStep(page);
  await page.locator('.wz-browse-tiles .wz-cat', { hasText: 'Lower thirds' }).click();
  await page.locator('.wz-variant', { hasText: 'Frosted Card' }).click();
  await finishIntoEditor(page);
  await expect(page.locator('.wz-modal')).toBeHidden();

  await startNewProject(page);
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-browse-tiles .wz-cat', { hasText: 'Lower thirds' }).click();
  const n = await catalogCounts(page);
  const firstStyle = () => page.locator('.wz-variant .wz-style-tag').first().textContent();
  expect(await firstStyle()).not.toBe('Elegant & glass');

  await page.locator('.wz-match input[type="checkbox"]').check();
  expect(await firstStyle()).toBe('Elegant & glass');
  // Ranking, never filtering: the result count is untouched.
  await expect(page.locator('.wz-variant')).toHaveCount(n.lowerThirds);
});

test('facet values without catalog mass render no chip', async ({ page }) => {
  await toBrowseStep(page);
  await page.locator('.wz-browse-drawer-btn').click();
  // No preset ships intensity "none", so that chip must not exist (proposal §10).
  await expect(page.locator('.wz-filter', { hasText: 'Motion: none' })).toHaveCount(0);
  // And only categories with content render tiles. This used to name the one category that
  // was empty — Products, then Captions — and each naming rotted the moment a pack filled it
  // (commerce cards, then the public-service pack's two-language notices). So assert the RULE
  // instead of an example: the tiles are exactly the graphic categories the catalog has
  // designs for, which stays true whether or not any category is currently empty.
  const expected = await page.evaluate(async () => {
    const { allTemplateMeta } = await import('/src/templates/templateMeta.ts');
    const { GRAPHIC_CATEGORIES } = await import('/src/model/taxonomy.ts');
    const filled = new Set(allTemplateMeta().map(({ meta }) => meta.category));
    return GRAPHIC_CATEGORIES.filter((c) => filled.has(c.id)).map((c) => c.name).sort();
  });
  const rendered = (await page.locator('.wz-browse-tiles .wz-cat-head strong').allInnerTexts())
    .map((t) => t.trim())
    .sort();
  expect(rendered).toEqual(expected);
});

// ── The FIELD PLAN (docs/GOALS.md "Student release" step 5): the Fields step offers exactly
// what the design's contract supports - lines add/remove on the standard contract, a rows
// editor over the ONE source field on a list design, and no restructuring at all on a fixed
// contract. Before the plan existed, add/remove rendered everywhere and self-assembled
// categories silently ignored it.

test('field plan: a ticker offers a rows editor, never line add/remove', async ({ page }) => {
  await toBrowseStep(page);
  await page.locator('.wz-browse-tiles .wz-cat', { hasText: 'Tickers' }).click();
  await page.locator('.wz-variant', { hasText: 'News Strip' }).first().click();
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields

  // The items line renders as ROWS over the one textarea-backed source field.
  const rowsEditor = page.getByTestId('list-rows-editor');
  await expect(rowsEditor).toBeVisible();
  await expect(page.getByTestId('field-plan-hint')).toContainText('Rows here are CONTENT');
  // No structural line add/remove anywhere on the step.
  await expect(page.getByRole('button', { name: '+ Add a line' })).toHaveCount(0);

  // Editing rows edits the ONE field's value: add a row, type into it, and the draft's
  // sample for that line gains exactly one more \n-separated entry.
  const before = await rowsEditor.locator('input').count();
  await page.getByTestId('list-row-add').click();
  await rowsEditor.locator('input').nth(before).fill('BREAKING · Rows are content');
  await expect(rowsEditor.locator('input')).toHaveCount(before + 1);
  await expect(rowsEditor.locator('input').nth(before)).toHaveValue('BREAKING · Rows are content');
});

test('field plan: a quiz board is a fixed contract - fields edit, structure does not', async ({ page }) => {
  await toBrowseStep(page);
  await page.locator('.wz-browse-tiles .wz-cat', { hasText: 'Quiz' }).click();
  await page.locator('.wz-variant', { hasText: 'Arena Quiz' }).first().click();
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields

  // Titles and samples stay editable; add/remove is gone (it was a silent no-op).
  await expect(page.locator('.wz-line-row').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add a line' })).toHaveCount(0);
  await expect(page.locator('.wz-line-row button', { hasText: '✕' })).toHaveCount(0);
  await expect(page.getByTestId('field-plan-hint')).toContainText('fixed set');
});
