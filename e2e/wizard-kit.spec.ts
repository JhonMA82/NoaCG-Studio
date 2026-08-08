import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { settleDurableWrites } from './_durable';

// THE KIT PATH — one door, not two.
//
// "Start from a template" and "Start from a kit" used to be separate Entry cards (ratified in
// docs/TEMPLATE_TAXONOMY_PROPOSAL.md §18 and reversed there): Browse produced one graphic and
// the kit card produced several, so the surface followed the outcome. It also meant a user who
// wanted the whole set had to know the word "kit" before pressing anything, and a user who
// picked wrong walked back to the front page to change their mind.
//
// Now the question is a SEGMENTED CONTROL at the top of Browse and the kit walks the SAME six
// steps a single graphic does, with two additions of its own: the TRAY (which graphic of the
// set) and the LOOK QUESTION (does the first graphic's identity carry to the rest).
//
// What matters here is the OUTCOME the flow promises: the count on screen is the count that
// gets built, one look carries across the set, and every graphic is saved into one PRODUCTION
// before either door is taken. A spec that only checked the picker rendered would pass on a
// flow that built nothing.

/** A short kit to walk: Wellness's twelve, cut to the first two. Walking a 36-graphic kit
 *  through the UI would re-buy this coverage at thirty times the cost. */
async function pickShortKit(page: Page, keep = 2) {
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await page.locator('[data-build-mode="kit"]').click();
  await expect(page.getByTestId('kit-picker')).toBeVisible();
  await page.locator('[data-kit="wellness"]').click();
  await expect(page.getByTestId('kit-detail')).toBeVisible();

  const items = page.locator('[data-testid="kit-contents"] [data-kit-item]');
  const total = await items.count();
  for (let i = keep; i < total; i++) await items.nth(i).uncheck();
  await expect(page.getByTestId('kit-total')).toHaveText(`${keep} graphics`);
}

/** Next through Fields → Style → Animation, then finish this graphic. */
async function walkOneKitGraphic(page: Page) {
  for (let i = 0; i < 3; i++) await page.locator('.wz-next').click();
}

test('the entry step offers no kit card — the question lives in Browse', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // The card is GONE, not hidden: a second door to the same outcome is exactly what this
  // change removes, and one left behind would quietly become the one people use.
  await expect(page.locator('[data-entry="kit"]')).toHaveCount(0);

  // …and the question it used to ask is reachable one click in, without leaving the step.
  await page.locator('[data-entry="template"]').click();
  await expect(page.getByTestId('wz-buildmode')).toBeVisible();
  await expect(page.locator('[data-build-mode="one"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the switch swaps the step body and is changeable without going back', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();

  // One graphic: the design grid.
  await expect(page.locator('.wz-variant-grid')).toBeVisible();
  await expect(page.getByTestId('kit-picker')).toHaveCount(0);

  await page.locator('[data-build-mode="kit"]').click();
  await expect(page.getByTestId('kit-picker')).toBeVisible();
  await expect(page.locator('.wz-variant-grid')).toHaveCount(0);
  // The rail's words follow the answer, so the walk never claims to be picking a design.
  await expect(page.locator('.wz-dot').nth(1).locator('.wz-dot-label')).toHaveText('Kit');

  // Back to one graphic, still on the same step — the whole point of a switch over two cards.
  await page.locator('[data-build-mode="one"]').click();
  await expect(page.locator('.wz-variant-grid')).toBeVisible();
  await expect(page.getByTestId('wz-stepcount')).toHaveText('Step 2 / 6');

  // The frame is one decision for the whole walk either way, so its picker survives the swap.
  await page.locator('[data-build-mode="kit"]').click();
  await expect(page.getByTestId('browse-format-aspect')).toBeVisible();
});

test('the count on screen is the count that gets built', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await page.locator('[data-build-mode="kit"]').click();

  // The unpicked card advertises the PACK's size — types AND extras (`kitSize`). It matched
  // neither the old create path nor the old contents list once, and a kit advertised as 27
  // graphics produced 12.
  const cardCount = Number(
    (await page.locator('[data-kit="wellness"] .wz-kit-count').innerText()).match(/\d+/)?.[0],
  );
  await page.locator('[data-kit="wellness"]').click();

  const inPack = page.locator('[data-testid="kit-contents"] [data-kit-item]');
  await expect(inPack).toHaveCount(cardCount);
  await expect(page.getByTestId('kit-total')).toHaveText(`${cardCount} graphics`);

  // Editing the set moves the number in BOTH directions — the picker is not decoration.
  await inPack.first().uncheck();
  await expect(page.getByTestId('kit-total')).toHaveText(`${cardCount - 1} graphics`);
  const extras = page.locator('[data-testid="kit-extras"] [data-kit-item]');
  await expect(extras.first()).not.toBeChecked();
  await extras.first().check();
  await expect(page.getByTestId('kit-total')).toHaveText(`${cardCount} graphics`);
});

test('only looks the kit can actually be built in are offered', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await page.locator('[data-build-mode="kit"]').click();
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

  // Every offered look must genuinely re-resolve the kit — same graphics, different look —
  // and the SET must survive the change: the picker's keys are type ids, not design ids.
  const baseline = await page.locator('[data-testid="kit-contents"] [data-kit-item]').count();
  for (const look of offered) {
    await family.selectOption(look);
    await expect(family).toHaveValue(look);
    await expect(page.locator('[data-testid="kit-contents"] [data-kit-item]')).toHaveCount(baseline);
    await expect(page.getByTestId('kit-total')).toHaveText(`${baseline} graphics`);
  }
});

test('picking another kit brings back its own default look and its own contents', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await page.locator('[data-build-mode="kit"]').click();

  await page.locator('[data-kit="church"]').click();
  const family = page.getByTestId('kit-family');
  await expect(family).toHaveValue('minimal'); // the pack's declared family
  await family.selectOption('sport');
  await page.locator('[data-testid="kit-contents"] [data-kit-item]').first().uncheck();

  // Neither an explicit look nor an edited set may leak onto the next kit, or it would
  // quietly stop being the kit it was curated as.
  await page.locator('[data-kit="esports"]').click();
  await expect(page.getByTestId('kit-detail').locator('h3')).toHaveText('Esports');
  await expect(family).toHaveValue('sport'); // esports' OWN family, which happens to be sport
  await expect(page.getByTestId('kit-total')).toHaveText('36 graphics');

  await page.locator('[data-kit="newsroom"]').click();
  await expect(family).toHaveValue('minimal'); // newsroom's own, not the carried pick
  const boxes = page.locator('[data-testid="kit-contents"] [data-kit-item]');
  await expect(boxes).toHaveCount(32);
  for (let i = 0; i < 32; i++) await expect(boxes.nth(i)).toBeChecked();
});

test('the tray is the second axis of progress, and Back keeps the set', async ({ page }) => {
  await pickShortKit(page);
  await page.locator('.wz-next').click();

  // TWO AXES: the rail says where you are inside this graphic, the tray which graphic of the
  // set. Both must be readable at once — that is the whole reason the tray is not a rail.
  await expect(page.getByTestId('wz-stepcount')).toHaveText('Step 3 / 6');
  const tray = page.getByTestId('kit-tray');
  await expect(tray).toContainText('graphic 1 of 2');
  const chips = tray.locator('[data-kit-chip]');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toHaveAttribute('data-state', 'current');
  await expect(chips.nth(1)).toHaveAttribute('data-state', 'pending');
  // A pending chip has nothing to show yet — a thumbnail there would be a picture of a
  // graphic that does not exist.
  await expect(chips.nth(1).locator('iframe')).toHaveCount(0);

  // The kit's LAST rail entry is not a jump target: reaching it means the graphic in hand has
  // been built, and a rail click sets the step directly.
  await expect(page.locator('.wz-dot').nth(5)).toBeDisabled();

  // Back to Browse and forward again: the set is exactly as it was left, and the walk resumes
  // on the graphic it was on rather than restarting the kit.
  await page.locator('.wz-back').click();
  await expect(page.getByTestId('kit-total')).toHaveText('2 graphics');
  await expect(page.locator('[data-build-mode="kit"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('wz-stepcount')).toHaveText('Step 3 / 6');
  await expect(page.getByTestId('kit-tray')).toContainText('graphic 1 of 2');
});

test('the first graphic sets the tone and its look carries to the rest', async ({ page }) => {
  await pickShortKit(page);
  await page.locator('.wz-next').click();

  // Fields → Style, where the tone is actually set. Signal Red is not any wellness design's
  // own default, so finding it on graphic 2 can only mean it was carried.
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('wz-stepcount')).toHaveText('Step 4 / 6');
  await page.locator('.wz-step button', { hasText: 'Signal Red' }).first().click();

  await page.locator('.wz-next').click(); // Animation
  await page.locator('.wz-next').click(); // finish this graphic → the look question

  const look = page.getByTestId('kit-look');
  await expect(look).toBeVisible();
  // Singular, not "the other 1 graphic" — a kit of two leaves exactly one to ask about, and
  // the counted phrasing is what makes a product read as generated.
  await expect(look.locator('h3')).toHaveText('Use this look for the other graphic?');
  // The card says what it will actually carry (the :root style contract, not "everything"),
  // read back off the choice that was just made.
  await expect(look).toContainText('Signal Red');
  // The tone-setter is done and wears its own thumbnail; the rest is still pending.
  await expect(page.locator('[data-kit-chip]').nth(0)).toHaveAttribute('data-state', 'done');
  await expect(page.locator('[data-kit-chip]').nth(0).locator('iframe')).toHaveCount(1);

  await page.getByTestId('kit-look-yes').click();
  await expect(page.getByTestId('kit-finish')).toBeVisible();
  await expect(page.locator('[data-kit-chip][data-state="done"]')).toHaveCount(2);

  // THE GRID IS THE CHECK ON THE KIT'S PROMISE: every graphic, built, side by side.
  const cells = page.locator('[data-testid="kit-built"] .wz-kit-built-cell');
  await expect(cells).toHaveCount(2);
  await expect(cells.nth(0).locator('iframe')).toHaveCount(1);

  await page.getByTestId('kit-finish-production-go').click();
  await expect(page).toHaveURL(/#\/production\//);
  await settleDurableWrites(page);

  const saved = await page.evaluate(async () => {
    const showId = location.hash.split('/').pop();
    // Through the model, not the raw key: the saved documents live in the durable store
    // (IndexedDB behind a synchronous mirror - src/model/durableStore.ts).
    const { loadShows } = await import('/src/model/shows.ts');
    const { loadGraphics } = await import('/src/model/library.ts');
    const shows = loadShows() as unknown as {
      id: string;
      name: string;
      look?: { palette?: { accent?: string } };
      graphics: { name: string; graphicId?: string; template: { html: string; js: string; css: string; fields?: unknown[] } }[];
      cues?: { sourceId: string }[];
    }[];
    const library = loadGraphics() as unknown as { id: string; packageId: string | null }[];
    const show = shows.find((s) => s.id === showId);
    if (!show) return null;
    const libraryIds = new Set(library.map((g) => g.id));
    return {
      showName: show.name,
      count: show.graphics.length,
      // ONE accent across the set - the propagated identity, measured on the emitted CSS.
      accents: [...new Set(show.graphics.map((g) => g.template.css.match(/--accent:\s*([^;]+);/)?.[1]?.trim()))],
      // One cue auto-seeded per pool graphic - the rundown is never empty-but-working.
      cueCount: show.cues?.length ?? 0,
      // Every pool copy back-links to a real library record, saved standalone.
      allLinked: show.graphics.every((g) => g.graphicId && libraryIds.has(g.graphicId)),
      allStandalone: library.every((g) => g.packageId === null),
      hasLook: Boolean(show.look?.palette?.accent),
      // Every one is a REAL template, not a stub: SPX definition present and a play() to call.
      allComplete: show.graphics.every(
        (g) => g.template.html.includes('SPXGCTemplateDefinition') && /play\s*(=|\()/.test(g.template.js),
      ),
      allHaveFields: show.graphics.every((g) => (g.template.fields ?? []).length > 0),
    };
  });

  expect(saved).not.toBeNull();
  expect(saved!.showName).toBe('Wellness');
  expect(saved!.count).toBe(2);
  expect(saved!.accents).toEqual(['#e63946']); // Signal Red, on BOTH graphics
  expect(saved!.cueCount).toBe(2);
  expect(saved!.allLinked).toBe(true);
  expect(saved!.allStandalone).toBe(true);
  expect(saved!.hasLook).toBe(true);
  expect(saved!.allComplete).toBe(true);
  expect(saved!.allHaveFields).toBe(true);
});

test('"take me through each one" walks the rest of the set', async ({ page }) => {
  await pickShortKit(page);
  await page.locator('.wz-next').click();
  await walkOneKitGraphic(page);

  await page.getByTestId('kit-look-no').click();

  // The walk restarts at Fields — for the SECOND graphic, which the tray and the header both
  // say out loud rather than leaving the reader to infer from the preview.
  await expect(page.getByTestId('wz-stepcount')).toHaveText('Step 3 / 6');
  await expect(page.getByTestId('kit-tray')).toContainText('graphic 2 of 2');
  await expect(page.locator('[data-kit-chip]').nth(1)).toHaveAttribute('data-state', 'current');
  await expect(page.locator('.wz-title-doc')).toHaveText('· Quiet Hold');

  // The look question is asked ONCE. Finishing the last graphic goes straight to the
  // production; asking again would be asking about a look the user already declined.
  await page.getByTestId('wz-kit-skip').click();
  await expect(page.getByTestId('kit-finish')).toBeVisible();
  await expect(page.getByTestId('kit-look')).toHaveCount(0);
  await expect(page.locator('[data-testid="kit-built"] .wz-kit-built-cell')).toHaveCount(2);
});

test('the export door saves the whole set first, then packages it', async ({ page }) => {
  await pickShortKit(page);
  await page.locator('.wz-next').click();
  await walkOneKitGraphic(page);
  await page.getByTestId('kit-look-yes').click();

  await page.getByTestId('kit-finish-name').fill('Studio Wellness');
  // The other half of the door's conditional: a kit going into a NEW production really is a
  // package of the kit, and says so.
  await expect(page.getByTestId('kit-finish-export')).toContainText('Export the kit (.zip)');
  await page.getByTestId('kit-finish-export').click();

  // Export is not a reward for opening the editor - and for a kit the editor is never
  // involved at all. The door lands on the production with THE production export surface
  // open (its target picker and validation gate), never a second one that could disagree.
  await expect(page).toHaveURL(/#\/production\//);
  await expect(page.getByTestId('production-export-dialog')).toBeVisible();
  await expect(page.getByTestId('production-export-dialog')).toContainText('Studio Wellness');
  await settleDurableWrites(page);

  // THE SAVE IS NOT OPTIONAL. A kit that was configured, exported and then dropped would cost
  // every choice in the walk to reproduce, times the size of the set.
  const savedCount = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return (loadGraphics() as unknown as unknown[]).length;
  });
  expect(savedCount).toBe(2);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('prod-export-download').click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const graphicHtmls = Object.keys(zip.files).filter(
    (name) => /^studio_wellness\/[^/]+\/[^/]+\.html$/.test(name) && !name.endsWith('controlpanel.html'),
  );
  expect(graphicHtmls).toHaveLength(2);
});

test('a kit opened FOR a production joins that one, in its look', async ({ page }) => {
  // The wizard can be opened for a production (its page's "+ New graphic"), which pre-applies
  // that production's look and preselects it on the single-graphic Finish. The kit path used to
  // read neither: it rebuilt every graphic's draft from `initialDraft()` and always called
  // `createShowNamedChecked`, so starting a kit here silently built a SECOND production beside
  // the one the user was standing in, in a look it had nothing to do with.
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-variant').first().click();
  await page.getByTestId('wz-skip-to-finish').click();
  await page.getByTestId('wz-finish-name').fill('Friday Desk');
  await page.getByTestId('wz-finish-production-go').click();
  await expect(page).toHaveURL(/#\/production\//);
  await settleDurableWrites(page);

  await page.getByTestId('production-new-graphic').click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  // The context open still starts on Entry - it preselects a destination, it does not skip
  // the choice of what to make.
  await page.locator('[data-entry="template"]').click();
  await page.locator('[data-build-mode="kit"]').click();
  await page.locator('[data-kit="wellness"]').click();
  const items = page.locator('[data-testid="kit-contents"] [data-kit-item]');
  const total = await items.count();
  for (let i = 2; i < total; i++) await items.nth(i).uncheck();
  await page.locator('.wz-next').click();
  await walkOneKitGraphic(page);
  await page.getByTestId('kit-look-yes').click();

  // The production it was opened for is the DEFAULT, and the door says which one it means -
  // "Open the production" over a picker pointing at somebody else's show says nothing.
  await expect(page.getByTestId('kit-finish-production')).not.toHaveValue('new');
  await expect(page.getByTestId('kit-finish-production-go')).toContainText('Add to Friday Desk');
  // AND THE EXPORT DOOR NAMES WHAT COMES OUT OF IT. Pooled into a production that already had
  // a graphic, the package is that production's — three graphics, not the two in the kit — so
  // a door still labelled "Export the kit" would be promising a package it does not produce.
  const exportDoor = page.getByTestId('kit-finish-export');
  await expect(exportDoor).toContainText('Export Friday Desk (.zip)');
  await expect(exportDoor).toContainText('all 3 graphics');
  // Take the EXPORT door rather than the production one: it saves identically, and it is the
  // door whose promise is checkable against a real artifact.
  await exportDoor.click();
  await expect(page).toHaveURL(/#\/production\//);
  await expect(page.getByTestId('production-export-dialog')).toBeVisible();
  await settleDurableWrites(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('prod-export-download').click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const graphicHtmls = Object.keys(zip.files).filter(
    (name) => /^friday_desk\/[^/]+\/[^/]+\.html$/.test(name) && !name.endsWith('controlpanel.html'),
  );
  expect(graphicHtmls).toHaveLength(3); // the door said 3, and the package has 3

  const report = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const shows = loadShows() as unknown as {
      name: string;
      look?: { palette?: { accent?: string } };
      graphics: { name: string; template: { css: string } }[];
    }[];
    return {
      shows: shows.length,
      names: shows.map((s) => s.name),
      pool: shows[0]?.graphics.map((g) => g.name) ?? [],
      accents: [...new Set((shows[0]?.graphics ?? []).map((g) => g.template.css.match(/--accent:\s*([^;]+);/)?.[1]?.trim()))],
    };
  });

  // ONE production, holding the graphic it started with AND the whole kit.
  expect(report.shows).toBe(1);
  expect(report.names).toEqual(['Friday Desk']);
  expect(report.pool).toHaveLength(3);
  // And one look across all three: the production's own, carried into the kit by the brand the
  // context open turns on - not the pack's curated palette and not each design's default.
  expect(report.accents).toHaveLength(1);
});

test('the newsroom and talk-show kits are coherent: one look, one family, no duplicates', async ({ page }) => {
  // The student-release flagship kits (docs/GOALS.md step 7). Their promise is COHERENCE:
  // every graphic in the kit shares ONE curated look. Measured before the fix (2026-08-04):
  // newsroom shipped 4 of 32 graphics off-family and mixed four accent palettes; talk-show
  // 3 of 24 off-family across four palettes. The mechanism is `TemplatePack.paletteId` -
  // imposed on every kit graphic at create - plus in-family extras curation, and this test
  // is the drift guard for both. Module-level on purpose: the walks above already pin the
  // create/pool/cue mechanics, so building 56 graphics through the UI would re-buy that
  // coverage at real cost.
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

test('the picker only ever offers cells that resolve', async ({ page }) => {
  // `kitChoices` widens the offer past the pack's own contents — "start from a genre preset,
  // then edit the set" — and the matrix is not full, so the widening is exactly where a row
  // that throws on Create could appear. Module-level because the claim is about all 21 packs
  // in every look they resolve in, which no UI walk could cover.
  await page.goto('/app');
  const problems = await page.evaluate(async () => {
    const { PACKS, resolvePack } = await import('/src/templates/packs.ts');
    const { kitChoices, kitSelection } = await import('/src/templates/kit.ts');
    const FAMILIES = ['noacg', 'minimal', 'editorial', 'sport', 'glass', 'cinematic'] as const;
    const found: string[] = [];
    for (const pack of PACKS) {
      for (const family of FAMILIES) {
        try {
          resolvePack({ ...pack, family });
        } catch {
          continue; // not an offered look — the picker never shows it
        }
        const choices = kitChoices(pack, family);
        if (choices.length === 0) found.push(`${pack.id}/${family}: no choices at all`);
        if (new Set(choices.map((c) => c.key)).size !== choices.length) {
          found.push(`${pack.id}/${family}: duplicate keys`);
        }
        // Every offered row must BUILD. This is the assertion the old surface could not make:
        // it only ever offered what a pack declared, so nothing widened the risk.
        for (const choice of kitChoices(pack, family)) {
          try {
            choice.variant.create();
          } catch (e) {
            found.push(`${pack.id}/${family}/${choice.key}: ${(e as Error).message}`);
          }
        }
        // And the selection must resolve back to exactly what was ticked.
        const keys = choices.map((c) => c.key);
        if (kitSelection(pack, family, keys).length !== keys.length) {
          found.push(`${pack.id}/${family}: selection lost rows`);
        }
      }
    }
    return found;
  });
  expect(problems).toEqual([]);
});
