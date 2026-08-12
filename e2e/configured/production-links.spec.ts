import { test, expect } from '@playwright/test';
import { createProject } from '../_create';
import { haveCreds, signIn } from './_helpers';

// A PRODUCTION'S URLS OUTLIVE UNPUBLISHING (docs/CLOUD_PLAYOUT.md §3, migration 0039).
//
// The output URL is pasted once into a CasparCG template or an OBS browser source and then left
// alone for the life of the production — so the one thing it may never do is move. It used to:
// unpublish DELETED the control_shows row and re-publishing re-minted every slug from its column
// default, which is the mechanism behind the unexplained "the CasparCG URL stopped working"
// report in student-release acceptance round 2.
//
// This lives in the configured suite because it is a claim about the DATABASE. Offline there is
// no row to delete, no trigger to fire and no slug to compare — the only honest proof runs the
// real publish/unpublish path against the real backend. It also fails, correctly, against a
// project that has not had 0039 applied yet.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('unpublishing and publishing again keeps every capability URL', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard signIn leaves open — not this walk
  // Shows SYNC, so a failed earlier run can leave a published production behind whose slugs
  // would shadow this one's. Start from an empty set.
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
    for (const s of loadShows()) {
      if (s.hostedSlug || s.outputSlug) await unpublishControlShow(s.id).catch(() => {});
      deleteShow(s.id);
    }
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });
  await createProject(page, { name: 'Link Keeper' });

  const showName = `Link Keeper ${Date.now()}`;
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill(showName);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();

  /** The four addresses as the app itself knows them, read back off the synced show record. */
  const capabilities = () =>
    page.evaluate(async (name) => {
      const { loadShows } = await import('/src/model/shows.ts');
      const s = loadShows().find((x) => x.name === name);
      return {
        control: s?.hostedSlug ?? null,
        output: s?.outputSlug ?? null,
        join: s?.joinSlug ?? null,
        presenter: s?.presenterSlug ?? null,
      };
    }, showName);

  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  // Publishing opens the links popover over everything; the backdrop closes it, clicked at a
  // CORNER because the popover deliberately sits above it (quiz-output.spec.ts says why).
  await page.locator('.lib-menu-backdrop').click({ position: { x: 5, y: 5 } });

  const first = await capabilities();
  expect(first.control).toBeTruthy();
  expect(first.output).toBeTruthy();
  expect(first.join).toBeTruthy();
  expect(first.presenter).toBeTruthy();

  // Unpublish exactly as an operator does — the links popover's own button.
  await page.getByTestId('production-links-toggle').click();
  await page.getByTestId('production-unpublish').click();
  await expect(page.getByTestId('production-mode')).not.toContainText('SHOW', { timeout: 30_000 });
  await expect(page.getByTestId('production-note')).toContainText('come back unchanged');
  // The published capabilities are gone from the local record; the reserved audience pair is
  // deliberately kept, which is what stops the readable join name being re-derived below.
  const between = await capabilities();
  expect(between.control).toBeNull();
  expect(between.output).toBeNull();

  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  await page.locator('.lib-menu-backdrop').click({ position: { x: 5, y: 5 } });

  expect(await capabilities()).toEqual(first);

  // Teardown: this account is shared by the live suite, and a reserved join name is reserved for
  // good — leaving published productions behind would collide with the next run.
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
    for (const s of loadShows()) {
      if (s.hostedSlug || s.outputSlug) await unpublishControlShow(s.id).catch(() => {});
      deleteShow(s.id);
    }
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });
});
