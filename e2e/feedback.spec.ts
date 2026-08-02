import { test, expect } from '@playwright/test';
import { createProject } from './_create';

// OFFLINE: the feedback surfaces must not exist at all.
//
// A self-hosted instance with no Supabase configuration has no inbox to send to, so
// `feedbackAvailable()` is false and neither the topbar button nor the post-generation rating
// renders. This is the same contract e2e/auth.spec.ts pins for auth UI (root AGENTS.md, "Auth
// posture"): an offline build grows NO surface that cannot work.
//
// The interactive half of the flow - clicking a thumb, picking a reason, sending a note - needs
// a configured backend and lives in e2e/configured/feedback.spec.ts, which intercepts the POST
// so a test run never writes into the real inbox.

test.describe('feedback, offline', () => {
  test('no feedback entry point exists with no backend configured', async ({ page }) => {
    await createProject(page);
    await expect(page.locator('.topbar')).toBeVisible();

    // The button is absent, not disabled: a control that cannot work is a worse answer than no
    // control (the same rule the admin surface applies to a support role's write actions).
    await expect(page.getByTestId('beta-feedback-open')).toHaveCount(0);
    await expect(page.locator('.fb-open')).toHaveCount(0);
    await expect(page.getByTestId('beta-feedback-dialog')).toHaveCount(0);
  });

  test('the absence is the gate, not an empty topbar', async ({ page }) => {
    // Mutation guard: the assertion above passes vacuously if the topbar failed to render at
    // all. Prove the neighbours ARE there, so "no feedback button" means the gate closed rather
    // than the shell being broken.
    await createProject(page);
    await expect(page.getByTestId('open-home')).toBeVisible();
    await expect(page.getByTestId('beta-feedback-open')).toHaveCount(0);
  });
});
