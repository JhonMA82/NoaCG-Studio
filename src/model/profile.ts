// THE PRODUCTION CONTROL PROFILE — how ONE production arranges and combines the controls its
// graphics already declare (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6; the shape was reserved in
// docs/CONTROL_PANEL_ROAD.md §3 on 2026-08-28 and confirmed by the owner on 2026-09-03).
//
// THE LINE THIS FILE HOLDS. A profile may arrange, hide, rename, section, pin and COMBINE
// controls the graphics already expose. It may NEVER invent an event, carry a condition, a
// comparison, a variable, a loop, a wait on something a graphic reports, or a wall clock. That
// refusal is not a paragraph somewhere — `validateShowProfile` below refuses any step key it does
// not know by name, which is what makes "no conditions" a mechanism rather than a hope. A show
// that needs one of those has found a BEHAVIOUR, and behaviours belong in a graphic's own
// contract, where the machine guards them.
//
// THE DIVISION OF LABOUR, in one line: inside one graphic, sequence and timing belong to the
// machine (its arrows, its timer arrows, its default path); across graphics and per production,
// they belong here. A profile never reaches into a machine, and a machine never learns a profile
// exists.
//
// WHY IT LIVES ON THE SHOW rather than on the template: a library graphic is shared by many
// productions, and one show's taste must not churn a shared document or ride into its exports.
// `Show.bindings` set that precedent and this follows it exactly — production-scoped taste over
// graphic-owned contract, pinned onto `control_shows` at publish (migration 0058), and older
// builds read past it.
//
// TWO READERS OF THE SAME BYTES, with opposite jobs, and the split is deliberate:
//
//   `readShowProfile`  DEGRADES. It drops what it cannot use and never throws, because a
//                      production mid-programme must render what it can rather than stop.
//   `validateShowProfile` REFUSES. It reads the RAW value and reports every problem, because an
//                      authoring surface must not let a broken profile be saved in the first
//                      place. It cannot be built on the parse: the parse has already dropped the
//                      unknown key it would have to report.
//
// THIS MODULE IMPORTS NOTHING AT RUNTIME, and must stay that way. `scripts/control-profile.test.mjs`
// transpiles this one file with a single `ts.transpileModule` call (the `productionData.ts`
// pattern), so a runtime import would leave the format with no unit tests at all. Everything the
// validator needs to know about a production arrives as an argument (`ProfilePool`).

/**
 * The profile's OWN format stamp, beside `Show.version` rather than inside it. `Show.profile` is
 * an additive-optional field, and an additive optional field never bumps the record's version
 * (root `AGENTS.md` rule 6) — so the profile carries its own, and a later breaking change to the
 * profile's shape migrates HERE without touching every show that has no profile at all.
 */
export const PROFILE_VERSION = 1;

// ── ARRANGE ──────────────────────────────────────────────────────────────────────────────────

/**
 * How one production presents ONE declared control. Presentation over declared capability, and
 * nothing else: a HIDDEN control's event is still guarded by the machine, and a RENAMED one still
 * greys by the same table. Delete the profile and the generated panel is what remains.
 *
 * Every field is optional and an absent field means "as the graphic declared it", so an entry
 * that says nothing is dropped rather than stored (see `serializeShowProfile`).
 */
export interface ArrangeEntry {
  /** Position in its section. Lower first; controls with no `order` follow in declared order. */
  order?: number;
  /** The section heading this control sits under, overriding the machine's own `section`. */
  section?: string;
  /** The name the OPERATOR reads. Absent = the control's declared label. */
  name?: string;
  /**
   * Out of the panel's flow. Still legal, still guarded — just not in the way.
   *
   * Every surface puts these behind ONE collapsed "More" rather than dropping them, and that is
   * the deliberate reading of "hidden": a production hiding a control is saying "not in my way",
   * which is not the same as saying it is gone. The machine still accepts the event, so an
   * operator who turns out to need it mid-show reaches it in one click instead of going back to
   * the authoring panel — which on the hosted page means going back to a laptop they may not
   * have. `hidden` beats `pinned` where a hand-edited profile carries both.
   */
  hidden?: boolean;
  /** Above the fold, in the handful this show actually uses (the football principle: the
   *  operator should understand football, not the graphics software). */
  pinned?: boolean;
}

/**
 * ARRANGE: pool-graphic name -> control id -> presentation.
 *
 * The control id is the machine button's `event` name (`blocks/animMachine.ts` `ControlButton`),
 * which is the same word an EVENT STEP names below — so both halves of the profile speak one
 * vocabulary, and an operator renaming a control in ARRANGE is naming the same thing a combined
 * control targets.
 */
export type ProfileArrange = Record<string, Record<string, ArrangeEntry>>;

// ── COMBINE ──────────────────────────────────────────────────────────────────────────────────

/** The lifecycle verbs a step may carry — the operator glossary (docs/CONTROL_LAYER.md), and
 *  deliberately not a word more. */
export type ProfileVerb = 'take' | 'update' | 'next' | 'out';

export const PROFILE_VERBS: readonly ProfileVerb[] = ['take', 'update', 'next', 'out'];

/**
 * The two marks ANY step may carry, and the whole of what one press may vary by.
 *
 * `after` is the controller pacing its OWN sends. It never touches a graphic's timer, which is
 * what keeps it on the right side of the "no second clock" ruling (owner, 2026-08-09 —
 * docs/PLAYOUT_DASHBOARD.md §8a): the graphic still sees ordinary rows arriving in order, and the
 * armed wait is visible because the button counts it down and a press cancels it. What it costs,
 * stated here so nobody discovers it live: the wait lives in the surface that pressed, so a
 * surface reloading mid-countdown loses the unsent tail. Nothing is retried behind anyone's back.
 *
 * `ask` is a TICK, never a value. It is the one variation a press admits, and it is a mark any
 * step may carry rather than a parameter of one macro — which is what makes "reveal the nominees,
 * but skip the one who did not turn up" the same gesture as "+1 to whoever was right".
 */
interface StepMarks {
  /** Seconds the surface waits before sending this step. Absent or 0 = send with the rest. */
  after?: number;
  /** Offer this step as a tick beside the button; it sends only when ticked. `default` is
   *  whether that tick starts on. */
  ask?: { default: boolean };
}

/**
 * One operator EVENT on a named pool graphic.
 *
 * The step names the control and carries NO payload, on purpose: the control's own declaration
 * carries the payload rule (`payload` rides a field as it reads, `adjust` moves it, `set` writes
 * the declared figure, `add`/`remove` work a line list), and every surface computes it with the
 * one `eventPayload` in `control/controlModel.ts`. A step that stated a value would be a second
 * opinion about what rides, and two opinions is how a system develops a drift nobody owns.
 *
 * A step is resolved when it FIRES, not when the button was pressed — so a delayed `adjust` reads
 * the figure on the wire at that moment, and a delayed `+1` counts from what the audience is
 * looking at.
 */
export interface EventStep extends StepMarks {
  kind: 'event';
  /** The pool graphic's name — the same routing key the command log, `staged` and `live` use. */
  graphic: string;
  /** The control id, which is the machine button's `event` name. */
  control: string;
}

/** One lifecycle VERB on a cue. */
export interface VerbStep extends StepMarks {
  kind: 'verb';
  verb: ProfileVerb;
  /** The cue id (`ShowCue.id`) this verb acts on. */
  cue: string;
}

/** One data PATCH of stated field values on a named pool graphic — field id -> value, all
 *  strings, the same currency a cue and an ordinary `update` row already carry. */
export interface PatchStep extends StepMarks {
  kind: 'patch';
  graphic: string;
  values: Record<string, string>;
}

export type ProfileStep = EventStep | VerbStep | PatchStep;

/**
 * One control the PRODUCTION made: a name and an ordered list of steps. The order is the meaning,
 * so it is never sorted.
 *
 * Every step becomes one ordinary row in the one command log, attributed to the operator who
 * pressed and guarded by the machine of the graphic it targets. A step the machine drops is
 * dropped ALONE — the rest proceed, and the activity feed says which one did not apply.
 */
export interface CombinedControl {
  id: string;
  /** What the operator reads on the button. */
  name: string;
  steps: ProfileStep[];
}

/** A production's whole profile. Two primitives, and there is deliberately no third. */
export interface ShowProfile {
  v: typeof PROFILE_VERSION;
  arrange: ProfileArrange;
  combine: CombinedControl[];
}

/** A profile that changes nothing — what "+ Controls" starts from. Serializes to the same bytes
 *  every time, so an untouched profile is one shape to read rather than two. */
export function emptyProfile(): ShowProfile {
  return { v: PROFILE_VERSION, arrange: {}, combine: [] };
}

// ── Reading (the degrading half) ─────────────────────────────────────────────────────────────

/**
 * What a stored value turned out to be.
 *
 * `read-only` is the case the root version invariant exists for: a profile a NEWER build wrote.
 * Its bytes are handed back verbatim so that writing the record out again cannot destroy them,
 * and every editing surface must refuse to change it. Dropping it instead would be the quiet
 * data loss the invariant names — an older build opening a show once would erase a profile it
 * simply did not understand.
 */
export type ProfileRead =
  | { status: 'ok'; profile: ShowProfile }
  | { status: 'read-only'; version: number; raw: unknown }
  | { status: 'none' };

/**
 * THE MIGRATE-ON-READ GUARD. Never throws, whatever it is handed — a renderer on air must not be
 * stopped by a malformed profile, and `readLiveCue` in `control/hostedControl.ts` degrades the
 * same way for the same reason.
 *
 * It DROPS rather than refuses: an unknown key, a wrongly typed field, a step missing its target
 * all disappear, and what is left renders. `validateShowProfile` is the half that reports them,
 * and an authoring surface runs that one before it saves.
 */
export function readShowProfile(value: unknown): ProfileRead {
  if (!isObject(value)) return { status: 'none' };
  const v = (value as { v?: unknown }).v;
  // No usable version stamp is garbage rather than a future format: there are no bytes here
  // worth preserving, and calling it read-only would make a stray `{}` un-authorable forever.
  if (typeof v !== 'number' || !Number.isFinite(v)) return { status: 'none' };
  // v1 is the FIRST version, so anything that is not 1 was written by a build this one does not
  // know. When v2 arrives its migration step goes here, above this line, and only versions past
  // the newest one this build understands fall through to read-only.
  if (v !== PROFILE_VERSION) return { status: 'read-only', version: v, raw: value };
  const row = value as { arrange?: unknown; combine?: unknown };
  return {
    status: 'ok',
    profile: { v: PROFILE_VERSION, arrange: readArrange(row.arrange), combine: readCombine(row.combine) },
  };
}

function readArrange(value: unknown): ProfileArrange {
  if (!isObject(value)) return {};
  const out: ProfileArrange = {};
  for (const [graphic, controls] of Object.entries(value)) {
    if (!graphic || !isObject(controls)) continue;
    const kept: Record<string, ArrangeEntry> = {};
    for (const [control, raw] of Object.entries(controls)) {
      if (!control || !isObject(raw)) continue;
      const entry = readArrangeEntry(raw);
      // An entry that says nothing is not stored: "as the graphic declared it" is an ABSENCE,
      // so an empty entry and a missing one must not be two ways to mean one thing.
      if (Object.keys(entry).length > 0) put(kept, control, entry);
    }
    if (Object.keys(kept).length > 0) put(out, graphic, kept);
  }
  return out;
}

function readArrangeEntry(raw: Record<string, unknown>): ArrangeEntry {
  const entry: ArrangeEntry = {};
  if (typeof raw.order === 'number' && Number.isFinite(raw.order)) entry.order = raw.order;
  if (typeof raw.section === 'string' && raw.section) entry.section = raw.section;
  if (typeof raw.name === 'string' && raw.name) entry.name = raw.name;
  if (raw.hidden === true) entry.hidden = true;
  if (raw.pinned === true) entry.pinned = true;
  return entry;
}

function readCombine(value: unknown): CombinedControl[] {
  if (!Array.isArray(value)) return [];
  const out: CombinedControl[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!isObject(raw)) continue;
    const { id, name, steps } = raw as { id?: unknown; name?: unknown; steps?: unknown };
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    if (typeof name !== 'string' || !name || !Array.isArray(steps)) continue;
    const kept = steps.map(readStep).filter((s): s is ProfileStep => s !== null);
    // A control that sends nothing is a button that lies about what it does.
    if (kept.length === 0) continue;
    seen.add(id);
    out.push({ id, name, steps: kept });
  }
  return out;
}

function readStep(raw: unknown): ProfileStep | null {
  if (!isObject(raw)) return null;
  const r = raw as Record<string, unknown>;
  const marks = readMarks(r);
  if (r.kind === 'event') {
    if (!isName(r.graphic) || !isName(r.control)) return null;
    return { kind: 'event', graphic: r.graphic, control: r.control, ...marks };
  }
  if (r.kind === 'verb') {
    if (!isVerb(r.verb) || !isName(r.cue)) return null;
    return { kind: 'verb', verb: r.verb, cue: r.cue, ...marks };
  }
  if (r.kind === 'patch') {
    if (!isName(r.graphic) || !isObject(r.values)) return null;
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(r.values)) {
      if (key && typeof value === 'string') put(values, key, value);
    }
    if (Object.keys(values).length === 0) return null;
    return { kind: 'patch', graphic: r.graphic, values, ...marks };
  }
  return null;
}

function readMarks(raw: Record<string, unknown>): StepMarks {
  const marks: StepMarks = {};
  // A zero wait is the same as no wait, and storing it as 0 would make two shapes mean one thing.
  if (typeof raw.after === 'number' && Number.isFinite(raw.after) && raw.after > 0) marks.after = raw.after;
  const ask = raw.ask;
  if (isObject(ask) && typeof (ask as { default?: unknown }).default === 'boolean') {
    marks.ask = { default: (ask as { default: boolean }).default };
  }
  return marks;
}

/**
 * What a PUBLISHED profile column reads back as (`control_shows.profile`, migration 0058).
 *
 * BOTH "no profile" and "a profile this build cannot read" answer null, and that is the honest
 * degradation rather than a shortcut: a surface may render only a profile it fully understands,
 * and falling back to the generated panel is exactly what deleting a profile does — so an operator
 * meeting a profile from a newer build gets a panel that works rather than one that is wrong.
 * `readLiveCue` in `control/hostedControl.ts` degrades the same way for the same reason.
 *
 * It lives HERE rather than beside the publish call because it is a question about the format, and
 * because `hostedControl.ts` is not a leaf module — a test that reached the normalizer through it
 * would drag the whole Supabase and asset graph in behind it.
 */
export function readPublishedProfile(value: unknown): ShowProfile | null {
  const read = readShowProfile(value);
  return read.status === 'ok' ? read.profile : null;
}

// ── Serializing (the canonical half) ─────────────────────────────────────────────────────────

/**
 * THE CANONICAL FORM. Two profiles that mean the same thing produce the same
 * `JSON.stringify(serializeShowProfile(p))`, byte for byte — which is what lets a test compare
 * profiles as text, a sync layer see "unchanged" as unchanged, and a reviewer read a diff that
 * only shows what an operator actually did.
 *
 * CANONICAL IS ORDERED NORMALIZATION, and saying it that way is what keeps it honest. Dropping is
 * `readShowProfile`'s job and happens here by CALLING it — an empty entry, a zero `after`, a
 * `hidden: false`, a control with no steps, the second control to claim an id. This function then
 * only puts what survived into one fixed key order (JavaScript preserves string-key insertion
 * order, so building the object in order is what fixes the bytes) with names sorted.
 *
 * The two used to drop separately, and disagreed: serialize kept a duplicate id that read then
 * removed, so serializing and reading back gave a different profile. Two functions in one module
 * holding their own opinion of what a valid profile is IS that defect, so now there is one.
 *
 * Steps keep their AUTHORED order, because for a combined control the order is the meaning.
 *
 * This is what a save path writes and what `publishControlShow` pins.
 */
export function serializeShowProfile(profile: ShowProfile): ShowProfile {
  const read = readShowProfile(profile);
  // A `ShowProfile` is v1 by its type, so anything else is a caller handing over something it
  // said was a profile and was not. An empty canonical profile is the answer that cannot lie.
  if (read.status !== 'ok') return emptyProfile();
  return {
    v: PROFILE_VERSION,
    arrange: orderArrange(read.profile.arrange),
    combine: read.profile.combine.map(orderControl),
  };
}

function orderArrange(arrange: ProfileArrange): ProfileArrange {
  const out: ProfileArrange = {};
  for (const graphic of Object.keys(arrange).sort()) {
    const controls = arrange[graphic];
    const kept: Record<string, ArrangeEntry> = {};
    for (const control of Object.keys(controls).sort()) put(kept, control, orderEntry(controls[control]));
    put(out, graphic, kept);
  }
  return out;
}

/** The five presentation keys in one order. Reading has already dropped the absent ones. */
function orderEntry(entry: ArrangeEntry): ArrangeEntry {
  const out: ArrangeEntry = {};
  if (entry.order !== undefined) out.order = entry.order;
  if (entry.section !== undefined) out.section = entry.section;
  if (entry.name !== undefined) out.name = entry.name;
  if (entry.hidden !== undefined) out.hidden = entry.hidden;
  if (entry.pinned !== undefined) out.pinned = entry.pinned;
  return out;
}

function orderControl(control: CombinedControl): CombinedControl {
  return { id: control.id, name: control.name, steps: control.steps.map(orderStep) };
}

function orderStep(step: ProfileStep): ProfileStep {
  // `kind` first, then the kind's own fields, then the two marks — one order for every step, so a
  // diff of a reordered list reads as a reorder rather than as a rewrite.
  const marks: StepMarks = {};
  if (step.after !== undefined) marks.after = step.after;
  if (step.ask) marks.ask = { default: step.ask.default };
  if (step.kind === 'event') return { kind: 'event', graphic: step.graphic, control: step.control, ...marks };
  if (step.kind === 'verb') return { kind: 'verb', verb: step.verb, cue: step.cue, ...marks };
  const values: Record<string, string> = {};
  for (const key of Object.keys(step.values).sort()) put(values, key, step.values[key]);
  return { kind: 'patch', graphic: step.graphic, values, ...marks };
}

/**
 * A profile with ONE graphic's arrangement replaced, canonical.
 *
 * The one door an authoring surface needs for ARRANGE, and it lives here rather than in that
 * surface for the reason `own()` and `put()` below exist: a pool graphic's name is somebody's
 * typed text, so the obvious `{ ...profile.arrange, [graphic]: entries }` sets the PROTOTYPE for
 * a production with a graphic called `__proto__` and the entry silently vanishes. One door means
 * one place that knows.
 *
 * An EMPTY map removes the graphic's key entirely rather than storing `{}`. "As the graphic
 * declared it" is an absence everywhere else in this format, and two shapes meaning one thing is
 * what makes a diff lie about what an operator did.
 *
 * It takes `undefined` for "this production has no profile yet", so a surface authoring the first
 * arrangement does not have to mint an empty profile of its own.
 */
export function withGraphicArrange(
  profile: ShowProfile | undefined,
  graphic: string,
  entries: Record<string, ArrangeEntry>,
): ShowProfile {
  const read = readShowProfile(profile);
  const base = read.status === 'ok' ? read.profile : emptyProfile();
  const arrange: ProfileArrange = {};
  for (const [name, existing] of Object.entries(base.arrange)) {
    if (name !== graphic) put(arrange, name, existing);
  }
  if (Object.keys(entries).length > 0) put(arrange, graphic, entries);
  // Canonical on the way out, so the caller cannot store two spellings of one arrangement — and
  // so an entry that says nothing, a `hidden: false`, and a graphic whose every entry was
  // cleared all disappear by the format's own rules rather than by the surface remembering to.
  return serializeShowProfile({ v: PROFILE_VERSION, arrange, combine: base.combine });
}

// ── Validating (the refusing half) ───────────────────────────────────────────────────────────

/**
 * What the production can offer, as the caller already knows it. Passed IN rather than imported,
 * which is what keeps this module dependency-free and its unit test a single transpile.
 */
export interface ProfilePool {
  /** Pool graphic name -> the control ids that graphic DECLARES, i.e.
   *  `machineControls(machine).map((b) => b.event)`. */
  controls: Record<string, string[]>;
  /** The production's cue ids (`ShowCue.id`). OMIT to skip the cue check — a caller that does not
   *  know the cues must not be told that every verb step is broken. */
  cues?: string[];
  /** Pool graphic name -> the field ids that graphic has, for a patch step's targets. OMIT to skip
   *  the check, exactly as `cues` does. Without it a patch naming `f99` validates clean and sends
   *  an update row that moves nothing — the same silent press an event step naming an undeclared
   *  control is an error for. */
  fields?: Record<string, string[]>;
}

export interface ProfileFinding {
  level: 'error' | 'warning';
  /** Where it is, for the authoring surface to point at: `combine[2].steps[0].after`,
   *  `arrange["Totals board"].reveal`. */
  where: string;
  message: string;
}

/** The keys each kind of step OWNS. Everything outside this table plus the two marks is refused
 *  by name, and that refusal is the whole fence: a condition, a comparison, a variable, a loop, a
 *  wait on a report and a wall clock all arrive as a key that is not on this list. */
const STEP_KEYS: Record<ProfileStep['kind'], readonly string[]> = {
  event: ['kind', 'graphic', 'control'],
  verb: ['kind', 'verb', 'cue'],
  patch: ['kind', 'graphic', 'values'],
};

const STEP_MARK_KEYS: readonly string[] = ['after', 'ask'];

const ARRANGE_KEYS: readonly string[] = ['order', 'section', 'name', 'hidden', 'pinned'];

const CONTROL_KEYS: readonly string[] = ['id', 'name', 'steps'];

/**
 * THE STRICT READER. It takes the RAW stored value, never a parsed profile — that is the point:
 * `readShowProfile` has already dropped the unknown key this has to report, so validating the
 * parse could only ever say "fine".
 *
 * An authoring surface runs this BEFORE it saves, and a clean profile is the precondition for
 * every surface that renders one. The asymmetry between the two halves is deliberate and worth
 * knowing: an ARRANGE entry that matches nothing is a WARNING, because it is inert presentation
 * and a renamed graphic must degrade rather than break a production mid-show; a STEP that names
 * nothing is an ERROR, because the operator would press a button that silently sends nothing.
 */
export function validateShowProfile(value: unknown, pool: ProfilePool): ProfileFinding[] {
  const findings: ProfileFinding[] = [];
  const error = (where: string, message: string) => findings.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => findings.push({ level: 'warning', where, message });

  if (!isObject(value)) {
    error('profile', 'This is not a control profile — a profile is an object carrying `v`, `arrange` and `combine`.');
    return findings;
  }
  const row = value as { v?: unknown; arrange?: unknown; combine?: unknown };
  if (typeof row.v !== 'number' || !Number.isFinite(row.v)) {
    error('profile.v', 'The profile carries no version stamp, so nothing can say which shape it is in.');
    return findings;
  }
  if (row.v !== PROFILE_VERSION) {
    // The cause is only knowable in one direction. A HIGHER version was written by a newer build;
    // a lower or fractional one is a corrupted record or a hand edit, and telling that operator to
    // go and find a newer build would point them at the wrong thing entirely.
    const why =
      Number.isInteger(row.v) && row.v > PROFILE_VERSION
        ? 'It was written by a newer build, so it is read-only here and must not be edited.'
        : 'No build ever wrote that version, so the record is damaged. It is read-only here rather than repaired, because a guess about what it meant could destroy it.';
    error('profile.v', `This profile is version ${row.v} and this build understands version ${PROFILE_VERSION}. ${why}`);
    return findings;
  }

  validateArrange(row.arrange, pool, error, warn);
  validateCombine(row.combine, pool, error);
  return findings;
}

type Report = (where: string, message: string) => void;

function validateArrange(value: unknown, pool: ProfilePool, error: Report, warn: Report): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    error('arrange', '`arrange` must be an object of pool-graphic name -> control id -> presentation.');
    return;
  }
  for (const [graphic, controls] of Object.entries(value)) {
    const at = `arrange[${JSON.stringify(graphic)}]`;
    const declared = declaredControls(pool, graphic);
    if (!declared) {
      warn(at, `No graphic named "${graphic}" is in this production. Its arrangement is ignored, and the panel falls back to what the machine generates.`);
    }
    if (!isObject(controls)) {
      error(at, 'Each graphic\'s arrangement must be an object of control id -> presentation.');
      continue;
    }
    for (const [control, entry] of Object.entries(controls)) {
      const here = `${at}.${control}`;
      if (declared && !declared.includes(control)) {
        warn(here, `"${graphic}" declares no control called "${control}". The entry is ignored, and that control keeps whatever the machine gave it.`);
      }
      validateArrangeEntry(entry, here, error);
    }
  }
}

function validateArrangeEntry(value: unknown, at: string, error: Report): void {
  if (!isObject(value)) {
    error(at, 'An arrangement entry must be an object of order, section, name, hidden and pinned.');
    return;
  }
  const entry = value as Record<string, unknown>;
  for (const key of Object.keys(entry)) {
    // The same fence as a step's, for the same reason: a key nobody declared is a capability
    // smuggled past the two primitives.
    if (!ARRANGE_KEYS.includes(key)) {
      error(`${at}.${key}`, `An arrangement carries only order, section, name, hidden and pinned. "${key}" is not one of them.`);
    }
  }
  if (entry.order !== undefined && (typeof entry.order !== 'number' || !Number.isFinite(entry.order))) {
    error(`${at}.order`, '`order` must be a number.');
  }
  if (entry.section !== undefined && typeof entry.section !== 'string') error(`${at}.section`, '`section` must be a name.');
  if (entry.name !== undefined && typeof entry.name !== 'string') error(`${at}.name`, '`name` must be a name.');
  if (entry.hidden !== undefined && typeof entry.hidden !== 'boolean') error(`${at}.hidden`, '`hidden` is on or off.');
  if (entry.pinned !== undefined && typeof entry.pinned !== 'boolean') error(`${at}.pinned`, '`pinned` is on or off.');
}

function validateCombine(value: unknown, pool: ProfilePool, error: Report): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    error('combine', '`combine` must be a list of combined controls.');
    return;
  }
  const seen = new Set<string>();
  value.forEach((raw, index) => {
    const at = `combine[${index}]`;
    if (!isObject(raw)) {
      error(at, 'A combined control must be an object carrying id, name and steps.');
      return;
    }
    const control = raw as Record<string, unknown>;
    for (const key of Object.keys(control)) {
      if (!CONTROL_KEYS.includes(key)) {
        error(`${at}.${key}`, `A combined control carries only id, name and steps. "${key}" is not one of them.`);
      }
    }
    if (typeof control.id !== 'string' || !control.id) {
      error(`${at}.id`, 'A combined control needs an id.');
    } else if (seen.has(control.id)) {
      error(`${at}.id`, `Two combined controls share the id "${control.id}", so nothing can tell them apart.`);
    } else {
      seen.add(control.id);
    }
    if (typeof control.name !== 'string' || !control.name) {
      error(`${at}.name`, 'A combined control needs a name the operator can read on the button.');
    }
    if (!Array.isArray(control.steps)) {
      error(`${at}.steps`, 'A combined control needs a list of steps.');
      return;
    }
    if (control.steps.length === 0) {
      error(`${at}.steps`, 'This control sends nothing. A button that sends nothing lies about what it does.');
      return;
    }
    control.steps.forEach((step, stepIndex) => validateStep(step, `${at}.steps[${stepIndex}]`, pool, error));
  });
}

function validateStep(value: unknown, at: string, pool: ProfilePool, error: Report): void {
  if (!isObject(value)) {
    error(at, 'A step must be an object.');
    return;
  }
  const step = value as Record<string, unknown>;
  const kind = step.kind;
  if (kind !== 'event' && kind !== 'verb' && kind !== 'patch') {
    error(
      `${at}.kind`,
      `A step is exactly one of an operator event on a graphic, a lifecycle verb on a cue, or a data patch — not ${JSON.stringify(kind)}.`,
    );
    return;
  }

  // THE FENCE. Every capability this design refuses by name — a condition, a comparison, a
  // variable, a loop, a wait on something a graphic reports, a wall clock, a profile calling
  // another profile — arrives as a key that is not on its kind's list. Refusing the key by name
  // is what makes the refusal a mechanism instead of a paragraph.
  const allowed = [...STEP_KEYS[kind], ...STEP_MARK_KEYS];
  for (const key of Object.keys(step)) {
    if (!allowed.includes(key)) {
      error(
        `${at}.${key}`,
        `A step carries only ${STEP_KEYS[kind].join(', ')} plus after and ask. "${key}" is not one of them: a profile has no place for a condition, a variable, a loop, a wait or a clock — a show that needs one of those has found a behaviour, and a behaviour belongs in the graphic's own contract.`,
      );
    }
  }

  validateMarks(step, at, error);

  if (kind === 'event') {
    if (!isName(step.graphic)) {
      error(`${at}.graphic`, 'An event step must name the graphic it fires on.');
      return;
    }
    if (!isName(step.control)) {
      error(`${at}.control`, 'An event step must name the control it fires.');
      return;
    }
    const declared = declaredControls(pool, step.graphic);
    if (!declared) {
      error(`${at}.graphic`, `No graphic named "${step.graphic}" is in this production, so this step would send nothing.`);
      return;
    }
    if (!declared.includes(step.control)) {
      error(
        `${at}.control`,
        `"${step.graphic}" declares no control called "${step.control}". A profile may only combine what a graphic already exposes; it can never invent an event.`,
      );
    }
    return;
  }

  if (kind === 'verb') {
    if (!isVerb(step.verb)) {
      error(`${at}.verb`, `A lifecycle verb is one of ${PROFILE_VERBS.join(', ')} — not ${JSON.stringify(step.verb)}.`);
    }
    if (!isName(step.cue)) {
      error(`${at}.cue`, 'A verb step must name the cue it acts on.');
      return;
    }
    // Skipped entirely when the caller did not say what cues exist — being told every verb step
    // is broken because nobody passed a cue list is worse than not checking.
    if (pool.cues && !pool.cues.includes(step.cue)) {
      error(`${at}.cue`, `This production has no cue "${step.cue}", so this step would send nothing.`);
    }
    return;
  }

  if (!isName(step.graphic)) {
    error(`${at}.graphic`, 'A patch step must name the graphic it writes to.');
    return;
  }
  if (!declaredControls(pool, step.graphic)) {
    error(`${at}.graphic`, `No graphic named "${step.graphic}" is in this production, so this step would send nothing.`);
  }
  if (!isObject(step.values)) {
    error(`${at}.values`, 'A patch step must state the field values it writes.');
    return;
  }
  const values = Object.entries(step.values as Record<string, unknown>);
  if (values.length === 0) {
    error(`${at}.values`, 'This patch writes nothing.');
  }
  const has = own(pool.fields, step.graphic);
  const declared = Array.isArray(has) ? has : null;
  for (const [key, value] of values) {
    if (typeof value !== 'string') {
      error(`${at}.values.${key}`, 'A field value is text — the same currency a cue and an update row carry.');
    }
    if (declared && !declared.includes(key)) {
      error(`${at}.values.${key}`, `"${step.graphic}" has no field called "${key}", so writing it would move nothing.`);
    }
  }
}

function validateMarks(step: Record<string, unknown>, at: string, error: Report): void {
  if (step.after !== undefined) {
    if (typeof step.after !== 'number' || !Number.isFinite(step.after)) {
      error(`${at}.after`, '`after` is a number of seconds.');
    } else if (step.after < 0) {
      error(`${at}.after`, 'A step cannot be sent before the press that sends it — `after` counts seconds forward.');
    }
  }
  if (step.ask !== undefined) {
    if (!isObject(step.ask)) {
      error(`${at}.ask`, '`ask` states the tick\'s default, as `{ "default": true }`.');
      return;
    }
    const ask = step.ask as Record<string, unknown>;
    for (const key of Object.keys(ask)) {
      if (key !== 'default') {
        error(`${at}.ask.${key}`, `\`ask\` carries only its default. "${key}" is not one of them: an ask is a tick, never a value.`);
      }
    }
    if (typeof ask.default !== 'boolean') {
      error(`${at}.ask.default`, 'The tick starts either on or off.');
    }
  }
}

// ── The small shared guards ──────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a key a USER named, without inheriting `Object.prototype`'s members.
 *
 * Every key in this format is somebody's typed name - a graphic, a control id, a field id - so a
 * plain `map[name]` answers a FUNCTION for a graphic called `constructor` or `toString`. Measured:
 * that made `validateShowProfile` throw instead of reporting findings, so an authoring surface
 * crashed rather than refusing; and the quieter half let a patch step naming `toString` validate
 * clean, which is the button that greens and then sends nothing on air.
 */
function own<T>(map: Record<string, T> | undefined, key: string): T | undefined {
  if (!map || !Object.prototype.hasOwnProperty.call(map, key)) return undefined;
  return map[key];
}

/** Add a key to a map being built, without `__proto__` setting the prototype instead of a key -
 *  the write-side twin of `own`, and the reason a graphic named `__proto__` cannot vanish. */
function put<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, { value, enumerable: true, writable: true, configurable: true });
}

/** The control ids a pool graphic declares, or undefined when the production has no such
 *  graphic - which is a WARNING for an arrangement and an ERROR for a step. */
function declaredControls(pool: ProfilePool, graphic: string): string[] | undefined {
  const declared = own(pool.controls, graphic);
  return Array.isArray(declared) ? declared : undefined;
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isVerb(value: unknown): value is ProfileVerb {
  return typeof value === 'string' && (PROFILE_VERBS as readonly string[]).includes(value);
}
