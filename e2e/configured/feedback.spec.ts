import { test, expect, type Request } from '@playwright/test';
import { dismissWizard, SUPABASE_URL } from './_helpers';
import { enableAdvancedMode } from '../_create';

// The beta feedback flow, with a backend configured and NO account - which is the case that
// matters most, because the editor has no login wall and most people who would tell us something
// have never signed in.
//
// EVERY REQUEST IS INTERCEPTED. The configured dev server points at the real Supabase project, so
// letting these POSTs through would put test rows in the operator's actual inbox. Fulfilling them
// here also lets the spec assert what the browser SENT, which is the part with a rule attached:
// the submission carries a rating, enumerated reasons and the user's words, and it must never
// carry a prompt, a brief, a template or a page URL.

interface Sent {
  kind?: string;
  sentiment?: string;
  reasons?: string[];
  message?: string;
  area?: string;
  visitorId?: string;
}

test.describe('beta feedback (configured, anonymous)', () => {
  test.skip(!SUPABASE_URL, 'set VITE_SUPABASE_URL to run the configured-mode suite');

  test('a note reaches the endpoint, and carries nothing it should not', async ({ page }) => {
    const sent: Sent[] = [];
    await page.route('**/api/me/feedback', async (route, request: Request) => {
      sent.push(JSON.parse(request.postData() ?? '{}') as Sent);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recorded: true }),
      });
    });

    // The Feedback button lives in the EDITOR shell (AppShell), which the student release put
    // behind Advanced mode - so a default /app boots the wizard shell and the button is not
    // there at all. This spec's subject is the endpoint and what the browser sends, so it opens
    // the editor to reach the door. THE GAP IT LEAVES IS REAL AND NOT THIS SPEC'S TO FIX: a
    // student who never opens Advanced mode has no way to send feedback at all.
    await enableAdvancedMode(page);
    await page.goto('/app');
    await dismissWizard(page);

    await page.getByTestId('beta-feedback-open').click();
    await expect(page.getByTestId('beta-feedback-dialog')).toBeVisible();

    // THE FIRST CLICK IS THE SUBMISSION. Nothing after it is required, which is the whole shape
    // of the flow - so the request must already be in flight before any reason is picked.
    await page.getByTestId('feedback-negative').click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].kind).toBe('beta');
    expect(sent[0].sentiment).toBe('negative');
    expect(sent[0].reasons).toEqual([]);

    // A negative rating OFFERS the reasons; a positive one does not (see the second test).
    await expect(page.getByTestId('feedback-why')).toBeVisible();
    await page.getByTestId('feedback-reason-confusing').click();
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[1].reasons).toEqual(['confusing']);

    await page.getByTestId('feedback-message').fill('The export button was hard to find.');
    await page.getByTestId('feedback-send').click();
    await expect.poll(() => sent.length).toBe(3);
    expect(sent[2].message).toBe('The export button was hard to find.');
    expect(sent[2].area).toBe('editor');

    // What must NOT be in any of them. The endpoint drops unknown keys, but the browser must not
    // be sending them in the first place - a field that leaves the machine has already left it.
    for (const body of sent) {
      for (const forbidden of ['prompt', 'brief', 'template', 'html', 'css', 'js', 'url', 'assets']) {
        expect(body, `submission must not carry ${forbidden}`).not.toHaveProperty(forbidden);
      }
    }
  });

  test('a positive rating asks nothing further', async ({ page }) => {
    const sent: Sent[] = [];
    await page.route('**/api/me/feedback', async (route, request: Request) => {
      sent.push(JSON.parse(request.postData() ?? '{}') as Sent);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":true}' });
    });

    // The Feedback button lives in the EDITOR shell (AppShell), which the student release put
    // behind Advanced mode - so a default /app boots the wizard shell and the button is not
    // there at all. This spec's subject is the endpoint and what the browser sends, so it opens
    // the editor to reach the door. THE GAP IT LEAVES IS REAL AND NOT THIS SPEC'S TO FIX: a
    // student who never opens Advanced mode has no way to send feedback at all.
    await enableAdvancedMode(page);
    await page.goto('/app');
    await dismissWizard(page);
    await page.getByTestId('beta-feedback-open').click();
    await page.getByTestId('feedback-positive').click();

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].sentiment).toBe('positive');
    // "This was good" is already complete. Asking why would turn the cheap half of the flow into
    // the expensive one, so the reason picker is negative-only by design.
    await expect(page.getByTestId('feedback-why')).toHaveCount(0);
    await expect(page.getByTestId('feedback-ack')).toBeVisible();
  });

  test('the dialog closes without sending anything', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/me/feedback', async (route) => {
      calls += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":true}' });
    });

    // The Feedback button lives in the EDITOR shell (AppShell), which the student release put
    // behind Advanced mode - so a default /app boots the wizard shell and the button is not
    // there at all. This spec's subject is the endpoint and what the browser sends, so it opens
    // the editor to reach the door. THE GAP IT LEAVES IS REAL AND NOT THIS SPEC'S TO FIX: a
    // student who never opens Advanced mode has no way to send feedback at all.
    await enableAdvancedMode(page);
    await page.goto('/app');
    await dismissWizard(page);
    await page.getByTestId('beta-feedback-open').click();
    await expect(page.getByTestId('beta-feedback-dialog')).toBeVisible();

    // Opening the sheet and thinking better of it must cost nothing. Escape is the same door.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('beta-feedback-dialog')).toHaveCount(0);
    expect(calls).toBe(0);
  });
});
