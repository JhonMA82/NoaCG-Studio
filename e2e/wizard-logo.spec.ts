import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { chooseType, pickDesign } from './_browse';

// The wizard's logo option: a variant that declares `logo: 'optional'` offers a toggle +
// custom upload on the Fields step; enabling it makes the created template carry a REAL
// SPX image field (filelist) bound to an <img id="fN">, with the uploaded file embedded
// as a data-URL asset. Toggled off, nothing is injected.

// A 1×1 orange PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

async function toFieldsStep(page: Page, category: string, variantName: string) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, category);
  await pickDesign(page, variantName);
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
}

async function createdTemplate(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return {
      fields: t.fields,
      assets: t.assets.map((a) => a.path),
      html: t.html,
    };
  });
}

test('logo toggle + custom upload: the created template carries the field, asset, and <img>', async ({ page }) => {
  await toFieldsStep(page, 'Topic', 'Hairline Card');

  // The optional-logo section is offered; turn it on and upload a custom logo.
  const logoSection = page.locator('.panel-section', { hasText: 'Include a logo slot' });
  await logoSection.getByRole('checkbox').check();
  await logoSection.locator('input[type="file"]').setInputFiles({
    name: 'club-crest.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(logoSection.locator('img[alt="Logo preview"]')).toBeVisible();

  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });

  const t = await createdTemplate(page);
  // The logo is a real SPX image field after the three text lines…
  const logoField = t.fields.find((f: { ftype: string }) => f.ftype === 'filelist')!;
  expect(logoField).toMatchObject({ field: 'f3', title: 'Logo', value: 'images/club-crest.png' });
  // …the uploaded file rides along as a data-URL asset…
  expect(t.assets).toContain('images/club-crest.png');
  // …and the design carries the bound <img> with the shared slot's class.
  expect(t.html).toContain('<img id="f3" class="info-card-logo"');

  // The preview (already rebuilt above) resolves images/ through the asset shim.
  const src = await page
    .frameLocator('iframe.preview-frame')
    .locator('#f3')
    .evaluate((el) => (el as HTMLImageElement).src);
  expect(src.startsWith('data:image/png')).toBeTruthy();
});

test('a lower third places the logo BESIDE the text, not above it', async ({ page }) => {
  // The 2026-08-13 Pro brand round's standing review rule: lower thirds stay vertically
  // compact - the mark sits beside the text/banner, never stacked above it. The shared slot
  // arranges that with a two-column grid on the box; info cards (the test above) keep the
  // stacked band, because a card is a vertical composition.
  //
  // Measured 2026-08-14, which is why the rule is worth a spec: stacked, the mark made lt02
  // 83% taller, lt25 74% and lt11 57%, and lt11 serves most branded output.
  await toFieldsStep(page, 'Lower thirds', 'House Strap');

  const logoSection = page.locator('.panel-section', { hasText: 'Include a logo slot' });
  await logoSection.getByRole('checkbox').check();
  await logoSection.locator('input[type="file"]').setInputFiles({
    name: 'club-crest.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(logoSection.locator('img[alt="Logo preview"]')).toBeVisible();

  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });

  const t = await createdTemplate(page);
  // The slot is the shared one…
  expect(t.html).toContain('class="lower-third-logo"');
  // …and it is the box's LAST child. That is not a formatting detail: a design addresses its
  // own children positionally (lt02 drops every line after the first below its underline with
  // `.lower-third-mask:nth-child(n + 2)`), so a mark inserted at the FRONT renumbers all of
  // them and the name renders under the rule. Measured 2026-08-14; the grid places the mark in
  // column one regardless of source order, so nothing is lost by putting it last.
  const logoAt = t.html.indexOf('lower-third-logo');
  const lastLineAt = t.html.lastIndexOf('lower-third-mask');
  expect(logoAt).toBeGreaterThan(0);
  expect(logoAt).toBeGreaterThan(lastLineAt);

  // Rendered: the box is a grid and the mark sits BESIDE the first text line - overlapping
  // it vertically, wholly to its left - rather than in a row of its own above it.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('.lower-third-box')).toHaveCSS('display', 'grid');
  const boxes = await frame.locator('.lower-third-box').evaluate((box) => {
    const logo = box.querySelector('.lower-third-logo')!.getBoundingClientRect();
    const line = box.querySelector('#f0')!.getBoundingClientRect();
    return { logo: { right: logo.right, top: logo.top, bottom: logo.bottom }, line: { left: line.left, top: line.top, bottom: line.bottom } };
  });
  expect(boxes.logo.right).toBeLessThanOrEqual(boxes.line.left);
  expect(boxes.logo.top).toBeLessThan(boxes.line.bottom);
  expect(boxes.logo.bottom).toBeGreaterThan(boxes.line.top);
});

test('logo toggle off: nothing is injected', async ({ page }) => {
  await toFieldsStep(page, 'Topic', 'Hairline Card');
  // Offered but left off (the default when no image was imported).
  await expect(page.locator('.panel-section', { hasText: 'Include a logo slot' })).toBeVisible();
  await finishIntoEditor(page);
  await expect(page.locator('.wz-modal')).toBeHidden();

  const t = await createdTemplate(page);
  expect(t.fields.some((f: { ftype: string }) => f.ftype === 'filelist')).toBeFalsy();
  expect(t.html).not.toContain('info-card-logo');
});

test('a no-logo design offers no logo section', async ({ page }) => {
  await toFieldsStep(page, 'Lower thirds', 'Hairline');
  await expect(page.locator('.wz-line-row').first()).toBeVisible();
  await expect(page.locator('.panel-section', { hasText: 'Include a logo slot' })).toBeHidden();
});
