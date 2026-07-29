import { expect, test, type Route } from '@playwright/test';
import { createProject } from './_create';

// The first-use AI disclosure notice (docs/AI_PLATFORM_PLAN.md §9, ratified decision 2).
// The gate's contract, mutation-proofed both ways:
//  - a REMOTE generation without prior acceptance shows the dialog first, and a decline
//    means NO request leaves the browser (the route counter is the proof);
//  - the OFFLINE STUB path never shows the notice - nothing leaves the machine.

const LITE_STATUS = {
  profile: 'lite',
  enabled: true,
  available: true,
  requiresSignIn: false,
  supportedCategories: ['lower-third'],
  limits: {
    promptCharacters: 2000,
    conversationTurns: 6,
    conversationCharacters: 6000,
    fields: 2,
    logos: 0,
    logoBytes: 2_000_000,
  },
  allowance: {
    dailyStartsRemaining: 6,
    monthlyStartsRemaining: 30,
    dailySuccessesRemaining: 3,
    monthlySuccessesRemaining: 20,
  },
};

test('a remote generation is gated on the notice; declining sends nothing', async ({ page }) => {
  test.setTimeout(60_000);
  let generationCalls = 0;
  await page.route('/api/ai/lite/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(LITE_STATUS),
  }));
  await page.route('/api/ai/lite/generations', async (route: Route) => {
    generationCalls += 1;
    await route.abort();
  });

  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  await expect(page.getByRole('heading', { name: 'NoaCG Lite' })).toBeVisible();
  await page.locator('.wz-step textarea').fill('A clean news lower third for a reporter.');
  await page.getByRole('button', { name: '✦ Create one Lite graphic' }).click();

  // The dialog appears BEFORE any request leaves; declining leaves the step untouched.
  await expect(page.getByTestId('ai-consent')).toBeVisible();
  expect(generationCalls).toBe(0);
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByTestId('ai-consent')).toBeHidden();
  expect(generationCalls).toBe(0);
  // The brief survives a decline - nothing was archived or cleared.
  await expect(page.locator('.wz-step textarea')).toHaveValue('A clean news lower third for a reporter.');

  // Accepting records it and lets the SAME click through (the aborted route proves the
  // request was attempted - the gate, not the network, is under test here).
  await page.getByRole('button', { name: '✦ Create one Lite graphic' }).click();
  await expect(page.getByTestId('ai-consent')).toBeVisible();
  await page.getByTestId('ai-consent-accept').click();
  await expect(page.getByTestId('ai-consent')).toBeHidden();
  await expect.poll(() => generationCalls).toBeGreaterThan(0);

  const stored = await page.evaluate(() => localStorage.getItem('spx-gfx-ai-notice') ?? '');
  expect(stored).toContain('ai-disclosure-v1');

  // Accepted once = never asked again: the next generation goes straight through.
  // (The accepted run consumed the prompt box, as every generation does.)
  const before = generationCalls;
  await page.locator('.wz-step textarea').fill('Another clean lower third.');
  await page.getByRole('button', { name: '✦ Create one Lite graphic' }).click();
  await expect.poll(() => generationCalls).toBeGreaterThan(before);
  await expect(page.getByTestId('ai-consent')).toHaveCount(0);
});

test('the offline stub generates without ever showing the notice', async ({ page }) => {
  // No spx-gfx-ai seed and no backend: the AI panel runs the deterministic stub, and the
  // disclosure dialog must NOT appear - nothing leaves the machine.
  await createProject(page);
  await page.getByTestId('dock-tab-ai').click();
  await expect(page.getByText(/offline stub/)).toBeVisible();
  const panel = page.locator('.panel-body', { has: page.getByRole('heading', { name: 'AI assistant' }) });
  await panel.locator('textarea').fill('make a fullscreen title');
  await panel.getByRole('button', { name: 'Generate', exact: true }).click();

  // The stub proposes a change with no consent dialog anywhere in the flow.
  await expect(panel.getByText('Proposed change')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('ai-consent')).toHaveCount(0);
});
