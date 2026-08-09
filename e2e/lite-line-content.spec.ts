// A generated graphic must come back carrying every line it was given, and a graphic TYPE must
// never come back with fewer populated lines than it declares line fields.
//
// The reproduction (docs/AI_LITE_PLAN.md §5 step 4): a quiz board declares five line fields -
// the question and its four answers - and `specToTemplate` slices a spec's lines to
// `variant.maxLines`, which the quiz type hand-declared as 1. Four answers were dropped before
// `variant.create()` ever saw them, and the quiz assembler builds its fields from a baked
// content declaration rather than from `o.lines`, so what shipped was the catalog's own
// planets question with four planets as its answers - a generation that "succeeded" while
// answering a completely different brief.
//
// Measured across the type registry at the time, NINE types were in that class: the three
// answer boards (5, 4 and 3 line fields) and every sports board (4 to 6), all declaring a
// capacity of 1 and carrying NONE of the caller's lines. That is why the guard below is
// registry-wide rather than quiz-shaped: this is the last obstacle between Lite and every
// category past lower thirds, and the next type to grow a line field must not be able to
// rejoin the class silently.
//
// Free - no model call, no tokens.

import { expect, test } from '@playwright/test';

type Page = import('@playwright/test').Page;

/** The five lines a quiz brief carries: the question and its four answers. */
const QUIZ_LINES = [
  { title: 'Question', sample: 'Which river runs through Vienna?' },
  { title: 'Answer A', sample: 'The Rhine' },
  { title: 'Answer B', sample: 'The Danube' },
  { title: 'Answer C', sample: 'The Elbe' },
  { title: 'Answer D', sample: 'The Seine' },
];

/** Compile a spec through the grounded path and report its line fields' values. */
async function compiledLineValues(page: Page, variantId: string, lines: { title: string; sample: string }[]) {
  return page.evaluate(async ({ variantId, lines }) => {
    const { specToTemplate } = await import('/src/ai/designSpec.ts');
    const spec = {
      fit: 'catalog',
      reason: 'pinned by e2e',
      name: 'Line content',
      summary: 'Line content',
      category: 'quiz',
      variantId,
      lines,
    } as unknown as Parameters<typeof specToTemplate>[0];
    const { template } = specToTemplate(spec);
    // The board's line fields are f0…f4; the trailing textfields are the hidden correct /
    // selected / audience data sources, which are not lines.
    return template.fields.slice(0, 5).map((f) => f.value);
  }, { variantId, lines });
}

/**
 * Compile every registered type's designs with one sentinel per declared line field and report
 * the ones that came back short.
 *
 * `mutate: 'leave-one-behind'` puts the pre-fix defect back by hand on the quiz board - its
 * second line field keeps the design's baked answer instead of the caller's line - so the same
 * measurement has to name it. A registry-wide "nothing came back short" is otherwise satisfied
 * by a check that can never fire.
 */
async function typesComingBackShort(page: Page, mutate: 'none' | 'leave-one-behind') {
  return page.evaluate(async (how) => {
    const { TYPES } = await import('/src/templates/types/registry.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    const short: { type: string; design: string; declared: number; carried: number }[] = [];
    for (const type of TYPES) {
      const declared = type.fields.filter((f) => f.role === 'line');
      if (declared.length === 0) continue; // a logo mark has no lines to lose
      for (const design of type.designs) {
        const variant = variantById(design.id);
        if (!variant) continue;
        const lines = declared.map((f, i) => ({ title: f.label, sample: `SENTINEL${i}` }));
        let template = variant.create({ lines });
        if (how === 'leave-one-behind' && type.id === 'quiz-board') {
          template = {
            ...template,
            fields: template.fields.map((f, i) => (i === 1 ? { ...f, value: 'Venus' } : f)),
          };
        }
        // Positional by the type's own contract: declared line field i IS the template's i-th
        // field, which is what keeps the compiled fN ids in step with the assembler.
        const carried = template.fields
          .slice(0, declared.length)
          .filter((f, i) => f.value === `SENTINEL${i}`).length;
        if (carried < declared.length) {
          short.push({ type: type.id, design: design.id, declared: declared.length, carried });
        }
      }
    }
    return short;
  }, mutate);
}

test.describe('a generated graphic carries every line it was given', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('a quiz spec compiles five populated answer lines', async ({ page }) => {
    expect(await compiledLineValues(page, 'qz02', QUIZ_LINES)).toEqual(QUIZ_LINES.map((l) => l.sample));
  });

  test("a spec with fewer lines keeps the board's own answers, never blanks", async ({ page }) => {
    // A fixed field contract cannot shrink: a quiz board with two of its four answers blanked
    // is not a smaller quiz, it is a broken one. The 'lines'-plan pad-with-empty rule is right
    // for a lower third and wrong here, which is why the field plan decides between them.
    const values = await compiledLineValues(page, 'qz02', QUIZ_LINES.slice(0, 2));
    expect(values.slice(0, 2)).toEqual(QUIZ_LINES.slice(0, 2).map((l) => l.sample));
    expect(values.slice(2).every((v) => v.trim().length > 0)).toBe(true);
  });
});

test.describe('no graphic type comes back with fewer lines than it declares', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('every registered type carries every line field it declares', async ({ page }) => {
    expect(await typesComingBackShort(page, 'none')).toEqual([]);
  });

  test('a type that leaves a line behind is reported', async ({ page }) => {
    const short = await typesComingBackShort(page, 'leave-one-behind');
    expect(short.length).toBeGreaterThan(0);
    expect(short.every((s) => s.type === 'quiz-board' && s.carried === s.declared - 1)).toBe(true);
  });
});
