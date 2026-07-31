import { test, expect, type Page } from '@playwright/test';

// NoaCG Pro - the image-guided pipeline's wizard flow (docs/NOACG_PRO_PLAN.md §7).
//
// The offline suite runs the STUB pipeline (no AI configured): a deterministic locally-drawn
// concept compiled through the real normalizer, compiler and production validator - so what
// is pinned here is the product flow and the honesty of the report, with zero tokens. The
// remote path differs only in where the concept and interpretation come from.

async function toProStep(page: Page) {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="pro"]').click();
  await expect(page.getByTestId('pro-step')).toBeVisible();
}

test('pro: the entry card leads to the step, offline mode says so, and Next waits for a result', async ({ page }) => {
  await toProStep(page);

  // Offline builds run the stub and say so - nothing pretends a model was involved.
  await expect(page.getByTestId('pro-offline-note')).toBeVisible();
  // No image-model picker offline: the route belongs to the remote path.
  await expect(page.getByTestId('pro-image-model')).toHaveCount(0);
  // Nothing to finish yet.
  await expect(page.getByRole('button', { name: 'Next ›' })).toBeDisabled();
});

test('pro: concept -> compile -> honest report -> editor, as an ordinary editable graphic', async ({ page }) => {
  await toProStep(page);

  await page.getByTestId('pro-name').fill('Noa Haline');
  await page.getByTestId('pro-title').fill('Anchor · Evening News');
  await page.getByTestId('pro-generate').click();

  // The concept renders for review before anything is compiled.
  await expect(page.getByTestId('pro-concept')).toBeVisible();
  await expect(page.getByTestId('pro-concept')).toContainText('Offline concept');

  // Compile runs the REAL production gate (static + live runtime bench), so give it room.
  await page.getByTestId('pro-compile').click();
  await expect(page.getByTestId('pro-report')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('pro-report')).toContainText('Compiled, validated');
  // The report is per-region and names what became editable.
  await expect(page.getByTestId('pro-outcomes')).toContainText('Name');
  await expect(page.getByTestId('pro-outcomes')).toContainText('operator-editable text field');

  // Finish: name it and take the editor door.
  await page.getByRole('button', { name: 'Next ›' }).click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
  await page.getByTestId('wz-finish-name').fill('Election Night Strap');
  await page.getByTestId('wz-finish-editor').click();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Election Night Strap');

  // The compiled graphic is an ORDINARY template: live fields with the brief's values,
  // reconstructed panels as registry parts, and a timeline-editable NOACG_ANIM block.
  const shape = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { getTemplateParts } = await import('/src/model/structure.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const t = useTemplateStore.getState().template;
    return {
      fields: t.fields.map((f) => ({ id: f.field, title: f.title, value: f.value })),
      parts: getTemplateParts(t.html, t.fields).map((p) => p.selector),
      hasAnimData: parseAnimData(t.js) !== null,
    };
  });
  expect(shape.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'f0', title: 'Name', value: 'Noa Haline' }),
    expect.objectContaining({ id: 'f1', title: 'Title', value: 'Anchor · Evening News' }),
  ]));
  expect(shape.parts).toEqual(expect.arrayContaining([
    '.imported-design-panel-1',
    '.imported-design-panel-2',
    '#f0',
    '#f1',
  ]));
  expect(shape.hasAnimData).toBe(true);
});
