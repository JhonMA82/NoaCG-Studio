import { test, expect, type Page } from '@playwright/test';

// NoaCG Pro - the pipeline as an execution TIER of the ONE Create-with-AI step
// (docs/NOACG_PRO_PLAN.md §7): no separate wizard card, the tier is chosen under
// ⚙ AI settings, and the brief/fields/uploads workflow is the shared one.
//
// **THE TIER IS OFFERED ONLY WHERE IT CAN ACTUALLY RUN** (owner, 2026-08-14): the server says
// hosted Pro is available AND the deployment carries the backend that route is metered
// through. A NoaCG tier runs on NoaCG's own service or it is not offered - it never asks a
// customer for a key to reach our own models. The offline suite is by definition the second
// half of that condition being false, so these specs pin the ABSENCE of the door, including
// the case that matters most: a status endpoint answering "available" is NOT enough on its
// own, or the AND would be an OR that nothing noticed.
//
// That absence is also why nothing here walks the wizard into Pro any more. The pipeline
// itself is still covered, and still token-free, by driving `pro/stub.ts` directly - the same
// route `scripts/pro-bench.mjs` takes. What is NOT covered offline, and is stated rather than
// quietly lost: the wizard walk through a hosted Pro generation and the allowance read-back,
// both of which need a backend-configured deployment (e2e/configured/ territory).

/** Answer /api/ai/pro-status as a deployment that offers hosted Pro. */
async function withHostedPro(page: Page, allowance = { daily: 3, monthly: 10 }) {
  await page.route('**/api/ai/pro-status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      profile: 'pro',
      enabled: true,
      available: true,
      requiresSignIn: false,
      maxGenerationCostUsd: 0.15,
      allowance: {
        dailyStartsRemaining: allowance.daily,
        monthlyStartsRemaining: allowance.monthly,
        dailySuccessesRemaining: 2,
        monthlySuccessesRemaining: 8,
      },
    }),
  }));
}

async function openAiTier(page: Page) {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  // There is no separate Pro entry card - Create with AI is the one AI door.
  await expect(page.locator('[data-entry="pro"]')).toHaveCount(0);
  await page.locator('[data-entry="ai"]').click();
  await expect(page.getByTestId('ai-tier')).toBeVisible();
}

test('pro: a status endpoint saying "available" is not enough on a build that cannot run it', async ({ page }) => {
  // The AND rule, from the side that is easy to get wrong: hosted Pro reserves and settles per
  // account, so a deployment with no backend cannot run it however the status answers. If this
  // ever passes as a visible tier, the two conditions have quietly become one.
  await withHostedPro(page);
  await openAiTier(page);
  await expect(page.getByTestId('ai-tier-pro')).toHaveCount(0);
  await expect(page.getByTestId('ai-tier')).not.toContainText('NoaCG Pro');
});

test('pro: with no hosted route at all, the tier is absent and nothing asks for a key', async ({ page }) => {
  await openAiTier(page);
  await expect(page.getByTestId('ai-tier-pro')).toHaveCount(0);
  // ABSENT, not greyed: a tier listed as unavailable still advertises itself. And the panel
  // that remains never asks for a key to reach NoaCG's own models - the only key surface here
  // belongs to the bring-your-own-key tier, for the user's own provider.
  await expect(page.getByTestId('ai-settings')).not.toContainText(/gateway/i);
  await expect(page.getByTestId('ai-pro-settings')).toHaveCount(0);
});

test('pro: the compiled concept is an ordinary editable template', async ({ page }) => {
  // The shape the wizard walk used to assert, driven straight at the pipeline: live fields
  // carrying the brief's values, reconstructed panels as registry parts, an editable
  // NOACG_ANIM block, and no raster left over.
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  const shape = await page.evaluate(async () => {
    const bust = `?t=${Date.now()}`;
    const { stubProConcept, stubCompilePro } = await import(`/src/ai/pro/reconstruct/stub.ts${bust}`);
    const { getTemplateParts } = await import(`/src/model/structure.ts${bust}`);
    const { parseAnimData } = await import(`/src/blocks/animData.ts${bust}`);
    const brief = {
      brief: 'Calm election-night strap, deep blue.',
      name: 'Maya Chen',
      title: 'Anchor · Evening News',
      includeLogo: false,
    };
    const concept = await stubProConcept(brief);
    const compiled = await stubCompilePro(brief, concept, {
      validate: async () => ({ ok: true, errors: [], warnings: [] }),
    });
    const t = compiled.template;
    return {
      fields: t.fields.map((f) => ({ id: f.field, title: f.title, value: f.value })),
      parts: getTemplateParts(t.html, t.fields).map((p) => p.selector),
      hasAnimData: parseAnimData(t.js) !== null,
      assetCount: t.assets.length,
    };
  });
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
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  const placed = await page.evaluate(async () => {
    const bust = `?t=${Date.now()}`;
    const { stubProConcept, stubCompilePro } = await import(`/src/ai/pro/reconstruct/stub.ts${bust}`);
    const brief = {
      brief: 'A calm news strap with the channel mark.',
      name: 'Maya Chen',
      title: 'Anchor',
      includeLogo: true,
    };
    const concept = await stubProConcept(brief);
    const compiled = await stubCompilePro(brief, concept, {
      validate: async () => ({ ok: true, errors: [], warnings: [] }),
      logoMark: {
        asset: { path: 'images/mark.png', data: 'data:image/png;base64,iVBORw0KGgo=' },
        purpose: 'asset',
        binding: 'swappable',
      },
    });
    const t = compiled.template;
    const slot = t.fields.find((f) => f.ftype === 'filelist');
    return {
      slotValue: slot?.value ?? null,
      bundled: t.assets.some((a) => a.path === 'images/mark.png'),
      srcInMarkup: slot ? new RegExp(`<img[^>]*id="${slot.field}"[^>]*src="images/mark.png"`).test(t.html) : false,
      // The per-region report's own words about what became of the mark - `note`, which is
      // where fillProLogoSlot writes it (src/ai/pro/reconstruct/logoAsset.ts).
      outcomes: compiled.report.outcomes.map((o) => o.note ?? '').join(' | '),
    };
  });
  // The field carries the path and the file really rides the template - a value pointing at
  // nothing is the dangling-reference defect this slice exists to avoid - and the report says
  // what happened to the mark rather than that a slot exists somewhere.
  expect(placed.slotValue).toBe('images/mark.png');
  expect(placed.bundled).toBe(true);
  expect(placed.srcInMarkup).toBe(true);
  expect(placed.outcomes).toContain('bundled as images/mark.png');
});

test('pro: filling the slot retires the empty-slot warning, keeps the as-is screen clean, and ignores a reference', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // Driven directly: the stub concept's logo area sits INSIDE its opaque strap, so the
  // compile has nothing to warn about there. A logo clear of every panel is the case the
  // warning exists for - and the case whose wording changes once a file is picked.
  const out = await page.evaluate(async () => {
    const bust = `?t=${Date.now()}`;
    const { normalizeProInterpretation } = await import(`/src/ai/pro/reconstruct/normalize.ts${bust}`);
    const { compileProPlan, PRO_EMPTY_LOGO_SLOT_WARNING } = await import(`/src/ai/pro/reconstruct/compile.ts${bust}`);
    const { fillProLogoSlot } = await import(`/src/ai/pro/reconstruct/logoAsset.ts${bust}`);
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
    const { stubProConcept, stubCompilePro } = await import(`/src/ai/pro/reconstruct/stub.ts${bust}`);
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
    const { normalizeProInterpretation } = await import(`/src/ai/pro/reconstruct/normalize.ts${bust}`);
    const { compileProPlan, validateProCompile } = await import(`/src/ai/pro/reconstruct/compile.ts${bust}`);
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
      const compiled = await compileProPlan(plan, { dataUrl, ...FRAME }, brief, {});
      const { template, report } = compiled;
      // The verdict the PIPELINE forms, through the seam pipeline.ts and stub.ts both use.
      // A gate that says nothing is passed in on purpose: what is under test is the finding
      // the compiler owns, not the platform validator's.
      const clean = { ok: true, errors: [], warnings: [] };
      const verdict = await validateProCompile(compiled, async () => clean);
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
      return {
        report: {
          textErased: report.textErased,
          bakedTextRefused: report.bakedTextRefused,
          ringMatted: report.ringMatted,
          warnings: report.warnings,
        },
        verdict: {
          ok: verdict!.ok,
          errors: verdict!.errors.map((f: { rule: string }) => f.rule),
          warnings: verdict!.warnings.map((f: { rule: string }) => f.rule),
        },
        centre,
        corner,
      };
    };

    return { flat: await compileOn(true), gradient: await compileOn(false) };
  });

  // Flat backdrop: both baked lines erased, the pad ring written as transparency, no
  // baked-text warning left to give.
  expect(out.flat.report.textErased).toBe(2);
  expect(out.flat.report.bakedTextRefused).toEqual([]);
  expect(out.flat.report.ringMatted).toBe(true);
  expect(out.flat.report.warnings).toEqual([]);
  // A clean reconstruction still passes: the new codes are findings, not a tax on every
  // Pro result.
  expect(out.flat.verdict).toEqual({ ok: true, errors: [], warnings: [] });
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

  // AND THE REFUSAL IS NOT USABLE (docs/NOACG_PRO_PLAN.md §16). The first real hosted
  // generation shipped exactly this - baked text the erase refused, the live field on top of
  // it - with `validation_rule_codes` EMPTY and the ledger row saying `usable`. A refusal the
  // compiler records and nothing scores is a scoring bug: the verdict now carries one blocking
  // `pro-baked-text` per refused region, so the wizard shows a failing result and the outcome
  // the browser reports is `failed` with those codes.
  expect(out.gradient.report.bakedTextRefused).toEqual(['Name', 'Title']);
  expect(out.gradient.verdict.ok).toBe(false);
  expect(out.gradient.verdict.errors).toEqual(['pro-baked-text', 'pro-baked-text']);
  // The pad ring is degraded, not broken - reported, never blocking.
  expect(out.gradient.verdict.warnings).toEqual(['pro-artwork-ring']);
});

test('pro: the offline pipeline scores a clean reconstruction through the same seam', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // The whole offline pipeline - stub concept, real normalize + compile, the REAL production
  // validator - so the blocking code is proved to cost a good generation nothing. The bench
  // agrees at scale: of twelve checked-in fixtures the three carrying refusals fail and the
  // nine without them pass exactly as before.
  const out = await page.evaluate(async () => {
    const bust = `?t=${Date.now()}`;
    const { stubProConcept, stubCompilePro } = await import(`/src/ai/pro/reconstruct/stub.ts${bust}`);
    const { productionSpxValidator } = await import(`/src/ai/litePipeline.ts${bust}`);

    const brief = { name: 'Maya Chen', title: 'Anchor', includeLogo: false, style: '' };
    const concept = await stubProConcept(brief);
    const result = await stubCompilePro(brief, concept, { validate: productionSpxValidator() });
    return {
      bakedTextRefused: result.report.bakedTextRefused,
      ringRefused: result.report.ringRefused,
      ok: result.validation?.ok ?? null,
      proCodes: [...(result.validation?.errors ?? []), ...(result.validation?.warnings ?? [])]
        .map((f: { rule: string }) => f.rule)
        .filter((rule: string) => rule.startsWith('pro-')),
    };
  });

  expect(out.bakedTextRefused).toEqual([]);
  expect(out.ringRefused).toBe(false);
  expect(out.proCodes).toEqual([]);
  expect(out.ok).toBe(true);
});

test('pro: tight concept pixels stay native while artwork, live text, panels and logo share one downscaled canvas placement', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  const out = await page.evaluate(async () => {
    const bust = `?t=${Date.now()}`;
    const { normalizeProInterpretation } = await import(`/src/ai/pro/reconstruct/normalize.ts${bust}`);
    const { compileProPlan } = await import(`/src/ai/pro/reconstruct/compile.ts${bust}`);
    const { composeDocument } = await import(`/src/preview/composeDocument.ts${bust}`);
    const { uuid } = await import(`/src/model/id.ts${bust}`);
    const SOURCE = { width: 1376, height: 300 };
    const canvas = document.createElement('canvas');
    canvas.width = SOURCE.width;
    canvas.height = SOURCE.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#16181d';
    ctx.fillRect(0, 0, SOURCE.width, SOURCE.height);
    ctx.fillStyle = '#f5a623';
    ctx.fillRect(0, 0, 12, SOURCE.height);

    const interpretation = {
      version: 1,
      graphicType: 'lower-third',
      graphicTypeConfidence: 0.98,
      canvasPlacement: { widthNorm: 0.6, xNorm: 0.0625, yNorm: 0.65 },
      regions: [
        { kind: 'panel', bbox: { x: 0, y: 0, w: 1, h: 1 }, confidence: 0.99, treatment: 'rebuild-shape',
          panel: { shape: 'panel', fill: { kind: 'solid', color: '#16181d' }, opacity: 1 } },
        { kind: 'text', bbox: { x: 0.08, y: 0.2, w: 0.5, h: 0.22 }, confidence: 0.95,
          treatment: 'rebuild-text', role: 'person-name', suggestedTitle: 'Name', sampleText: 'Maya Chen' },
        { kind: 'text', bbox: { x: 0.08, y: 0.58, w: 0.42, h: 0.15 }, confidence: 0.95,
          treatment: 'rebuild-text', role: 'person-role', suggestedTitle: 'Title', sampleText: 'Anchor' },
        { kind: 'logo', bbox: { x: 0.87, y: 0.2, w: 0.08, h: 0.36 }, confidence: 0.9,
          treatment: 'keep-asset', suggestedTitle: 'Logo' },
      ],
      animation: { presetId: 'design-fade', speed: 1 },
      warnings: [],
    };
    const plan = normalizeProInterpretation(interpretation, SOURCE, uuid);
    const dataUrl = canvas.toDataURL('image/png');
    const result = await compileProPlan(
      plan,
      { dataUrl, ...SOURCE },
      { name: 'Maya Chen', title: 'Anchor', includeLogo: true, brief: '' },
    );
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(result.template);
    await new Promise<void>((resolve) => { frame.onload = () => resolve(); });
    const doc = frame.contentDocument!;
    const rect = (selector: string) => {
      const r = doc.querySelector(selector)!.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const art = rect('.imported-design-art');
    const field = rect('#fw0');
    const panel = rect('.imported-design-panel-1');
    const logo = rect(`#${result.report.logoSlot!.wrapperId}`);
    const asset = result.template.assets.find((entry) => entry.path.endsWith('pro-concept.png'))!;
    const sourceImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = asset.data;
    });
    frame.remove();
    return {
      placement: result.report.placement,
      source: { width: sourceImage.naturalWidth, height: sourceImage.naturalHeight },
      art,
      field,
      panel,
      logo,
      expected: {
        fieldX: art.x + (plan.fields[0].x - plan.unit.x) * plan.placement.scale,
        fieldY: art.y + (plan.fields[0].y - plan.unit.y) * plan.placement.scale,
        logoX: art.x + (plan.logo!.x - plan.unit.x) * plan.placement.scale,
        logoY: art.y + (plan.logo!.y - plan.unit.y) * plan.placement.scale,
      },
    };
  });

  expect(out.source).toEqual({ width: 1376, height: 300 });
  expect(out.placement.scale).toBeLessThan(1);
  expect(out.placement.sizeFulfilled).toBe(true);
  expect(out.art.width).toBeCloseTo(1152, 0);
  expect(out.art.x).toBeCloseTo(120, 0);
  expect(out.art.y).toBeCloseTo(702, 0);
  expect(out.panel.x).toBeCloseTo(out.art.x, 0);
  expect(out.panel.y).toBeCloseTo(out.art.y, 0);
  expect(out.panel.width).toBeCloseTo(out.art.width, 0);
  expect(out.field.x).toBeCloseTo(out.expected.fieldX, 0);
  expect(out.field.y).toBeCloseTo(out.expected.fieldY, 0);
  expect(out.logo.x).toBeCloseTo(out.expected.logoX, 0);
  expect(out.logo.y).toBeCloseTo(out.expected.logoY, 0);
});

test('pro: decorative regions with panel geometry are rebuilt, and a duplicate box becomes one layer', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // Models file accent bars under kind "decorative" (every checked-in fixture does) and
  // sometimes report one strap twice - a 'panel' and a 'decorative' twin on the same box.
  // The plan must rebuild the bar and paint the strap ONCE.
  const out = await page.evaluate(async () => {
    const bust = `?t=${Date.now()}`;
    const { normalizeProInterpretation } = await import(`/src/ai/pro/reconstruct/normalize.ts${bust}`);
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
