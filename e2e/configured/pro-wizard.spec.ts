import { test, expect, type Page, type Route } from '@playwright/test';
import { SUPABASE_URL, haveCreds, settleSync, signIn } from './_helpers';
import { startNewProject } from '../_create';

// HOSTED NoaCG Pro, on a deployment that can actually run it.
//
// Pro is offered on exactly two conditions, ANDed (src/ai/AGENTS.md, "The tiers a user is
// offered"): the server says hosted Pro is available to this visitor, AND the deployment
// carries the backend that route is metered through. The offline suite is by definition the
// second half being false, so `e2e/pro.spec.ts` pins the ABSENCE of the door and drives the
// pipeline through `pro/stub.ts`. **Nothing anywhere covered the walk a class will actually
// run**, because the only surface it exists on is a configured deployment - which is here.
//
// WHAT IS REAL AND WHAT IS STUBBED, and why each is what it is:
//
//  - REAL: the backend half of the AND (`isBackendConfigured()`), the account and its access
//    token, the wizard, the whole browser pipeline - language normalization, the composer, the
//    catalog assembler it builds through, and the production validator with its live bench.
//  - STUBBED: `/api/ai/pro-status` (except in the reachability test below), the reservation,
//    the outcome, and the ONE model call. Three reasons, all binding: a real generation spends
//    real money, a real reservation writes a row into the operator's actual ledger, and hosted
//    Pro is entitlement-gated to the owner and @arcada.fi accounts - so the throwaway test
//    account could never see the door however the suite ran.
//
// UPDATED 2026-08-15 with the engine it covers (docs/NOACG_PRO_PLAN.md §15, §16). Pressing
// Create used to spend two calls - a concept IMAGE and an interpretation of it - and now spends
// exactly one, for the design LANGUAGE the platform composes in. The walk is the same walk; what
// changed is how many calls one reservation has to pay for, which is the thing this spec exists
// to measure.
//
// So these specs assert THE WALK: the door appears, the allowance the panel shows came from
// the server, every model call is metered against one reservation, and the generation reaches
// a terminal state. They deliberately assert NOTHING about whether the graphic is usable -
// that verdict is being changed elsewhere, and a spec pinning today's answer would be a spec
// that has to be edited to let an improvement land.

/**
 * The design language the stubbed model returns - a complete, legible answer, so this walk
 * measures the WALK rather than the normalizer's fallbacks. It is the shape `emit_design_language`
 * forces (src/ai/pro/language/contract.ts): enums, four hex colours and a bundled font id, and
 * not one number the model could get wrong.
 */
const LANGUAGE = {
  name: 'Harbour Nightly',
  rationale: 'A public-service election desk: deep navy, one gold accent, calm and authoritative.',
  palette: { accent: '#c8a24a', panel: '#101b2e', text: '#ffffff', textDim: '#b9c2d0' },
  typography: {
    fontId: 'space-grotesk',
    headingWeight: 'bold',
    supportingWeight: 'medium',
    step: 'clear',
    headingCase: 'as-written',
    supportingCase: 'caps',
    tracking: 'normal',
  },
  shape: { corner: 'sharp', panel: 'solid' },
  accent: { form: 'edge-bar', weight: 'medium' },
  density: 'balanced',
  motion: { character: 'reveal', pace: 'measured' },
};

/** A language is a page of enum values, which is the whole economic argument for Phase A. */
const USAGE = { inputTokens: 1800, outputTokens: 420, totalTokens: 2220 };

const RESERVATION = {
  generationId: '5b9b6f2e-6c1f-4a3d-9f2a-2f7c1a4d8e01',
  expiresAt: '2099-01-01T00:00:00.000Z',
  maxCalls: 4,
  maxGenerationCostUsd: 0.15,
};

/** Answer `/api/ai/pro-status` as a deployment that offers hosted Pro, reading the allowance
 *  from `read()` on EVERY call - so the numbers the panel shows can be changed server-side and
 *  the read-back becomes observable. */
async function withHostedPro(
  page: Page,
  read: () => { daily: number; monthly: number },
): Promise<void> {
  await page.route('**/api/ai/pro-status', (route) => {
    const { daily, monthly } = read();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: 'pro',
        enabled: true,
        available: true,
        requiresSignIn: false,
        maxGenerationCostUsd: 0.15,
        // THE TWO COUNTERS ARE DELIBERATELY DIFFERENT. An allowance is starts AND successes,
        // and a user meets whichever runs out first - so a fixture where they agree cannot
        // tell a panel reading the right one from a panel reading either. Measured
        // 2026-08-15 on a real deployment: the note said "1 generation(s) left today" off
        // the STARTS counter while successes were spent, and Create came back disabled under
        // that sentence.
        allowance: {
          dailyStartsRemaining: daily,
          monthlyStartsRemaining: monthly,
          dailySuccessesRemaining: Math.max(0, daily - 5),
          monthlySuccessesRemaining: Math.max(0, monthly - 9),
        },
      }),
    });
  });
}

/** Open the ⚙ panel, whatever state it is in. It OPENS ITSELF once the tier resolves, on a
 *  condition that depends on the real Lite status and on whether this browser has a key - so a
 *  blind click is as likely to close it as to open it (the lesson e2e/ai-tiers.spec.ts wrote
 *  down). Ask the button what it is currently reporting instead. */
async function openAiSettings(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /AI settings/ });
  const sheet = page.getByTestId('ai-settings');
  await expect(button).toBeVisible();
  // The button is a TOGGLE against a moving target: reading `aria-expanded` and then pressing
  // loses the race when the panel opens itself in between, and the press closes what had just
  // opened (measured - the panel was reliably shut on arrival). Press until it is open, and
  // let the retry own the timing rather than a guess about it.
  await expect(async () => {
    if (!(await sheet.isVisible())) await button.click();
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Sign in, let the account SETTLE, and open the Create-with-AI step.
 *
 * Signing in is itself a sync trigger, and the pull that follows opens whatever the account was
 * last working on - which closes the wizard underneath a walk that started too early. Measured
 * here: the step was reached, and ~18 s later the assertions were running against the editor.
 * So the order is sign in, wait for the library to settle, and only THEN start the project this
 * spec is about.
 */
async function openAiStep(page: Page): Promise<void> {
  await signIn(page);
  await settleSync(page);
  // `signIn` leaves the wizard open, and normally it still is - but the pull can land on a
  // saved project and take the app to the editor, so this asks rather than assumes. Pressing
  // "+ New graphic" while the wizard IS open hangs on its own backdrop, which is the shape the
  // unconditional version failed in.
  const wizard = page.getByTestId('creation-wizard');
  if (!(await wizard.isVisible())) await startNewProject(page);
  await expect(wizard).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  // ANSWER THE ANALYTICS PROMPT FIRST. It only exists on a configured deployment - which is
  // why no offline spec has ever had to - and it sits over the bottom-right of the step, on
  // top of ⚙ AI settings and More control. Playwright reports that honestly ("subtree
  // intercepts pointer events") and a real student meets exactly the same obstacle, so
  // declining it is part of this walk rather than a workaround for the suite.
  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible()) {
    await consent.getByRole('button', { name: 'No thanks' }).click();
    await expect(consent).toHaveCount(0);
  }
  // The step's own furniture, so a failure below names the door rather than the wizard.
  await expect(page.getByRole('button', { name: /AI settings/ })).toBeVisible();
}

test.describe('hosted NoaCG Pro (configured)', () => {
  test.skip(!SUPABASE_URL, 'set VITE_SUPABASE_URL to run the configured-mode suite');
  test.skip(!haveCreds, 'set E2E_EMAIL / E2E_PASSWORD to run the configured-mode suite');

  test('the pro-status route is REACHED and answers the wire contract', async ({ request }) => {
    // Nothing is stubbed here, and that is the point. `/api/ai/pro-status` is a single segment
    // under a `[...path].ts` catch-all precisely because a nested path never arrives at any
    // code at all - a platform 404 that a green build, the API tests and the offline suite are
    // all blind to (api/_lib/pro/router.ts records the measurement). This asks the running
    // deployment, which is the only thing that can answer it.
    //
    // `available` is deliberately NOT asserted: it depends on AI_PRO_ENABLED, the managed key,
    // the ledger and this account's entitlement. What is asserted is that the route exists and
    // speaks ProStatusResponse, so `loadProStatus` gets a status rather than a null it would
    // silently read as "this deployment has no Pro".
    const response = await request.get('/api/ai/pro-status');
    expect(response.status()).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.profile).toBe('pro');
    expect(typeof body.enabled).toBe('boolean');
    expect(typeof body.available).toBe('boolean');
    expect(typeof body.requiresSignIn).toBe('boolean');
    expect(typeof body.maxGenerationCostUsd).toBe('number');
  });

  test('the door appears, the allowance reads back, and one reservation pays for the whole generation', async ({ page }) => {
    // The validator's live bench runs a real iframe playout, and this walk also pays for a real
    // sign-in first.
    test.setTimeout(180_000);

    let allowance = { daily: 7, monthly: 41 };
    /** Every hosted call the browser made, in order - the metering contract as a timeline. */
    const calls: string[] = [];
    const outcomes: { generationId: string; status: string; ruleCodes?: string[] }[] = [];
    /** The reservation id each model call was charged to. */
    const chargedTo: (string | undefined)[] = [];
    /** Which tool each model call forced - the engine, named by what it asks the model for. */
    const toolsAsked: (string | undefined)[] = [];

    await withHostedPro(page, () => allowance);
    await page.route('**/api/ai/pro-generations', async (route: Route) => {
      calls.push('reserve');
      // A reservation is minted once per generation and never reused, so a second POST here
      // would be the double-spend the idempotency key exists to prevent.
      const body = route.request().postDataJSON() as { idempotencyKey?: string };
      expect(body.idempotencyKey ?? '').toMatch(/^pro-.{16,}$/);
      // The walk carries a REAL session: this is the account's own access token, not a
      // fixture. Without it the server has nobody to meter, and the tier is a promise the
      // deployment cannot keep.
      expect(route.request().headers().authorization ?? '').toMatch(/^Bearer .+/);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESERVATION) });
    });
    await page.route('**/api/ai/pro-outcome', async (route: Route) => {
      const body = route.request().postDataJSON() as {
        generationId: string; status: string; ruleCodes?: string[];
      };
      calls.push('outcome');
      outcomes.push(body);
      // The server is the thing that knows what is left, so the panel must ASK it again rather
      // than decrement a number it is holding. Moving it here makes the difference visible.
      allowance = { daily: 6, monthly: 40 };
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":true}' });
    });
    await page.route('**/api/ai/generate', async (route: Route) => {
      const body = route.request().postDataJSON() as {
        // `tool` is rewritten as `structuredOutput` on the wire (src/ai/modelGateway.ts), which
        // is the name the server revalidates the parsed answer against.
        request: { expect?: string; structuredOutput?: { name?: string } };
        proGenerationId?: string;
      };
      calls.push('design');
      chargedTo.push(body.proGenerationId);
      toolsAsked.push(body.request.structuredOutput?.name);
      // NO IMAGE IS EVER ASKED FOR. Failing loudly rather than fulfilling is deliberate: an
      // image request reaching here means the retired concept engine is live again, and a stub
      // that quietly answered it would let that ship (docs/NOACG_PRO_PLAN.md §16).
      expect(body.request.expect ?? 'object', 'Pro asks for no image').not.toBe('image');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          output: LANGUAGE,
          usage: USAGE,
          provider: 'vercel',
          model: 'stub-text',
          attempts: [],
        }),
      });
    });

    await openAiStep(page);

    // THE DOOR. This is the AND's true branch, and it exists on no other surface: offline the
    // second condition is false by construction, so the offline suite can only ever pin the
    // absence.
    await openAiSettings(page);
    const tiers = page.getByTestId('ai-tier');
    await expect(tiers.getByTestId('ai-tier-pro')).toContainText('NoaCG Pro');
    await tiers.getByTestId('ai-tier-pro').click();
    await expect(tiers.getByTestId('ai-tier-pro').getByRole('radio')).toBeChecked();
    await expect(page.getByRole('heading', { name: 'NoaCG Pro' })).toBeVisible();

    // THE ALLOWANCE READ-BACK. The numbers are the server's answer verbatim; a tier that runs
    // on NoaCG's own service has nothing else to show and nothing to configure, so the panel
    // asks for no key and offers no model.
    const note = page.getByTestId('ai-pro-hosted-note');
    // The BINDING number, which is the successes counter here - not the starts counter's 7/41.
    await expect(note).toContainText('2 generation(s) left today');
    await expect(note).toContainText(/32\s+this month/);
    // No provider picker, no model box, and no credential field: a NoaCG tier runs on NoaCG's
    // own service or it is not offered. (The COPY says "no key to supply", so the assertion is
    // about the controls, not about the word.)
    await expect(page.locator('#ai-provider')).toHaveCount(0);
    await expect(page.getByTestId('ai-settings').getByRole('button', { name: /Store (key|token)/ })).toHaveCount(0);

    await page.locator('.wz-step textarea').fill(
      'A calm public-broadcast election-night strap: deep blue, a thin gold rule, authoritative.',
    );
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // A TERMINAL STATE - a result card carrying the readiness rows the validator produced.
    // Whether those rows PASS is the usability verdict, and this spec has no opinion on it:
    // the walk is what is under test.
    await expect(page.getByTestId('ai-readiness')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('.wz-step').getByText(/⏳/)).toHaveCount(0);

    // …and the card tells its own story back: the language the model named, not a picture.
    await expect(page.getByTestId('pro-report')).toContainText(LANGUAGE.name);

    // ONE RESERVATION PAYS FOR THE WHOLE GENERATION, and it is opened BEFORE any model call -
    // a call made outside a reservation is spend the server cannot admit, refuse or attribute.
    expect(calls[0]).toBe('reserve');
    expect(calls.filter((c) => c === 'reserve')).toHaveLength(1);
    // EXACTLY ONE MODEL CALL, and it asks for a design language. That is the engine, pinned by
    // what it spends rather than by what it imports: the retired path made two calls, the first
    // of which was a flat-rate image the compiler then failed to keep (§16).
    expect(calls.filter((c) => c === 'design')).toHaveLength(1);
    expect(toolsAsked).toEqual(['emit_design_language']);
    expect(chargedTo).toEqual([RESERVATION.generationId]);

    // The outcome closes the reservation the calls were charged to. WHICH outcome is the
    // usability verdict again, so only the vocabulary is pinned.
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].generationId).toBe(RESERVATION.generationId);
    expect(['usable', 'failed', 'accepted']).toContain(outcomes[0].status);
    // The row's codes are errors plus Pro's OWN warnings, never the runtime bench's chatty
    // observations - those would evict the Pro codes off a 30-slot wire, which is the whole
    // reason the filter is asymmetric (src/ai/pro/language/gate.ts). A passing generation
    // therefore carries only `pro-` codes, or none.
    const codes = outcomes[0].ruleCodes ?? [];
    if (outcomes[0].status !== 'failed') {
      expect(codes.filter((code) => !code.startsWith('pro-'))).toEqual([]);
    }
    expect(new Set(codes).size, 'the row never repeats a code').toBe(codes.length);

    // …and the panel now shows what the SERVER says is left, not a client-side decrement.
    await expect(note).toContainText('1 generation(s) left today');
    await expect(note).toContainText(/31\s+this month/);
  });

  test('a configured backend alone is not a door - the server still decides', async ({ page }) => {
    test.setTimeout(120_000);
    // The mirror of e2e/pro.spec.ts's first test, from the side only this suite can reach: the
    // backend half of the AND is REAL here, so if the two conditions ever collapse into one,
    // this is where a deployment starts showing a door its server will refuse.
    await page.route('**/api/ai/pro-status', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: 'pro',
        enabled: true,
        available: false,
        reason: 'disabled',
        requiresSignIn: false,
        maxGenerationCostUsd: 0.15,
      }),
    }));
    await openAiStep(page);
    await openAiSettings(page);
    // ABSENT, not greyed: a tier listed as unavailable still advertises itself.
    await expect(page.getByTestId('ai-tier-pro')).toHaveCount(0);
    await expect(page.getByTestId('ai-tier')).not.toContainText('NoaCG Pro');
    await expect(page.getByTestId('ai-pro-settings')).toHaveCount(0);
  });
});
