// An identity line must not wrap, and a headline may.
//
// The first production NoaCG Lite round shipped a five-line "lower third": the operator's job
// title wrapped onto three rows and every gate passed it, because a wrapped line does not
// escape its frame - the overflow sweep and the runtime bench's stress pass both ask that
// question, and the type floor measures font size (docs/AI_LITE_PLAN.md §1).
//
// The discriminator is the line's declared ROLE, which Lite's schema has always required. A
// person's role, organization or location belongs on one line; a story headline running to two
// lines over a one-line kicker was the best frame that round produced. So this spec pins all
// three outcomes together - a guard that only proves the error fires would be satisfied by a
// check that flags everything.
//
// It drives `compileLiteDecision` directly (the shared compile path both production and the
// benchmark are built from) rather than the wizard: no model call, no tokens, and no dependency
// on the AI step's UI.

import { expect, test } from '@playwright/test';

const LONG_ROLE = 'International Development Policy Research Fellow';
const SHORT_ROLE = 'Head Coach';

/** Compile one Lite decision and report the validation rules it raised. */
async function rulesFor(
  page: import('@playwright/test').Page,
  role: string,
  sample: string,
): Promise<string[]> {
  return page.evaluate(
    async ([lineRole, lineSample]) => {
      const mod = await import('/src/ai/litePipeline.ts');
      type Decision = Parameters<typeof mod.compileLiteDecision>[0];
      type Context = Parameters<typeof mod.compileLiteDecision>[1];
      // `role` is required on a LITE decision's lines and absent from the shared DesignSpec
      // type, which is exactly the asymmetry singleLineIdentityFields reads at runtime - so the
      // fixture is built as data and narrowed once, rather than typed as `any`.
      const decision = {
          fit: 'catalog',
          reason: 'pinned by e2e',
          name: 'Line fit',
          summary: 'Line fit',
          category: 'lower-third',
          // lt32 Scrim is the tightest audited chassis - 28 characters on one line, measured by
          // scripts/lite-line-capacity.mjs. Picking it makes the wrap reproducible without a
          // absurd string, and it is the design the round actually failed on.
          variantId: 'lt32',
          intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: lineRole },
          lines: [
            { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
            { title: 'Role', sample: lineSample, role: lineRole },
          ],
          flourish: null,
        } as unknown as Decision;
      const result = await mod.compileLiteDecision(decision, {} as Context);
      return result.validation.errors.map((error) => error.rule);
    },
    [role, sample] as const,
  );
}

test.describe('a Lite identity line stays on one line', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('a person-role too long for the chassis raises bench-line-wrap', async ({ page }) => {
    expect(await rulesFor(page, 'person-role', LONG_ROLE)).toContain('bench-line-wrap');
  });

  test('the same chassis stays quiet when the role fits', async ({ page }) => {
    // The other half of the guard: without this, a check that flagged every graphic would pass
    // the test above and nobody would notice until it blocked real work.
    expect(await rulesFor(page, 'person-role', SHORT_ROLE)).not.toContain('bench-line-wrap');
  });

  test('the same long copy is allowed to wrap when it is a story headline', async ({ page }) => {
    // Identical string, identical chassis - only the declared role differs. This is what proves
    // the check reads the role rather than just measuring height.
    expect(await rulesFor(page, 'story-headline', LONG_ROLE)).not.toContain('bench-line-wrap');
  });
});
