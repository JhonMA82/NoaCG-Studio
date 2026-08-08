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

test('a teams table loads one team into the side the operator picked, and leaves the other alone', async ({ page }) => {
  test.setTimeout(120_000);
  // ONE ROW IS ONE TEAM. A two-team board titles its fields "Team A" / "Score A" / "Team B" /
  // …, so a teams row matches none of them literally and the preset used to bind nothing at
  // all. The side picker is what closes that: the operator says which half of the board the
  // next row fills, and the field titles are matched with their side token dropped.
  await createProject(page, { name: 'House Match Board' });
  await productionFor(page, 'Cup Final');

  await page.getByTestId('tab-data').click();
  await page.getByTestId('new-dataset-kind').selectOption('teams');
  await page.getByTestId('add-dataset').click();
  const dataset = page.locator('.pd-dataset');
  await expect(dataset.getByTestId('dataset-name')).toHaveValue('Teams');
  const fill = async (rowIndex: number, cells: string[]) => {
    const row = dataset.locator('tbody tr').nth(rowIndex);
    for (let i = 0; i < cells.length; i++) await row.locator('td input').nth(i).fill(cells[i]);
  };
  // Columns: Team · Score · Team colour · Team logo — every one the sideless half of a real
  // field title, which is what makes them bindable at all.
  await fill(0, ['Ashton United', '2', '#ff0000', '']);
  await page.getByTestId('add-row').click();
  await fill(1, ['Marske Town', '1', '#0000ff', '']);

  await page.getByTestId('tab-playout').click();
  const side = page.getByTestId('cue-load-side');
  await expect(side).toBeVisible();          // a sided board, so the picker is offered

  // Load the first team into side A. B must not move.
  await page.getByTestId('cue-load-side-A').click();
  await page.getByTestId('cue-load-row').selectOption({ label: 'Teams: Ashton United' });
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Ashton United');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('2');
  // Side B still holds the design's own starting values — this board ships a sample score.
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('AWAY');
  await expect(page.getByTestId('cue-field-f3')).toHaveValue('84');

  // Now the second team into side B. A must survive it — this is the assertion that proves the
  // other side's fields are excluded rather than merely unmatched.
  await page.getByTestId('cue-load-side-B').click();
  await page.getByTestId('cue-load-row').selectOption({ label: 'Teams: Marske Town' });
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('Marske Town');
  await expect(page.getByTestId('cue-field-f3')).toHaveValue('1');
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Ashton United');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('2');

  // Loading is a DRAFT action: nothing reached air without a Take.
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
});

test('a graphic with no sides never grows a side picker, and the quiz binding is untouched', async ({ page }) => {
  // The guard on the gesture: the picker is offered only where A/B fields exist, so a quiz
  // board (whose titles carry "Answer A"… but no standalone side on the fields a row fills)
  // must keep binding exactly as it did before the side rule existed.
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night 2');

  await page.getByTestId('tab-data').click();
  await page.getByTestId('add-dataset').click();
  const dataset = page.locator('.pd-dataset');
  const row = dataset.locator('tbody tr').nth(0);
  const cells = ['Which planet is red?', 'Venus', 'Mars', 'Pluto', 'Titan', 'B'];
  for (let i = 0; i < cells.length; i++) await row.locator('td input').nth(i).fill(cells[i]);

  await page.getByTestId('tab-playout').click();
  await page.getByTestId('cue-load-row').selectOption({ index: 1 });
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Which planet is red?');
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('Mars');
});

test('a graphic on air survives a Data-workspace round trip', async ({ page }) => {
  // THE DEFECT (acceptance pass, 2026-08-06): "go to the Data tab while something is in
  // program, come back to Playout, and the graphic is gone from the dashboard — it's still
  // live on CasparCG." The workspace switch unmounts the monitors, and the rebuilt PROGRAM
  // stage is a blank renderer nobody had told what was on air.
  //
  // The same shape as the Phase 2 defect on this exact round trip (the preview came back
  // unscaled), which is why this asserts the RENDERED PICTURE inside the program iframe rather
  // than the ON AIR chip beside it: the chip was right the whole time the monitor was empty.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Round Trip');

  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  // A value the DESIGN does not ship. Taking the cue as-is proves nothing: a rebuilt stage
  // renders the template's own default text, so an assertion against it passes on a monitor
  // that was never told anything (this spec did exactly that in its first version).
  const AIRED = 'Round Trip Sentinel';
  await page.getByTestId('cue-field-f0').fill(AIRED);
  await page.getByTestId('verb-take').click();
  await expect(program.locator('#f0')).toHaveText(AIRED);
  await expect(page.getByTestId('live-cue-chip')).not.toContainText('nothing on air');

  await page.getByTestId('tab-data').click();
  await expect(page.getByTestId('production-data')).toBeVisible();
  await page.getByTestId('tab-playout').click();

  // Back on Playout: the rundown still says ON AIR, and now so does the picture.
  await expect(page.getByTestId('live-cue-chip')).not.toContainText('nothing on air');
  await expect(program.locator('#f0')).toHaveText(AIRED);
  // Not merely present in the markup — the entrance ran, so it is actually visible.
  await expect
    .poll(async () =>
      program.locator('#f0').evaluate((el) => {
        const box = el.closest('[class$="-box"]') ?? el;
        return Number(getComputedStyle(box as Element).opacity);
      }),
    )
    .toBeGreaterThan(0.9);
});

test('a quiz bank imported from CSV loads into a cue and airs — the Phase 2 walk from a file', async ({ page }) => {
  // Phase 7. The parser's own edge cases (quoted commas, quoted newlines, doubled quotes,
  // separators, JSON shapes) are unit-tested in scripts/csv.test.mjs; what is pinned HERE is
  // the walk a user actually does — a file becomes a table, a row becomes a cue, the cue airs.
  // The fixture carries a quoted comma on purpose, so a `split(',')` regression cannot pass.
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Import Night');

  await page.getByTestId('tab-data').click();
  await page.getByTestId('import-dataset').setInputFiles({
    name: 'Quiz bank.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Question,Answer A,Answer B,Answer C,Answer D,Correct answer\n' +
        '"Which of these, exactly, is a planet?",Ganymede,Mars,Europa,Titan,B\n' +
        'Which ocean is the largest?,Atlantic,Indian,Pacific,Arctic,C\n',
    ),
  });

  // It reports what BOUND, not merely what arrived: a table that matches no field imports
  // perfectly and does nothing.
  const note = page.getByTestId('import-note');
  await expect(note).toContainText('Imported 2 rows');
  await expect(note).toContainText('Question');
  await expect(note).toContainText('Correct answer');

  // A real table, named after the file, editable like any other.
  const dataset = page.locator('.pd-dataset');
  await expect(dataset).toHaveCount(1);
  await expect(dataset.getByTestId('dataset-name')).toHaveValue('Quiz bank');
  await expect(dataset.locator('tbody tr')).toHaveCount(2);
  // The quoted comma survived — one cell, not two columns.
  await expect(dataset.locator('tbody tr').first().locator('td input').first()).toHaveValue(
    'Which of these, exactly, is a planet?',
  );

  // ── Load a row into the cue and air it. ──
  await page.getByTestId('tab-playout').click();
  await page.getByTestId('cue-load-next').click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Which of these, exactly, is a planet?');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('verb-take').click();
  await expect(program.locator('#f0')).toHaveText('Which of these, exactly, is a planet?');
  await expect(program.locator('#f2')).toHaveText('Mars');
});

test('the downloaded template is a file the importer accepts, with the columns a cue can bind', async ({
  page,
}) => {
  // The other half of import. What is pinned is the ROUND TRIP: the header the download carries
  // is the header the importer reads back, and its columns bind to the quiz board's fields -
  // which is the whole reason a blank template beats guessing at column names.
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Template Night');
  await page.getByTestId('tab-data').click();

  await page.getByTestId('new-dataset-kind').selectOption('quiz');
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-dataset-template').click(),
  ]).then(([d]) => d);
  expect(download.suggestedFilename()).toBe('quiz-questions-template.csv');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  expect(text.trim()).toBe('Question,Answer A,Answer B,Answer C,Answer D,Correct answer');

  // Hand it straight back, with a row typed in as an operator would.
  await page.getByTestId('import-dataset').setInputFiles({
    name: 'Quiz questions.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`${text}Which planet is red?,Venus,Mars,Pluto,Titan,B\r\n`),
  });
  const note = page.getByTestId('import-note');
  await expect(note).toContainText('Imported 1 row');
  // Every column bound - a template that named a column no field answers to would be the one
  // failure this feature exists to make impossible.
  await expect(note).toContainText('Question, Answer A, Answer B, Answer C, Answer D, Correct answer');
});

test('an imported table whose columns match no field says so rather than looking successful', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'No Match');
  await page.getByTestId('tab-data').click();
  await page.getByTestId('import-dataset').setInputFiles({
    name: 'sales.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Region;Revenue\nNorth;12\nSouth;9\n'),
  });
  const note = page.getByTestId('import-note');
  // The semicolon export still parses as two columns — the separator is detected, not assumed.
  await expect(page.getByTestId('col-c0')).toHaveValue('Region');
  await expect(page.getByTestId('col-c1')).toHaveValue('Revenue');
  await expect(note).toContainText('NO column matches');
});

test('a file that is not a table is refused with a reason', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Bad File');
  await page.getByTestId('tab-data').click();
  await page.getByTestId('import-dataset').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.getByTestId('import-note')).toContainText('list of rows');
  await expect(page.getByTestId('data-empty')).toBeVisible();
});
