import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { enableAdvancedMode, finishIntoEditor, startNewProject } from './_create';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// Era 2a: import an existing template (.html or SPX-style .zip) to edit and convert.

// A believable foreign template: inline style + script, an SPX definition, no house contracts.
// The header comment names SPXGCTemplateDefinition BEFORE the real assignment, with an `=`
// (charset) and a CSS `{...}` in between - the exact shape of real SPX packs, where a
// first-mention parser anchors on the prose and reads garbage instead of the definition.
const FOREIGN_HTML = `<!DOCTYPE html>
<html>
<head>
<!-- Old score bug. See SPXGCTemplateDefinition -object below for data field descriptions. -->
<meta charset="utf-8">
<title>Old Score Bug</title>
<style>
  .legacy-note { margin: 0; }
</style>
<script>window.SPXGCTemplateDefinition = {
  "description": "Old Score Bug", "playserver": "OVERLAY", "playchannel": "1",
  "playlayer": "9", "webplayout": "9", "out": "manual", "dataformat": "json",
  "DataFields": [ { "field": "f0", "ftype": "textfield", "title": "Score", "value": "0 - 0" } ]
};</script>
<style>
  body { margin: 0; background: transparent; }
  #bug { position: absolute; top: 40px; left: 40px; color: #fff; font: bold 40px sans-serif; opacity: 0; }
</style>
</head>
<body>
  <div id="bug"><span id="f0">0 - 0</span></div>
  <script>
    function update(data) { var f = JSON.parse(data); for (var k in f) { var el = document.getElementById(k); if (el) el.textContent = f[k]; } }
    function play() { document.getElementById('bug').style.opacity = '1'; }
    function stop() { document.getElementById('bug').style.opacity = '0'; }
    function next() {}
  </script>
  <!-- Module scripts only parse as modules: the importer must leave them in the HTML,
       never strip them into the classic JS pane (the HKO-lineage corpus shape). -->
  <script type="module">export {};</script>
</body>
</html>`;

async function dropTemplate(page: Page, name: string, buffer: Buffer) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  // Import lives inside "Create with AI": drop the file, then the no-AI byte-faithful open.
  await page.locator('[data-entry="ai"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({ name, mimeType: 'text/html', buffer });
  // Foreign SPX does not carry a universal FPS field. NoaCG must say so and require an
  // explicit project-format confirmation instead of silently assigning its default.
  await expect(page.getByTestId('import-format-detection')).toContainText('uncertain');
  await expect(page.getByRole('button', { name: /Open as code \(no AI\)/ })).toBeDisabled();
  await page.getByTestId('confirm-import-format').click();
  await awaitPreviewRebuild(page, async () => {
    await page.getByRole('button', { name: /Open as code \(no AI\)/ }).click();
    await expect(page.locator('.wz-modal')).toBeHidden();
  });
}

test('import .html: splits into panes, keeps the definition, validates, exports', async ({ page }) => {
  await dropTemplate(page, 'old-score-bug.html', Buffer.from(FOREIGN_HTML));
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Old Score Bug');

  const tpl = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return { html: t.html, css: t.css, js: t.js, fields: t.fields.map((f) => f.field) };
  });
  expect(tpl.css).toContain('#bug');                       // style moved to the CSS pane
  expect(tpl.js).toContain('function play()');             // script moved to the JS pane
  expect(tpl.html).toContain('SPXGCTemplateDefinition');   // definition stays in the HTML
  expect(tpl.html).not.toContain('function play()');
  expect(tpl.html).toContain('type="module"');             // module script stays in the HTML
  expect(tpl.js).not.toContain('export {}');               // ...never in the classic JS pane
  expect(tpl.fields).toEqual(['f0']);

  // Landed on Export with the inline validation — this one is already valid.
  await expect(page.locator('[data-testid="dock-right"] .dock-tab.active .dock-tab-label')).toHaveText('Export');
  await expect(page.locator('.panel-body .status-ok')).toContainText('valid and ready');

  // The graphic actually works: update + play through the simulator.
  await page.getByTestId('dock-tab-data').click();
  await page.locator('.field-row', { hasText: 'Score' }).locator('input').first().fill('2 - 1');
  await page.getByRole('button', { name: '▶ Play' }).click();
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('#f0')).toHaveText('2 - 1');
  await expect
    .poll(async () => frame.locator('#bug').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});

test('import round-trip: an exported Starter zip re-imports as the same code', async ({ page }) => {
  // Create + export a wizard template (the editor create - Advanced since step 6).
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-cat', { hasText: 'Lower thirds' }).click();
  await page.locator('.wz-variant', { hasText: 'Hairline' }).click();
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
  });
  const before = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return { css: t.css, js: t.js, resolution: t.resolution, fps: t.fps };
  });
  await page.getByTestId('dock-tab-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zipBuffer = readFileSync(await download.path());
  await JSZip.loadAsync(zipBuffer); // sanity: it is a real zip

  // Re-import the zip through the wizard (inside "Create with AI", no AI involved).
  await startNewProject(page);
  await page.locator('[data-entry="ai"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'hairline_spx.zip',
    mimeType: 'application/zip',
    buffer: zipBuffer,
  });
  await page.getByRole('button', { name: /Open as code \(no AI\)/ }).click();
  await expect(page.locator('.wz-modal')).toBeHidden();
  const after = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return {
      name: t.name,
      css: t.css,
      js: t.js,
      fields: t.fields.length,
      resolution: t.resolution,
      fps: t.fps,
    };
  });
  expect(after.name).toBe('Hairline');
  expect(after.css.trim()).toBe(before.css.trim());
  expect(after.js.trim()).toBe(before.js.trim());
  expect(after.fields).toBe(2);
  expect(after.resolution).toEqual(before.resolution);
  expect(after.fps).toBe(before.fps);
});

test('import zip: only the scripts the page loads reach the JS pane', async ({ page }) => {
  // A real vendor pack ships ONE folder holding several templates plus every library any of
  // them uses. Concatenating every .js under that folder merged sibling designs (identical
  // top-level names - a redeclaration SyntaxError) and dragged ES modules into a classic
  // pane. Both shapes are here; the corpus sweep found them (docs/SPX_EXAMPLES_CORPUS.md).
  const zip = new JSZip();
  // helpers.js is REFERENCED, so only the module check can keep it out - the reference
  // filter would happily let it through and the assertion below would pass vacuously.
  zip.file('MAIN.html', `<!doctype html><html><body><div id="f0"></div>
    <script src="js/main.js"></script>
    <script type="module" src="js/helpers.js"></script>
    </body></html>`);
  zip.file('js/main.js', 'var eaze = "main"; function play() {}');
  zip.file('SIBLING.html', '<!doctype html><html><body>sibling</body></html>');
  zip.file('js/sibling.js', 'var eaze = "sibling";');           // the other template's copy
  zip.file('js/helpers.js', "import x from './lib.js';\nexport function crop() {}");
  const base64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');

  await page.goto('/app');
  const js = await page.evaluate(async (b64) => {
    const { importZipTemplate } = await import('/src/model/importTemplate.ts');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const { template } = await importZipTemplate('pack.zip', bytes.buffer);
    return template.js;
  }, base64);

  expect(js).toContain('var eaze = "main"');
  expect(js).not.toContain('var eaze = "sibling"');    // no redeclaration
  expect(js).not.toContain('export function crop');    // no module in a classic pane
  // Still one runnable script, which is the property the pane has to keep.
  expect(() => new Function(js)).not.toThrow();
});
