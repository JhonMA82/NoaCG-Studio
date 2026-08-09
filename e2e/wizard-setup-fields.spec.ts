import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect, type Page } from '@playwright/test';
import { chooseType, pickDesign } from './_browse';

// The wizard's SETUP section: the non-line decisions that belong to BUILDING a graphic rather
// than to running it - which answer a quiz marks correct, the club colours, how long a
// countdown runs. Every one of them was previously reachable only after creation, in the
// editor's Data tab, so a quiz created in the wizard always revealed its chassis's own default
// row and the only way to change that was to open the advanced surface the student release
// exists to make optional.
//
// What appears there is DERIVED, never a second declaration: `setupFields` drops any field an
// operator event carries as PAYLOAD, because this model's answer to combinatorial states is
// "the moment is a state, what it is about is DATA" - so a payload field is live state by
// construction. The quiz proves both halves at once: `correctAnswer` is setup and offered,
// `selectedAnswer` is the `select` event's payload and is not.

async function toFieldsStep(page: Page, category: string, variantName: string) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, category);
  await pickDesign(page, variantName);
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
}

async function createdFields(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return Object.fromEntries(
      useTemplateStore.getState().template.fields.map((f) => [f.title, f.value]),
    );
  });
}

test('a quiz created in the wizard marks the answer the author chose', async ({ page }) => {
  await toFieldsStep(page, 'Quiz', 'House Quiz');

  const setup = page.getByTestId('wz-setup');
  await expect(setup).toBeVisible();
  // The board's own default is B; the author picks C without ever opening the editor. Four
  // letters render as the shared control's segmented picker, not a dropdown - a small closed
  // choice is one press either way, which is the whole reason that control exists.
  await setup.getByTestId('wz-setup-correctAnswer-opt-C').click();

  await finishIntoEditor(page);
  await expect(page.locator('.wz-modal')).toBeHidden();

  const fields = await createdFields(page);
  expect(fields['Correct answer']).toBe('C');
  // The lines are untouched by the setup edit - the board still says what it said.
  expect(fields['Question']).toBeTruthy();
});

test('live state is not offered at create, only setup is', async ({ page }) => {
  await toFieldsStep(page, 'Quiz', 'House Quiz');

  const setup = page.getByTestId('wz-setup');
  // `correctAnswer` is decided when the quiz is written…
  await expect(setup.getByTestId('wz-setup-correctAnswer')).toBeVisible();
  // …while the contestant's pick and the audience percentages ride in on operator events, so
  // offering them here would invite an author to set a value the first event overwrites.
  await expect(setup.getByTestId('wz-setup-selectedAnswer')).toHaveCount(0);
  await expect(setup.getByTestId('wz-setup-audienceResults')).toHaveCount(0);
});

test('a countdown\'s duration and a scorebug\'s colours are setup too', async ({ page }) => {
  // The quiz proves a `select`; these are the other kinds the section has to render, and they
  // come from SELF-ASSEMBLED categories whose fields the design owns rather than the shared
  // assembler emitting them - which is exactly where a positional mapping could have been
  // wrong without anything noticing.
  await toFieldsStep(page, 'Timers & clocks', 'Clean Clock');
  const clock = page.getByTestId('wz-setup');
  await clock.getByTestId('wz-setup-minutes').fill('12');
  await finishIntoEditor(page);
  // The store is read only once the wizard has closed: the create lands as the modal goes, and
  // reading straight after the click returns the PREVIOUS project's fields.
  await expect(page.locator('.wz-modal')).toBeHidden();
  expect((await createdFields(page))['Timer (minutes)']).toBe('12');

  await toFieldsStep(page, 'Scoreboards', 'House Scorebug');
  const board = page.getByTestId('wz-setup');
  // The colour control is a swatch plus its hex box; the box is the one a spec can type into.
  await board.getByTestId('wz-setup-colourA').locator('..').locator('input.grow').fill('#123456');
  await finishIntoEditor(page);
  await expect(page.locator('.wz-modal')).toBeHidden();
  expect((await createdFields(page))['Team A colour']).toBe('#123456');
});

test('a setup value lands on the field it names, for every type that has one', async ({ page }) => {
  // Registry-wide, because the write is POSITIONAL (declared field i is the template's i-th)
  // and the check is by TITLE. A type whose design emitted its fields in a different order
  // from the declaration would silently write the club colour into the period chip, and no
  // per-type spec would be looking. 25 types carry setup fields today.
  await page.goto('/app');
  const wrong = await page.evaluate(async () => {
    const { TYPES } = await import('/src/templates/types/registry.ts');
    const { setupFields } = await import('/src/templates/types/graphicType.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    const probe = (kind: string, field: { options?: { value: string }[] }) => {
      switch (kind) {
        case 'number': return '7';
        case 'color': return '#123456';
        case 'select': return field.options?.[field.options.length - 1]?.value ?? '';
        case 'lines': return 'PROBE | 1';
        default: return 'PROBE';
      }
    };
    const bad: string[] = [];
    let covered = 0;
    for (const type of TYPES) {
      const setup = setupFields(type);
      if (!setup.length) continue;
      const variant = variantById(type.designs[0].id);
      if (!variant) continue;
      covered += 1;
      const content = Object.fromEntries(setup.map((f) => [f.key, probe(f.kind, f)]));
      const byTitle = Object.fromEntries(variant.create({ content }).fields.map((f) => [f.title, f.value]));
      for (const f of setup) {
        if (byTitle[f.label] !== content[f.key]) {
          bad.push(`${type.id}.${f.key} (${f.kind}): wanted ${content[f.key]}, got ${String(byTitle[f.label])}`);
        }
      }
    }
    return { bad, covered };
  });
  expect(wrong.covered).toBeGreaterThan(20); // the measurement itself is reaching the registry
  expect(wrong.bad).toEqual([]);
});

test('a design with no setup values shows no setup section', async ({ page }) => {
  // A lower third is lines, a logo and nothing else - so the section must not appear at all
  // rather than appear empty. (The mutation half of the test above: a section that rendered
  // unconditionally would pass every assertion there and still be wrong here.)
  await toFieldsStep(page, 'Lower thirds', 'House Strap');
  await expect(page.getByTestId('wz-setup')).toHaveCount(0);
});
