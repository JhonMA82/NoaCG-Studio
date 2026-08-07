import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { showCode } from './_code';

// Monaco loads lazily (AppShell wraps CodeEditor in React.lazy): the shell, preview, and
// wizard never wait on the editor bundle, and surfaces that don't show code don't fetch it
// at all. These specs pin the boundary itself; the rest of the suite covers the editor's
// behavior once it is up. The resource checks work in dev-server terms (module URLs), which
// is what this suite runs against — the production chunk split falls out of the same import().

/**
 * Record the URL of every request the page issues, from before the first navigation.
 *
 * We listen at the Playwright layer rather than reading `performance.getEntriesByType`: the
 * browser's resource-timing buffer drops entries once full (creating a project formats its HTML
 * through Prettier, whose lazy dev-module graph alone is hundreds of fetches), which used to
 * evict the Monaco entry and flake these tests. A captured request list never evicts, so the
 * lazy-loading signal stays reliable no matter how many other modules load.
 */
function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (req) => urls.push(req.url()));
  return urls;
}

async function createHairline(page: Page): Promise<string[]> {
  const requested = recordRequests(page);
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  // The category tiles sit outside the filter disclosure now; opening it is harmless.
  const drawerToggle = page.locator('.wz-browse-drawer-btn');
  if (await drawerToggle.isVisible()) await drawerToggle.click();
  await page.locator('.wz-cat', { hasText: 'Lower thirds' }).click();
  await page.locator('.wz-variant', { hasText: 'Hairline' }).click();
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });
  return requested;
}

const isEditorModule = (url: string) => /CodeEditor|monaco/i.test(url);

test('desktop: Monaco is not fetched until the code pane is opened', async ({ page }) => {
  const requested = await createHairline(page);
  // The pane ships CLOSED (model/layout.ts), so a user who never opens code never pays for
  // the editor bundle — the same bargain the mobile layout has always had.
  await expect(page.getByTestId('dock-tab-code')).toHaveCount(0);
  expect(requested.some(isEditorModule)).toBe(false);

  // Opening it streams Monaco in behind the shell, and the lazy boundary resolves into a real,
  // working editor (showCode waits for it).
  await showCode(page);
  expect(requested.some(isEditorModule)).toBe(true);
});

test('mobile: Monaco is not fetched until "Show code"', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const requested = await createHairline(page);

  // The view-and-test mobile layout shows no code — the editor bundle must not be paid for.
  await expect(page.locator('.mobile-code-toggle')).toBeVisible();
  expect(requested.some(isEditorModule)).toBe(false);

  // Opening the code view fetches the bundle on demand and mounts the editor.
  await page.locator('.mobile-code-toggle').click();
  // 20 s for the same reason showCode uses it (e2e/_code.ts): this waits on a lazy chunk the
  // dev server transforms on demand, so it bounds a DOWNLOAD, not a render. The default expect
  // budget is tuned for renders, and at 7 s this was losing to a cold Monaco fetch under four
  // workers - the element resolved and was still `hidden` when the clock ran out. The desktop
  // case next door has always had the wider budget; only this mobile path went without.
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 20_000 });
  expect(requested.some(isEditorModule)).toBe(true);
  await context.close();
});
