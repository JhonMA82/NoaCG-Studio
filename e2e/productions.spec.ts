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

test('the production page fits one 1080p screen, and the preview takes only the room left over', async ({ page }) => {
  // Acceptance round 2, 2026-08-05: "the preview video is way too big — I want the whole page
  // to fit on one screen". Fitting the preview on WIDTH alone gave it 862px of a 1027px column
  // on a full-HD screen, so the verbs and the cue editor sat below the fold. The page is a
  // cockpit: the strips take their natural height and the preview takes what is left.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill('One Screen');
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.locator('.prod-preview-frame')).toBeVisible();

  const fit = await page.evaluate(() => {
    const main = document.querySelector('.control-page-main')!;
    const frame = document.querySelector('.prod-preview-frame')!.getBoundingClientRect();
    const log = document.querySelector('[data-testid="action-log"]')!.getBoundingClientRect();
    return {
      // Nothing scrolls: not the column, not the document.
      columnOverflow: main.scrollHeight - main.clientHeight,
      documentOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      // The LAST thing on the page is above the fold — that is what "one screen" means.
      lastRowBottom: Math.round(log.bottom),
      viewportHeight: window.innerHeight,
      // The frame keeps the graphic's own aspect ratio, so nothing is cropped or stretched.
      frameRatio: +(frame.width / frame.height).toFixed(2),
      frameHeight: Math.round(frame.height),
    };
  });
  expect(fit.columnOverflow).toBe(0);
  expect(fit.documentOverflow).toBe(0);
  expect(fit.lastRowBottom).toBeLessThanOrEqual(fit.viewportHeight);
  expect(fit.frameRatio).toBe(1.78);
  // Big enough to judge a graphic by, small enough to leave the operator's controls on screen.
  expect(fit.frameHeight).toBeGreaterThan(240);
  expect(fit.frameHeight).toBeLessThan(fit.viewportHeight * 0.62);
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

test('rehearsal drives a local copy of the output, and every verb reaches it', async ({ page }) => {
  // Rehearsal is the whole operator workflow WITHOUT the wire, so unlike everything else in
  // §4 it runs offline — which is what lets this spec assert what actually reaches the screen.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor L3');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await createProject(page, { category: 'Tickers' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Ticker crawl');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('new-production-name').fill('Evening News');
  await page.getByTestId('new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  for (const label of ['Anchor L3', 'Ticker crawl']) {
    await page.getByTestId('add-graphic-pick').selectOption({ label });
    await page.getByTestId('add-graphic').click();
  }

  // Unpublished and not rehearsing: the strip says so rather than claiming a mode, the verbs
  // stay dead, and the cue preview is still what the box shows — this is authoring.
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED');
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await expect(page.getByTestId('rehearsal-stage')).toHaveCount(0);

  // Rehearsing is opt-in, and it is what makes the verbs usable before there is any wire.
  await page.getByTestId('toggle-rehearsal').click();
  await expect(page.getByTestId('production-mode')).toContainText('REHEARSE');
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await expect(page.getByTestId('production-publish')).toBeDisabled();

  // The rehearsal is the REAL renderer: one iframe per pool graphic, stacked as layers.
  const stage = page.getByTestId('rehearsal-stage');
  await expect(stage.locator('iframe')).toHaveCount(2);

  const cueRows = page.getByTestId('cue-list').locator('.control-entry');
  const takeCue = async (i: number) => {
    await cueRows.nth(i).getByTestId('select-cue').click();
    await page.getByTestId('verb-take').click();
  };

  // Take the lower third: its value reaches the rehearsal's own document, so this is the
  // rendered graphic, not a claim about one. The cue is NAMED too — the action log reads
  // cues by the name the operator wrote, so a cue left on its default name proves nothing.
  await cueRows.nth(0).getByTestId('select-cue').click();
  await page.getByTestId('cue-label').fill('Anna Andersson');
  await page.getByTestId('cue-field-f0').fill('Anna Andersson');
  await takeCue(0);
  await expect(page.frameLocator('[data-testid="rehearsal-stage"] iframe[title="Anchor L3"]').locator('#f0')).toHaveText(
    'Anna Andersson',
  );
  await expect(page.getByTestId('live-cue-chip')).toContainText('L1');

  // Take the ticker: BOTH layers are up. This is the multi-layer contract, and rehearsal is
  // the only place the offline suite can see it end to end.
  await takeCue(1);
  await expect(page.getByTestId('live-cue-chip')).toContainText('L1');
  await expect(page.getByTestId('live-cue-chip')).toContainText('L2');
  await expect(page.locator('[data-testid^="pool-"] [data-testid="layer-live"]')).toHaveCount(2);

  // Out takes down the SELECTED cue's layer and leaves the other one up.
  await cueRows.nth(0).getByTestId('select-cue').click();
  await page.getByTestId('verb-out').click();
  await expect(page.locator('[data-testid^="pool-"] [data-testid="layer-live"]')).toHaveCount(1);
  await expect(page.getByTestId('live-cue-chip')).toContainText('Ticker crawl');
  await expect(page.getByTestId('live-cue-chip')).not.toContainText('Anchor L3');

  // All out clears the frame.
  await page.getByTestId('verb-out-all').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await expect(page.locator('[data-testid^="pool-"] [data-testid="layer-live"]')).toHaveCount(0);

  // The ACTION LOG recorded all of it, newest first, in the operator's own words. Rehearsal
  // keeps its own log through the same describeLogRow the wire rows go through, which is the
  // only reason any of this is checkable without a backend.
  const log = page.getByTestId('action-log');
  await log.locator('summary').click();
  const rows = log.getByTestId('action-log-row');
  // Newest first: the last thing done was the All out, which stops the ticker's layer.
  await expect(rows.first()).toContainText('Out');
  await expect(rows.first()).toContainText('Ticker crawl');
  // The take is named by the CUE's label, never its id.
  await expect(log).toContainText('Took “Anna Andersson”');
  await expect(log).not.toContainText('Updated 0 fields');

  // Rename a cue and take it IMMEDIATELY — no click in between to let the record catch up.
  // The verb runs in the same tick as its own draft flush, so a log reading only the stored
  // record names the cue as it was BEFORE the rename: the one moment the log is most likely
  // to be read is the one it used to get wrong.
  await cueRows.nth(0).getByTestId('select-cue').click();
  await page.getByTestId('cue-label').fill('Björn Berg');
  await page.getByTestId('verb-take').click();
  await expect(rows.first()).toContainText('Took “Björn Berg”');
});

test('a published production shows SHOW until the operator asks to rehearse', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill('Evening News');
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED');

  // Offline builds cannot publish, so stand a slug in for one: what is under test is which
  // mode a PUBLISHED production starts in, and that reads `hostedSlug` alone.
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('spx-gfx-shows') ?? '[]') as { hostedSlug?: string }[];
    for (const s of list) s.hostedSlug = 'stand-in-slug';
    localStorage.setItem('spx-gfx-shows', JSON.stringify(list));
  });
  await page.reload();

  // Published starts in SHOW — the behaviour that existed before rehearsal did, unchanged.
  await expect(page.getByTestId('production-mode')).toContainText('SHOW');
  await expect(page.getByTestId('production-preview')).toContainText('nothing changes on air');
  await expect(page.getByTestId('rehearsal-stage')).toHaveCount(0);

  // Rehearsing is one click, and it is the strip that says so.
  await page.getByTestId('toggle-rehearsal').click();
  await expect(page.getByTestId('production-mode')).toContainText('REHEARSE');
  await expect(page.getByTestId('production-mode')).toContainText('Nothing reaches the output URL');
  await expect(page.getByTestId('rehearsal-stage')).toBeVisible();

  await page.getByTestId('toggle-rehearsal').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW');
  await expect(page.getByTestId('rehearsal-stage')).toHaveCount(0);
});

test('the action log reads commands as operator language, and drops the bookkeeping', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { describeLogRow, appendLogEntries, logTime } = await import('/src/control/eventLog.ts');
    const label = (id: string) => (id === 'cue-a' ? 'Anna Andersson' : null);
    const row = (id: number, graphic: string, msg: unknown) => ({ id, graphic, msg, created_at: '2026-08-04T09:15:30.000Z' });
    const say = (id: number, graphic: string, msg: unknown) => describeLogRow(row(id, graphic, msg) as never, label);
    return {
      take: say(1, 'Bug', { t: 'cue', cue: 'cue-a' }),
      // A cue whose label has since been deleted still reads as a take, never as a raw id.
      unknownCue: say(2, 'Bug', { t: 'cue', cue: 'gone' })?.text,
      out: say(3, 'Bug', { t: 'cue', cue: null })?.text,
      update: say(4, 'Bug', { t: 'update', data: { f0: 'x', f1: 'y' } })?.text,
      one: say(5, 'Bug', { t: 'update', data: { f0: 'x' } })?.text,
      event: say(6, 'Bug', { t: 'event', event: 'reveal' })?.text,
      // The bookkeeping rows are NOT operator actions and must never reach the feed.
      staged: say(7, 'Bug', { t: 'staged', data: {} }),
      live: say(8, 'Bug', { t: 'live', data: {} }),
      unknown: say(9, 'Bug', { t: 'something-new' }),
      // Newest first, and a re-delivered row (the tail refill replays what the socket brought)
      // must not appear twice.
      order: appendLogEntries(
        appendLogEntries([], [say(1, 'Bug', { t: 'play' })!, say(2, 'Bug', { t: 'next' })!]),
        [say(2, 'Bug', { t: 'next' })!, say(3, 'Bug', { t: 'stop' })!],
      ).map((e) => e.id),
      time: logTime('2026-08-04T09:15:30.000Z').length,
      undated: logTime(null),
    };
  });
  expect(result.take).toMatchObject({ kind: 'take', graphic: 'Bug', text: 'Took “Anna Andersson”' });
  expect(result.unknownCue).toBe('Took “a cue”');
  expect(result.out).toBe('Out');
  expect(result.update).toBe('Updated 2 fields');
  expect(result.one).toBe('Updated 1 field');
  expect(result.event).toBe('Fired “reveal”');
  expect(result.staged).toBeNull();
  expect(result.live).toBeNull();
  expect(result.unknown).toBeNull();
  expect(result.order).toEqual([3, 2, 1]);
  expect(result.time).toBe(8); // hh:mm:ss — seconds matter when two takes are a moment apart
  expect(result.undated).toBe('—');
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
