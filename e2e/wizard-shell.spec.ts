import { test, expect, type Page } from '@playwright/test';

// The wizard's SHELL — the header row, and the two ways out of it.
//
// Neither of these is about a step's content. The ✕ decides what "cancel" means once a mode
// has been chosen, and the step counter decides whether the header is telling the truth about
// a walk the reader has not picked yet. Both were reported by the owner against the shipped
// build, and both are invisible to every other spec here.

/** Open the wizard on its Entry step. A fresh context has no autosaved project, so /app
 *  auto-opens it. */
async function wizard(page: Page) {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
}

const counter = (page: Page) => page.getByTestId('wz-stepcount');

test('the step counter appears from the second step, counting the ACTIVE mode', async ({ page }) => {
  await wizard(page);

  // Entry has no answer to give: no mode is chosen, and the denominator is not the same
  // number for every door. "Step 1 / 6" there states a walk the reader has not picked.
  await expect(counter(page)).toHaveCount(0);

  await page.locator('[data-entry="template"]').click();
  await expect(counter(page)).toHaveText(/Step\s*2\s*\/\s*6/);
  await page.locator('.wz-variant').first().click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(counter(page)).toHaveText(/Step\s*3\s*\/\s*6/);

  // Create with AI is a THREE-step walk, so a hard-coded 6 would be a lie on its own screen.
  await page.locator('.wz-header .gallery-close').click();
  await expect(page.locator('[data-entry="ai"]')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  await expect(counter(page)).toHaveText(/Step\s*2\s*\/\s*3/);
});

test('the header keeps its shape whether or not the counter is there', async ({ page }) => {
  await wizard(page);

  // THE HEADER RULE (re-design/handoff.md §6, src/components/AGENTS.md): the ✕ is a 32px
  // bordered square hard right, ALWAYS last. Removing the counter cluster must not let two
  // auto margins split the row and park the ✕ mid-header — which is exactly what happens if
  // the `margin-left: auto` handoff between counter and button is written the obvious way.
  const geometry = async () => {
    const header = (await page.locator('.wz-header').boundingBox())!;
    const close = (await page.locator('.wz-header .gallery-close').boundingBox())!;
    return { gap: header.x + header.width - (close.x + close.width), w: close.width, h: close.height };
  };

  const onEntry = await geometry();
  expect(onEntry.w).toBe(32);
  expect(onEntry.h).toBe(32);

  await page.locator('[data-entry="template"]').click();
  await expect(counter(page)).toBeVisible();
  const onBrowse = await geometry();
  expect(onBrowse.w).toBe(32);
  // Same distance from the right edge with the counter present as without it.
  expect(Math.abs(onBrowse.gap - onEntry.gap)).toBeLessThan(1);
  // And the counter sits BEFORE it, never after.
  const count = (await counter(page).boundingBox())!;
  const close = (await page.locator('.wz-header .gallery-close').boundingBox())!;
  expect(count.x + count.width).toBeLessThanOrEqual(close.x);
});

test('✕ past Entry returns to the wizard front page, keeping the project format', async ({ page }) => {
  await wizard(page);
  await page.locator('[data-entry="template"]').click();

  // Change the format, then walk in far enough to have a real draft to lose.
  await page.locator('.wz-browse-format select').first().selectOption('9:16');
  await page.locator('.wz-variant').first().click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(counter(page)).toHaveText(/Step\s*3\s*\/\s*6/);
  const format = await page.locator('.wz-rail-format').textContent();
  expect(format).toContain('9:16');

  await page.locator('.wz-header .gallery-close').click();

  // Back to Entry — NOT out of the wizard. Losing the whole surface to correct one wrong
  // turn is the fault this fixes.
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(counter(page)).toHaveCount(0);
  // The mode's own choices go with the mode: the header no longer names a design.
  await expect(page.locator('.wz-title-doc')).toHaveCount(0);

  // The FORMAT survives, because it is a property of the thing being made rather than of the
  // route taken to make it. Re-entering any mode finds it still set.
  await page.locator('[data-entry="template"]').click();
  await expect(page.locator('.wz-rail-format')).toHaveText(format!);
  // The design choice did not survive with it.
  await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled();
});

test('✕ on the Entry step still leaves the wizard', async ({ page }) => {
  await wizard(page);
  await page.locator('.wz-header .gallery-close').click();
  // Nowhere left to rewind to, so it closes exactly as it always did.
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);
  await expect(page.getByTestId('home-page')).toBeVisible();
});

test('the brand lockup is the Home door from inside the wizard', async ({ page }) => {
  await wizard(page);
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-variant').first().click();
  await expect(counter(page)).toBeVisible();

  // ✕ rewinds within the wizard, so Home has to stay reachable from every step — it is the
  // same lockup that is the Home door on every other topbar in the product.
  await page.locator('.wz-header .brand-home').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);
});
