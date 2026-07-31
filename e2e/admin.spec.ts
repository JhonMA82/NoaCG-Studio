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
  // And with no backend there is no notice to publish, so the band must not appear at all.
  await expect(page.locator('.system-notice')).toHaveCount(0);
});

// The admin surface can hide templates and narrow render formats. Offline it must do neither -
// the catalog and the local export targets are free-forever core, and an instance with no
// backend has no admin to have restricted anything.
test('offline: the entitlement endpoint is absent and the catalog stays whole', async ({ page, request }) => {
  const response = await request.get('/api/me/entitlement');
  const body = response.ok() ? ((await response.json()) as { hiddenTemplates: string[] }) : null;
  // Either the route answers the anonymous defaults, or it is not there at all. What it must
  // never do is come back with something hidden.
  if (body) expect(body.hiddenTemplates).toEqual([]);

  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  // The browse grid renders real cards, so nothing filtered the catalog away.
  await expect(page.locator('.wz-variant').first()).toBeVisible();
  const count = await page.locator('.wz-variant').count();
  expect(count).toBeGreaterThan(5);
});

test('the landing page does not link to the admin surface either', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href*="/admin"]')).toHaveCount(0);
  const text = (await page.locator('body').innerText()).toLowerCase();
  expect(text).not.toContain('/admin');
});

// Every section has to be reachable once the server says yes. Without this, a broken section
// would look identical to a section that is correctly refusing to render.
test('each admin section renders behind a stubbed session', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  // The data endpoints answer their real 404; every section must survive that rather than
  // blanking the shell, because that is exactly what a partial outage looks like.
  await page.goto('/admin');
  await expect(page.locator('.admin-shell')).toBeVisible();

  for (const label of [
    'Overview',
    'Users',
    'Plans',
    'Usage and cost',
    'Output quality',
    'System',
    'Templates',
    'Audit',
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.admin-content h1')).toHaveText(label === 'Usage and cost' ? 'Usage and cost' : label);
    await expect(page.locator('.admin-notfound')).toHaveCount(0);
  }
});

// The quality section is the only surface that shows what the generator is being nudged by, so
// a silently-empty one would be indistinguishable from "nobody has thrown anything away yet".
// Stubbed rather than live: the authorized view with real data belongs to the live suite, but
// the RENDERING of that data is ordinary front-end work and is pinned here.
test('the quality section separates what the prompt is fed from what has not counted yet', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/quality*', (route) =>
    route.fulfill({
      json: {
        days: 30,
        // Worst keep rate first, as the endpoint sorts it: 1 of 5 kept, then 3 of 4.
        emerging: [
          { variantId: 'lt-ribbon', intentKind: 'person', accepted: 1, discarded: 4 },
          { variantId: 'lt-stack', intentKind: 'event', accepted: 3, discarded: 1 },
        ],
        reasons: [
          { reason: 'hard-to-read', count: 9 },
          { reason: 'wrong-style', count: 4 },
          { reason: 'brand-new-reason', count: 1 },
        ],
        priors: [{ variantId: 'lt-bar', intentKind: 'person', accepted: 18, discarded: 2 }],
        priorWindowDays: 90,
        priorMinSamples: 8,
        totals: { generations: 120, withVariant: 96, withFeedback: 14 },
        truncated: false,
      },
    }),
  );

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Output quality', exact: true }).click();
  await expect(page.locator('.admin-content h1')).toHaveText('Output quality');

  // The two tables must stay distinguishable: one is acting on the generator right now, the
  // other explicitly is not. Reading them as one list is the mistake this layout prevents.
  const prompted = page.locator('.admin-block').filter({ hasText: 'What the generator is being nudged by' });
  const emerging = page.locator('.admin-block').filter({ hasText: 'Emerging signal' });
  await expect(prompted).toContainText('last 90 days, minimum 8 samples');
  await expect(prompted.locator('tbody tr')).toHaveCount(1);
  await expect(prompted.locator('tbody tr').first()).toContainText('lt-bar');
  await expect(prompted.locator('tbody tr').first()).toContainText('90%');

  // Worst first, and a sub-50% rate is marked hot rather than left as a bar to squint at.
  await expect(emerging.locator('tbody tr')).toHaveCount(2);
  await expect(emerging.locator('tbody tr').first()).toContainText('lt-ribbon');
  await expect(emerging.locator('tbody tr').first()).toContainText('20%');
  await expect(emerging.locator('tbody tr').first().locator('.admin-meter-hot')).toHaveCount(1);
  await expect(emerging.locator('tbody tr').nth(1).locator('.admin-meter-hot')).toHaveCount(0);

  // Enumerated reasons read as English; one the UI has no label for is shown raw and FLAGGED,
  // because a reason nobody labelled must not become a reason nobody sees.
  const reasons = page.locator('.admin-block').filter({ hasText: 'Why people threw one away' });
  await expect(reasons).toContainText('Hard to read');
  await expect(reasons).toContainText('Wrong style');
  await expect(reasons.locator('tbody tr').last()).toContainText('brand-new-reason');
  await expect(reasons.locator('tbody tr').last().locator('.admin-pill')).toHaveText('unlabelled');

  await expect(page.locator('.admin-stats')).toContainText('96');
  await expect(page.locator('.admin-problem')).toHaveCount(0);
});

// A window that hit the read cap must say so: the tables below it are a floor, not a total, and
// an operator reading "3 discards" off a truncated window would draw the wrong conclusion.
test('a truncated quality window says the numbers are a floor', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/quality*', (route) =>
    route.fulfill({
      json: {
        days: 90,
        emerging: [],
        reasons: [],
        priors: [],
        priorWindowDays: 90,
        priorMinSamples: 8,
        totals: { generations: 20000, withVariant: 0, withFeedback: 0 },
        truncated: true,
      },
    }),
  );

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Output quality', exact: true }).click();
  await expect(page.locator('.admin-problem')).toContainText('hit the read cap');
  // And the empty tables must explain themselves rather than rendering as blank space.
  await expect(page.locator('.admin-content')).toContainText('No design has reached 8 samples yet');
});
