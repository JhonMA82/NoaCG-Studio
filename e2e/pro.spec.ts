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
  await expect(page.getByTestId('pro-report')).toContainText('fully reconstructed, no raster left');
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
      assetCount: t.assets.length,
    };
  });
  // The stub strap's every edge is a rebuilt opaque panel, so the tightened crop makes the
  // reconstruction cover the whole unit and the raster is dropped: pure editable code.
  expect(shape.assetCount).toBe(0);
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

test('pro: baked text outside panels is erased where the backdrop is flat, refused honestly where not', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // Drive the compiler directly with a hand-built interpretation: two text regions, NO
  // panels - so nothing covers the baked text and every unit edge keeps its pad ring.
  // The flat concept exercises the clean path (erase + ring matte); the gradient concept
  // exercises both refusals. This is the coverage the checked-in fixtures cannot give:
  // their text is panel-covered and their backdrops are non-flat.
  const out = await page.evaluate(async () => {
    const bust = `?t=${Date.now()}`;
    const { normalizeProInterpretation } = await import(`/src/ai/pro/normalize.ts${bust}`);
    const { compileProPlan } = await import(`/src/ai/pro/compile.ts${bust}`);
    const { uuid } = await import(`/src/model/id.ts${bust}`);

    const FRAME = { width: 1920, height: 1080 };
    const NAME = { x: 200, y: 840, w: 400, h: 44 };
    const TITLE = { x: 200, y: 910, w: 360, h: 28 };
    const norm = (r: { x: number; y: number; w: number; h: number }) =>
      ({ x: r.x / FRAME.width, y: r.y / FRAME.height, w: r.w / FRAME.width, h: r.h / FRAME.height });

    const draw = (flat: boolean) => {
      const canvas = document.createElement('canvas');
      canvas.width = FRAME.width;
      canvas.height = FRAME.height;
      const ctx = canvas.getContext('2d')!;
      if (flat) {
        ctx.fillStyle = '#202530';
        ctx.fillRect(0, 0, FRAME.width, FRAME.height);
      } else {
        const g = ctx.createLinearGradient(0, 0, FRAME.width, FRAME.height);
        g.addColorStop(0, '#101010');
        g.addColorStop(1, '#e0e0e0');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, FRAME.width, FRAME.height);
      }
      // "Text" ink strictly inside the regions, clear of the 3px sample ring.
      ctx.fillStyle = '#f5f6f8';
      ctx.fillRect(NAME.x + 6, NAME.y + 8, NAME.w - 12, NAME.h - 16);
      ctx.fillRect(TITLE.x + 6, TITLE.y + 8, TITLE.w - 12, TITLE.h - 16);
      return canvas.toDataURL('image/png');
    };

    const interpretation = {
      version: 1,
      graphicType: 'lower-third',
      graphicTypeConfidence: 0.9,
      regions: [
        { kind: 'text', bbox: norm(NAME), confidence: 0.9, treatment: 'rebuild-text', role: 'person-name', suggestedTitle: 'Name', sampleText: 'Noa Haline' },
        { kind: 'text', bbox: norm(TITLE), confidence: 0.9, treatment: 'rebuild-text', role: 'person-role', suggestedTitle: 'Title', sampleText: 'Anchor' },
      ],
      animation: { presetId: 'design-fade', speed: 1 },
      warnings: [],
    };
    const brief = { name: 'Noa Haline', title: 'Anchor', includeLogo: false, style: '' };

    const compileOn = async (flat: boolean) => {
      const dataUrl = draw(flat);
      const plan = normalizeProInterpretation(interpretation, FRAME, uuid);
      const { template, report } = await compileProPlan(plan, { dataUrl, ...FRAME }, brief, {});
      // Read the shipped artwork back: the erased text centre and a ring corner pixel.
      const art = template.assets[0]?.data ?? null;
      let centre = null;
      let corner = null;
      if (art) {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = art;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
        centre = at(NAME.x - plan.unit.x + Math.round(NAME.w / 2), NAME.y - plan.unit.y + Math.round(NAME.h / 2));
        corner = at(0, 0);
      }
      return { report: { textErased: report.textErased, ringMatted: report.ringMatted, warnings: report.warnings }, centre, corner };
    };

    return { flat: await compileOn(true), gradient: await compileOn(false) };
  });

  // Flat backdrop: both baked lines erased, the pad ring written as transparency, no
  // baked-text warning left to give.
  expect(out.flat.report.textErased).toBe(2);
  expect(out.flat.report.ringMatted).toBe(true);
  expect(out.flat.report.warnings).toEqual([]);
  // The shipped pixels agree with the report: the name's centre is the backdrop fill again
  // (not the near-white ink), and the ring corner is fully transparent.
  expect(out.flat.centre![3]).toBe(255);
  expect(out.flat.centre![0]).toBeLessThan(120);
  expect(out.flat.corner).toEqual([0, 0, 0, 0]);

  // Gradient backdrop: both passes refuse rather than guess, and each refusal is reported.
  expect(out.gradient.report.textErased).toBe(0);
  expect(out.gradient.report.ringMatted).toBe(false);
  expect(out.gradient.report.warnings.some((w: string) => w.includes('"Name"') && w.includes('non-flat'))).toBe(true);
  expect(out.gradient.report.warnings.some((w: string) => w.includes('"Title"') && w.includes('non-flat'))).toBe(true);
  expect(out.gradient.report.warnings.some((w: string) => w.includes('ring of the concept'))).toBe(true);
  // The refused artwork still carries the baked ink and an opaque ring corner.
  expect(out.gradient.centre![3]).toBe(255);
  expect(out.gradient.centre![0]).toBeGreaterThan(200);
  expect(out.gradient.corner![3]).toBe(255);
});
