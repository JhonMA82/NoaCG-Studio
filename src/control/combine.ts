// COMBINE — one press, several rows, some of them later (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b,
// AC-6 of docs/work-specs/control-panel-any-graphic). The format is `src/model/profile.ts`; this
// is the RUNTIME that turns one of its combined controls into rows on the wire.
//
// WHAT IT OWNS, and the list is deliberately short: WHICH steps a press sends (the `ask` ticks),
// WHEN each one goes (the `after` marks, accumulated), WHETHER the button is pressable at all
// (the first step's legality), and the SURFACE-SIDE TIMER that holds the tail until it fires.
//
// WHAT IT DELIBERATELY DOES NOT OWN. It never builds a payload and never decides what rides: that
// is `controlModel.ts` `eventPayload`, the one rule every surface computes, and a second opinion
// here is how two surfaces come to disagree about what a `+1` means. The caller hands over what
// the wire READS (`CombineNow`) and turns a fired step into rows itself. So this module imports
// nothing at runtime, which is what lets `scripts/combine-control.test.mjs` transpile it alone —
// the same arrangement `model/profile.ts` and `model/productionData.ts` are held to, and for the
// same reason: the fence is only a mechanism if something cheap can run it.
//
// THE LINE, restated because this is where it would be crossed: there is no condition, no
// comparison, no variable, no loop, no wait on something a graphic reports and no wall clock. A
// step's `after` is the SURFACE pacing its own sends and never touches a graphic's own timer,
// which is what keeps it on the right side of the "no second clock" ruling (owner, 2026-08-09,
// docs/PLAYOUT_DASHBOARD.md §8a ruling 2). The armed wait is visible because the button counts it
// down, and a press on the countdown cancels it.
//
// WHAT A DELAYED STEP COSTS, stated so nobody discovers it live: the wait lives in the SURFACE
// that pressed. A page reloading mid-countdown loses the unsent tail, nothing is retried behind
// anyone's back, and the operator presses it again by hand. That is §6d's own accounting and the
// button's hint says it out loud.

import type { CombinedControl, ProfileStep, ProfileVerb } from '../model/profile';

// ── What the wire reads right now ────────────────────────────────────────────────────────────

/** One pool graphic, as a combined control sees it at this moment. */
export interface GraphicNow {
  /** Is it up on its layer? Every step but a `take` acts on a graphic that is already on air,
   *  exactly as ✎ Update and the ⚡ buttons do. */
  live: boolean;
  /** Control id -> does the machine have an arrow out of its CURRENT state for that control.
   *  A control the graphic does not DECLARE is absent from the map, which is a different
   *  sentence from one that is declared and momentarily illegal — and the operator gets both. */
  legal: ReadonlyMap<string, boolean>;
}

/**
 * The production as a press finds it. MAPS rather than objects on purpose: a pool graphic's name
 * and a control id are somebody's typed text, and `record[name]` answers a function for one
 * called `constructor` — the measurement `model/profile.ts` `own()` exists for.
 */
export interface CombineNow {
  /** Pool graphic name -> its state. A graphic no longer in the production is absent. */
  graphics: ReadonlyMap<string, GraphicNow>;
  /** Cue id -> the pool graphic that cue belongs to. A deleted cue is absent. */
  cues: ReadonlyMap<string, string>;
}

/** The operator's word for each lifecycle verb, the transport bar's own spelling. */
export const VERB_WORDS: Record<ProfileVerb, string> = {
  take: 'Take',
  update: 'Update',
  next: 'Next',
  out: 'Out',
};

// ── Legality ─────────────────────────────────────────────────────────────────────────────────

/**
 * Why this step cannot send right now, in the operator's words — or null when it can.
 *
 * Every sentence names the GRAPHIC, because a combined control spans graphics and "not on air"
 * with no subject is the least useful thing a multi-graphic control could say.
 */
export function stepBlocked(step: ProfileStep, now: CombineNow): string | null {
  if (step.kind === 'verb') {
    const graphic = now.cues.get(step.cue);
    if (!graphic) return 'that cue is no longer in this production';
    // TAKE is the one verb that acts on a graphic which is NOT yet up — it is what puts it there.
    if (step.verb === 'take') return null;
    return now.graphics.get(graphic)?.live ? null : `“${graphic}” is not on air`;
  }
  const graphic = now.graphics.get(step.graphic);
  if (!graphic) return `“${step.graphic}” is not in this production`;
  if (!graphic.live) return `“${step.graphic}” is not on air`;
  if (step.kind === 'patch') {
    return Object.keys(step.values).length > 0 ? null : 'that step carries no field values';
  }
  const legal = graphic.legal.get(step.control);
  // Undeclared and illegal are two different repairs: one is a profile pointing at a control the
  // graphic lost, the other is an operator pressing at the wrong moment in a walk.
  if (legal === undefined) return `“${step.graphic}” declares no control called “${step.control}”`;
  return legal ? null : `“${step.control}” has no arrow out of “${step.graphic}”’s current state`;
}

/**
 * Why the BUTTON is greyed, or null when it is pressable.
 *
 * The rule is §6b's, in one line: a combined control greys when its FIRST step is illegal. Not
 * when any step is — the later ones are judged when they fire, because a walk's second step is
 * routinely illegal at the moment the first is pressed (that is what the walk is for), and a
 * button greyed by a step three seconds in the future would be unpressable for the whole show.
 */
export function combineBlocked(control: CombinedControl, now: CombineNow): string | null {
  const first = control.steps[0];
  if (!first) return 'this control has no steps yet';
  return stepBlocked(first, now);
}

// ── The plan ─────────────────────────────────────────────────────────────────────────────────

/** One step of a control, with where it sits in the control's own list. */
export interface PlannedStep {
  /** The step's index in `control.steps` — what the tick list and the feed point at. */
  index: number;
  step: ProfileStep;
}

/** The steps that go together, and how long after the press they go. */
export interface StepGroup {
  /** Milliseconds after the press. 0 is "with the press", and it is the common case. */
  at: number;
  steps: PlannedStep[];
}

/** One step a press may vary by: an `ask` step, offered as a tick with its declared default. */
export interface AskStep extends PlannedStep {
  /** Whether the tick starts on. */
  on: boolean;
}

/** The tick list a press offers. Empty for a control with no `ask` step, which is most of them. */
export function askSteps(control: CombinedControl): AskStep[] {
  return control.steps
    .map((step, index) => ({ index, step }))
    .filter((p): p is AskStep => !!p.step.ask)
    .map((p) => ({ ...p, on: p.step.ask!.default }));
}

/**
 * WHAT ONE PRESS SENDS AND WHEN — the pure half, and the whole of the timing vocabulary.
 *
 * `after` ACCUMULATES: a step's wait is measured from when the step before it fired, not from the
 * press. That is the only reading under which §6c's own table works — "five per-row reveals a
 * beat apart, then the envelope" is five steps each marked `after 2 s`, and "one entry every four
 * seconds" is nine » Next steps each marked `after 4 s`. Read as an offset from the press, all
 * nine would fire together at four seconds, which is not a list running itself.
 *
 * A step marked `after 0` (or unmarked) therefore fires WITH the step before it, which is how the
 * proof case is composed: `reveal`, then one `+1` marked `after 3 s` and four more unmarked, and
 * all five land three seconds after the reveal.
 *
 * THE OFFSET IS A PROPERTY OF THE POSITION, not of whether that particular step sends. An `ask`
 * step left unticked still spends its wait, so un-ticking the third of five nominees does not
 * pull the fourth one's reveal a beat earlier and put the whole sequence out of time with the
 * music. The tick decides what goes, never when.
 *
 * `ticked` holds the indices whose tick is ON. A step with no `ask` mark always sends.
 */
export function planCombine(control: CombinedControl, ticked: ReadonlySet<number>): StepGroup[] {
  const groups: StepGroup[] = [];
  let at = 0;
  control.steps.forEach((step, index) => {
    // Seconds in the format, milliseconds on the clock. Negative and fractional waits are already
    // refused by the validator; clamping here means a hand-edited record cannot run time backwards
    // and re-order the sequence.
    at += Math.max(0, Math.round((step.after ?? 0) * 1000));
    if (step.ask && !ticked.has(index)) return;
    // `at` never decreases, so the last group is always the one this step belongs to — and the
    // groups come out in firing order without a sort.
    const last = groups[groups.length - 1];
    if (last && last.at === at) last.steps.push({ index, step });
    else groups.push({ at, steps: [{ index, step }] });
  });
  return groups;
}

// ── The scheduler ────────────────────────────────────────────────────────────────────────────

/** An armed combined control, as the button draws it. */
export interface ArmedWait {
  /** Milliseconds still to run before the next group fires. Never negative. */
  left: number;
  /** How many steps have not been sent yet — what a cancel would drop. */
  steps: number;
}

/** The clock, injectable so a unit test is not a real wait. */
export interface SchedulerClock {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

const REAL_CLOCK: SchedulerClock = {
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface Run {
  /** Groups still unsent, soonest first. */
  groups: StepGroup[];
  pressedAt: number;
  handle: unknown;
  fire: (group: StepGroup) => void;
}

/**
 * THE SURFACE'S OWN TIMERS — one run per armed combined control, every one of them cancellable.
 *
 * It holds no React, no storage and no wire. The page gives it a `fire` callback and the callback
 * is what resolves a group against the wire AT THE MOMENT IT GOES — which is the design's one
 * non-obvious rule: a step is resolved when it FIRES, not when the button was pressed, so a
 * delayed `+1` counts from what the audience is looking at rather than from what was on screen
 * three seconds ago (§6b). Nothing about a group is computed in advance except which steps are in
 * it and when it goes.
 *
 * Deliberately NOT persisted. §6d: the wait lives in the surface that pressed, a reload loses the
 * unsent tail, and the state chip says so. Persisting it would mean a production whose combined
 * controls keep firing out of a tab nobody is looking at.
 */
export class CombineScheduler {
  private readonly runs = new Map<string, Run>();
  private readonly clock: SchedulerClock;
  private readonly onChange: () => void;

  constructor(opts: { clock?: SchedulerClock; onChange?: () => void } = {}) {
    this.clock = opts.clock ?? REAL_CLOCK;
    this.onChange = opts.onChange ?? (() => {});
  }

  /**
   * PRESS. Fires every group that is due now — synchronously, in order, before this returns — and
   * arms a timer for the rest. A second press of a control that is still armed replaces its run
   * rather than stacking a second one: the button is a cancel while it counts down, so this can
   * only be reached by a surface that got ahead of itself, and two runs of one control firing
   * into each other is the worst of the two answers.
   */
  press(controlId: string, groups: StepGroup[], fire: (group: StepGroup) => void): void {
    this.drop(controlId);
    if (groups.length === 0) return;
    this.runs.set(controlId, { groups: groups.slice(), pressedAt: this.clock.now(), handle: null, fire });
    this.advance(controlId);
  }

  /** What the button draws while a control waits, or null when it is not armed. */
  waiting(controlId: string): ArmedWait | null {
    const run = this.runs.get(controlId);
    if (!run) return null;
    const elapsed = this.clock.now() - run.pressedAt;
    return {
      left: Math.max(0, run.groups[0].at - elapsed),
      steps: run.groups.reduce((n, g) => n + g.steps.length, 0),
    };
  }

  /** The controls with a tail still to send. */
  armed(): string[] {
    return [...this.runs.keys()];
  }

  /** Cancel one control's unsent tail. Returns how many steps were dropped — 0 when it was not
   *  armed, which is what lets a caller stay quiet rather than announce a cancel that cancelled
   *  nothing. */
  cancel(controlId: string): number {
    const steps = this.runs.get(controlId)?.groups.reduce((n, g) => n + g.steps.length, 0) ?? 0;
    if (this.drop(controlId)) this.onChange();
    return steps;
  }

  /** Cancel EVERY armed control — what an operator's Out means (§6b: "any Out ... cancels what
   *  has not been sent"). Returns what it dropped, so the activity feed can name each one. */
  cancelAll(): { controlId: string; steps: number }[] {
    const dropped = [...this.runs.entries()].map(([controlId, run]) => ({
      controlId,
      steps: run.groups.reduce((n, g) => n + g.steps.length, 0),
    }));
    for (const { controlId } of dropped) this.drop(controlId);
    if (dropped.length > 0) this.onChange();
    return dropped;
  }

  /** Every timer off, no callbacks. The page calls this when it unmounts. */
  dispose(): void {
    for (const controlId of [...this.runs.keys()]) this.drop(controlId);
  }

  /** Fire everything due, then arm the next. One place decides both, so a group can never be
   *  skipped by a timer that woke late: the loop reads the CLOCK rather than trusting that one
   *  wake-up equals one group. */
  private advance(controlId: string): void {
    const run = this.runs.get(controlId);
    if (!run) return;
    const elapsed = this.clock.now() - run.pressedAt;
    while (run.groups.length > 0 && run.groups[0].at <= elapsed) run.fire(run.groups.shift()!);
    if (run.groups.length === 0) {
      this.runs.delete(controlId);
      this.onChange();
      return;
    }
    run.handle = this.clock.setTimer(() => this.advance(controlId), run.groups[0].at - elapsed);
    this.onChange();
  }

  /** Forget a run and its timer. Returns whether there was one, so the callers above can tell a
   *  real cancel from a no-op without asking twice. */
  private drop(controlId: string): boolean {
    const run = this.runs.get(controlId);
    if (!run) return false;
    if (run.handle !== null) this.clock.clearTimer(run.handle);
    this.runs.delete(controlId);
    return true;
  }
}

// ── Words ────────────────────────────────────────────────────────────────────────────────────

/** How a surface spells the things a step points at. Passed in because the arranged LABEL of a
 *  control is the production's own word for it (ARRANGE), and a cue's label is what the operator
 *  typed — neither is knowable from the step. */
export interface StepNames {
  /** The word the panel shows for one control of one graphic. */
  control(graphic: string, control: string): string;
  /** A cue's own label. */
  cue(id: string): string;
}

/**
 * One step in a sentence, for the button's hover and for the activity feed. The marks ride at the
 * end because they are when and whether, and the step is what.
 *
 * `marks: false` drops them, which is what a TICK's own label wants: the tick already says "if
 * ticked" by being a tick, and its wait belongs to the sequence rather than to the choice.
 */
export function stepWords(step: ProfileStep, names: StepNames, opts: { marks?: boolean } = {}): string {
  const marks: string[] = [];
  if (opts.marks !== false && step.after) marks.push(`after ${step.after} s`);
  if (opts.marks !== false && step.ask) marks.push('if ticked');
  const tail = marks.length > 0 ? ` (${marks.join(', ')})` : '';
  if (step.kind === 'event') return `${names.control(step.graphic, step.control)} on ${step.graphic}${tail}`;
  if (step.kind === 'verb') return `${VERB_WORDS[step.verb]} “${names.cue(step.cue)}”${tail}`;
  const n = Object.keys(step.values).length;
  return `${n === 1 ? '1 field' : `${n} fields`} on ${step.graphic}${tail}`;
}
