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

test('a design with no setup values shows no setup section', async ({ page }) => {
  // A lower third is lines, a logo and nothing else - so the section must not appear at all
  // rather than appear empty. (The mutation half of the test above: a section that rendered
  // unconditionally would pass every assertion there and still be wrong here.)
  await toFieldsStep(page, 'Lower thirds', 'House Strap');
  await expect(page.getByTestId('wz-setup')).toHaveCount(0);
});
