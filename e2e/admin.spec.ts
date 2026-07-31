import { test, expect, type Page } from '@playwright/test';

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
    'Models',
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

// ── the overview dashboard ───────────────────────────────────────────────────────────────
//
// Stubbed rather than live, on the same reasoning as the quality specs above: the authorized
// view against real data belongs to the live suite, but how the numbers are PRESENTED is
// ordinary front-end work, and presentation is exactly where the misreadings this section is
// designed against would appear.

const OVERVIEW_METRICS = {
  newAccounts: 2,
  activeVisitors: 41,
  activeAccounts: 7,
  visits: 380,
  signups: 1,
  graphicsCreated: 18,
  videosCreated: 3,
  creatingVisitors: 9,
  firstTimeCreators: 4,
  anonymousCreates: 12,
  signedInCreates: 9,
  anonymousGraphics: 10,
  anonymousCreators: 6,
  exports: 6,
  exportingVisitors: 5,
  anonymousExports: 4,
  aiGenerations: 22,
  aiSuccesses: 17,
  aiFailures: 3,
  aiDeclined: 2,
  aiUsers: 5,
  aiCostUsd: 0.4123,
  gatewayManaged: 8,
  gatewayByo: 30,
  anonymousGatewayCalls: 7,
  gatewayManagedCostUsd: 0.09,
  gatewayFailures: 2,
  rendersStarted: 5,
  rendersDelivered: 4,
  rendersFailed: 1,
  renderMedianMs: 42_000,
};

function overviewWindow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    from: '2026-07-31T00:00:00+03:00',
    to: '2026-07-31T09:15:00+03:00',
    previousFrom: '2026-07-30T00:00:00+03:00',
    previousTo: '2026-07-30T09:15:00+03:00',
    metrics: OVERVIEW_METRICS,
    previous: { ...OVERVIEW_METRICS, graphicsCreated: 11, exports: 6, aiFailures: 9 },
    previousPartialLedgers: [],
    ...overrides,
  };
}

function overviewBody(overrides: Record<string, unknown> = {}) {
  return {
    timezone: 'Europe/Helsinki',
    generatedAt: '2026-07-31T06:15:00Z',
    windows: [overviewWindow('day'), overviewWindow('week'), overviewWindow('month')],
    state: {
      totalAccounts: 40,
      suspendedAccounts: 1,
      accountsNeverCreated: 24,
      activeGrants: 3,
      grantsExpiringSoon: 2,
      rendersInFlight: 1,
      rendersOverdue: 0,
      accountsSince: '2026-01-06T00:00:00Z',
      funnelSince: '2026-06-01T00:00:00Z',
      generationsSince: '2026-05-02T00:00:00Z',
      gatewaySince: '2026-05-02T00:00:00Z',
      rendersSince: '2026-04-03T00:00:00Z',
    },
    mix: [
      { bucket: 'creation-door', key: 'template', count: 12 },
      { bucket: 'creation-door', key: 'ai', count: 4 },
      { bucket: 'export-target', key: 'spx', count: 5 },
    ],
    available: true,
    fleet: { spendLast24hUsd: 0.41, ceilingUsd: 4 },
    notTracked: ['Export failures. Every export figure is a success count.'],
    ...overrides,
  };
}

async function stubOverview(page: Page, body: Record<string, unknown>) {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/overview*', (route) => route.fulfill({ json: body }));
  await page.route('**/api/admin/system*', (route) =>
    route.fulfill({ json: { disabledFeatures: [], models: [], maintenanceNotice: null, betaUserIds: [] } }),
  );
}

test('the overview states its reporting boundaries, and every number says what it counts', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');
  await expect(page.locator('.admin-content h1')).toHaveText('Overview');

  // The timezone and the comparison rule are ON the page. A dashboard whose "today" is
  // undefined is a dashboard two people read differently, and this sentence is what stops
  // that - so it is asserted rather than left as a nicety.
  const boundary = page.locator('.admin-boundary');
  await expect(boundary).toContainText('Europe/Helsinki');
  await expect(boundary).toContainText('same elapsed span one period earlier');
  await expect(boundary).toContainText('09:15');

  // Three windows, in reading order.
  const headers = page.locator('.admin-metrics').first().locator('thead th');
  await expect(headers.nth(1)).toHaveText('Today');
  await expect(headers.nth(2)).toHaveText('This week');
  await expect(headers.nth(3)).toHaveText('This month');

  // THE CENTRAL ASSERTION: an event count and a unique-browser count are visibly different
  // kinds of number. Without the unit line they would be two identical-looking figures that a
  // reader could add together or compare directly.
  await expect(page.locator('tr[data-metric="visits"] th .admin-muted')).toContainText('events');
  await expect(page.locator('tr[data-metric="activeVisitors"] th .admin-muted')).toContainText('distinct browsers');
  await expect(page.locator('tr[data-metric="activeAccounts"] th .admin-muted')).toContainText('accounts');

  // Money is formatted as money and a duration as a duration - never as a bare count.
  await expect(page.locator('tr[data-metric="aiCostUsd"] td').first()).toContainText('$0.41');
  await expect(page.locator('tr[data-metric="renderMedianMs"] td').first()).toContainText('42.0 s');

  // The user's own AI spend is present and NOT folded into ours.
  await expect(page.locator('tr[data-metric="gatewayByo"] th')).toContainText('user key');
});

test('a render that finished is reported as delivered, and an aged-out file is not a failure', async ({ page }) => {
  // The defect this pins: an `expired` render is one that WORKED and whose output has since been
  // deleted by the TTL cron. Counting it as failed reported four delivered renders as failures
  // on this instance, and building "completed" on the transient `complete` state made that
  // column decay to zero. The row must say delivered, and it must say why.
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  const row = page.locator('tr[data-metric="rendersDelivered"]');
  await expect(row.locator('th')).toContainText('delivered');
  await expect(row.locator('th .admin-muted')).toContainText('whether or not the file still exists');
  await expect(row.locator('td').first()).toContainText('4');

  // The word "completed" is gone from the render table - it was the transient state.
  await expect(page.locator('tr[data-metric="rendersCompleted"]')).toHaveCount(0);

  // Failed says what it excludes, so nobody reads an expired output back into it.
  await expect(page.locator('tr[data-metric="rendersFailed"] th .admin-muted')).toContainText('not an expired output');

  // And the median admits its narrower scope rather than looking like the whole picture.
  await expect(page.locator('tr[data-metric="renderMedianMs"] th .admin-muted')).toContainText('still live');
});

test('a brief Lite refuses is reported as declined, not as a failure', async ({ page }) => {
  // The same shape as the render row above, on the AI side: `unsupported` is Lite correctly
  // refusing a brief outside its scope - the guardrail firing. Counting it as a failure turned
  // 19 real failures into 26 on production.
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  const declined = page.locator('tr[data-metric="aiDeclined"]');
  await expect(declined.locator('th')).toContainText('declined as out of scope');
  await expect(declined.locator('th .admin-muted')).toContainText('guardrail firing, not failing');
  await expect(declined.locator('td').first()).toContainText('2');

  // The failure row must not silently absorb it, and must say so.
  await expect(page.locator('tr[data-metric="aiFailures"] td').first()).toContainText('3');
  await expect(page.locator('tr[data-metric="aiFailures"] th .admin-muted')).toContainText('declined');

  // Spend names its own scope, because a reservation ceiling is not a charge.
  await expect(page.locator('tr[data-metric="aiCostUsd"] th .admin-muted')).toContainText('reservation ceiling');
});

test('what gets made without an account is a first-class figure, not a footnote', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  const block = page.locator('.admin-block').filter({ hasText: 'Made without an account' });
  // Events and people are separate rows: 10 graphics from 6 browsers is a different story from
  // 10 graphics from 1, and a single number cannot tell them apart.
  await expect(block.locator('tr[data-metric="anonymousGraphics"] td').first()).toContainText('10');
  await expect(block.locator('tr[data-metric="anonymousCreators"] th .admin-muted')).toContainText('distinct browsers');
  await expect(block.locator('tr[data-metric="anonymousExports"] td').first()).toContainText('4');

  // Account-free AI is the OTHER reading of "without an account" and comes from a different
  // ledger, so it is labelled rather than silently merged with the funnel rows.
  await expect(block.locator('tr[data-metric="anonymousGatewayCalls"] th')).toContainText('no account at all');

  // Stated as a subset, so nobody adds it to the creation table above.
  await expect(block).toContainText('subset of the table above');
});

test('a change is an absolute difference, and the direction is not assumed to be good', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  // 18 against 11: reported as +7, not as "+64%". At this instance's volume a percentage on a
  // single-digit base cries wolf every morning.
  const graphics = page.locator('tr[data-metric="graphicsCreated"] td').first();
  await expect(graphics).toContainText('18');
  await expect(graphics.locator('.admin-delta')).toHaveText('+7');

  // Unchanged says so rather than showing a zero that looks like a measurement.
  await expect(page.locator('tr[data-metric="exports"] td').first().locator('.admin-delta')).toHaveText('no change');

  // 3 failures against 9 is a FALL, and the arithmetic is the same whether falling is good news
  // or bad - the page reports the number and lets the operator judge.
  await expect(page.locator('tr[data-metric="aiFailures"] td').first().locator('.admin-delta')).toHaveText('−6');
});

test('with no comparable span the overview says so instead of showing a zero', async ({ page }) => {
  await stubOverview(page, overviewBody({ windows: [overviewWindow('month', { previous: null })] }));
  await page.goto('/admin');

  await expect(page.locator('tr[data-metric="graphicsCreated"] .admin-delta').first()).toHaveText('no comparison');
  // A missing comparison must never render as "−18", which would read as a collapse.
  await expect(page.locator('.admin-delta-down')).toHaveCount(0);
});

test('a comparison span older than a ledger is withheld ONLY for that ledger', async ({ page }) => {
  // The real failure this prevents: the activity ledger is younger than the window. Last month
  // is then mostly a stretch of time nothing was recording, so 18 against 0 renders as "+18"
  // and reads as growth when what changed is that counting began.
  //
  // And the second failure, which the first fix caused: withholding the whole COLUMN. These
  // ledgers were switched on months apart, so a young funnel must not cost the registration
  // trend, which comes from the account directory and is evidenced all the way back.
  await stubOverview(page, overviewBody({
    windows: [
      overviewWindow('month', {
        previousPartialLedgers: ['funnel'],
        previous: { ...OVERVIEW_METRICS, graphicsCreated: 0, newAccounts: 1, aiFailures: 9 },
      }),
    ],
  }));
  await page.goto('/admin');

  // Funnel-backed: withheld, and the value itself is still shown.
  await expect(page.locator('tr[data-metric="graphicsCreated"] .admin-delta').first()).toHaveText('partial history');
  await expect(page.locator('tr[data-metric="graphicsCreated"] td').first()).toContainText('18');
  await expect(page.locator('tr[data-metric="activeVisitors"] .admin-delta').first()).toHaveText('partial history');

  // Account-backed and Lite-backed: their ledgers cover the span, so they KEEP their change.
  await expect(page.locator('tr[data-metric="newAccounts"] .admin-delta').first()).toHaveText('+1');
  await expect(page.locator('tr[data-metric="aiFailures"] .admin-delta').first()).toHaveText('−6');
});

test('every metric declares a ledger, so none inherits another one\'s history', async ({ page }) => {
  // Mark EVERY ledger partial: if a row's ledger were missing or wrong, its delta would survive
  // this and the row would be comparing against history it does not have.
  await stubOverview(page, overviewBody({
    windows: [
      overviewWindow('month', {
        previousPartialLedgers: ['accounts', 'funnel', 'lite', 'gateway', 'render'],
      }),
    ],
  }));
  await page.goto('/admin');

  await expect(page.locator('.admin-metrics tbody tr')).not.toHaveCount(0);
  await expect(page.locator('.admin-delta-up')).toHaveCount(0);
  await expect(page.locator('.admin-delta-down')).toHaveCount(0);
  await expect(page.locator('.admin-delta-flat')).toHaveCount(0);
});

test('an uninstalled aggregation reads as an absence, never as an instance nobody uses', async ({ page }) => {
  await stubOverview(page, overviewBody({ available: false, windows: [], state: null, mix: [], fleet: null }));
  await page.goto('/admin');

  await expect(page.locator('.admin-problem')).toContainText('not installed');
  await expect(page.locator('.admin-problem')).toContainText('it is an absence');
  // And no table of zeroes is rendered beside that warning.
  await expect(page.locator('.admin-metrics')).toHaveCount(0);
});

test('what is wrong sits above what is big, and links to the page that fixes it', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/overview*', (route) =>
    route.fulfill({ json: overviewBody({ fleet: { spendLast24hUsd: 3.9, ceilingUsd: 4 } }) }),
  );
  await page.route('**/api/admin/system*', (route) =>
    route.fulfill({
      json: {
        disabledFeatures: ['ai.lite'],
        models: [],
        maintenanceNotice: { message: 'Renders are queued', level: 'warning', until: null },
        betaUserIds: [],
      },
    }),
  );
  await page.goto('/admin');

  const attention = page.locator('.admin-attention li');
  await expect(attention.first()).toContainText('Switched off instance-wide');
  await expect(attention.filter({ hasText: 'ceiling' })).toHaveCount(1);
  await expect(attention.filter({ hasText: 'suspended' })).toHaveCount(1);
  await expect(attention.filter({ hasText: 'expire within seven days' })).toHaveCount(1);

  // It is ABOVE the numbers, which is the whole point of the block: an operator arriving during
  // an incident must not have to read past three healthy tiles to find the kill switch.
  const attentionBox = await page.locator('.admin-attention').boundingBox();
  const firstTable = await page.locator('.admin-metrics').first().boundingBox();
  expect(attentionBox).not.toBeNull();
  expect(firstTable).not.toBeNull();
  expect(attentionBox?.y ?? 0).toBeLessThan(firstTable?.y ?? 0);

  // And it acts: the kill-switch card opens the section that turns it back on.
  await attention.filter({ hasText: 'Switched off' }).getByRole('button').click();
  await expect(page.locator('.admin-content h1')).toHaveText('System');
});

test('the overview names what it does not track, so an absence is not read as a zero', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  const block = page.locator('.admin-block').filter({ hasText: 'Not tracked' });
  await expect(block.locator('li')).toContainText('success count');
  await expect(block.locator('.admin-pill').first()).toHaveText('no data');

  // The activation-attribution gap is stated rather than hidden behind a confident number.
  await expect(page.locator('.admin-content')).toContainText('upper bound');
});

test('the overview carries no user content of any kind', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');
  await expect(page.locator('.admin-metrics').first()).toBeVisible();

  // Every value on this page is a count, a slug or an amount. The mix bars are the only place a
  // string from a ledger is rendered at all, and those are server-written slugs - a creation
  // door, an export target, a referrer host, a rejection code like `provider_rejected` - so the
  // shape they are allowed to have is asserted rather than assumed. No spaces, therefore no
  // sentence, therefore nothing a person typed.
  const labels = await page.locator('.admin-bar-label').allInnerTexts();
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).toMatch(/^[a-z0-9._-]{1,64}$/);
});

// ── model eligibility ────────────────────────────────────────────────────────────────────

const MODEL_ROWS = [
  {
    key: 'openrouter:vendor/approved-one',
    provider: 'openrouter',
    model: 'vendor/approved-one',
    name: 'Approved One',
    contextLength: 131_072,
    inputPerMillion: 0.05,
    outputPerMillion: 0.15,
    structuredOutput: true,
    vision: false,
    openWeight: true,
    free: false,
    available: true,
    zdr: 'audited',
    zdrAvailable: true,
    approved: true,
    verdict: 'approved',
    blocks: [],
    createdAt: '2026-01-01T00:00:00Z',
    isNew: false,
  },
  {
    key: 'openrouter:vendor/fresh',
    provider: 'openrouter',
    model: 'vendor/fresh',
    name: 'Fresh Candidate',
    contextLength: 262_144,
    inputPerMillion: 0.11,
    outputPerMillion: 0.8,
    structuredOutput: true,
    vision: true,
    openWeight: true,
    free: false,
    available: true,
    zdr: 'unknown',
    zdrAvailable: null,
    approved: false,
    verdict: 'eligible',
    blocks: [],
    createdAt: '2026-07-20T00:00:00Z',
    isNew: true,
  },
  {
    key: 'openrouter:vendor/expensive',
    provider: 'openrouter',
    model: 'vendor/expensive',
    name: 'Expensive Flagship',
    contextLength: 200_000,
    inputPerMillion: 15,
    outputPerMillion: 75,
    structuredOutput: true,
    vision: true,
    openWeight: false,
    free: false,
    available: true,
    zdr: 'unknown',
    zdrAvailable: null,
    approved: false,
    verdict: 'ineligible',
    blocks: ['over-price-ceiling'],
    createdAt: '2026-07-22T00:00:00Z',
    isNew: true,
  },
];

const MODELS_BODY = {
  provider: 'openrouter',
  syncedAt: '2026-07-31T06:00:00Z',
  models: MODEL_ROWS,
  rule: { provider: 'openrouter', inputPerMillion: 1, outputPerMillion: 5, newModelDays: 30 },
  missingApproved: [] as string[],
  discoveryFailed: false,
};

async function stubModels(page: Page, body: Record<string, unknown>) {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/models*', (route) => route.fulfill({ json: body }));
}

test('the models section reports eligibility and refuses to imply quality', async ({ page }) => {
  await stubModels(page, MODELS_BODY);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await expect(page.locator('.admin-content h1')).toHaveText('Models');

  // The disclaimer is load-bearing, not decoration: a price table with capability ticks reads
  // like a shortlist unless the page says otherwise, first.
  await expect(page.locator('.admin-note').first()).toContainText('eligibility, not quality');
  await expect(page.locator('.admin-note').first()).toContainText('never starts a generation');

  // No score, rank or recommendation anywhere on the page.
  const text = (await page.locator('.admin-content').innerText()).toLowerCase();
  for (const word of ['score', 'rank', 'recommend']) {
    expect(text).not.toContain(word);
  }

  // The rule the verdicts were measured against is stated, so a verdict is checkable.
  await expect(page.locator('.admin-content')).toContainText('$1.00 per million input tokens');
});

test('ZDR is shown as audited only where an audit exists', async ({ page }) => {
  await stubModels(page, MODELS_BODY);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByRole('button', { name: /^Everything listed/ }).click();

  await expect(page.locator('tr[data-model="vendor/approved-one"]')).toContainText('audited: yes');
  // The unapproved candidate must read "not audited". A "no" would be an equally unfounded
  // claim in the other direction.
  const fresh = page.locator('tr[data-model="vendor/fresh"]');
  await expect(fresh).toContainText('not audited');
  await expect(fresh).not.toContainText('audited: no');

  // An ineligible route says WHY, in words, rather than leaving a blank cell.
  await expect(page.locator('tr[data-model="vendor/expensive"]')).toContainText('over the funded price ceiling');
});

test('the models filters count what they show, and default to what is new', async ({ page }) => {
  await stubModels(page, MODELS_BODY);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Newly discovered (2)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approved routes (1)' })).toBeVisible();
  // The landing filter is the newly discovered set - what an operator opens this page for.
  await expect(page.locator('tbody tr')).toHaveCount(2);

  await page.getByRole('button', { name: /^Approved routes/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('approved');
});

test('a provider outage costs the models section only, and says so', async ({ page }) => {
  await stubModels(page, { ...MODELS_BODY, models: [], syncedAt: null, discoveryFailed: true });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();

  await expect(page.locator('.admin-problem')).toContainText('could not be read');
  await expect(page.locator('.admin-problem')).toContainText('every other part of the admin surface');

  // The rest of the shell is still navigable, which is the actual claim being made.
  await page.getByRole('button', { name: 'Users', exact: true }).click();
  await expect(page.locator('.admin-content h1')).toHaveText('Users');
});

test('an approved route the provider stopped listing is reported as an outage', async ({ page }) => {
  await stubModels(page, { ...MODELS_BODY, missingApproved: ['openrouter:vendor/vanished'] });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();

  await expect(page.locator('.admin-problem')).toContainText('openrouter:vendor/vanished');
  await expect(page.locator('.admin-problem')).toContainText('fails closed');
});
