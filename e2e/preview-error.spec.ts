import { test, expect } from '@playwright/test';
import { createProject } from './_create';
import { awaitPreviewRebuild } from './_preview';

// A template whose JS throws at load must not fail SILENTLY on the canvas. The preview document
// posts the error back (composeDocument's error hook -> store previewError), and before this
// spec the only surface that showed it was the Export panel - a person watching the stage saw a
// broken graphic and no explanation anywhere. PreviewFrame now wears the error on the stage
// itself (.preview-runtime-error), cleared automatically because every rebuild starts by
// resetting previewError.

/** Swap the working template's JS through the same one-apply path every editor surface uses. */
async function applyJs(page: import('@playwright/test').Page, js: string | null) {
  await awaitPreviewRebuild(page, () =>
    page.evaluate(async (code: string | null) => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const s = useTemplateStore.getState();
      s.applyTemplate({ ...s.template, js: code ?? s.template.js });
    }, js),
  );
}

test('a template runtime error is worn on the stage, and clears on the next good build', async ({ page }) => {
  await createProject(page, 'Hairline');
  const badge = page.getByTestId('preview-runtime-error');
  await expect(badge).toBeHidden();

  // Keep the good code to restore - the "fix" half of the test.
  const goodJs = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });

  await applyJs(page, 'throw new Error("boom at load");');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('boom at load');

  // The badge must not take gestures from the canvas under it (it is a label, not a control).
  await expect(badge).toHaveCSS('pointer-events', 'none');

  await applyJs(page, goodJs);
  await expect(badge).toBeHidden();
});
