// Every field a NoaCG Lite graphic declares must reach the screen.
//
// The defect, from the 2026-08-08 quality round (benchmarks/lite/ROUND-2026-08-08-QUALITY.md
// §4): one generation shipped a lower third that painted the name, reserved a wide band under
// it, and drew nothing there. `fieldCount` said 2. Driving the graphic with fresh data through
// `update()` changed nothing on screen. Static validation, the runtime bench, the type floor and
// the wrap check were all silent, because every one of them asks about an element that IS drawn.
//
// The question that answers it already existed - `structuralIntentCheck` drives every field to a
// sentinel and re-reads the painted frame - and it could not run here: it needs a StructuralIntent,
// and Lite runs no intent stage at all, so `withStructuralFindings` returns early on every Lite
// result. The drive now lives in `src/validation/fieldPaint.ts`, shared by both, and the bench
// exposes it as the opt-in `fieldPaints` that Lite's validator turns on.
//
// Three tests, because a gate that only proves it can fire is satisfied by a check that flags
// everything, and a gate nobody enables is decoration:
//   1. an ordinary Lite compile stays quiet;
//   2. a template whose field genuinely cannot paint raises it (the mutation half);
//   3. it is OFF unless a caller asks - a hand-written template may hide whatever it likes.
//
// Free - no model call, no tokens.

import { expect, test } from '@playwright/test';

type Page = import('@playwright/test').Page;

/** Compile one ordinary Lite decision through the shared grounded path. */
async function rulesFor(page: Page, mutate: 'none' | 'hide-second-field'): Promise<string[]> {
  return page.evaluate(async (how) => {
    const pipeline = await import('/src/ai/litePipeline.ts');
    const bench = await import('/src/validation/runtimeBench.ts');
    type Decision = Parameters<typeof pipeline.compileLiteDecision>[0];
    type Context = Parameters<typeof pipeline.compileLiteDecision>[1];
    const decision = {
      fit: 'catalog', reason: 'pinned by e2e', name: 'Field paint', summary: 'Field paint',
      category: 'lower-third', variantId: 'lt11',
      intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
      lines: [
        { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
        { title: 'Role', sample: 'Head Coach', role: 'person-role' },
      ],
      flourish: null,
    } as unknown as Decision;
    const compiled = await pipeline.compileLiteDecision(decision, {} as Context);
    const template = compiled.template;
    if (!template) return ['NO TEMPLATE'];
    if (how === 'none') {
      // The real path: whatever `compileLiteDecision` decided, read at its own severity.
      return [...compiled.validation.errors, ...compiled.validation.warnings].map((f) => f.rule);
    }
    const second = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea')[1];
    if (!second) return ['NO SECOND FIELD'];
    // `display: none` is the crudest form of the defect and the one the drive is specified
    // against (`visibleText` skips display:none and visibility:hidden, and deliberately does
    // NOT consult opacity - a region a later step reveals is transparent and perfectly
    // reachable). A colour that vanishes into the panel is the same finding by a different
    // route, and is not pinned here because it would be testing the browser's compositor.
    const hidden = { ...template, css: `${template.css}\n#${second.field} { display: none !important; }\n` };
    const result = await bench.benchTemplateRuntime(hidden, { fieldPaints: true });
    return [...result.errors, ...result.warnings].map((f) => f.rule);
  }, mutate);
}

test.describe('a Lite graphic paints every field it declares', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('an ordinary Lite compile raises nothing', async ({ page }) => {
    // `compileLiteDecision` turns `fieldPaints` on, so this is the check running on a real
    // result - a gate that fired on the platform's own output would be worse than no gate.
    expect(await rulesFor(page, 'none')).not.toContain('bench-field-unpainted');
  });

  test('a field that cannot paint raises bench-field-unpainted', async ({ page }) => {
    expect(await rulesFor(page, 'hide-second-field')).toContain('bench-field-unpainted');
  });

  test('the drive is off unless a caller asks, and leaves the default data behind it', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const pipeline = await import('/src/ai/litePipeline.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      type Decision = Parameters<typeof pipeline.compileLiteDecision>[0];
      type Context = Parameters<typeof pipeline.compileLiteDecision>[1];
      const decision = {
        fit: 'catalog', reason: 'x', name: 'x', summary: 'x',
        category: 'lower-third', variantId: 'lt11',
        intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
        lines: [
          { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
          { title: 'Role', sample: 'Head Coach', role: 'person-role' },
        ],
        flourish: null,
      } as unknown as Decision;
      const compiled = await pipeline.compileLiteDecision(decision, {} as Context);
      const hidden = {
        ...compiled.template,
        css: `${compiled.template.css}\n#f1 { display: none !important; }\n`,
      };
      // Same broken template, twice: once with the option and once without.
      const off = await bench.benchTemplateRuntime(hidden, {});
      const on = await bench.benchTemplateRuntime(hidden, { fieldPaints: true });
      return {
        off: [...off.errors, ...off.warnings].map((f) => f.rule),
        on: [...on.errors, ...on.warnings].map((f) => f.rule),
      };
    });

    expect(out.off).not.toContain('bench-field-unpainted');
    expect(out.on).toContain('bench-field-unpainted');
    // The drive replaces the frame's data with sentinels, and the exit, replay and stress
    // phases run after it. If the restore were dropped, those phases would silently start
    // measuring `ZQ0X` instead of the real copy - so the two runs must otherwise agree.
    const others = (rules: string[]) => rules.filter((r) => r !== 'bench-field-unpainted').sort();
    expect(others(out.on)).toEqual(others(out.off));
  });
});
