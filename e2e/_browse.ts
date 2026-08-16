import { expect, type Page } from '@playwright/test';

// Reaching a design on the wizard's Browse step, the way a person reaches one.
//
// THE STEP RENDERS A PAGE, NOT THE CATALOG (re-design/handoff.md §2b): a first page of 12 plus
// "Show 12 more". Before that it rendered every match - 429 cards and 30,215 px of scroll on
// the step whose whole job is picking one - which is why a spec could name any design in the
// catalog and click it straight off the grid. It cannot any more, and it SHOULD not: nobody
// scrolls 429 live previews looking for "Hairline", they type it.
//
// So `pickDesign` searches first. That is not a workaround for the page - it is the flow the
// step is built around, and a spec that clicked a card only reachable by rendering the whole
// catalog was exercising something no user did.
//
// `chooseType` is the other half: the category strip became ONE dropdown, and since
// 2026-08-16 that dropdown offers the ten CATEGORY GROUPS (model/taxonomy.ts) with the
// selected group's member categories as chips below it - so "pick a category by name" is now
// select-the-group, then click-the-chip.

/** Resolve a human name to the dropdown's group id + the member chip to click (null when the
 *  group has one member and renders no chips). Category names win over group names, so
 *  "Tickers" keeps meaning the ticker CATEGORY (21 designs), not the whole shelf. */
async function resolveBrowseTarget(
  page: Page,
  wanted: { name?: string; id?: string },
): Promise<{ group: string; chip: string | null } | null> {
  return page.evaluate(async (w) => {
    const { GRAPHIC_CATEGORIES, CATEGORY_GROUPS, CATEGORY_GROUP_OF } = await import('/src/model/taxonomy.ts');
    const q = w.name?.toLowerCase();
    const cat = w.id
      ? GRAPHIC_CATEGORIES.find((c) => c.id === w.id)
      : GRAPHIC_CATEGORIES.find((c) => c.name.toLowerCase().includes(q!));
    if (cat) {
      const group = CATEGORY_GROUPS.find((g) => g.id === CATEGORY_GROUP_OF[cat.id])!;
      return { group: group.id, chip: group.categories.length > 1 ? cat.name : null };
    }
    if (!q) return null;
    const group = CATEGORY_GROUPS.find((g) => g.name.toLowerCase().includes(q));
    return group ? { group: group.id, chip: null } : null;
  }, wanted);
}

async function applyBrowseTarget(
  page: Page,
  target: { group: string; chip: string | null },
): Promise<void> {
  await page.getByTestId('wz-browse-type').selectOption(target.group);
  if (target.chip) {
    await page.locator('.wz-browse-cats .wz-filter', { hasText: target.chip }).click();
  }
}

/**
 * Narrow Browse to one graphic CATEGORY by its human name ("Lower thirds", "Scoreboards").
 *
 * Matches by SUBSTRING, because the callers inherited partial names from the chip strip they
 * used to click ("Quiz" for "Polls, voting & quizzes", "corner logos" for "Bugs & corner
 * logos"). A name that only matches a GROUP ("Timers, breaks & credits") selects the group
 * alone. Every name in use resolves to exactly one target; a spec picking a category by
 * ARITHMETIC rather than by name uses `chooseCategory` with the id. Passing null clears both.
 */
export async function chooseType(page: Page, name: string | null): Promise<void> {
  if (name === null) {
    await page.getByTestId('wz-browse-type').selectOption('');
    return;
  }
  const target = await resolveBrowseTarget(page, { name });
  expect(target, `no graphic category or group named "${name}"`).toBeTruthy();
  await applyBrowseTarget(page, target!);
}

/** Narrow Browse to one graphic category by its ID ('map', 'scoreboard') - for specs that
 *  choose a category by arithmetic over the taxonomy rather than by a written-down name. */
export async function chooseCategory(page: Page, categoryId: string): Promise<void> {
  const target = await resolveBrowseTarget(page, { id: categoryId });
  expect(target, `no graphic category with id "${categoryId}"`).toBeTruthy();
  await applyBrowseTarget(page, target!);
}

/**
 * Pick a design BY NAME: search for it, then click its card. Leaves the query in the box, the
 * way it would be for a person - a spec that needs the unfiltered grid afterwards clears it.
 */
export async function pickDesign(page: Page, name: string): Promise<void> {
  await page.locator('.wz-browse-search').fill(name);
  await page.locator('.wz-variant', { hasText: name }).first().click();
}

/**
 * How many designs the current filters match, off the step's own "Showing 12 of 82" line.
 *
 * This is what replaced counting `.wz-variant` cards. The cards now count the PAGE, so a
 * facet assertion written against them would pass at 12 for every filter that leaves twelve
 * or more - which is most of them, and is a test that cannot fail. The line is also the thing
 * a user reads to learn what a facet did, so asserting it asserts the reported truth.
 */
export async function resultTotal(page: Page): Promise<number> {
  const text = await page.getByTestId('wz-browse-count').innerText();
  const match = /of\s+(\d+)/.exec(text);
  expect(match, `could not read a total out of "${text}"`).toBeTruthy();
  return Number(match![1]);
}

/**
 * Page until a named design is on the grid — what a person does when they know a result is in
 * there somewhere. Fails with the count line in the message if the button runs out first, so a
 * design that has genuinely fallen out of the result reads as that rather than as a timeout.
 *
 * Use this when the SUBJECT is that the design is in the result at all (an alias reaching
 * across categories, a pack being whole). When the subject is anything else, `pickDesign`
 * searches for it instead and costs one action.
 */
export async function revealDesign(page: Page, name: string): Promise<void> {
  const card = page.locator('.wz-variant', { hasText: name }).first();
  const more = page.getByTestId('wz-browse-more');
  // Bounded by the result itself: every press adds a page, so the loop ends when the button
  // does. The cap is a backstop against a button that never stops offering more.
  for (let press = 0; press < 60; press += 1) {
    if (await card.count()) {
      await expect(card).toBeVisible();
      return;
    }
    if (!(await more.count())) break;
    await more.click();
  }
  throw new Error(
    `"${name}" is not in this result: ${await page.getByTestId('wz-browse-count').innerText()}`,
  );
}

/** How many designs are actually on the grid right now, off the same line. */
export async function shownCount(page: Page): Promise<number> {
  const text = await page.getByTestId('wz-browse-count').innerText();
  const match = /Showing\s+(\d+)/.exec(text);
  expect(match, `could not read a shown count out of "${text}"`).toBeTruthy();
  return Number(match![1]);
}
