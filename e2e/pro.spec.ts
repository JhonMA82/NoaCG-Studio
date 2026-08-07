import { test, expect, type Page } from '@playwright/test';
import { enableAdvancedMode } from './_create';

// NoaCG Pro - the image-guided pipeline as an execution TIER of the ONE Create-with-AI
// step (docs/NOACG_PRO_PLAN.md §7): no separate wizard card, the tier is chosen under
// ⚙ AI settings, and the brief/fields/uploads workflow is the shared one.
//
// The offline suite runs the STUB pipeline (no OpenRouter key configured): a deterministic
// locally-drawn concept compiled through the real normalizer, compiler and production
// validator - so what is pinned here is the product flow and the honesty of the report,
// with zero tokens. The remote path differs only in where the concept and interpretation
// come from.

async function toProTier(page: Page) {
  // Pro creates end in the EDITOR (wz-finish-editor) - an Advanced door now (step 6).
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  // There is no separate Pro entry card - Create with AI is the one AI door.
  await expect(page.locator('[data-entry="pro"]')).toHaveCount(0);
  await page.locator('[data-entry="ai"]').click();
  // Offline, with nothing configured, the settings open themselves; the tier lives there.
  await expect(page.getByTestId('ai-tier')).toBeVisible();
  await page.getByTestId('ai-tier-pro').click();
  await expect(page.getByRole('heading', { name: 'NoaCG Pro' })).toBeVisible();
}

test('pro: a tier of Create with AI - offline says so, no model pickers, Next waits for a result', async ({ page }) => {
  await toProTier(page);

  // Offline builds run the stub and say so - nothing pretends a model was involved.
  await expect(page.getByTestId('pro-offline-note')).toBeVisible();
  // A normal Pro user picks NO models: the tier's settings carry the key surface only.
  await expect(page.getByTestId('ai-pro-settings')).toBeVisible();
  await expect(page.getByTestId('ai-pro-settings').getByText('Model', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('ai-pro-settings').getByText('Vercel AI Gateway key', { exact: true })).toBeVisible();
  // Nothing to finish yet.
  await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled();
});

test('pro: brief + fields -> concept -> honest report -> editor, as an ordinary editable graphic', async ({ page }) => {
  await toProTier(page);

  // The SHARED workflow authors the brief: category + data fields from More control.
  await page.getByTestId('more-control-toggle').click();
  await page.getByRole('button', { name: /^Lower third/ }).click();
  await page.getByRole('button', { name: /Data fields/ }).click();
  await page.getByLabel('Example value').first().fill('Maya Chen');
  await page.getByLabel('Example value').nth(1).fill('Anchor · Evening News');

  await page.locator('.wz-step textarea').first().fill('Calm election-night strap, deep blue.');
  // One press runs concept -> interpret -> compile -> the REAL production gate (static +
  // live runtime bench), so give it room.
  await page.getByRole('button', { name: '✧ Generate' }).click();
  await expect(page.getByTestId('pro-report')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('pro-report')).toContainText('Offline concept');
  await expect(page.getByTestId('pro-report')).toContainText('fully reconstructed, no raster left');
  // The report is per-region and names what became editable.
  await expect(page.getByTestId('pro-outcomes')).toContainText('Name');
  await expect(page.getByTestId('pro-outcomes')).toContainText('operator-editable text field');
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes SPX validation');

  // Finish: name it and take the editor door.
  await page.getByRole('button', { name: 'Next →' }).click();
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
    expect.objectContaining({ id: 'f0', title: 'Name', value: 'Maya Chen' }),
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

test('pro: an as-is upload is bundled into the logo slot it asked the concept for', async ({ page }) => {
  await toProTier(page);

  // A small opaque PNG - guessPurpose reads a mark-sized picture as "use it as it is", which
  // is what makes the brief ask the concept for a logo area in the first place.
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0b6cf0';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(32, 32, 64, 64);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.setInputFiles('.wz-drop input[type=file]', {
    name: 'mark.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('ai-upload')).toHaveAttribute('data-purpose', 'asset');

  await page.locator('.wz-step textarea').first().fill('A calm news strap with the channel mark.');
  await page.getByRole('button', { name: '✧ Generate' }).click();
  await expect(page.getByTestId('pro-report')).toBeVisible({ timeout: 60_000 });
  // The report says what happened to the mark - not that a slot exists somewhere.
  await expect(page.getByTestId('pro-outcomes')).toContainText(
    "Your uploaded mark was bundled as images/mark.png and set as the Logo slot's value.",
  );

  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByTestId('wz-finish-name').fill('Marked Strap');
  await page.getByTestId('wz-finish-editor').click();
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Marked Strap');

  const placed = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const state = useTemplateStore.getState();
    const t = state.template;
    const slot = t.fields.find((f) => f.ftype === 'filelist');
    return {
      slotValue: slot?.value ?? null,
      sample: slot ? state.sampleData[slot.field] ?? null : null,
      bundled: t.assets.some((a) => a.path === 'images/mark.png'),
      srcInMarkup: slot ? new RegExp(`<img[^>]*id="${slot.field}"[^>]*src="images/mark.png"`).test(t.html) : false,
    };
  });
  // The field carries the path, the project's sample data follows from that default, and the
  // file really rides the template - a value pointing at nothing is the dangling-reference
  // defect this slice exists to avoid.
  expect(placed.slotValue).toBe('images/mark.png');
  expect(placed.sample).toBe('images/mark.png');
  expect(placed.bundled).toBe(true);
  expect(placed.srcInMarkup).toBe(true);
});

test('pro: filling the slot retires the empty-slot warning, keeps the as-is screen clean, and ignores a reference', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // Driven directly: the stub concept's logo area sits INSIDE its opaque strap, so the
  // compile has nothing to warn about there. A logo clear of every panel is the case the
  // warning exists for - and the case whose wording changes once a file is picked.
  const out = await page.evaluate(async () => {
    const bust = `?t=${Date.now()}`;
    const { normalizeProInterpretation } = await import(`/src/ai/pro/normalize.ts${bust}`);
    const { compileProPlan, PRO_EMPTY_LOGO_SLOT_WARNING } = await import(`/src/ai/pro/compile.ts${bust}`);
    const { fillProLogoSlot } = await import(`/src/ai/pro/logoAsset.ts${bust}`);
    const { assetIntegrityFindings } = await import(`/src/ai/assetIntegrity.ts${bust}`);
    const { parseDefinition } = await import(`/src/model/spxDefinition.ts${bust}`);
    const { uuid } = await import(`/src/model/id.ts${bust}`);

    const FRAME = { width: 1920, height: 1080 };
    const canvas = document.createElement('canvas');
    canvas.width = FRAME.width;
    canvas.height = FRAME.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#202530';
    ctx.fillRect(0, 0, FRAME.width, FRAME.height);
    const concept = { dataUrl: canvas.toDataURL('image/png'), ...FRAME };

    const interpretation = {
      version: 1,
      graphicType: 'lower-third',
      graphicTypeConfidence: 0.9,
      regions: [
        { kind: 'text', bbox: { x: 0.1, y: 0.78, w: 0.2, h: 0.04 }, confidence: 0.9,
          treatment: 'rebuild-text', role: 'person-name', suggestedTitle: 'Name', sampleText: 'Noa' },
        // Clear of everything: nothing rebuilt covers it, so the crop keeps the baked mark.
        { kind: 'logo', bbox: { x: 0.6, y: 0.78, w: 0.05, h: 0.05 }, confidence: 0.9,
          treatment: 'keep-asset', suggestedTitle: 'Channel mark' },
      ],
      animation: { presetId: 'design-fade', speed: 1 },
      warnings: [],
    };
    const brief = { brief: '', name: 'Noa', title: 'Anchor', includeLogo: true };
    const plan = normalizeProInterpretation(interpretation, FRAME, uuid);
    const compiled = await compileProPlan(plan, concept, brief, {});
    const base = { ...compiled, validation: null, concept };

    const mark = { path: 'images/mark.png', data: 'data:image/png;base64,iVBORw0KGgo=' };
    const filled = fillProLogoSlot(base, { asset: mark, purpose: 'asset', binding: 'swappable' });
    // A vision-only reference is never bundled or placed (model/imagePurpose.ts).
    const asReference = fillProLogoSlot(base, { asset: mark, purpose: 'mood' });

    const slot = filled.report.logoSlot;
    return {
      emptyWarning: PRO_EMPTY_LOGO_SLOT_WARNING,
      before: {
        warnings: compiled.report.warnings,
        note: compiled.report.outcomes[1].note,
        nameNote: compiled.report.outcomes[0].note,
        assets: compiled.template.assets.length,
      },
      after: {
        warnings: filled.report.warnings,
        note: filled.report.outcomes[1].note,
        nameNote: filled.report.outcomes[0].note,
        assets: filled.template.assets.length,
        slotValue: filled.template.fields.find((f) => f.field === slot?.fieldId)?.value ?? null,
        // Re-PARSED, not string-matched: the definition inside the HTML is what survives a
        // reload, and a value only in the parsed field list would be lost on the next read.
        definitionValue: parseDefinition(filled.template.html)?.fields
          .find((f) => f.field === slot?.fieldId)?.value ?? null,
        wrapperFilled: new RegExp(`<div\\b[^>]*\\bid="${slot?.wrapperId}"[^>]*>`)
          .exec(filled.template.html)?.[0]?.includes('has-image') ?? false,
        integrity: assetIntegrityFindings(filled.template, ['images/mark.png']).map((f) => f.rule),
      },
      referenceUntouched: asReference === base,
    };
  });

  // Before: the slot is empty and the report says so.
  expect(out.before.warnings).toContain(out.emptyWarning);
  expect(out.before.assets).toBe(1);
  // After: the mark is bundled, the value is written into the DEFINITION (not just the parsed
  // field list), the empty-slot line is gone, and only the logo's own outcome changed.
  expect(out.after.assets).toBe(2);
  expect(out.after.slotValue).toBe('images/mark.png');
  expect(out.after.definitionValue).toBe('images/mark.png');
  expect(out.after.wrapperFilled).toBe(true);
  expect(out.after.warnings).not.toContain(out.emptyWarning);
  expect(out.after.note).toContain('bundled as images/mark.png');
  expect(out.after.nameNote).toBe(out.before.nameNote);
  // The as-is screen finds the picture (an <img> with that src) and has nothing to report:
  // the slot's rules crop, filter and distort nothing.
  expect(out.after.integrity).toEqual([]);
  // A picture that is not "use it as it is" is not bundled at all.
  expect(out.referenceUntouched).toBe(true);
});

test('pro: the quality gate is handed the FILLED template, not the one with an empty slot', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // The as-is screen finds a protected picture by its <img src> (assetIntegrity.ts
  // targetsOf), so a fill applied AFTER validation would be screened by nothing at all -
  // and the readiness rows the user reads would describe a template they never get. The
  // fill therefore rides the pipeline, and this is what pins the order: a validator that
  // reports what it was actually given.
  const seen = await page.evaluate(async () => {
    const bust = `?t=${Date.now()}`;
    const { stubProConcept, stubCompilePro } = await import(`/src/ai/pro/stub.ts${bust}`);
    const { assetIntegrityFindings } = await import(`/src/ai/assetIntegrity.ts${bust}`);

    const brief = { brief: '', name: 'Maya Chen', title: 'Anchor', includeLogo: true };
    const concept = await stubProConcept(brief);
    const looked: { src: boolean; screened: boolean }[] = [];
    const validate = async (t: { html: string }) => {
      looked.push({
        src: /<img[^>]*src="images\/mark\.png"/.test(t.html),
        // The screen can only REACH the picture once its src is there; an empty finding
        // list from a template it cannot see would be a false all-clear.
        screened: assetIntegrityFindings(t, ['images/mark.png']).length === 0
          && /<img[^>]*src="images\/mark\.png"/.test(t.html),
      });
      return { ok: true, errors: [], warnings: [] };
    };
    await stubCompilePro(brief, concept, {
      validate,
      logoMark: {
        asset: { path: 'images/mark.png', data: 'data:image/png;base64,iVBORw0KGgo=' },
        purpose: 'asset',
        binding: 'swappable',
      },
    });
    return looked;
  });

  expect(seen).toEqual([{ src: true, screened: true }]);
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
        { kind: 'text', bbox: norm(NAME), confidence: 0.9, treatment: 'rebuild-text', role: 'person-name', suggestedTitle: 'Name', sampleText: 'Maya Chen' },
        { kind: 'text', bbox: norm(TITLE), confidence: 0.9, treatment: 'rebuild-text', role: 'person-role', suggestedTitle: 'Title', sampleText: 'Anchor' },
      ],
      animation: { presetId: 'design-fade', speed: 1 },
      warnings: [],
    };
    const brief = { name: 'Maya Chen', title: 'Anchor', includeLogo: false, style: '' };

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

test('pro: decorative regions with panel geometry are rebuilt, and a duplicate box becomes one layer', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // Models file accent bars under kind "decorative" (every checked-in fixture does) and
  // sometimes report one strap twice - a 'panel' and a 'decorative' twin on the same box.
  // The plan must rebuild the bar and paint the strap ONCE.
  const out = await page.evaluate(async () => {
    const bust = `?t=${Date.now()}`;
    const { normalizeProInterpretation } = await import(`/src/ai/pro/normalize.ts${bust}`);
    const { uuid } = await import(`/src/model/id.ts${bust}`);

    const FRAME = { width: 1920, height: 1080 };
    const strap = { x: 0.1, y: 0.75, w: 0.4, h: 0.12 };
    const interpretation = {
      version: 1,
      graphicType: 'lower-third',
      graphicTypeConfidence: 0.9,
      regions: [
        { kind: 'panel', bbox: strap, confidence: 0.9, treatment: 'rebuild-shape',
          panel: { shape: 'panel', fill: { kind: 'solid', color: '#16181d' }, opacity: 1 } },
        // The duplicate twin: same box, filed as decorative.
        { kind: 'decorative', bbox: strap, confidence: 0.9, treatment: 'rebuild-shape',
          panel: { shape: 'panel', fill: { kind: 'solid', color: '#16181d' }, opacity: 1 } },
        // The accent bar, filed as decorative WITH geometry: must rebuild.
        { kind: 'decorative', bbox: { x: 0.1, y: 0.75, w: 0.004, h: 0.12 }, confidence: 0.9,
          treatment: 'rebuild-shape',
          panel: { shape: 'accent-bar', fill: { kind: 'solid', color: '#f5a623' }, opacity: 1 } },
        // Geometry-less decoration: stays raster.
        { kind: 'decorative', bbox: { x: 0.3, y: 0.9, w: 0.05, h: 0.01 }, confidence: 0.9, treatment: 'keep-asset' },
        { kind: 'text', bbox: { x: 0.12, y: 0.78, w: 0.2, h: 0.04 }, confidence: 0.9,
          treatment: 'rebuild-text', role: 'person-name', suggestedTitle: 'Name', sampleText: 'Noa' },
      ],
      animation: { presetId: 'design-slide', speed: 1 },
      warnings: [],
    };
    const plan = normalizeProInterpretation(interpretation, FRAME, uuid);
    return {
      panelLayers: plan.panels.map((p: { shape: string }) => p.shape),
      treatments: plan.outcomes.map((o: { kind: string; treatment: string }) => `${o.kind}:${o.treatment}`),
      unitPad: plan.unitPad,
    };
  });

  // One strap layer (the twin deduped) + the accent bar - not three layers.
  expect(out.panelLayers.sort()).toEqual(['accent-bar', 'panel']);
  expect(out.treatments).toEqual([
    'panel:rebuild-shape',
    'decorative:rebuild-shape',
    'decorative:rebuild-shape',
    'decorative:keep-asset',
    'text:rebuild-text',
  ]);
  // The strap owns every union edge except where the raster decoration sticks out below -
  // that side keeps its pad, the rebuilt edges crop tight.
  expect(out.unitPad.left).toBe(0);
  expect(out.unitPad.top).toBe(0);
  expect(out.unitPad.right).toBe(0);
  expect(out.unitPad.bottom).toBeGreaterThan(0);
});
