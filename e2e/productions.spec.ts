import { test, expect } from '@playwright/test';
import { createProject } from './_create';

// Cloud playout (docs/CLOUD_PLAYOUT.md): the Productions area + the production page's cue
// rundown + the output renderer's offline honesty. The wire paths (publish, the log, the
// hosted pages, the live renderer) are backend features covered by the maintainer's
// live-verify checklist (§8) — this suite pins everything that runs offline.

test('a production page manages cues: auto-cue on add, edit, duplicate, reorder, preview', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });

  // Add the current graphic to a new production from the editor's control panel.
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill('Evening News');
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await expect(section.locator('.status-ok')).toContainText('is in the production');

  // The panel links straight to the production page.
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();

  // Adding a graphic auto-created its first cue, seeded from the template's defaults (§2).
  const cueRows = page.getByTestId('cue-list').locator('.control-entry');
  await expect(cueRows).toHaveCount(1);
  await expect(cueRows.first()).toContainText('Hairline');

  // Edit the cue: label, note, and a field value.
  await page.getByTestId('cue-label').fill('Anna Andersson');
  await page.getByTestId('cue-note').fill('after the intro');
  await page.getByTestId('cue-field-f0').fill('Anna Andersson');
  await expect(cueRows.first()).toContainText('Anna Andersson');
  await expect(cueRows.first()).toContainText('after the intro');

  // The LOCAL preview settles with the cue's values (debounced 350 ms; the locator retries).
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  await expect(preview.locator('#f0')).toHaveText('Anna Andersson');

  // A second cue on the SAME pool graphic — the point of the cue model (§2).
  await page.getByTestId('add-cue').click();
  await expect(cueRows).toHaveCount(2);
  await page.getByTestId('cue-label').fill('Ben Berg');

  // Reorder: Ben moves above Anna; order is the rundown.
  const rows = page.getByTestId('cue-list').locator('.control-entry');
  await rows.nth(1).getByTitle('Move up').click();
  await expect(rows.nth(0)).toContainText('Ben Berg');
  await expect(rows.nth(1)).toContainText('Anna Andersson');

  // Duplicate keeps the values and appends.
  await rows.nth(0).getByTitle('Duplicate this cue').click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText('Ben Berg copy');

  // Offline: the verbs are disabled (no published log to drive) and publishing says why.
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await expect(page.getByTestId('production-publish')).toBeDisabled();
  await expect(page.locator('.control-page-main')).toContainText('runs offline');

  // The cue survives a reload (persisted on the Show record).
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.control-entry')).toHaveCount(3);
});

test('Home Productions creates a production and opens its page; removing a graphic removes its cues', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  // Save to the library so the production page's "add from library" list has a row.
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Morning Show');
  await page.getByTestId('new-production').click();

  // Creating lands straight on the production page.
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('no-cues')).toBeVisible();

  // Add the saved graphic from the library; its auto-cue appears.
  await page.getByTestId('add-graphic-pick').selectOption({ label: 'Anchor L3' });
  await page.getByTestId('add-graphic').click();
  const rows = page.getByTestId('cue-list').locator('.control-entry');
  await expect(rows).toHaveCount(1);

  // Removing the pool graphic takes its cues with it — a cue over nothing cannot air.
  await page.locator('[data-testid^="pool-"]').getByTitle(/Remove this graphic/).click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByTestId('no-cues')).toBeVisible();
});

test('the /output page answers honestly offline and builds a stage from a payload', async ({ page }) => {
  // The offline build: the renderer names its state instead of spinning (never on real air —
  // this state only exists for a wrong URL or a build with no backend).
  await page.goto('/output?production=abc&debug=1');
  await expect(page.locator('body')).toContainText('Output not available');
  await expect(page.locator('body')).toContainText('runs offline');
  await page.goto('/output');
  await expect(page.locator('body')).toContainText('missing its');

  // The STAGE is testable without a backend: build it from a payload in the page context —
  // one sandboxed iframe per graphic, resolution-exact, scaled to the viewport. Commands are
  // applied IMMEDIATELY after creation, before any iframe can have loaded: the stage must
  // queue them until each document's listener exists, because a postMessage into an unloaded
  // srcdoc is silently lost — exactly what ate the boot-recovery burst on a renderer refresh.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { createOutputStage } = await import('/src/output/stage.ts');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const graphic = (key: string) => ({
      key,
      html: `<div id="f0"></div>`,
      css: 'body { margin: 0; }',
      js: 'function update(d){ document.getElementById("f0").textContent = JSON.parse(d).f0 || ""; } function play(){} function stop(){}',
      assets: [],
      resolution: { width: 1920, height: 1080, label: 'Full HD 1080p' },
      fps: 50,
    });
    const stage = createOutputStage(root, {
      v: 1,
      resolution: { width: 1920, height: 1080, label: 'Full HD 1080p' },
      graphics: [graphic('Lower third'), graphic('Ticker')],
      cues: [],
    });
    // The recovery pattern, fired before load: data half, then visual half.
    stage.apply('Lower third', { t: 'update', data: { f0: 'Recovered after refresh' } });
    stage.apply('Lower third', { t: 'play' });
    const iframes = [...root.querySelectorAll('iframe')];
    return {
      graphics: stage.graphics,
      count: iframes.length,
      sandboxes: iframes.map((f) => f.getAttribute('sandbox')),
      widths: iframes.map((f) => f.style.width),
      titles: iframes.map((f) => f.getAttribute('title')),
      zIndexes: iframes.map((f) => f.style.zIndex),
      transform: (root.firstElementChild as HTMLElement).style.transform,
      transparent: (root.firstElementChild as HTMLElement).style.background,
    };
  });
  expect(result.graphics).toEqual(['Lower third', 'Ticker']);
  expect(result.count).toBe(2);
  // The sandbox posture is load-bearing (published template code must never reach the origin).
  expect(result.sandboxes).toEqual(['allow-scripts', 'allow-scripts']);
  expect(result.widths).toEqual(['1920px', '1920px']);
  // Payload order IS the layer stack, stated as a z-index rather than left to append order:
  // index 0 furthest back, the last entry on top.
  expect(result.titles).toEqual(['Lower third', 'Ticker']);
  expect(result.zIndexes).toEqual(['1', '2']);
  expect(result.transform).toContain('scale(');
  expect(result.transparent).toBe('transparent');
  // The pre-load commands flushed into the document once it loaded — the queued update landed.
  await expect(page.frameLocator('iframe[title="Lower third"]').locator('#f0')).toHaveText('Recovered after refresh');
});

test('the layer stack is authored front to back and is what the output stacks', async ({ page }) => {
  // Two saved graphics, so the production has two layers to order.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Bug');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Evening News');
  await page.getByTestId('new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();

  const addGraphic = async (label: string) => {
    await page.getByTestId('add-graphic-pick').selectOption({ label });
    await page.getByTestId('add-graphic').click();
  };
  await addGraphic('Bug');
  await addGraphic('Anchor L3');

  // Listed FRONT TO BACK, like every layer panel: the newest addition is on top, and the
  // numbers fall as the eye travels down. The stored pool is the reverse — paint order.
  const layers = page.locator('[data-testid^="pool-"]');
  await expect(layers).toHaveCount(2);
  await expect(layers.nth(0)).toContainText('L2');
  await expect(layers.nth(0)).toContainText('Anchor L3');
  await expect(layers.nth(1)).toContainText('L1');
  await expect(layers.nth(1)).toContainText('Bug');

  const poolOrder = () =>
    page.evaluate(async () => {
      const { loadShows } = await import('/src/model/shows.ts');
      return loadShows()[0].graphics.map((g: { name: string }) => g.name);
    });
  // Paint order: index 0 is furthest back, which is the BOTTOM row on screen.
  expect(await poolOrder()).toEqual(['Bug', 'Anchor L3']);

  // Send the front layer back: the list and the stored paint order both follow.
  await layers.nth(0).getByTestId('layer-back').click();
  await expect(layers.nth(0)).toContainText('Bug');
  await expect(layers.nth(1)).toContainText('Anchor L3');
  expect(await poolOrder()).toEqual(['Anchor L3', 'Bug']);

  // The ends of the stack cannot move past themselves.
  await expect(layers.nth(0).getByTestId('layer-forward')).toBeDisabled();
  await expect(layers.nth(1).getByTestId('layer-back')).toBeDisabled();

  // Bring it forward again — the inverse move restores the stack exactly.
  await layers.nth(1).getByTestId('layer-forward').click();
  expect(await poolOrder()).toEqual(['Bug', 'Anchor L3']);

  // That pool order is what the PUBLISHED payload carries, and the payload's order is what the
  // stage turns into z-indexes (asserted above) — the two halves of "the top row wins".
  const payloadOrder = await page.evaluate(async () => {
    const [{ buildOutputPayload }, { loadShows }] = await Promise.all([
      import('/src/control/hostedControl.ts'),
      import('/src/model/shows.ts'),
    ]);
    const payload = await buildOutputPayload(loadShows()[0]);
    return payload.graphics.map((g: { key: string }) => g.key);
  });
  expect(payloadOrder).toEqual(['Bug', 'Anchor L3']);
});

test('a cue is live per LAYER, not per production', async ({ page }) => {
  // The vocabulary the whole multi-layer operator surface rests on: the row-persisted snapshot
  // reads as a map keyed by graphic, an older single-cue row migrates into the one layer it
  // described, and a marker only ever touches its own layer.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { readLiveCue, withLiveCue } = await import('/src/control/hostedControl.ts');
    // Format 1 (migration 0031): one cue, on the layer its own `graphic` names.
    const migrated = readLiveCue({ cue: 'cue-a', graphic: 'Bug', at: '2026-01-01T00:00:00.000Z' });
    // Format 2 (migration 0034): the per-layer map.
    const current = readLiveCue({
      v: 2,
      layers: { Bug: { cue: 'cue-a' }, 'Lower third': { cue: 'cue-b' } },
    });
    return {
      migrated,
      current,
      // Nothing at all, and a shape from a future format, both read as "nothing on air".
      empty: readLiveCue(null),
      unknown: readLiveCue({ v: 9, layers: 'not a map' }),
      // A take on one layer leaves the other alone; an Out removes the key rather than nulling it.
      afterTake: withLiveCue(current, 'Ticker', 'cue-c'),
      afterOut: withLiveCue(current, 'Bug', null),
      // A repeated marker returns the SAME object, so a re-delivered log row re-renders nothing.
      idempotent: withLiveCue(current, 'Bug', 'cue-a') === current,
    };
  });
  expect(result.migrated).toEqual({ Bug: 'cue-a' });
  expect(result.current).toEqual({ Bug: 'cue-a', 'Lower third': 'cue-b' });
  expect(result.empty).toEqual({});
  expect(result.unknown).toEqual({});
  expect(result.afterTake).toEqual({ Bug: 'cue-a', 'Lower third': 'cue-b', Ticker: 'cue-c' });
  expect(result.afterOut).toEqual({ 'Lower third': 'cue-b' });
  expect(result.idempotent).toBe(true);
});
