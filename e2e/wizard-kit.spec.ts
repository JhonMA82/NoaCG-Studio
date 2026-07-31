import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// "Start from a kit" — the pack Entry card (ratified in docs/TEMPLATE_TAXONOMY_PROPOSAL.md
// §18: its own card, NOT a third Browse mode, because Browse produces one graphic and a kit
// produces several).
//
// What matters here is the OUTCOME the card promises: several graphics, saved together, with
// the editor left alone. A spec that only checked the step rendered would pass on a card that
// created nothing.

test('a kit creates every graphic in it as one package and lands there', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();

  await page.locator('[data-entry="kit"]').click();
  await expect(page.getByTestId('kit-step')).toBeVisible();

  // Nothing is selected on arrival, so the detail panel must not be there - an empty panel
  // would imply a step that does not exist.
  await expect(page.getByTestId('kit-detail')).toHaveCount(0);

  // A kit is ONE decision, so the footer's step controls stand down. They did not, and the
  // footer's Next advanced to a step kit mode does not render - a blank screen.
  await expect(page.locator('.wz-footer .wz-next')).toHaveCount(0);
  await expect(page.locator('.wz-footer').getByRole('button', { name: 'Create project' })).toHaveCount(0);

  // The COUNT ON THE CARD is the first promise the user reads, and it must match what the
  // kit builds. It did not: the card counted the pack's types AND extras while the create
  // path resolved only the types, so a kit advertised as 27 graphics produced 12.
  const cardCount = Number(
    (await page.locator('[data-kit="church"] .wz-kit-count').innerText()).match(/\d+/)?.[0],
  );
  expect(cardCount).toBeGreaterThan(1);

  await page.locator('[data-kit="church"]').click();
  const detail = page.getByTestId('kit-detail');
  await expect(detail).toBeVisible();
  // The kit says what is in it, by name, before anything is created - and the list, the card
  // count and the created package must all be the same number.
  const contents = detail.locator('.wz-kit-contents li');
  const declared = await contents.count();
  expect(declared).toBe(cardCount);

  await page.getByTestId('kit-create').click();

  // The outcome is a PACKAGE route, not the editor.
  await expect(page).toHaveURL(/#\/package\//);
  await expect(page.locator('.wz-modal')).toHaveCount(0);

  const saved = await page.evaluate(() => {
    const packageId = location.hash.split('/').pop();
    const graphics = JSON.parse(localStorage.getItem('spx-gfx-graphics') ?? '[]') as {
      name: string;
      packageId: string | null;
      template: { html: string; js: string; fields?: unknown[] };
    }[];
    const packets = JSON.parse(localStorage.getItem('spx-gfx-packets') ?? '[]') as { id: string; name: string }[];
    const inPackage = graphics.filter((g) => g.packageId === packageId);
    return {
      packageName: packets.find((p) => p.id === packageId)?.name ?? null,
      count: inPackage.length,
      uniqueNames: new Set(inPackage.map((g) => g.name)).size,
      // Every one is a REAL template, not a stub: SPX definition present and a play() to call.
      allComplete: inPackage.every(
        (g) => g.template.html.includes('SPXGCTemplateDefinition') && /play\s*(=|\()/.test(g.template.js),
      ),
      allHaveFields: inPackage.every((g) => (g.template.fields ?? []).length > 0),
    };
  });

  expect(saved.packageName).toBe('Church & Ceremony');
  expect(saved.count).toBe(declared);
  expect(saved.uniqueNames).toBe(declared); // no duplicate rows in the package
  expect(saved.allComplete).toBe(true);
  expect(saved.allHaveFields).toBe(true);
});

test('only looks the kit can actually be built in are offered', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="kit"]').click();
  await page.locator('[data-kit="church"]').click();

  const family = page.getByTestId('kit-family');
  const offered = await family.locator('option').allInnerTexts();

  // The (type x family) matrix is NOT full: a pack's types only ship designs in some
  // families, and offering one that throws on Create would offer a guaranteed failure.
  // Measured 2026-07-29: editorial and cinematic resolve for no pack at all.
  //
  // THIS IS ALSO THE DRIFT GUARD for that claim. If someone fills the editorial or cinematic
  // cells across the type registry, this assertion fails - and the fix is to update the three
  // places that state the four-family split (src/templates/packs.ts, src/templates/AGENTS.md,
  // docs/PACK_TAXONOMY.md), not to loosen the test. The `validatePacks` cell gate only checks
  // a pack's own declared family, so nothing else would notice.
  expect(offered.length).toBeGreaterThan(0);
  expect(offered).not.toContain('editorial');
  expect(offered).not.toContain('cinematic');

  // Every offered look must genuinely re-resolve the kit - same graphics, different look.
  const baseline = await page.locator('.wz-kit-contents li').count();
  for (const look of offered) {
    await family.selectOption(look);
    await expect(family).toHaveValue(look);
    await expect(page.locator('.wz-kit-contents li')).toHaveCount(baseline);
  }
});

test('picking another kit brings back its own default look', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="kit"]').click();

  await page.locator('[data-kit="church"]').click();
  const family = page.getByTestId('kit-family');
  await expect(family).toHaveValue('minimal'); // the pack's declared family
  await family.selectOption('sport');

  // An explicit pick must not leak onto the next kit, or it would quietly stop being the
  // look it was curated in.
  await page.locator('[data-kit="esports"]').click();
  await expect(page.getByTestId('kit-detail').locator('h3')).toHaveText('Esports');
  await expect(family).toHaveValue('sport'); // esports' OWN family, which happens to be sport

  await page.locator('[data-kit="newsroom"]').click();
  await expect(family).toHaveValue('minimal'); // newsroom's own, not the carried pick
});

test('the Esports kit builds and downloads as one complete Volt tournament package', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="kit"]').click();

  const card = page.locator('[data-kit="esports"]');
  await expect(card).toContainText('36 graphics');
  await card.click();

  const detail = page.getByTestId('kit-detail');
  await expect(page.getByTestId('kit-family')).toHaveValue('sport');
  const contents = detail.locator('.wz-kit-contents');
  for (const name of [
    'Volt Stinger',
    'Map Ladder',
    'Map Veto',
    'Team Tag',
    'Commentary Booth',
    'Desk Duo',
    'Results Rail',
    'Sponsor Crawl',
  ]) {
    await expect(contents.getByText(name, { exact: true })).toBeVisible();
  }

  await page.getByTestId('kit-create').click();
  await expect(page).toHaveURL(/#\/package\//);

  const packageReport = await page.evaluate(() => {
    const packageId = location.hash.split('/').pop();
    const graphics = JSON.parse(localStorage.getItem('spx-gfx-graphics') ?? '[]') as {
      name: string;
      packageId: string | null;
      template: { css: string };
    }[];
    const inPackage = graphics.filter((graphic) => graphic.packageId === packageId);
    const voltSpecialists = new Set([
      'Map Veto',
      'Team Tag',
      'Commentary Booth',
      'Desk Duo',
      'Results Rail',
      'Sponsor Crawl',
    ]);
    return {
      count: inPackage.length,
      names: inPackage.map((graphic) => graphic.name),
      specialistLookMatches: inPackage
        .filter((graphic) => voltSpecialists.has(graphic.name))
        .every((graphic) => graphic.template.css.includes('#c8f31d') && graphic.template.css.includes('Oswald')),
    };
  });

  expect(packageReport.count).toBe(36);
  expect(new Set(packageReport.names).size).toBe(36);
  expect(packageReport.specialistLookMatches).toBe(true);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-package').click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const entries = Object.keys(zip.files);
  expect(entries.filter((name) => name.endsWith('/index.html'))).toHaveLength(36);
  expect(entries).toContain('esports/map_veto/index.html');
  expect(entries).toContain('esports/series_scorebug/index.html');
  expect(entries).toContain('esports/volt_stinger/index.html');
  expect(entries).toContain('esports/README.md');
});
