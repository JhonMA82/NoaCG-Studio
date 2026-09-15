// THE HOSTED CONTROL PAGE'S HALF OF A COMBINED CONTROL — how that surface reads its production
// (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b, docs/CONTROL_LAYER.md "Hosted control").
//
// `combine.ts` decides which steps go and when, `combineSend.ts` decides what they put on the
// wire, and both are surface-independent. What is left is the surface's own answer to four
// questions — which graphics are up, which of their controls are legal, what each cue would send,
// and what the wire last put on air — and on this page every one of them is answered from the
// PUBLISHED bytes: the `panel` spec, the `output` payload, the `profile` column and the live
// snapshot the log keeps. Nothing here reads a show record, because this page never sees one.
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
}

/** A user-named key, read safely: a graphic name and a control id are somebody's typed text, so a
 *  bare `map[name]` answers a function for one called `constructor`. */
function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
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
): Record<string, string> {
  return { ...cue.values, ...(own(staged, cue.graphic) ?? {}) };
}

/**
 * HOW THIS SURFACE READS THE PRODUCTION when a group fires.
 */
export function hostedCombineWorld(machines: Map<string, HostedMachine>, at: HostedCombineInput): CombineWorld {
  const cueValues = (cue: OutputCue) => hostedCueValues(cue, at.staged);
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
