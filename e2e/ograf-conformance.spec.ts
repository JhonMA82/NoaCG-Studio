import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// OGraf v1 conformance, gated rather than remembered.
//
// exports.spec.ts already drives an exported Graphic through load → update → play → stop. This
// file covers the two halves that a hand check keeps missing:
//
//  * the MANIFEST against the spec's own schema rules, over the WHOLE catalog rather than one
//    sample graphic — the schema declares `additionalProperties: false` on every object and
//    types each property's `default` by its declared `type`, so a single category whose fields
//    differ (a checkbox, a number, a dropdown) can be the only one that emits an invalid file;
//  * the parts of the Web Component contract with a MUST in them — skipAnimation, overlapping
//    action calls, and the ReturnPayload a renderer gets when it calls an action too early or
//    after dispose(). Each one is silent when broken: the graphic keeps animating, or the
//    renderer swallows a rejected promise.
//
// Spec: https://ograf.ebu.io/v1/specification/docs/Specification.html

const SCHEMA_URL = 'https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json';

async function downloadOgraf(page: Page, usage?: 'Live' | 'Post-production' | 'Both'): Promise<JSZip> {
  await page.getByTestId('dock-tab-export').click();
  await page.locator('.issue', { hasText: 'OGraf (EBU) export' }).click();
  if (usage) await page.getByTestId('ograf-usage').getByText(usage, { exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  return JSZip.loadAsync(readFileSync(await download.path()));
}

/** Serve an exported package from a fake origin — a minimal OGraf renderer's file access. */
async function serve(page: Page, zip: JSZip, origin: string, folder: string) {
  const files = new Map<string, Buffer>();
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir) files.set(name.replace(new RegExp(`^${folder}/`), ''), await zip.file(name)!.async('nodebuffer'));
  }
  await page.route(`${origin}/**`, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '');
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({
      status: 200,
      contentType: /\.m?js$/.test(path) ? 'application/javascript' : /\.woff2$/.test(path) ? 'font/woff2' : 'text/plain',
      headers: { 'access-control-allow-origin': '*' },
      body,
    });
  });
  return [...files.keys()];
}

test('every catalog graphic emits a manifest that satisfies the OGraf v1 schema', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/app');
  await page.keyboard.press('Escape');

  // The generator is a pure function of the template, so this runs in-page over the whole
  // catalog rather than exporting 150 zips: what is being proven is that no design's field
  // mix, step count or state machine can produce a manifest a renderer would reject.
  const report = await page.evaluate(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { buildOgrafManifest } = await import('/src/export/targets/ograf.ts');
    const { validateOgrafManifest } = await import('/src/export/targets/ografSchema.ts');
    const failures: string[] = [];
    let checked = 0;
    let withActions = 0;
    let withDurations = 0;
    for (const variant of Object.values(CATALOG).flat().filter(Boolean)) {
      let template;
      try {
        template = variant.create({});
      } catch {
        continue; // a variant that needs options is covered by the wizard's own specs
      }
      for (const usage of ['live', 'post-production', 'both'] as const) {
        const manifest = buildOgrafManifest(template, usage);
        checked += 1;
        if (Array.isArray(manifest.customActions) && manifest.customActions.length) withActions += 1;
        if (Array.isArray(manifest.actionDurations) && manifest.actionDurations.length) withDurations += 1;
        for (const error of validateOgrafManifest(manifest)) failures.push(`${template.name} (${usage}): ${error}`);
      }
    }
    return { failures: failures.slice(0, 25), failureCount: failures.length, checked, withActions, withDurations };
  });

  expect(report.checked, 'the catalog sweep found nothing to check').toBeGreaterThan(100);
  expect(report.failures, `${report.failureCount} manifest violations`).toEqual([]);
  // Both optional-but-emitted sections must actually be reached by the sweep, or the check
  // above proves only that the required fields are right.
  expect(report.withActions, 'no graphic exercised the customActions branch').toBeGreaterThan(0);
  expect(report.withDurations, 'no graphic exercised the actionDurations branch').toBeGreaterThan(0);
});

test('the validator refuses the manifest mistakes the spec is strict about', async ({ page }) => {
  // A gate nobody has seen fail is not a gate. Each mutation below is a real conformance trap:
  // an un-prefixed vendor field, a default typed against its property, a duplicate action id,
  // a duration for an action that does not exist, and a `main` the package does not contain.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const verdicts = await page.evaluate(async (schemaUrl) => {
    const { validateOgrafManifest, validateOgrafPackage } = await import('/src/export/targets/ografSchema.ts');
    const base = {
      $schema: schemaUrl,
      id: 'demo',
      name: 'Demo',
      main: 'graphic.mjs',
      supportsRealTime: true,
      supportsNonRealTime: false,
      schema: { type: 'object', properties: { f0: { type: 'string', title: 'Name', default: 'Anna' } } },
      customActions: [{ id: 'select', name: 'Select' }],
    } as Record<string, unknown>;
    const mutate = (patch: Record<string, unknown>) => validateOgrafManifest({ ...base, ...patch }).length;
    return {
      clean: validateOgrafManifest(base).length,
      vendorField: mutate({ noacgFlavour: 'lower-third' }),
      idWithSlash: mutate({ id: 'noacg/demo' }),
      wrongDefault: mutate({ schema: { type: 'object', properties: { f0: { type: 'boolean', default: 'true' } } } }),
      untypedProperty: mutate({ schema: { type: 'object', properties: { f0: { title: 'Name' } } } }),
      duplicateAction: mutate({ customActions: [{ id: 'select', name: 'A' }, { id: 'select', name: 'B' }] }),
      unknownDurationTarget: mutate({ actionDurations: [{ type: 'customAction', customActionId: 'nope', duration: 100 }] }),
      twoPlayDurations: mutate({ actionDurations: [{ type: 'playAction', duration: 1 }, { type: 'playAction', duration: 2 }] }),
      fractionalDuration: mutate({ actionDurations: [{ type: 'stopAction', duration: 12.5 }] }),
      badConstraintKey: mutate({ renderRequirements: [{ resolution: { width: { about: 1920 } } }] }),
      thumbnailNotAnImage: mutate({ thumbnails: [{ file: 'preview.txt' }] }),
      missingMain: validateOgrafPackage(base, ['other.mjs']).length,
      presentMain: validateOgrafPackage(base, ['graphic.mjs']).length,
    };
  }, SCHEMA_URL);

  expect(verdicts.clean).toBe(0);
  expect(verdicts.presentMain).toBe(0);
  for (const [name, count] of Object.entries(verdicts)) {
    if (name === 'clean' || name === 'presentMain') continue;
    expect(count, `${name} was accepted`).toBeGreaterThan(0);
  }
});

test('the exported package declares its steps, durations and canvas — and ships what it names', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const zip = await downloadOgraf(page);
  const manifest = JSON.parse(await zip.file('hairline/hairline.ograf.json')!.async('string'));
  const packaged = Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir)
    .map((name) => name.replace(/^hairline\//, ''));

  expect(manifest.$schema).toBe(SCHEMA_URL);
  // The authored canvas is declared as an `ideal` constraint: a statement of what the graphic
  // was designed for, not a refusal to render anywhere else. Read back off the project rather
  // than hard-coded, so the assertion is "the manifest agrees with the format" and not "the
  // default format is still 1080p25".
  const format = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { resolution, fps } = useTemplateStore.getState().template;
    return { width: resolution.width, height: resolution.height, fps };
  });
  expect(manifest.renderRequirements).toEqual([
    {
      resolution: { width: { ideal: format.width }, height: { ideal: format.height } },
      frameRate: { ideal: format.fps },
    },
  ]);
  // Durations come off the graphic's own timeline, so a host can pre-roll a take.
  const play = manifest.actionDurations.find((d: { type: string }) => d.type === 'playAction');
  const stop = manifest.actionDurations.find((d: { type: string }) => d.type === 'stopAction');
  expect(play.duration).toBeGreaterThan(0);
  expect(stop.duration).toBeGreaterThan(0);
  expect(play.steps.map((s: { step: number }) => s.step)).toEqual(
    Array.from({ length: manifest.stepCount }, (_, i) => i),
  );

  const verdict = await page.evaluate(
    async ({ manifest, packaged }) => {
      const { validateOgrafManifest, validateOgrafPackage } = await import('/src/export/targets/ografSchema.ts');
      return [...validateOgrafManifest(manifest), ...validateOgrafPackage(manifest, packaged)];
    },
    { manifest, packaged },
  );
  expect(verdict, 'the downloaded package is not conformant').toEqual([]);
});

test('skipAnimation lands the action instantly, in real time', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const zip = await downloadOgraf(page);
  await serve(page, zip, 'http://ograf-skip.local', 'hairline');

  const result = await page.evaluate(async () => {
    const mod = await import('http://ograf-skip.local/graphic.mjs');
    customElements.define('ograf-skip-under-test', mod.default);
    type Driver = HTMLElement & {
      load(p: unknown): Promise<{ statusCode: number }>;
      playAction(p: unknown): Promise<{ statusCode: number; currentStep?: number }>;
      stopAction(p: unknown): Promise<{ statusCode: number }>;
      dispose(p?: unknown): Promise<unknown>;
    };
    const opacity = (el: HTMLElement) => getComputedStyle(el.querySelector('.lower-third')!).opacity;
    // ONE graphic at a time, disposed before the next is mounted. The template's own runtime
    // addresses its elements with document-wide selectors — exactly as it does under SPX, where
    // a template owns its page — so two instances of the same design sharing one document would
    // write over each other. An OGraf renderer gives each Graphic its own document; this test
    // must not pretend otherwise (docs/OGRAF.md, "Known limits").
    const drive = async (run: (el: Driver) => Promise<Record<string, string>>) => {
      const el = document.createElement('ograf-skip-under-test') as Driver;
      document.body.appendChild(el);
      await el.load({ data: { f0: 'Anna Andersson', f1: 'Reporter' }, renderType: 'realtime', renderCharacteristics: {} });
      const out = await run(el);
      await el.dispose({});
      el.remove();
      return out;
    };

    // The control: a normal play is still mid-entrance the moment it resolves.
    const control = await drive(async (el) => {
      await el.playAction({});
      return { entrance: opacity(el) };
    });

    // skipAnimation: the same actions, each already at its settled frame — no waiting.
    const skipped = await drive(async (el) => {
      await el.playAction({ skipAnimation: true });
      const entrance = opacity(el);
      await el.stopAction({ skipAnimation: true });
      return { entrance, exit: opacity(el) };
    });

    return { control: control.entrance, skipped: skipped.entrance, skippedExit: skipped.exit };
  });

  expect(result.skipped, 'playAction({skipAnimation}) left the entrance animating').toBe('1');
  // The design's CSS rest is opacity 0 — off air, with nothing left to animate out.
  expect(result.skippedExit, 'stopAction({skipAnimation}) left the exit animating').toBe('0');
  expect(result.control, 'the control case was already settled — the assertion proves nothing').not.toBe('1');
});

test('actions called concurrently, too early, or after dispose all answer with a ReturnPayload', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const zip = await downloadOgraf(page);
  await serve(page, zip, 'http://ograf-contract.local', 'hairline');

  const result = await page.evaluate(async () => {
    const mod = await import('http://ograf-contract.local/graphic.mjs');
    customElements.define('ograf-contract-under-test', mod.default);
    type Driver = HTMLElement & {
      load(p: unknown): Promise<{ statusCode: number }>;
      playAction(p: unknown): Promise<{ statusCode: number; currentStep?: number }>;
      stopAction(p: unknown): Promise<{ statusCode: number }>;
      updateAction(p: unknown): Promise<{ statusCode: number }>;
      customAction(p: unknown): Promise<{ statusCode: number }>;
      dispose(p?: unknown): Promise<{ statusCode: number }>;
    };
    const el = document.createElement('ograf-contract-under-test') as Driver;
    document.body.appendChild(el);

    // An action before load() has nothing to act on: a status code, never a rejected promise.
    const early = await el.updateAction({ data: { f0: 'Too soon' } });

    // The renderer MUST call load() and wait for it before any action.
    await el.load({ data: { f0: 'Anna', f1: 'Reporter' }, renderType: 'realtime', renderCharacteristics: {} });

    // Concurrency: three actions issued without awaiting the previous one. The spec forbids
    // ignoring them, and they must land in arrival order — the last update wins.
    const pending = [
      el.playAction({}),
      el.updateAction({ data: { f0: 'Second' } }),
      el.updateAction({ data: { f0: 'Third' } }),
    ];
    const settled = await Promise.all(pending);
    const afterConcurrent = el.querySelector('#f0')?.textContent;

    const unknownAction = await el.customAction({ id: 'no-such-action' });
    const disposed = await el.dispose({});
    const afterDispose = await el.playAction({});

    return {
      early: early.statusCode,
      settled: settled.map((r) => r.statusCode),
      firstStep: (settled[0] as { currentStep?: number }).currentStep,
      afterConcurrent,
      unknownAction: unknownAction.statusCode,
      disposed: disposed.statusCode,
      afterDispose: afterDispose.statusCode,
      cleared: el.innerHTML === '',
    };
  });

  expect(result.early, 'an action before load() should answer 4xx, not throw').toBe(409);
  expect(result.settled, 'a concurrent action was ignored').toEqual([200, 200, 200]);
  expect(result.firstStep).toBe(0);
  expect(result.afterConcurrent, 'concurrent updates did not land in arrival order').toBe('Third');
  expect(result.unknownAction).toBe(400);
  expect(result.disposed).toBe(200);
  expect(result.afterDispose, 'an action after dispose() should answer 4xx, not throw').toBe(409);
  expect(result.cleared).toBe(true);
});
