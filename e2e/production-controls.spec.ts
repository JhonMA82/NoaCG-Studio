import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';

// The production page's GRAPHIC ACTIONS block (docs/PLAYOUT_DASHBOARD.md §8): the machine's
// ⚡ buttons rendered from the metadata that travels inside the template, greyed by the
// structural guard, with the state chip naming what the greying is judged against. All of it
// offline — the verbs drive the local PROGRAM monitor, which is the same renderer the
// published output runs, so what these specs prove is what airs.

/** Create the current editor graphic's production and land on its page. */
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

test('the production page re-asks for machine state, so a change it did not cause still reaches the chip', async ({ page }) => {
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');

  const chip = page.getByTestId('machine-state-chip');
  await page.getByTestId('verb-take').click();
  await expect(chip).toHaveText('Question');

  // DRIVE THE MACHINE BEHIND THE PAGE'S BACK. The stage posts one `{cmd:'state'}` after each
  // command it applies, so the page's picture of the machine is only ever as fresh as its own
  // last command. Anything that moves the graphic WITHOUT going through this page — a timer
  // arrow firing in the runtime, another operator's device driving the shared log, or simply a
  // reply that lost the race with the entrance it was asking about — leaves the chip stale,
  // and the ⚡ buttons are greyed against that same stale state (`isEventLegal`).
  //
  // The /output renderer has re-asked every second since it shipped (src/output/main.ts); this
  // surface had no poll at all, which is why a state that arrived wrong stayed wrong until the
  // operator pressed something else. Measured as a red quiz-pilot run whose chip read "Off"
  // through eighteen consecutive polls with no correction ever arriving.
  const handle = await page.locator('[data-testid="program-stage"] iframe').elementHandle();
  const frame = await handle!.contentFrame();
  await frame!.evaluate(() => {
    (window as unknown as { noacgDispatch: (e: string, p?: unknown) => void }).noacgDispatch(
      'select',
      { f6: 'B' },
    );
  });

  // Nobody told the page. It has to ask again — and the chip is what says it did.
  await expect(chip).toHaveText('Answer selected', { timeout: 5_000 });
});

test('a Take pressed a moment after the page opens still airs - and stays aired', async ({ page }) => {
  // EVERY OTHER SPEC HERE TAKES INSTANTLY, and that is what hid this: a real operator opens a
  // production, reads the rundown and presses Take seconds later. The local PROGRAM monitor
  // reports its machine state once a second, so by then the page knew the graphic was "off" -
  // and the boot recovery, which was keyed on `liveCue` MOVING rather than on the wire's own
  // answer, treated the operator's own first Take as a page that had opened onto a live
  // production and replayed `snap` to that stale "off". The graphic aired and went straight
  // back off: black monitor, chip reading Off, every action greyed, nothing said. Offline it
  // was every take, because with no wire `liveCue` can only move locally.
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');

  // Past the first state poll - the window the old bug needed.
  await expect(page.getByTestId('machine-state-chip')).toHaveText('not on air');
  await page.waitForTimeout(2_000);
  await page.getByTestId('verb-take').click();

  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(program.locator('.quiz')).toBeVisible();
  // And it is still there after the next few polls - a graphic that airs and then quietly
  // disappears is the same defect wearing a delay.
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
  await expect(page.getByTestId('cue-action-select')).toBeEnabled();
});

test('quiz actions on the production page: greying, select/lock, live update keeps the lock, snap recovers the verdict', async ({ page }) => {
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');

  const actions = page.getByTestId('cue-actions');
  const chip = page.getByTestId('machine-state-chip');
  const select = page.getByTestId('cue-action-select');
  const lock = page.getByTestId('cue-action-lock');
  const judge = page.getByTestId('cue-action-judge');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');

  // The block is there, says it acts ON AIR, and every button is dead until a Take — the
  // graphic is not up, so firing anything would be a lie the runtime happens to swallow.
  await expect(actions).toBeVisible();
  await expect(actions).toContainText('act on air');
  await expect(chip).toHaveText('not on air');
  await expect(select).toBeDisabled();
  await expect(select).toHaveAttribute('title', /not on air — Take the cue first/);
  await expect(lock).toBeDisabled();
  await expect(judge).toBeDisabled();

  // TAKE. The machine enters the Question state; the guard opens exactly the arrows that
  // leave it: select, judge, and lock (the hidden-pick flow seals straight from the
  // question) — while revealChoice stays grey, its only arrow leaving `sealed`.
  await page.getByTestId('verb-take').click();
  await expect(chip).toHaveText('Question');
  await expect(select).toBeEnabled();
  await expect(judge).toBeEnabled();
  await expect(lock).toBeEnabled();
  await expect(page.getByTestId('cue-action-revealChoice')).toBeDisabled();

  // The Selected-answer dropdown renders as SEGMENTED buttons (short constrained choice).
  // Pick B in the cue editor, then fire Select — the value rides as the event's payload.
  await page.getByTestId('cue-field-f6-opt-B').click();
  await select.click();
  await expect(chip).toHaveText('Answer selected');
  await expect(lock).toBeEnabled();
  await expect(program.locator('.quiz-option').nth(1)).toHaveClass(/quiz-sel/);

  // Lock it in: the chip says so, and select GREYS — no select arrow leaves `locked`, and the
  // panel mirrors the machine's structural guard rather than guessing.
  await lock.click();
  await expect(chip).toHaveText('Locked in');
  await expect(select).toBeDisabled();
  await expect(program.locator('.quiz')).toHaveClass(/quiz-locked/);

  // THE RECOVERY-FIDELITY FIX (tracker G9): a live ✎ Update mid-lock must repaint the board
  // from the machine's state, not wipe the selection and the lock while the chip still says
  // "Locked in".
  await page.getByTestId('cue-field-f0').fill('Still locked after an update?');
  await page.getByTestId('verb-update').click();
  await expect(program.locator('#f0')).toHaveText('Still locked after an update?');
  await expect(program.locator('.quiz')).toHaveClass(/quiz-locked/);
  await expect(program.locator('.quiz-option').nth(1)).toHaveClass(/quiz-sel/);

  // Fire the reveal, then SNAP back to "Locked in" — recovery, no animation. The snap fires
  // only the TARGET state's own call (applyLock); the selection belongs to the suppressed
  // intermediate `selected` state, so the highlighted pick can only come back through the
  // data half that rides with the snap (reset is two operations). Asserting quiz-sel here is
  // what proves that update actually went — a snap alone would leave the lock without a pick.
  await judge.click();
  await expect(chip).toHaveText('Reveal');
  await expect(program.locator('.quiz-correct')).toHaveCount(1);
  await page.getByTestId('machine-snap').selectOption({ label: 'Locked in' });
  await expect(chip).toHaveText('Locked in');
  await expect(program.locator('.quiz-correct')).toHaveCount(0);
  await expect(program.locator('.quiz')).toHaveClass(/quiz-locked/);
  await expect(program.locator('.quiz-option').nth(1)).toHaveClass(/quiz-sel/);

  // And back to start: every group to its initial, the visual half of reset.
  await page.getByTestId('machine-snap').selectOption({ label: '⟲ Back to start (visual reset)' });
  await expect(program.locator('.quiz-option.quiz-sel')).toHaveCount(0);
});

test('scorebug actions group by section and drive the clock; a plain lower third shows no actions block', async ({ page }) => {
  await createProject(page, { name: 'Club Scorebug' });
  await productionFor(page, 'Club Match');

  const actions = page.getByTestId('cue-actions');
  await expect(actions).toBeVisible();
  // The machine's controls carry their own sections ("Clock", "Match") — the panel renders
  // them as labelled groups, not one undifferentiated row.
  await expect(actions.locator('h4', { hasText: 'Clock' })).toBeVisible();
  await expect(actions.locator('h4', { hasText: 'Match' })).toBeVisible();

  await page.getByTestId('verb-take').click();
  const start = page.getByTestId('cue-action-clockStart');
  const stop = page.getByTestId('cue-action-clockStop');
  await expect(start).toBeEnabled();
  await expect(stop).toBeDisabled(); // armed: nothing to stop yet — the guard, mirrored

  await start.click();
  await expect(page.getByTestId('machine-state-chip')).toContainText(/running/i);
  await expect(stop).toBeEnabled();
  await expect(start).toBeDisabled();

  // Full time is destructive (one way only) and marked as such.
  await expect(page.getByTestId('cue-action-final')).toHaveClass(/destructive/);
});

test('a match board reaches every one of its controls from the cockpit: both clock verbs, the interval, the crests', async ({ page }) => {
  test.setTimeout(120_000);
  // The scorebug test above covers Start/Stop. This covers what Phase 4 actually promised an
  // operator: the REST of the surface — reset, the interval pair, and the fields a two-team
  // board carries that a strip does not (a period breakdown, club colours, two crests).
  await createProject(page, { name: 'House Match Board' });
  await productionFor(page, 'Cup Tie');

  const chip = page.getByTestId('machine-state-chip');
  await page.getByTestId('verb-take').click();

  // FOUR parallel groups, not one. The quiz pilot had a single group, so nothing until now had
  // ever rendered a chip naming several at once — the label is ~65 characters wide.
  await expect(chip).toContainText('clock:');
  await expect(chip).toContainText('play:');
  await expect(chip).toContainText('result:');
  // And it must stay on ONE line inside the header rather than reflowing the panel.
  const chipLines = await chip.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { wrap: cs.whiteSpace, height: Math.round(el.getBoundingClientRect().height) };
  });
  expect(chipLines.wrap).toBe('nowrap');
  expect(chipLines.height).toBeLessThan(30);

  // THE CLOCK, all three verbs. Reset is the one the scorebug test never reached, and it is
  // the one that makes a second half possible without reloading the graphic.
  const start = page.getByTestId('cue-action-clockStart');
  const stop = page.getByTestId('cue-action-clockStop');
  const reset = page.getByTestId('cue-action-clockReset');
  await expect(reset).toBeDisabled();            // armed already: nothing to reset back to
  await start.click();
  await expect(chip).toContainText('Clock running');
  await expect(reset).toBeEnabled();
  await stop.click();
  await expect(chip).toContainText('Clock stopped');
  await reset.click();
  await expect(chip).toContainText('At period start');
  await expect(reset).toBeDisabled();            // back where it started, and the guard says so

  // THE INTERVAL PAIR, which is a different group and must move on its own: holding the clock
  // for an injury is not half time, so these are separate facts and separate buttons.
  const interval = page.getByTestId('cue-action-interval');
  const resume = page.getByTestId('cue-action-resumePlay');
  await expect(resume).toBeDisabled();
  await interval.click();
  await expect(chip).toContainText('Interval');
  await expect(interval).toBeDisabled();
  await resume.click();
  await expect(chip).toContainText('In play');

  // THE FIELDS. A match board carries a period breakdown, two club colours and two crests, and
  // every one of them has to be editable from here — the crest pickers in particular were
  // rendering with no options at all, so a logo could be set from the hosted page and not from
  // the cockpit, which is exactly the divergence the dashboard contract forbids.
  await expect(page.getByTestId('cue-field-f6')).toBeVisible();          // period breakdown
  await expect(page.getByTestId('cue-field-f7')).toHaveAttribute('type', 'color');
  await expect(page.getByTestId('cue-field-f8')).toHaveAttribute('type', 'color');
  for (const logo of ['cue-field-f9', 'cue-field-f10']) {
    const picker = page.getByTestId(logo);
    await expect(picker).toBeVisible();
    await expect(picker).toHaveJSProperty('tagName', 'SELECT');
    // A brand-new board has no crest uploaded yet, so the honest state is an empty picker
    // that SAYS where pictures come from. That sentence is the proof the cockpit now passes
    // the graphic's picture list at all: the hint only renders when a list was supplied and
    // came back empty, so before this it could not appear however many crests existed.
    await expect(picker.locator('xpath=../..')).toContainText('add one in the editor');
  }

  // And the scores are steppers now, so a goal is one press rather than a retype.
  const scoreA = page.getByTestId('cue-field-f1');
  await expect(scoreA).toHaveAttribute('type', 'number');
  await scoreA.fill('2');
  await page.getByTestId('verb-update').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(program.locator('#f1')).toHaveText('2');
});

test('an audience Q&A cue reveals its answer; switching to a plain cue swaps the actions away honestly', async ({ page }) => {
  // A plain lower third in the library first — the leak check needs a second, machine-less
  // graphic in the same production.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Plain Strap');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await createProject(page, { name: 'House Q&A' });
  await productionFor(page, 'Town Hall');

  const actions = page.getByTestId('cue-actions');
  const answer = page.getByTestId('cue-action-answer');
  await expect(answer).toBeVisible();
  await expect(answer).toBeDisabled();

  await page.getByTestId('verb-take').click();
  await expect(answer).toBeEnabled();
  await answer.click();
  // The answer is a real waypoint on the walk — the event advances it, and once it has been
  // given there is no arrow to fire it again.
  await expect(answer).toBeDisabled();

  // Add the plain lower third to the SAME production and select its cue: the actions block
  // must disappear (no explicit machine — no fake controls), and come back when the Q&A cue
  // is selected again. Nothing leaks between cues.
  await page.getByTestId('add-graphic-pick').selectOption({ label: 'Plain Strap' });
  await page.getByTestId('add-graphic').click();
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(rows).toHaveCount(2);
  await rows.nth(1).locator('.pd-cue-label').click();
  await expect(actions).toBeHidden();
  await rows.nth(0).locator('.pd-cue-label').click();
  await expect(actions).toBeVisible();
  await expect(page.getByTestId('cue-action-answer')).toBeVisible();
});

test('± LIVE NUMBERS bumps a figure on air without publishing other staged edits', async ({ page }) => {
  // The podium board is the block's reason to exist: game-show points change on every
  // question, and stepper-then-✎-Update was two presses under pressure. The block itself is
  // generic — any graphic with a `number` field gets it — so this walk is also the podium
  // type's playout proof: per-contestant scores, the spotlight machine beside them.
  await createProject(page, { name: 'House Podiums' });
  await productionFor(page, 'Game Night');

  // Off air: the block renders (the template has number fields), every button waits for Take.
  const block = page.getByTestId('live-numbers');
  await expect(block).toBeVisible();
  const up = page.getByTestId('live-number-f2-up');
  await expect(up).toBeDisabled();
  // The spotlight index is an ⚡ payload field, so it gets NO bump pair — it is set by its own
  // action, and a second road to it would air a value without the state that gives it meaning.
  await expect(page.getByTestId('live-number-f9-up')).toHaveCount(0);

  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(program.locator('#f2')).toHaveText('0');

  // Stage an edit that must NOT ride the bump: a half-typed name stays staged.
  await page.getByTestId('cue-field-f1').fill('ZO');

  await expect(up).toBeEnabled();
  await up.click();
  await up.click();

  // The bump aired — just that field. The staged name did not.
  await expect(program.locator('#f2')).toHaveText('2');
  await expect(program.locator('#f1')).toHaveText('MAYA');
  // …and the cue kept the new value, so the next ⟳ Take or ✎ Update cannot regress the score.
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('2');

  // ✎ Update still publishes the whole cue — the staged name goes to air the normal way.
  await page.getByTestId('verb-update').click();
  await expect(program.locator('#f1')).toHaveText('ZO');
  await expect(program.locator('#f2')).toHaveText('2');

  // The podium machine drives beside it: spotlight podium 2, judged by the structural guard.
  await page.getByTestId('cue-field-f9').fill('2');
  await page.getByTestId('cue-action-spotlight').click();
  await expect(page.getByTestId('machine-state-chip')).toContainText('spotlit', { ignoreCase: true });
  await expect(program.locator('.scoreboard-podium-2')).toHaveClass(/scoreboard-podium-spot/);
  // A cleared name collapses its podium — contestant count is content, not a state.
  await page.getByTestId('cue-field-f7').fill('');
  await page.getByTestId('verb-update').click();
  await expect(program.locator('.scoreboard-podium-4')).toHaveClass(/scoreboard-podium-empty/);
});
