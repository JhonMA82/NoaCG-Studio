import { test, expect } from '@playwright/test';
import { createProject } from './_create';

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
