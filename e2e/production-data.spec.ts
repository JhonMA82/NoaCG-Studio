import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';

// The production DATA workspace (docs/INTERACTIVE_PLAYOUT_PLAN.md D3/D6): the show's own
// tables, edited on the Data tab, loaded into CUES on the Playout tab by deliberate operator
// action. The load fills a DRAFT — nothing reaches air except through Take.

async function productionFor(page: Page, name: string): Promise<void> {
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill(name);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await expect(section.locator('.status-ok')).toContainText('is in the production');
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
}

test('a quiz bank authored on the Data tab loads into the cue, airs only on Take, and survives a reload', async ({ page }) => {
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');

  // ── The Data workspace: create a quiz table (preset columns spell the quiz field titles). ──
  await page.getByTestId('tab-data').click();
  await expect(page.getByTestId('production-data')).toBeVisible();
  await expect(page.getByTestId('data-empty')).toBeVisible();
  await page.getByTestId('add-dataset').click();
  const dataset = page.locator('.pd-dataset');
  await expect(dataset).toHaveCount(1);
  await expect(dataset.getByTestId('dataset-name')).toHaveValue('Quiz questions');
  // The preset ships its starter row; fill it, then add a second question.
  const fill = async (rowIndex: number, cells: string[]) => {
    const row = dataset.locator('tbody tr').nth(rowIndex);
    for (let i = 0; i < cells.length; i++) {
      await row.locator('td input').nth(i).fill(cells[i]);
    }
  };
  await fill(0, ['Which planet is known as the Red Planet?', 'Venus', 'Mars', 'Pluto', 'Titan', 'B']);
  await page.getByTestId('add-row').click();
  await expect(dataset.locator('tbody tr')).toHaveCount(2);
  await fill(1, ['Which ocean is the largest?', 'Atlantic', 'Indian', 'Pacific', 'Arctic', 'C']);
  await expect(dataset).toContainText('2 rows');

  // ── Back on Playout, the cue offers the rows — labelled by their question. ──
  await page.getByTestId('tab-playout').click();
  const load = page.getByTestId('cue-load-row');
  await expect(load).toBeVisible();
  await expect(load.locator('option')).toHaveCount(3); // the placeholder + two rows
  await load.selectOption({ label: 'Quiz questions: Which ocean is the largest?' });

  // The load fills the DRAFT: fields update, the local preview settles, air stays untouched.
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Which ocean is the largest?');
  await expect(page.getByTestId('cue-field-f3')).toHaveValue('Pacific');
  await expect(page.getByTestId('cue-field-f5-opt-C')).toHaveClass(/on/);
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  await expect(preview.locator('#f0')).toHaveText('Which ocean is the largest?');
  // The preview must come back SCALED after the Data-tab round trip: the measure effect used
  // to key on the unchanged document, so the remounted frame was never measured and a 1920px
  // document rendered unscaled — DOM text present, picture showing its empty corner.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const iframe = document.querySelector('iframe[title="Cue preview"]')?.getBoundingClientRect();
        const frame = document.querySelector('[data-testid="production-preview"]')?.getBoundingClientRect();
        return iframe && frame ? iframe.width <= frame.width + 1 : false;
      }),
    )
    .toBe(true);
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

  // Take airs it — the one door to Program.
  await page.getByTestId('verb-take').click();
  await expect(program.locator('#f0')).toHaveText('Which ocean is the largest?');

  // ── The table is on the Show record: reload, reopen the Data tab, everything is there. ──
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('tab-data').click();
  await expect(page.locator('.pd-dataset tbody tr')).toHaveCount(2);
  await expect(page.locator('.pd-dataset tbody tr').nth(1).locator('td input').first()).toHaveValue(
    'Which ocean is the largest?',
  );

  // The deep link works too: #/production/<id>/data is a real route with real history.
  expect(page.url()).toContain('/data');

  // ── Row and table removal: a row goes at once; a whole table asks twice. ──
  const rows = page.locator('.pd-dataset tbody tr');
  await rows.nth(0).locator('[data-testid^="row-delete-"]').click();
  await expect(rows).toHaveCount(1);
  await page.getByTestId('dataset-delete').click();
  await expect(page.getByTestId('dataset-delete')).toHaveText('Delete table?');
  await page.getByTestId('dataset-delete').click();
  await expect(page.getByTestId('data-empty')).toBeVisible();

  // Back on Playout the load control disappears with the table — no dead select.
  await page.getByTestId('tab-playout').click();
  await expect(page.getByTestId('cue-load-row')).toBeHidden();
});

test('a table whose columns match nothing offers no load control, and columns can be added and renamed', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Plain News');

  await page.getByTestId('tab-data').click();
  await page.getByTestId('new-dataset-kind').selectOption('generic');
  await page.getByTestId('add-dataset').click();
  const dataset = page.locator('.pd-dataset');

  // Generic columns match no lower-third field — the Playout tab offers nothing.
  await page.getByTestId('tab-playout').click();
  await expect(page.getByTestId('cue-load-row')).toBeHidden();

  // Rename a column to the field's TITLE and the binding appears — the words are the wiring.
  await page.getByTestId('tab-data').click();
  await dataset.getByTestId('col-c0').fill('Name');
  await dataset.locator('tbody tr td input').first().fill('Alexandra Riva');
  await page.getByTestId('new-column-name').fill('Title');
  await page.getByTestId('add-column').click();
  await dataset.locator('tbody tr td input').nth(3).fill('Chief Correspondent');

  await page.getByTestId('tab-playout').click();
  const load = page.getByTestId('cue-load-row');
  await expect(load).toBeVisible();
  await load.selectOption({ label: 'Data table: Alexandra Riva' });
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Alexandra Riva');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('Chief Correspondent');
});
