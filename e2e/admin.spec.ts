import { test, expect } from '@playwright/test';

// The private admin surface, from the outside (docs/ADMIN.md section 1).
//
// This suite runs in OFFLINE mode (playwright.config.ts pins blank Supabase vars), which is
// exactly the posture a self-hoster gets: no backend, therefore no users to administer,
// therefore no admin surface. Every assertion here is NEGATIVE on purpose - the value of
// this page is entirely in what it refuses to show, and a spec that only checked the
// authorized view would pass while the refusal path rotted.
//
// The authorized view needs a real signed-in admin and belongs to the live suite
// (playwright.live.config.ts), not here.

test('/admin renders a plain 404 with nothing about an admin system on it', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.locator('.admin-notfound')).toBeVisible();
  await expect(page.locator('.admin-notfound h1')).toHaveText('404');

  // The shell must never have mounted, not even for a frame before the gate answered.
  await expect(page.locator('.admin-shell')).toHaveCount(0);
  await expect(page.locator('.admin-rail')).toHaveCount(0);

  // No sign-in affordance: offering one would confirm there is something to sign in to.
  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0);
  await expect(page.locator('.auth-gate, .auth-signin, .auth-status')).toHaveCount(0);

  // Nothing on the page names the surface. The title, in particular, is what a browser
  // history or a shared screenshot would otherwise leak.
  await expect(page).toHaveTitle('Not found');
  const text = (await page.locator('body').innerText()).toLowerCase();
  for (const word of ['admin', 'sign in', 'forbidden', 'unauthorized', 'permission']) {
    expect(text).not.toContain(word);
  }
});

test('the admin API answers 404, and identically for a real route and an invented one', async ({ request }) => {
  const known = await request.get('/api/admin/session');
  const invented = await request.get('/api/admin/does-not-exist');
  const withToken = await request.get('/api/admin/session', {
    headers: { authorization: 'Bearer not-a-real-token' },
  });

  for (const response of [known, invented, withToken]) {
    expect(response.status()).toBe(404);
  }
  // Byte-identical bodies: the caller cannot tell which of the three they hit.
  const bodies = await Promise.all([known.text(), invented.text(), withToken.text()]);
  expect(bodies[1]).toBe(bodies[0]);
  expect(bodies[2]).toBe(bodies[0]);
  expect(JSON.parse(bodies[0])).toEqual({ error: { code: 'not_found', message: 'Not found' } });
});

test('a POST to an admin route is refused the same way, not with a 405', async ({ request }) => {
  const response = await request.post('/api/admin/session', { data: {} });
  expect(response.status()).toBe(404);
  expect(JSON.parse(await response.text())).toEqual({ error: { code: 'not_found', message: 'Not found' } });
});

// Without this one, every assertion above could pass because the page renders nothing at
// all. Stubbing a successful session proves the shell IS reachable, which is what makes
// "the shell never mounted" a real finding rather than a vacuous one. The stub replaces the
// SERVER's answer - it cannot bypass the server, it only shows what a yes looks like.
test('the shell renders when, and only when, the server says yes', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.goto('/admin');

  await expect(page.locator('.admin-shell')).toBeVisible();
  await expect(page.locator('.admin-role')).toHaveText('owner');
  await expect(page.locator('.admin-email')).toHaveText('owner@example.com');
  await expect(page.locator('.admin-notfound')).toHaveCount(0);
});

test('the editor is untouched by the admin surface existing', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  // Nothing links to it from the app: not the topbar, not a menu, not a stray anchor.
  await expect(page.locator('a[href*="/admin"]')).toHaveCount(0);
});
