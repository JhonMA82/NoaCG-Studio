import { test, expect } from '@playwright/test';
import { createProject } from './_create';
import { parkFocusOffControls } from './_keys';

// Recovery drills (docs/GOALS.md "Student release" step 10 — the agent-automatable half).
// Each drill is a classroom failure that must be OBSERVED handled, not assumed: the ones
// needing the real backend/hardware (renderer reboot, boot recovery on /output, republish
// payload swap) live on the owner checklist (docs/STUDENT_RELEASE_ACCEPTANCE.md) and the
// live-verify list (docs/CLOUD_PLAYOUT.md §8); wrong-take → Out / All out is pinned in
// productions.spec.ts; expired-session recovery in configured/account.spec.ts. What runs
// here is the one drill that is fully offline: storage exhaustion.

test('storage full: a save fails LOUDLY, the library keeps the last good copy, freeing space recovers', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });

  // Save once — the baseline copy that must survive everything below.
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Quota victim');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  // Fill localStorage until it refuses, then keep shrinking the step so almost nothing is
  // left — the classroom failure is a device already stuffed with graphics and fonts.
  // Padding rides ONE well-known key so cleanup is exact. (Replacing an existing key only
  // needs the DELTA, so the edit below is deliberately large enough not to fit.)
  await page.evaluate(() => {
    const grow = (step: number) => {
      for (;;) {
        try {
          localStorage.setItem('spx-e2e-filler', (localStorage.getItem('spx-e2e-filler') ?? '') + 'x'.repeat(step));
        } catch {
          return; // full at this granularity — the last successful set stays stored
        }
      }
    };
    grow(4 * 1024 * 1024);
    grow(256 * 1024);
    grow(16 * 1024);
    grow(2 * 1024);
  });

  // Edit (large enough that the rewrite cannot fit in the sliver left), then try to save.
  // The status must say FAILED — a silent failure is the one outcome this drill exists to
  // rule out — and the stored record must still be the last good copy, not a torn write.
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.applyTemplate({ ...s.template, css: s.template.css + '\n/* mid-crisis edit */\n/*' + 'y'.repeat(256 * 1024) + '*/\n' });
  });
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-status')).toHaveText('Save failed');

  const stored = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const doc = loadGraphics().find((g) => g.name === 'Quota victim');
    return { exists: !!doc, carriesEdit: doc?.template.css.includes('mid-crisis edit') ?? false };
  });
  expect(stored.exists).toBe(true);
  expect(stored.carriesEdit).toBe(false); // the last GOOD copy, not a torn write

  // Freeing space recovers without a reload: the same Ctrl+S lands the edit.
  await page.evaluate(() => localStorage.removeItem('spx-e2e-filler'));
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  const after = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().find((g) => g.name === 'Quota victim')?.template.css.includes('mid-crisis edit') ?? false;
  });
  expect(after).toBe(true);
});

/** Air a graphic from a fresh production and land on its dashboard. */
async function productionOnAir(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill(name);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
}

test('SPACE puts the selected cue on air and takes it off again, and 0 still means Out', async ({ page }) => {
  // Acceptance pass, 2026-08-06: "you take with space and go out with — is it zero? It should
  // be take. Put something on and take takes it off. It should go in and out with space."
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionOnAir(page, 'Space Toggle');

  const chip = page.getByTestId('live-cue-chip');
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(chip).not.toContainText('nothing on air');
  // The buttons say what the key now does: the same press takes it off.
  await expect(page.getByTestId('verb-take')).toContainText('RE-TAKE');
  await expect(page.getByTestId('verb-out')).toContainText('SPACE');

  await page.keyboard.press(' ');
  await expect(chip).toContainText('nothing on air');
  await expect(page.getByTestId('verb-take')).toContainText('TAKE');
  await expect(page.getByTestId('verb-take')).not.toContainText('RE-TAKE');

  // 0 keeps working, from either state — the toggle ADDS a gesture, it replaces none.
  await page.keyboard.press(' ');
  await expect(chip).not.toContainText('nothing on air');
  await page.keyboard.press('0');
  await expect(chip).toContainText('nothing on air');

  // The explicit RE-TAKE stays reachable: the button, on a cue that is already live.
  await page.keyboard.press(' ');
  await expect(page.getByTestId('verb-take')).toContainText('RE-TAKE');
  await page.getByTestId('verb-take').click();
  await expect(chip).not.toContainText('nothing on air');
});

test('an edit to the cue that is on air says it has not been sent yet', async ({ page }) => {
  // Acceptance pass, 2026-08-06: "there needs to be an alert when something changes and you
  // need to send that update. I had problems with my CasparCG output but only because I hadn't
  // sent an update, and the dashboard doesn't prompt me."
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionOnAir(page, 'Unsent');

  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('verb-take').click();
  const unsent = page.getByTestId('cue-unsent');
  await expect(unsent).toContainText('changes push live on');

  // Type into the live cue: air is now behind the screen, and the surface says so.
  await page.getByTestId('cue-field-f0').fill('Not sent yet');
  await expect(unsent).toContainText('not on air yet');
  await expect(page.getByTestId('verb-update')).toHaveClass(/pd-unsent/);
  // …and it is telling the truth — air still shows the previous value.
  await expect(program.locator('#f0')).not.toHaveText('Not sent yet');

  await page.getByTestId('verb-update').click();
  await expect(program.locator('#f0')).toHaveText('Not sent yet');
  await expect(unsent).toContainText('changes push live on');
  await expect(page.getByTestId('verb-update')).not.toHaveClass(/pd-unsent/);
});
