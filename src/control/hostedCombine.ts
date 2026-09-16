// THE HOSTED CONTROL PAGE'S HALF OF A COMBINED CONTROL — how that surface reads its production
// (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b, docs/CONTROL_LAYER.md "Hosted control").
//
// `combine.ts` decides which steps go and when, `combineSend.ts` decides what they put on the
// wire, and both are surface-independent. What is left is the surface's own answer to five
// questions — which graphics are up, which of their controls are legal, what each cue would send,
// what the wire last put on air, and which of its fields follow a SHARED value rather than the cue
// — and on this page every one of them is answered from bytes the slug can reach: the `panel`
// spec, the `output` payload, the `profile` column, the live snapshot the log keeps, and the
// production tree and bindings (`control_data_by_slug`, migration 0060). Nothing here reads a show
// record, because this page never sees one.
//
// IT LIVES OUTSIDE THE COMPONENT so it can be measured. The hosted page cannot be mounted by an
// offline spec at all (it needs a configured backend, `e2e/hosted-control.spec.ts` says so at
// length), so a rule written inside its JSX is a rule nothing in the merge gate can run. These
// functions take the published bytes and hand back exactly what the page hands the resolver.

import {
  arrangeFor,
  eventButtons,
  eventLegality,
  isEventLegal,
  type ControlButton,
} from './controlModel';
import type { CombineNow, StepNames } from './combine';
import type { CombineWorld } from './combineSend';
import type { LiveCueMap, LiveReportMap, OutputCue, PanelGraphicSpec } from './hostedControl';
import { resolveBindings, type ProductionBindings, type ResolvedValues } from '../model/productionData';
import type { ShowProfile } from '../model/profile';

/** One published graphic's machine, parsed once rather than per step. */
export interface HostedMachine {
  buttons: ControlButton[];
  legality: Record<string, Record<string, string[]>>;
}

/** The published production as this page currently holds it. */
export interface HostedCombineInput {
  /** Every published graphic's panel spec — where the declared controls come from. */
  panel: PanelGraphicSpec[];
  /** The published cue rundown. */
  cues: OutputCue[];
  /** Which cue is up on each layer, off the wire's own snapshot — so a take from ANOTHER
   *  operator's surface counts here exactly as this page's own does. */
  liveCue: LiveCueMap;
  /** Each graphic's last report: its machine state is what the greying is judged against. */
  live: LiveReportMap;
  /** The SHARED staging buffer — another operator typing is part of what a Take would send. */
  staged: Record<string, Record<string, string>>;
  /** What each graphic was last TOLD to show, followed off the log. This is the baseline a MOVED
   *  field counts from, and the reason a delayed `+1` fired here lands on the figure somebody
   *  else's press just put up rather than on the one this page saw at the press. */
  aired: Record<string, Record<string, string>>;
  /** The production's control profile, already through the version gate at the reader. */
  profile: ShowProfile | null;
  /**
   * WHAT THE PRODUCTION HAS BOUND, and what those bindings currently RESOLVE TO - read on the
   * control slug (`control_data_by_slug`, migration 0060), because a production's shared values
   * are not in the published panel and never will be: the panel is authored state, the tree is
   * what is true right now.
   *
   * Empty for a production with no bindings, which is every production that has not used the
   * Data tab - and then every function below behaves exactly as it did before shared values
   * existed. That is the property to keep: `bound` answering null everywhere IS the old page.
   */
  bindings: ProductionBindings;
  resolved: ResolvedValues;
}

/** A user-named key, read safely: a graphic name and a control id are somebody's typed text, so a
 *  bare `map[name]` answers a function for one called `constructor`. A MISSING map reads as an
 *  empty one, because a surface that has not resolved an optional half of its production yet
 *  (the tree arrives one round trip after the panel) must behave as one with nothing there. */
function own<T>(map: Record<string, T> | undefined, key: string): T | undefined {
  return map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/** The bound values for one graphic, read safely off a user-named key. */
function boundFor(at: HostedCombineInput, graphic: string): Record<string, string> | undefined {
  return own(at.bindings, graphic);
}

/**
 * EVERY PUBLISHED GRAPHIC'S MACHINE, not just the selected one. The ⚡ block reads one graphic
 * because that is what an action acts on; a combined control does not, because its steps name
 * their own graphics (§6c's proof case reveals on one board and adds points on another).
 */
export function hostedPoolMachines(panel: PanelGraphicSpec[]): Map<string, HostedMachine> {
  const out = new Map<string, HostedMachine>();
  for (const g of panel) out.set(g.name, { buttons: eventButtons(g.js), legality: eventLegality(g.js) });
  return out;
}

/** The production as a press finds it — what decides whether the button is pressable and which
 *  steps the machine would drop. */
export function hostedCombineNow(machines: Map<string, HostedMachine>, at: HostedCombineInput): CombineNow {
  return {
    graphics: new Map(
      [...machines].map(([name, machine]) => [
        name,
        {
          live: !!own(at.liveCue, name),
          legal: new Map(
            machine.buttons.map((b) => [
              b.event,
              isEventLegal(machine.legality, b.event, own(at.live, name)?.state ?? null),
            ]),
          ),
        },
      ]),
    ),
    cues: new Map(at.cues.map((c) => [c.id, c.graphic] as const)),
  };
}

/**
 * THE VALUES THE OPERATOR SEES FOR ONE CUE: the published cue with the SHARED staging buffer over
 * them, so another operator typing is part of what a Take would send.
 *
 * One function because the page's ⟳ TAKE, ✎ Update, the snap's trailing write, the cue editor and
 * a combined control's verb step all have to send the same values — two readings of "the cue as it
 * stands" is how one production's Take comes to mean two things.
 */
export function hostedCueValues(
  cue: OutputCue,
  staged: Record<string, Record<string, string>>,
  resolved: ResolvedValues,
): Record<string, string> {
  // BOUND VALUES SIT ON TOP OF BOTH (plan §2.7): a bound field is never a cue value, so taking a
  // cue prepared at 1-0 while the tree says 3-2 airs 3-2, and neither the published cue nor an
  // operator typing into the shared buffer can push it back. Without this the page's own ± press
  // moved the shared value and the very next ⟳ Take put the old figure back on air.
  return { ...cue.values, ...(own(staged, cue.graphic) ?? {}), ...(own(resolved, cue.graphic) ?? {}) };
}

/** The tree as this page's bindings resolve it - one call per render rather than one per cue. */
export function hostedResolved(data: Record<string, unknown>, bindings: ProductionBindings): ResolvedValues {
  return resolveBindings(data as Parameters<typeof resolveBindings>[0], bindings);
}

/**
 * HOW THIS SURFACE READS THE PRODUCTION when a group fires.
 */
export function hostedCombineWorld(machines: Map<string, HostedMachine>, at: HostedCombineInput): CombineWorld {
  const cueValues = (cue: OutputCue) => hostedCueValues(cue, at.staged, at.resolved);
  return {
    buttons: (graphic) => machines.get(graphic)?.buttons ?? [],
    cueSendValues: (cueId) => {
      const cue = at.cues.find((c) => c.id === cueId);
      return cue ? cueValues(cue) : null;
    },
    onAir: (graphic) => {
      const cueId = own(at.liveCue, graphic);
      const cue = cueId ? at.cues.find((c) => c.id === cueId) ?? null : null;
      return cue ? { cueId: cue.id, values: cueValues(cue) } : null;
    },
    aired: (graphic) => own(at.aired, graphic),
    bound: (graphic, field) => {
      const paths = boundFor(at, graphic);
      const path = paths && Object.prototype.hasOwnProperty.call(paths, field) ? paths[field] : undefined;
      return path ? { path, current: own(at.resolved, graphic)?.[field] } : null;
    },
  };
}

/**
 * How a step's target is SPELLED here — the in-app page's rule, word for word, because one
 * production must read the same on both surfaces.
 *
 * A control wears the production's own word for it when ARRANGE renamed it, else its declared
 * label. The author's SECTION is prefixed only when the label alone would be AMBIGUOUS — another
 * control of the same graphic reading the same. That is the case the prefix exists for (the
 * totals board's five controls are all labelled "+1"); prefixing unconditionally produced
 * "Podiums Spotlight podium" on the first real graphic it met.
 */
export function hostedCombineNames(machines: Map<string, HostedMachine>, at: HostedCombineInput): StepNames {
  return {
    control: (graphic, control) => {
      const buttons = machines.get(graphic)?.buttons ?? [];
      const button = buttons.find((b) => b.event === control);
      const arrangement = arrangeFor(at.profile, graphic);
      const renamed = arrangement ? own(arrangement, control)?.name : undefined;
      const label = renamed || button?.label || control;
      const shared = buttons.filter((b) => b.label === button?.label).length > 1;
      return shared && button?.section ? `${button.section} ${label}` : label;
    },
    cue: (cueId) => at.cues.find((c) => c.id === cueId)?.label ?? 'a cue',
  };
}
