import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';

// The production AUDIENCE workspace (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 5).
//
// It runs on the LOCAL provider — in memory, with a submission simulator — which is exactly why
// this whole workflow is drivable offline. That was the point of building the seam first: what
// is pinned here is the moderation workflow itself, and the Supabase provider will be a second
// implementation of an interface these specs have already exercised.
//
// THE RULE THE SPECS EXIST FOR: nothing a viewer wrote reaches Program without an operator
// pressing Take. "Send to rundown" makes a CUE and stops.

async function productionFor(page: Page, name: string): Promise<void> {
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill(name);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
}

test('the audience workflow: arrive, edit a broadcast version, approve, send to the rundown, air it', async ({ page }) => {
  await createProject(page, { name: 'House Q&A' });
  await productionFor(page, 'Phone In');

  await page.getByTestId('tab-audience').click();
  await expect(page.getByTestId('production-audience')).toBeVisible();
  expect(page.url()).toContain('/audience');
  await expect(page.getByTestId('audience-empty')).toBeVisible();

  // Three arrive.
  await page.getByTestId('audience-simulate').click();
  const rows = page.locator('.pd-aud-row');
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId('audience-filter-inbox')).toContainText('(3)');

  // ── The BROADCAST version is editable and the ORIGINAL is not. ──
  const first = rows.first();
  const sent = await first.getByTestId('audience-edit-body').inputValue();
  await first.getByTestId('audience-edit-body').fill('Tidied for air');
  await expect(first.getByTestId('audience-show-original')).toBeVisible();
  await first.getByTestId('audience-show-original').click();
  // What was actually sent is still there, word for word — an edit is a tidy-up, never a
  // rewrite of the record.
  await expect(first.getByTestId('audience-original')).toContainText(sent);

  // Anonymise replaces the name on air and leaves the record alone.
  await first.getByTestId('audience-anonymize').check();
  await expect(first.locator('.pd-aud-author')).toHaveText('Anonymous');
  await expect(first.getByTestId('audience-original')).not.toContainText('Anonymous');

  // ── Approve, shortlist, reject: three different verdicts, three different lists. ──
  await rows.nth(1).getByTestId('audience-shortlist').click();
  await rows.nth(2).getByTestId('audience-reject').click();
  await expect(page.getByTestId('audience-filter-shortlist')).toContainText('(1)');
  await page.getByTestId('audience-filter-inbox').click();
  await expect(rows).toHaveCount(2); // the rejected one has left the inbox

  // ── The ONE exit: a cue on the rundown. Nothing has aired. ──
  await page.getByTestId('audience-filter-all').click();
  await page.locator('.pd-aud-row').first().getByTestId('audience-send').click();
  await expect(page.getByTestId('audience-note')).toContainText('airs when you Take it');
  await expect(page.locator('.pd-aud-row').first().getByTestId('audience-used')).toBeVisible();

  await page.getByTestId('tab-playout').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  const cue = page.locator('.pd-cue', { hasText: 'Tidied for air' }).first();
  await expect(cue).toBeVisible();
  await cue.click();

  // Now the operator airs it, deliberately — and the edited text is what goes out.
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('verb-take').click();
  await expect(program.locator('body')).toContainText('Tidied for air');
});

test('the audience workspace survives a workspace round trip and a reload', async ({ page }) => {
  await createProject(page, { name: 'House Q&A' });
  await productionFor(page, 'Round Trip');
  await page.getByTestId('tab-audience').click();
  await page.getByTestId('audience-simulate').click();
  await expect(page.locator('.pd-aud-row')).toHaveCount(3);

  await page.getByTestId('tab-playout').click();
  await page.getByTestId('tab-audience').click();
  // The provider is in memory and deliberately holds nothing durable, so a round trip within
  // the page keeps the material and a RELOAD does not. Both are stated here rather than left
  // to be discovered: rehearsal material is other people's words in shape, and there is no
  // reason a practice run should outlive the tab.
  await expect(page.locator('.pd-aud-row')).toHaveCount(3);

  await page.reload();
  await expect(page.getByTestId('production-audience')).toBeVisible();
  await expect(page.getByTestId('audience-empty')).toBeVisible();
});

test('the viewer preview is the join page itself, and it follows the operator', async ({ page }) => {
  await createProject(page, { name: 'House Q&A' });
  await productionFor(page, 'Preview');
  await page.getByTestId('tab-audience').click();

  await page.getByTestId('audience-preview-details').locator('summary').click();
  const preview = page.getByTestId('audience-preview');
  // Closed is the honest starting state, and the preview says so in the words a viewer reads.
  await expect(preview).toContainText('Not taking part right now');

  // Opening the door changes what the room sees — the mode travels with it, so the preview can
  // never sit on "standing by" while the operator's own screen says Questions.
  await page.getByTestId('audience-open').check();
  await expect(preview.locator('.nj-send')).toBeVisible();
  await expect(preview).toContainText('Send us your question');

  await page.getByTestId('audience-mode').selectOption('comment');
  await expect(preview).toContainText('Your message');

  // READ-ONLY: an operator's preview must not be able to put words in the audience's mouth.
  await preview.locator('textarea').fill('Not from the operator, thanks');
  await preview.locator('.nj-send').click();
  await expect(preview).toContainText('send from a phone');
  await expect(page.locator('.pd-aud-row')).toHaveCount(0);
});

test('the public join page answers honestly on an offline build', async ({ page }) => {
  // The page is a capability URL, so every "nothing here" answer is the SAME answer — but an
  // offline build is not a capability question at all, and saying so beats showing a form that
  // could never send anything.
  await page.goto('/join/friday-night-live');
  await expect(page.locator('#join')).toContainText('runs offline');
  await expect(page.locator('form, textarea')).toHaveCount(0);
});

test('an unknown production workspace degrades to Playout rather than a dead surface', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Degrade');
  const url = page.url();
  await page.goto(`${url.replace(/\/(data|audience)$/, '')}/nonsense`);
  await expect(page.getByTestId('production-verbs')).toBeVisible();
  await expect(page.getByTestId('production-audience')).toHaveCount(0);
});
