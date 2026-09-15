// guards: src/control/combine.ts
//
// Unit tests for COMBINE's runtime (src/control/combine.ts, docs/CONTROL_PANEL_ANY_GRAPHIC.md
// §6b and §6d; AC-6 of docs/work-specs/control-panel-any-graphic).
//
// These run in the BUILD GATE rather than in Playwright because there is no browser in the
// question: a combined control and a snapshot of the wire go in, an order and a set of waits come
// out. The module imports nothing at runtime, which is what makes one `transpileModule` call
// enough (the `control-profile.test.mjs` and `production-data.test.mjs` pattern) - and is the
// reason `combine.ts` must stay dependency-free. It states that in its own header; this file is
// what would break if somebody made it import `controlModel.ts` for a payload.
//
// WHY THE TIMER IS TESTED HERE AT ALL. The delay is the one part of the profile that runs on a
// clock, and every honest question about it - does the tail still go if a timer wakes late, does
// a cancel really stop it, does an unticked step still spend its wait - is a question about
// ORDER, which a real three-second Playwright wait answers slowly and flakily. The clock is
// injected and the test drives it by hand, so the whole sequence resolves in microseconds and the
// assertions are exact rather than "within a tolerance".
//
// WHAT THE ASSERTIONS ARE GUARDING, in one line each:
//   - `after` ACCUMULATES. Read as an offset from the press instead, a nine-step list that should
//     run itself over 36 seconds fires all nine at once.
//   - A step is resolved when it FIRES. The fire callback is what reads the wire, so a delayed
//     `+1` counts from what the audience is looking at (§6b).
//   - An unticked `ask` step still spends its wait, so a skipped nominee does not pull the rest
//     of the sequence out of time.
//   - The FIRST step decides the greying. Judging every step would grey a walk's button for the
//     whole show, because a walk's later steps are illegal until the earlier ones have run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/control/combine.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
const { askSteps, combineBlocked, CombineScheduler, planCombine, stepBlocked, stepWords } = mod;

// ── The proof case, as the production page composes it (plan §6c, first row) ─────────────────

/** "Reveal performer, then after 3 s the five +1s, each offered as a tick." */
function proofCase() {
  return {
    id: 'c1',
    name: 'Reveal + points',
    steps: [
      { kind: 'event', graphic: 'Votes board', control: 'reveal' },
      { kind: 'event', graphic: 'Totals board', control: 'plus1', after: 3, ask: { default: false } },
      { kind: 'event', graphic: 'Totals board', control: 'plus2', ask: { default: false } },
      { kind: 'event', graphic: 'Totals board', control: 'plus3', ask: { default: false } },
      { kind: 'event', graphic: 'Totals board', control: 'plus4', ask: { default: false } },
      { kind: 'event', graphic: 'Totals board', control: 'plus5', ask: { default: false } },
    ],
  };
}

/** Both boards on air, every control legal — the state the operator's minute starts in. */
function bothLive() {
  return {
    graphics: new Map([
      ['Votes board', { live: true, legal: new Map([['reveal', true]]) }],
      [
        'Totals board',
        {
          live: true,
          legal: new Map([1, 2, 3, 4, 5].map((n) => [`plus${n}`, true])),
        },
      ],
    ]),
    cues: new Map([
      ['cue-votes', 'Votes board'],
      ['cue-totals', 'Totals board'],
    ]),
  };
}

/** A clock the test drives by hand. `advance` runs every timer that comes due on the way, in
 *  order, moving `now` to each one's own due time first - so a callback that arms another timer
 *  sees the clock it would really see. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  return {
    clock: {
      now: () => now,
      setTimer: (fn, ms) => {
        const id = next++;
        timers.set(id, { fn, at: now + ms });
        return id;
      },
      clearTimer: (id) => timers.delete(id),
    },
    armed: () => timers.size,
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
  };
}

// ── The plan ─────────────────────────────────────────────────────────────────────────────────

test('the proof case sends the reveal now and the ticked +1s three seconds later', () => {
  const groups = planCombine(proofCase(), new Set([1, 3]));
  assert.deepEqual(
    groups.map((g) => [g.at, g.steps.map((s) => s.index)]),
    [
      [0, [0]],
      [3000, [1, 3]],
    ],
  );
  // The reveal carries no `ask`, so it is in the plan whatever the ticks say.
  assert.equal(groups[0].steps[0].step.control, 'reveal');
});

test('an unticked ask step still spends its wait', () => {
  // THE TRAP THIS PINS. Skipping an unticked step BEFORE accumulating its `after` would pull
  // everything behind it earlier: un-tick the nominee who did not turn up and the remaining
  // reveals land a beat early, out of time with the music that was cut to them. The offset is a
  // property of the POSITION; the tick decides what goes, never when.
  const control = {
    id: 'c2',
    name: 'Reveal the nominees',
    steps: [
      { kind: 'event', graphic: 'Board', control: 'row1', after: 2, ask: { default: true } },
      { kind: 'event', graphic: 'Board', control: 'row2', after: 2, ask: { default: true } },
      { kind: 'event', graphic: 'Board', control: 'row3', after: 2, ask: { default: true } },
    ],
  };
  // The middle nominee is skipped; the third still fires at six seconds, not at four.
  assert.deepEqual(
    planCombine(control, new Set([0, 2])).map((g) => [g.at, g.steps.map((s) => s.index)]),
    [
      [2000, [0]],
      [6000, [2]],
    ],
  );
});

test('after accumulates, so a nine-step list runs itself rather than firing at once', () => {
  // The late-night top ten of §6c: » Next nine times, one every four seconds. Read as an offset
  // from the PRESS, every one of these would land at 4000.
  const control = {
    id: 'c3',
    name: 'Run the list',
    steps: Array.from({ length: 9 }, () => ({ kind: 'verb', verb: 'next', cue: 'cue-list', after: 4 })),
  };
  const groups = planCombine(control, new Set());
  assert.equal(groups.length, 9);
  assert.deepEqual(
    groups.map((g) => g.at),
    [4000, 8000, 12000, 16000, 20000, 24000, 28000, 32000, 36000],
  );
});

test('a hand-edited negative wait cannot run the sequence backwards', () => {
  // The validator refuses a negative `after`, so this can only arrive as a damaged record - and
  // the answer is to clamp rather than to re-order, because the step list's order IS the meaning.
  const control = {
    id: 'c4',
    name: 'Damaged',
    steps: [
      { kind: 'verb', verb: 'take', cue: 'cue-votes', after: 2 },
      { kind: 'verb', verb: 'next', cue: 'cue-votes', after: -5 },
    ],
  };
  assert.deepEqual(
    planCombine(control, new Set()).map((g) => g.at),
    [2000],
  );
});

test('the tick list is the ask steps with their declared defaults', () => {
  const asks = askSteps(proofCase());
  assert.deepEqual(
    asks.map((a) => [a.index, a.on]),
    [
      [1, false],
      [2, false],
      [3, false],
      [4, false],
      [5, false],
    ],
  );
  // A control with no `ask` offers no ticks, which is most of them.
  assert.deepEqual(askSteps({ id: 'c5', name: 'Wrap', steps: [{ kind: 'verb', verb: 'out', cue: 'cue-votes' }] }), []);
});

// ── Legality ─────────────────────────────────────────────────────────────────────────────────

test('a step whose graphic is off air says so, and names the graphic', () => {
  const now = bothLive();
  now.graphics.get('Totals board').live = false;
  const step = { kind: 'event', graphic: 'Totals board', control: 'plus1' };
  assert.equal(stepBlocked(step, now), '“Totals board” is not on air');
  // The reveal on the OTHER board is unaffected - a step is judged against its own graphic, which
  // is the whole reason every step names one.
  assert.equal(stepBlocked({ kind: 'event', graphic: 'Votes board', control: 'reveal' }, now), null);
});

test('undeclared and illegal are two different sentences', () => {
  const now = bothLive();
  now.graphics.get('Votes board').legal.set('reveal', false);
  assert.equal(
    stepBlocked({ kind: 'event', graphic: 'Votes board', control: 'reveal' }, now),
    '“reveal” has no arrow out of “Votes board”’s current state',
  );
  assert.equal(
    stepBlocked({ kind: 'event', graphic: 'Votes board', control: 'clear' }, now),
    '“Votes board” declares no control called “clear”',
  );
  assert.equal(
    stepBlocked({ kind: 'event', graphic: 'Gone', control: 'reveal' }, now),
    '“Gone” is not in this production',
  );
});

test('Take is the one verb legal on a graphic that is not up yet', () => {
  const now = bothLive();
  now.graphics.get('Votes board').live = false;
  assert.equal(stepBlocked({ kind: 'verb', verb: 'take', cue: 'cue-votes' }, now), null);
  assert.equal(stepBlocked({ kind: 'verb', verb: 'next', cue: 'cue-votes' }, now), '“Votes board” is not on air');
  assert.equal(stepBlocked({ kind: 'verb', verb: 'out', cue: 'gone' }, now), 'that cue is no longer in this production');
});

test('the FIRST step decides the greying, not the ones after it', () => {
  const now = bothLive();
  // The totals board is off air, which the +1 steps depend on - and they are all in the future.
  now.graphics.get('Totals board').live = false;
  assert.equal(combineBlocked(proofCase(), now), null);
  // Grey it by the step that is actually about to go.
  now.graphics.get('Votes board').live = false;
  assert.equal(combineBlocked(proofCase(), now), '“Votes board” is not on air');
  assert.equal(combineBlocked({ id: 'c6', name: 'Empty', steps: [] }, now), 'this control has no steps yet');
});

// ── The scheduler ────────────────────────────────────────────────────────────────────────────

test('the press sends the first group at once and the tail when its wait runs out', () => {
  const { clock, advance } = fakeClock();
  const scheduler = new CombineScheduler({ clock });
  const fired = [];

  scheduler.press('c1', planCombine(proofCase(), new Set([1, 2])), (g) => fired.push(g.at));
  // Synchronous: the reveal is on the wire before `press` returns, exactly as a ⚡ press is.
  assert.deepEqual(fired, [0]);
  assert.deepEqual(scheduler.armed(), ['c1']);
  assert.deepEqual(scheduler.waiting('c1'), { left: 3000, steps: 2 });

  advance(1000);
  assert.deepEqual(fired, [0]);
  assert.deepEqual(scheduler.waiting('c1'), { left: 2000, steps: 2 });

  advance(2000);
  assert.deepEqual(fired, [0, 3000]);
  // The run is over, so nothing is armed and the button goes back to being a button.
  assert.deepEqual(scheduler.armed(), []);
  assert.equal(scheduler.waiting('c1'), null);
});

test('a step is resolved when it FIRES, which is what makes a delayed +1 count from air', () => {
  // The design's one non-obvious rule (§6b). The scheduler never computes a payload; it calls
  // back at the moment the group goes, and the caller reads the wire THEN. Proved by moving the
  // world between the press and the fire and watching the callback see the later one.
  const { clock, advance } = fakeClock();
  const scheduler = new CombineScheduler({ clock });
  let scoreOnAir = 4;
  const read = [];

  scheduler.press('c1', planCombine(proofCase(), new Set([1])), () => read.push(scoreOnAir));
  assert.deepEqual(read, [4]);
  scoreOnAir = 7; // somebody else bumped it, or an earlier step did
  advance(3000);
  assert.deepEqual(read, [4, 7]);
});

test('a cancel drops the unsent tail and nothing arrives afterwards', () => {
  const { clock, advance, armed } = fakeClock();
  const scheduler = new CombineScheduler({ clock });
  const fired = [];

  scheduler.press('c1', planCombine(proofCase(), new Set([1, 2, 3])), (g) => fired.push(g.at));
  assert.deepEqual(fired, [0]);
  assert.equal(scheduler.cancel('c1'), 3); // three +1s never went
  assert.equal(armed(), 0); // and the timer itself is off, not merely ignored
  advance(10_000);
  assert.deepEqual(fired, [0]);
  // Cancelling again drops nothing, which is what lets a surface stay quiet rather than announce
  // a cancel that cancelled nothing.
  assert.equal(scheduler.cancel('c1'), 0);
});

test('Out cancels every armed control at once, and says what each one lost', () => {
  const { clock, advance } = fakeClock();
  const scheduler = new CombineScheduler({ clock });
  const fired = [];

  scheduler.press('c1', planCombine(proofCase(), new Set([1, 2])), (g) => fired.push(`c1@${g.at}`));
  scheduler.press('c2', [{ at: 5000, steps: [{ index: 0, step: {} }] }], (g) => fired.push(`c2@${g.at}`));
  assert.deepEqual(scheduler.cancelAll(), [
    { controlId: 'c1', steps: 2 },
    { controlId: 'c2', steps: 1 },
  ]);
  advance(10_000);
  assert.deepEqual(fired, ['c1@0']);
  assert.deepEqual(scheduler.cancelAll(), []);
});

test('a timer that wakes late still fires every group it slept through, in order', () => {
  // A background tab, a garbage collection, a laptop lid. One wake-up is not one group: the run
  // reads the CLOCK and drains everything due, or a list pacing itself every four seconds would
  // silently drop entries whenever the browser throttled the tab.
  const { clock, advance } = fakeClock();
  const scheduler = new CombineScheduler({ clock });
  const fired = [];
  const control = {
    id: 'c3',
    name: 'Run the list',
    steps: Array.from({ length: 4 }, () => ({ kind: 'verb', verb: 'next', cue: 'cue-list', after: 1 })),
  };

  scheduler.press('c3', planCombine(control, new Set()), (g) => fired.push(g.at));
  advance(3_500);
  assert.deepEqual(fired, [1000, 2000, 3000]);
  advance(1_000);
  assert.deepEqual(fired, [1000, 2000, 3000, 4000]);
  assert.deepEqual(scheduler.armed(), []);
});

test('a second press replaces the run rather than stacking a second one', () => {
  const { clock, advance } = fakeClock();
  const scheduler = new CombineScheduler({ clock });
  const fired = [];

  scheduler.press('c1', planCombine(proofCase(), new Set([1])), () => fired.push('first'));
  scheduler.press('c1', planCombine(proofCase(), new Set([1])), () => fired.push('second'));
  advance(5_000);
  // Two immediate groups (one per press) and ONE tail, from the run that is still standing.
  assert.deepEqual(fired, ['first', 'second', 'second']);
});

test('dispose leaves no timer behind', () => {
  const { clock, advance, armed } = fakeClock();
  const scheduler = new CombineScheduler({ clock });
  const fired = [];
  scheduler.press('c1', planCombine(proofCase(), new Set([1])), () => fired.push('go'));
  scheduler.dispose();
  assert.equal(armed(), 0);
  advance(10_000);
  assert.deepEqual(fired, ['go']);
});

test('onChange fires when a run arms, advances and ends, so a countdown repaints', () => {
  const { clock, advance } = fakeClock();
  let changes = 0;
  const scheduler = new CombineScheduler({ clock, onChange: () => (changes += 1) });
  scheduler.press('c1', planCombine(proofCase(), new Set([1])), () => {});
  assert.equal(changes, 1); // armed
  advance(3_000);
  assert.equal(changes, 2); // and done
});

// ── Words ────────────────────────────────────────────────────────────────────────────────────

test('a step reads as a sentence, with its marks at the end', () => {
  const names = {
    control: (graphic, control) => (control === 'reveal' ? 'Reveal performer' : `+1 ${graphic}`),
    cue: (id) => (id === 'cue-votes' ? 'Song 3 votes' : id),
  };
  const control = proofCase();
  assert.equal(stepWords(control.steps[0], names), 'Reveal performer on Votes board');
  assert.equal(stepWords(control.steps[1], names), '+1 Totals board on Totals board (after 3 s, if ticked)');
  assert.equal(stepWords({ kind: 'verb', verb: 'out', cue: 'cue-votes' }, names), 'Out “Song 3 votes”');
  assert.equal(
    stepWords({ kind: 'patch', graphic: 'Totals board', values: { f1: 'a', f2: 'b' } }, names),
    '2 fields on Totals board',
  );
  assert.equal(
    stepWords({ kind: 'patch', graphic: 'Totals board', values: { f1: 'a' } }, names),
    '1 field on Totals board',
  );
});
