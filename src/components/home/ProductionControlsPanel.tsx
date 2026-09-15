// THE CONTROLS PANEL — where a production authors the ARRANGE half of its control profile
// (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b and §6e; the format is src/model/profile.ts).
//
// WHAT IT IS FOR, in the owner's words: the operator should understand the show, not the
// software. A graphic may declare twelve controls and a production may press four of them; this
// is where the four come to the top, the eight go behind a drawer, and "plus_katri" becomes
// "Katri +1". Nothing here changes what a press DOES — the declaration decides that, the machine
// still guards it, and deleting the profile leaves the generated panel exactly as it was.
//
// WHAT IT DELIBERATELY DOES NOT AUTHOR:
//
//   - FIELD BANDS. The cue editor's grouping is DERIVED from the field titles and stays that way
//     (docs/PLAYOUT_DASHBOARD.md §2e, owner 2026-08-21: "we have no idea what kinds of graphics
//     we will have in the future"). ARRANGE has no vocabulary for a field and must not grow one.
//   - SECTIONS. The section is the AUTHOR's own metadata and travels inside the graphic. The
//     format lets a profile override it, but this panel does not offer the text box: drag order
//     already moves a control past a heading, which is the gesture an operator actually reaches
//     for, and a production renaming another author's sections is how two vocabularies start.
//   - A PATCH STEP'S VALUES. COMBINE's third step kind writes stated field values, and composing
//     one here would mean a text box taking a VALUE. §6e allows this panel exactly two kinds of
//     text box, a name and a number of seconds, and that limit is most of what keeps the authoring
//     surface from growing into an editor for arbitrary payloads. The format still carries patch
//     steps and the ⚡ block still sends them, so a pack or a later surface can author one; this
//     panel offers a graphic's declared CONTROLS and a cue's VERBS, which is what the proof case
//     and every row of §6c's table are made of.
//
// WHY IT IS COLLAPSED BY DEFAULT. This column is an OPERATING surface: a drag-to-reorder list
// sitting open under the ⚡ buttons during a programme is a hand's-width from the controls that
// go to air. Authoring is a thing you sit down and do.
import { useState } from 'react';
import type { ControlButton } from '../../control/controlModel';
import { arrangeControls, arrangeFor } from '../../control/controlModel';
import { VERB_WORDS } from '../../control/combine';
// `put` is the format module's own guard for a user-named key, not a second copy of it: a control
// id is the author's own event name, and a bare `map[control] = entry` loses one called
// `__proto__` with no error at all — a panel reporting a save that stored nothing.
import {
  put,
  PROFILE_VERBS,
  type ArrangeEntry,
  type CombinedControl,
  type ProfileStep,
  type ProfileVerb,
  type ShowProfile,
} from '../../model/profile';

/** The drag payload's own MIME type, the cue rundown's mechanism exactly: a private type means a
 *  row dragged out of this list cannot be dropped into the rundown, or the other way round. */
const DRAG_TYPE = 'text/noacg-control';

/** One thing a step can point at: a pool graphic with the controls it declares, or a cue the four
 *  lifecycle verbs act on. Built by the page, because only it knows the whole production. */
export interface CombineTarget {
  kind: 'graphic' | 'cue';
  /** The pool graphic's NAME, or the cue's id — whichever the step stores. */
  id: string;
  /** What the operator reads in the picker. */
  label: string;
  /** A graphic's declared controls, in the words the ⚡ block shows. Empty for a cue. */
  controls: { id: string; label: string }[];
}

/** The half-picked step under one combined control — what the three selects and the two marks
 *  currently read. It is UI state and never a profile: a step exists the moment "+ Add step" turns
 *  it into one. */
interface StepRow {
  /** `graphic:<pool name>` or `cue:<cue id>`. One box, because "which graphic" and "which cue" are
   *  the same question asked of a production: what does this step act on. */
  target: string;
  /** A control id when the target is a graphic, a lifecycle verb when it is a cue. */
  action: string;
  /** Seconds to wait before this step, as typed. The one number box in the whole panel (§6e). */
  after: string;
  /** '' = always send; 'on'/'off' = offer it as a tick, starting there. */
  ask: '' | 'on' | 'off';
}

const EMPTY_ROW: StepRow = { target: '', action: '', after: '', ask: '' };

/** The key the add-a-step row of a control that does not exist yet is held under. A real control
 *  id is minted as `combined-N`, so this cannot collide with one. */
const NEW_ROW = '\u0000new';

/** Turn a picked row into a step, or null when it is not finished. */
function buildStep(row: StepRow): ProfileStep | null {
  const at = row.target.indexOf(':');
  if (at < 0 || !row.action) return null;
  const kind = row.target.slice(0, at);
  const id = row.target.slice(at + 1);
  const marks: { after?: number; ask?: { default: boolean } } = {};
  const after = Number(row.after);
  // A zero or absent wait is "with the step before it", and the format stores that as an ABSENCE
  // — the same rule `readMarks` applies, kept here so the panel cannot write the other shape.
  if (Number.isFinite(after) && after > 0) marks.after = after;
  if (row.ask) marks.ask = { default: row.ask === 'on' };
  if (kind === 'cue') {
    return PROFILE_VERBS.includes(row.action as ProfileVerb)
      ? { kind: 'verb', verb: row.action as ProfileVerb, cue: id, ...marks }
      : null;
  }
  return { kind: 'event', graphic: id, control: row.action, ...marks };
}

/** The first `combined-N` nobody is using. Deterministic rather than random so a production's
 *  profile diffs readably and a spec can name the control it just made. */
function freeId(combine: CombinedControl[]): string {
  const taken = new Set(combine.map((c) => c.id));
  for (let n = 1; ; n += 1) if (!taken.has(`combined-${n}`)) return `combined-${n}`;
}

/** One step in the composer's own words. Short, because it sits in a narrow list under the ⚡
 *  block; the full sentence with its marks is on the button's hover in the block itself. */
function stepLine(step: ProfileStep, targets: CombineTarget[]): string {
  const marks: string[] = [];
  if (step.after) marks.push(`after ${step.after} s`);
  if (step.ask) marks.push(step.ask.default ? 'ask, on' : 'ask, off');
  const tail = marks.length > 0 ? ` · ${marks.join(' · ')}` : '';
  const find = (kind: CombineTarget['kind'], id: string) => targets.find((t) => t.kind === kind && t.id === id);
  if (step.kind === 'verb') {
    return `${VERB_WORDS[step.verb]} ${find('cue', step.cue)?.label ?? step.cue}${tail}`;
  }
  const target = find('graphic', step.graphic);
  if (step.kind === 'patch') {
    return `${Object.keys(step.values).length} field(s) → ${target?.label ?? step.graphic}${tail}`;
  }
  const control = target?.controls.find((c) => c.id === step.control);
  return `${control?.label ?? step.control} → ${target?.label ?? step.graphic}${tail}`;
}

export default function ProductionControlsPanel({
  graphic,
  buttons,
  profile,
  readOnly,
  targets,
  onArrange,
  onCombine,
  onDeleteProfile,
}: {
  /** The POOL graphic's name — the key ARRANGE, the bindings and the published panel all use. */
  graphic: string;
  /** The controls the graphic DECLARES, generated (controlModel `eventButtons`). */
  buttons: ControlButton[];
  /** Everything a COMBINE step can point at, across the whole production — every pool graphic and
   *  every cue, not just the selected one. A combined control spans graphics on purpose (§6c: the
   *  cross-graphic step was the case the design refused to special-case), so this half of the
   *  panel is production-wide while the list above it is one graphic's. */
  targets: CombineTarget[];
  /** The profile as this build may RENDER it (`readPublishedProfile`), or null for a production
   *  with none — and also for one this build cannot read, which `readOnly` then explains. */
  profile: ShowProfile | null;
  /** A profile a NEWER build wrote. Every door refuses it (`model/shows.ts` says why), so the
   *  panel says so rather than offering controls that would silently do nothing. */
  readOnly: boolean;
  /** This graphic's whole arrangement, replaced. An empty map deletes the graphic's key. */
  onArrange: (entries: Record<string, ArrangeEntry>) => void;
  /** The production's whole list of combined controls, replaced. */
  onCombine: (combine: CombinedControl[]) => void;
  onDeleteProfile: () => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  /** Names being TYPED, by control id. The stored name is trimmed and an empty one means "as the
   *  graphic declared it", so committing on every keystroke made the box refuse a space: the
   *  trim took it off, the value came back without it, and "Stop the clock" could not be typed.
   *  The draft holds what the operator is actually typing; blur is what commits it. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** The name being typed for a combined control that does not exist yet. Null means nobody is
   *  making one. It cannot be stored until it has a STEP: the format drops a control that sends
   *  nothing (`readCombine`), so a button with no steps would vanish on the next read and the
   *  operator would be told it saved. It is therefore held here and written on the first step. */
  const [newName, setNewName] = useState<string | null>(null);
  /** The add-a-step row of each combined control, by control id — `NEW_ROW` for the one being
   *  made. Component state because a half-picked step is not a profile. */
  const [pickers, setPickers] = useState<Record<string, StepRow>>({});

  const combine = profile?.combine ?? [];

  const pickerFor = (id: string): StepRow =>
    (Object.prototype.hasOwnProperty.call(pickers, id) ? pickers[id] : undefined) ?? EMPTY_ROW;
  const setPicker = (id: string, change: Partial<StepRow>) =>
    setPickers((p) => {
      const next = { ...p };
      put(next, id, { ...pickerFor(id), ...change });
      return next;
    });

  /** Add the picked step to a control, or — for `NEW_ROW` — mint the control around it. */
  const addStep = (id: string) => {
    const step = buildStep(pickerFor(id));
    if (!step) return;
    setPickers((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    if (id !== NEW_ROW) {
      onCombine(combine.map((c) => (c.id === id ? { ...c, steps: [...c.steps, step] } : c)));
      return;
    }
    onCombine([...combine, { id: freeId(combine), name: (newName ?? '').trim() || 'Combined control', steps: [step] }]);
    setNewName(null);
  };

  /** One control's steps, replaced. An emptied control goes entirely, because the format would
   *  drop it on the next read anyway and two answers to "is it there" is one too many. */
  const setSteps = (id: string, steps: ProfileStep[]) => {
    if (steps.length === 0) {
      onCombine(combine.filter((c) => c.id !== id));
      return;
    }
    onCombine(combine.map((c) => (c.id === id ? { ...c, steps } : c)));
  };

  /** Move one step up or down. The ORDER IS THE MEANING (§6b), so this is the one gesture that
   *  changes what a press does without changing any step. */
  const moveStep = (id: string, index: number, by: -1 | 1) => {
    const control = combine.find((c) => c.id === id);
    if (!control) return;
    const to = index + by;
    if (to < 0 || to >= control.steps.length) return;
    const steps = control.steps.slice();
    [steps[index], steps[to]] = [steps[to], steps[index]];
    setSteps(id, steps);
  };

  const entries = arrangeFor(profile, graphic) ?? {};
  /** The rows, in the order the operator will meet them: pinned, then each section, then the
   *  hidden ones. The list an operator drags IS the panel they get. */
  const arranged = arrangeControls(buttons, entries);
  const rows = [
    ...arranged.pinned.map((c) => ({ ...c, pinned: true, hidden: false })),
    ...arranged.sections.flatMap(([, controls]) => controls.map((c) => ({ ...c, pinned: false, hidden: false }))),
    ...arranged.more.map((c) => ({ ...c, pinned: false, hidden: true })),
  ];

  const storedFor = (event: string): ArrangeEntry | undefined =>
    Object.prototype.hasOwnProperty.call(entries, event) ? entries[event] : undefined;

  /**
   * The entries this panel does NOT govern: an arrangement for a control the graphic no longer
   * declares. They are carried through every write rather than tidied away, because a control can
   * disappear for a moment while its template is being edited, and an operator would never be
   * told that an afternoon's arranging went with it. The validator already WARNS about them, and
   * deleting the profile is the deliberate way to clear them.
   */
  const untouched = (): Record<string, ArrangeEntry> => {
    const declared = new Set(rows.map((r) => r.button.event));
    const kept: Record<string, ArrangeEntry> = {};
    for (const [event, entry] of Object.entries(entries)) if (!declared.has(event)) put(kept, event, entry);
    return kept;
  };

  /** One control's entry, changed. An entry that ends up saying nothing is dropped by the
   *  format's own canonical form, so "back to how the graphic declared it" needs no special
   *  case here — it is what clearing every mark leaves behind. */
  const patch = (event: string, change: Partial<ArrangeEntry>) => {
    const next = untouched();
    for (const row of rows) {
      const entry = { ...storedFor(row.button.event), ...(row.button.event === event ? change : {}) };
      // An undefined mark is a REMOVED mark: `{ ...entry, name: undefined }` is how clearing the
      // rename box gets back to the declared label, and JSON would carry the key otherwise.
      for (const key of Object.keys(entry) as (keyof ArrangeEntry)[]) {
        if (entry[key] === undefined) delete entry[key];
      }
      if (Object.keys(entry).length > 0) put(next, row.button.event, entry);
    }
    onArrange(next);
  };

  /** Drop `from` at `to`'s position, renumbering the whole list. Renumbering rather than nudging
   *  one key: `order` is a position, the list is short, and a partial numbering would make the
   *  next drag depend on which drags came before it. */
  const reorder = (from: string, to: string) => {
    const fromIndex = rows.findIndex((r) => r.button.event === from);
    const toIndex = rows.findIndex((r) => r.button.event === to);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const moved = rows.slice();
    moved.splice(toIndex, 0, moved.splice(fromIndex, 1)[0]);
    const next = untouched();
    moved.forEach((row, index) => {
      put(next, row.button.event, { ...storedFor(row.button.event), order: index });
    });
    onArrange(next);
  };

  /** Commit a typed name. Empty, or the declared label typed back, is "as the graphic declared
   *  it" — storing the declared word would pin it and stop it following the graphic when its
   *  author changes it. */
  const commitName = (event: string, declared: string) => {
    const draft = drafts[event];
    if (draft === undefined) return; // a blur with nothing typed is not an edit
    setDrafts((d) => {
      const next = { ...d };
      delete next[event];
      return next;
    });
    const typed = draft.trim();
    patch(event, { name: typed && typed !== declared ? typed : undefined });
  };

  const hasArrangement = Object.keys(entries).length > 0;

  /**
   * THE STEP PICKER — three boxes and two marks, drawn the same for a control being made and for
   * one being extended. No text box takes anything but a name or a number of seconds (§6e), which
   * is why the target and the action are SELECTS over what the production already declares: a
   * step can only ever name something a graphic exposes, and a picker that cannot spell anything
   * else is that rule as a mechanism rather than as a validation message.
   */
  const stepPicker = (id: string) => {
    const row = pickerFor(id);
    const target = targets.find((t) => `${t.kind}:${t.id}` === row.target) ?? null;
    return (
      <div className="pd-combine-picker" data-testid={`combine-picker-${id === NEW_ROW ? 'new' : id}`}>
        <select
          value={row.target}
          aria-label="What this step acts on"
          // Changing the target clears the action: a control id means nothing on a cue, and
          // carrying it across would build a step naming a control the new target never declared.
          onChange={(e) => setPicker(id, { target: e.target.value, action: '' })}
          data-testid={`combine-target-${id === NEW_ROW ? 'new' : id}`}
        >
          <option value="">Act on…</option>
          {targets.map((t) => (
            <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
              {t.kind === 'cue' ? `Cue: ${t.label}` : t.label}
            </option>
          ))}
        </select>
        <select
          value={row.action}
          disabled={!target}
          aria-label="What this step sends"
          onChange={(e) => setPicker(id, { action: e.target.value })}
          data-testid={`combine-action-${id === NEW_ROW ? 'new' : id}`}
        >
          <option value="">{target?.kind === 'cue' ? 'Verb…' : 'Control…'}</option>
          {target?.kind === 'cue'
            ? PROFILE_VERBS.map((verb) => (
                <option key={verb} value={verb}>
                  {VERB_WORDS[verb]}
                </option>
              ))
            : (target?.controls ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
        </select>
        <label className="pd-combine-after">
          after
          <input
            type="number"
            min={0}
            step={0.5}
            value={row.after}
            placeholder="0"
            aria-label="Seconds to wait before this step"
            onChange={(e) => setPicker(id, { after: e.target.value })}
            data-testid={`combine-after-${id === NEW_ROW ? 'new' : id}`}
          />
          s
        </label>
        <select
          value={row.ask}
          aria-label="Offer this step as a tick"
          title="A tick beside the button, which is the whole of what one press may vary by. It is a tick, never a value."
          onChange={(e) => setPicker(id, { ask: e.target.value as StepRow['ask'] })}
          data-testid={`combine-ask-${id === NEW_ROW ? 'new' : id}`}
        >
          <option value="">Always</option>
          <option value="on">Ask, ticked</option>
          <option value="off">Ask, unticked</option>
        </select>
        <button
          disabled={!buildStep(row)}
          onClick={() => addStep(id)}
          title={buildStep(row) ? 'Add this step to the end of the list' : 'Pick what the step acts on and what it sends'}
          data-testid={`combine-add-step-${id === NEW_ROW ? 'new' : id}`}
        >
          + Add step
        </button>
      </div>
    );
  };

  return (
    <details className="pd-actions pd-controls-panel" data-testid="controls-panel">
      <summary>
        <span className="pd-actions-kicker">CONTROLS</span>
        <span className="muted">
          {hasArrangement
            ? `arranged for this production, ${rows.length} control${rows.length === 1 ? '' : 's'}`
            : 'as the graphic declared them'}
          {combine.length > 0 &&
            ` · ${combine.length} combined control${combine.length === 1 ? '' : 's'}`}
        </span>
      </summary>
      <p className="hint pd-actions-help">
        How THIS production shows {graphic}&rsquo;s controls. Drag to order them, pin the handful
        you press, hide the rest behind &ldquo;More&rdquo;, and rename one into the show&rsquo;s own
        words. Nothing about a press changes: the graphic still decides what it does, and a hidden
        control is still guarded and still one click away.
      </p>

      {readOnly ? (
        <p className="status-bad" data-testid="controls-panel-readonly">
          This production&rsquo;s control profile was written by a newer build, so it is read-only
          here. Open it on that build to change it. Editing it from here could destroy settings
          this one cannot even see.
        </p>
      ) : (
        <>
          <ul className="pd-controls-list" data-testid="controls-list">
            {rows.map((row) => {
              const event = row.button.event;
              return (
                <li
                  key={event}
                  className={`pd-controls-row${row.hidden ? ' hidden' : ''}${dragging === event ? ' dragging' : ''}`}
                  data-testid={`controls-row-${event}`}
                  // The whole row is a DROP target and only the grip is a drag SOURCE. Making the
                  // row draggable put the rename box inside the source, so dragging across it to
                  // select text started a row drag instead — and the grip advertises `cursor: grab`
                  // as if it were the handle, which it now is.
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(null);
                    const from = e.dataTransfer.getData(DRAG_TYPE);
                    if (from) reorder(from, event);
                  }}
                >
                  <span
                    className="pd-grip"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, event);
                      setDragging(event);
                    }}
                    onDragEnd={() => setDragging(null)}
                    aria-hidden="true"
                    data-testid={`controls-grip-${event}`}
                  >
                    ⣿
                  </span>
                  {/* THE ONLY TEXT BOX IN THE PANEL, and it takes a NAME — never a value, a
                      number of seconds or an expression (§6b: the profile has no place for one).
                      Empty is a real answer: it means "as the graphic declared it". */}
                  <input
                    className="pd-controls-name"
                    value={drafts[event] ?? row.label}
                    aria-label={`Name for ${row.button.label}`}
                    placeholder={row.button.label}
                    onChange={(e) => setDrafts((d) => ({ ...d, [event]: e.target.value }))}
                    onBlur={() => commitName(event, row.button.label)}
                    // Enter commits without reaching for the mouse. Escape is deliberately NOT
                    // bound: undoing a name is typing it back, and an abandon that raced the
                    // draft's own state update would commit the very text it promised to drop.
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    data-testid={`controls-name-${event}`}
                  />
                  <button
                    className={`pd-controls-mark${row.pinned ? ' on' : ''}`}
                    aria-pressed={row.pinned}
                    disabled={row.hidden}
                    title={
                      row.hidden
                        ? 'A hidden control has no fold to sit above. Unhide it first.'
                        : row.pinned
                          ? 'Pinned above the fold. Press to unpin.'
                          : 'Pin it above the fold, where the hand goes first'
                    }
                    onClick={() => patch(event, { pinned: row.pinned ? undefined : true })}
                    data-testid={`controls-pin-${event}`}
                  >
                    ★ Pin
                  </button>
                  <button
                    className={`pd-controls-mark${row.hidden ? ' on' : ''}`}
                    aria-pressed={row.hidden}
                    title={
                      row.hidden
                        ? 'Behind "More". Press to bring it back into the panel.'
                        : 'Put it behind "More": still legal, still one click away, just not in the way'
                    }
                    // Hiding clears the pin: the two mean opposite things and a profile carrying
                    // both is a hand-edit the surfaces have to resolve rather than a state this
                    // panel should be able to produce.
                    onClick={() =>
                      patch(event, row.hidden ? { hidden: undefined } : { hidden: true, pinned: undefined })
                    }
                    data-testid={`controls-hide-${event}`}
                  >
                    {row.hidden ? '◦ Hidden' : '● Shown'}
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length === 0 && <p className="hint">This graphic declares no controls to arrange.</p>}

          {/* COMBINED CONTROLS — the profile's other primitive (§6b). Production-wide rather than
              per graphic, because a step names its own graphic and the cross-graphic case is the
              one the design refused to special-case: "reveal here, +1 there" is composed the same
              way as "reveal the nominees on one board". */}
          <div className="pd-combine" data-testid="combine-composer">
            <h4>Combined controls</h4>
            <p className="hint">
              One button, several steps, in the order you put them. A step sends exactly one thing
              the production can already send. <b>after</b> makes the surface wait that long before
              it. The button counts down, and a press on the countdown cancels the rest.{' '}
              <b>Ask</b> offers the step as a tick beside the button. There is no condition and no
              loop. Those belong in a graphic&rsquo;s own code.
            </p>
            <ul className="pd-combine-list" data-testid="combine-list">
              {combine.map((control) => (
                <li key={control.id} className="pd-combine-control" data-testid={`combine-control-${control.id}`}>
                  <div className="pd-combine-head">
                    <input
                      className="pd-controls-name"
                      value={drafts[control.id] ?? control.name}
                      aria-label={`Name for ${control.name}`}
                      onChange={(e) => setDrafts((d) => ({ ...d, [control.id]: e.target.value }))}
                      // Commit on blur and on Enter, never on keystroke: a trim-on-change box
                      // refuses the space bar (the rename box above learned this the hard way).
                      onBlur={() => {
                        const draft = drafts[control.id];
                        setDrafts((d) => {
                          const next = { ...d };
                          delete next[control.id];
                          return next;
                        });
                        const typed = (draft ?? '').trim();
                        if (typed && typed !== control.name) {
                          onCombine(combine.map((c) => (c.id === control.id ? { ...c, name: typed } : c)));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      data-testid={`combine-name-${control.id}`}
                    />
                    <span className="muted">
                      {control.steps.length} step{control.steps.length === 1 ? '' : 's'}
                    </span>
                    <button
                      className="pd-controls-mark"
                      onClick={() => onCombine(combine.filter((c) => c.id !== control.id))}
                      title="Remove this combined control. The graphics' own controls are untouched."
                      data-testid={`combine-delete-${control.id}`}
                    >
                      ✕ Delete
                    </button>
                  </div>
                  <ol className="pd-combine-steps" data-testid={`combine-steps-${control.id}`}>
                    {control.steps.map((step, index) => (
                      <li key={index} data-testid={`combine-step-${control.id}-${index}`}>
                        <span className="pd-combine-step-text">{stepLine(step, targets)}</span>
                        <button
                          disabled={index === 0}
                          onClick={() => moveStep(control.id, index, -1)}
                          title="Earlier in the sequence"
                          data-testid={`combine-step-up-${control.id}-${index}`}
                        >
                          ▲
                        </button>
                        <button
                          disabled={index === control.steps.length - 1}
                          onClick={() => moveStep(control.id, index, 1)}
                          title="Later in the sequence"
                          data-testid={`combine-step-down-${control.id}-${index}`}
                        >
                          ▼
                        </button>
                        <button
                          onClick={() => setSteps(control.id, control.steps.filter((_, i) => i !== index))}
                          title="Remove this step. Removing the last one removes the control."
                          data-testid={`combine-step-delete-${control.id}-${index}`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ol>
                  {stepPicker(control.id)}
                </li>
              ))}
            </ul>
            {newName === null ? (
              <button onClick={() => setNewName('')} data-testid="combine-new">
                + Combined control
              </button>
            ) : (
              <div className="pd-combine-control" data-testid="combine-new-control">
                <div className="pd-combine-head">
                  <input
                    className="pd-controls-name"
                    value={newName}
                    autoFocus
                    placeholder="What the operator reads on the button"
                    aria-label="Name for the new combined control"
                    onChange={(e) => setNewName(e.target.value)}
                    data-testid="combine-new-name"
                  />
                  <span className="muted">no steps yet</span>
                  <button
                    className="pd-controls-mark"
                    onClick={() => setNewName(null)}
                    data-testid="combine-new-cancel"
                  >
                    ✕ Cancel
                  </button>
                </div>
                {/* IT IS SAVED BY ITS FIRST STEP, not by a Save button. The format drops a control
                    that sends nothing, so a stepless one would disappear on the next read while
                    the panel said it was there. */}
                <p className="hint">Add its first step and the control is saved.</p>
                {stepPicker(NEW_ROW)}
              </div>
            )}
          </div>

          {/* DELETE IS ONE ACTION and restores the complete generated panel, on every surface
              (docs/CONTROL_PANEL_ROAD.md §3). It removes the whole profile, combined controls
              included, which is why it says so and why it is the only destructive control here. */}
          {profile && (
            <p className="pd-controls-delete">
              <button
                className="pd-action destructive"
                onClick={() => onDeleteProfile()}
                title="Removes this production's whole control profile, every graphic's arrangement and every combined control, and leaves the generated panel on all three deployments"
                data-testid="controls-delete-profile"
              >
                Delete profile
              </button>
              <span className="hint">
                Removes the arrangement for every graphic in this production and leaves the panel
                the graphics generate.
              </span>
            </p>
          )}
        </>
      )}
    </details>
  );
}
