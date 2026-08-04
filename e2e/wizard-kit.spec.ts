import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// "Start from a kit" — the pack Entry card (ratified in docs/TEMPLATE_TAXONOMY_PROPOSAL.md
// §18: its own card, NOT a third Browse mode, because Browse produces one graphic and a kit
// produces several).
//
// What matters here is the OUTCOME the card promises: several graphics saved to the library
// and pooled into one PRODUCTION - the unit that airs (docs/GOALS.md "Student release") -
// with the editor left alone. A spec that only checked the step rendered would pass on a
// card that created nothing.

test('a kit creates every graphic into one production and lands on its page', async ({ page }) => {
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
  // count and the created production's pool must all be the same number.
  const contents = detail.locator('.wz-kit-contents li');
  const declared = await contents.count();
  expect(declared).toBe(cardCount);

  await page.getByTestId('kit-create').click();

  // The outcome is a PRODUCTION route, not the editor.
  await expect(page).toHaveURL(/#\/production\//);
  await expect(page.locator('.wz-modal')).toHaveCount(0);

  const saved = await page.evaluate(() => {
    const showId = location.hash.split('/').pop();
    const shows = JSON.parse(localStorage.getItem('spx-gfx-shows') ?? '[]') as {
      id: string;
      name: string;
      look?: { palette?: { accent?: string } };
      graphics: { name: string; graphicId?: string; template: { html: string; js: string; fields?: unknown[] } }[];
      cues?: { sourceId: string }[];
    }[];
    const library = JSON.parse(localStorage.getItem('spx-gfx-graphics') ?? '[]') as {
      id: string;
      name: string;
      packageId: string | null;
    }[];
    const show = shows.find((s) => s.id === showId);
    if (!show) return null;
    const libraryIds = new Set(library.map((g) => g.id));
    return {
      showName: show.name,
      count: show.graphics.length,
      uniqueNames: new Set(show.graphics.map((g) => g.name)).size,
      // One cue auto-seeded per pool graphic - the rundown is never empty-but-working.
      cueCount: show.cues?.length ?? 0,
      // Every pool copy back-links to a real library record, saved standalone.
      allLinked: show.graphics.every((g) => g.graphicId && libraryIds.has(g.graphicId)),
      allStandalone: library.every((g) => g.packageId === null),
      // The kit's curated look landed on the production.
      hasLook: Boolean(show.look?.palette?.accent),
      // Every one is a REAL template, not a stub: SPX definition present and a play() to call.
      allComplete: show.graphics.every(
        (g) => g.template.html.includes('SPXGCTemplateDefinition') && /play\s*(=|\()/.test(g.template.js),
      ),
      allHaveFields: show.graphics.every((g) => (g.template.fields ?? []).length > 0),
    };
  });

  expect(saved).not.toBeNull();
  expect(saved!.showName).toBe('Church & Ceremony');
  expect(saved!.count).toBe(declared);
  expect(saved!.uniqueNames).toBe(declared); // no duplicate pool rows
  expect(saved!.cueCount).toBe(declared);
  expect(saved!.allLinked).toBe(true);
  expect(saved!.allStandalone).toBe(true);
  expect(saved!.hasLook).toBe(true);
  expect(saved!.allComplete).toBe(true);
  expect(saved!.allHaveFields).toBe(true);
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

test('the newsroom and talk-show kits are coherent: one look, one family, no duplicates', async ({ page }) => {
  // The student-release flagship kits (docs/GOALS.md step 7). Their promise is COHERENCE:
  // every graphic in the kit shares ONE curated look. Measured before the fix (2026-08-04):
  // newsroom shipped 4 of 32 graphics off-family and mixed four accent palettes; talk-show
  // 3 of 24 off-family across four palettes. The mechanism is `TemplatePack.paletteId` -
  // imposed on every kit graphic at create - plus in-family extras curation, and this test
  // is the drift guard for both. Module-level on purpose: the church test above already
  // pins the create/pool/cue mechanics, so building 56 graphics through the UI would re-buy
  // that coverage at real cost.
  await page.goto('/app');
  const report = await page.evaluate(async () => {
    const { PACKS } = await import('/src/templates/packs.ts');
    const { kitItems } = await import('/src/templates/kit.ts');
    const { paletteById } = await import('/src/model/wizard.ts');
    const out: Record<string, { total: number; offFamily: string[]; accents: string[]; expected: string; dupes: string[] }> = {};
    for (const pack of PACKS.filter((p) => ['newsroom', 'talk-show'].includes(p.id))) {
      const items = kitItems(pack, pack.family);
      const palette = paletteById(pack.paletteId!);
      const accents = new Set<string>();
      for (const item of items) {
        const created = item.variant.create({ palette });
        accents.add(created.css.match(/--accent:\s*([^;]+);/)?.[1]?.trim() ?? 'NONE');
      }
      const names = items.map((item) => item.variant.name);
      out[pack.id] = {
        total: items.length,
        offFamily: items.filter((item) => item.variant.styleTag !== pack.family).map((item) => item.variant.id),
        accents: [...accents],
        expected: palette.accent,
        dupes: names.filter((name, index) => names.indexOf(name) !== index),
      };
    }
    return out;
  });

  expect(report['newsroom'].total).toBe(32);
  expect(report['talk-show'].total).toBe(24);
  for (const kit of Object.values(report)) {
    expect(kit.offFamily).toEqual([]);
    expect(kit.accents).toEqual([kit.expected]); // ONE accent across the whole kit
    expect(kit.dupes).toEqual([]); // a type resolution and an extra naming the same design would silently merge in the pool
  }
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
  await expect(page).toHaveURL(/#\/production\//);

  const productionReport = await page.evaluate(() => {
    const showId = location.hash.split('/').pop();
    const shows = JSON.parse(localStorage.getItem('spx-gfx-shows') ?? '[]') as {
      id: string;
      graphics: { name: string; template: { css: string } }[];
    }[];
    const pool = shows.find((s) => s.id === showId)?.graphics ?? [];
    const voltSpecialists = new Set([
      'Map Veto',
      'Team Tag',
      'Commentary Booth',
      'Desk Duo',
      'Results Rail',
      'Sponsor Crawl',
    ]);
    return {
      count: pool.length,
      names: pool.map((graphic) => graphic.name),
      specialistLookMatches: pool
        .filter((graphic) => voltSpecialists.has(graphic.name))
        .every((graphic) => graphic.template.css.includes('#c8f31d') && graphic.template.css.includes('Oswald')),
    };
  });

  expect(productionReport.count).toBe(36);
  expect(new Set(productionReport.names).size).toBe(36);
  expect(productionReport.specialistLookMatches).toBe(true);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-production').click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const entries = Object.keys(zip.files);
  // Each graphic's template file carries its own name (folder and file agree); no index.html.
  const graphicHtmls = entries.filter((name) => /^esports\/[^/]+\/[^/]+\.html$/.test(name) && !name.endsWith('controlpanel.html'));
  expect(graphicHtmls).toHaveLength(36);
  expect(graphicHtmls.every((name) => {
    const [, folder, file] = name.split('/');
    return file === `${folder}.html`;
  })).toBe(true);
  expect(entries.filter((name) => name.endsWith('index.html'))).toEqual([]);
  expect(entries).toContain('esports/map_veto/map_veto.html');
  expect(entries).toContain('esports/series_scorebug/series_scorebug.html');
  expect(entries).toContain('esports/volt_stinger/volt_stinger.html');
  expect(entries).toContain('esports/show_controlpanel.html');
  expect(entries).toContain('esports/README.md');
});
