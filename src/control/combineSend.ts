// WHAT ONE PRESS OF A COMBINED CONTROL PUTS ON THE WIRE — the half `src/control/combine.ts`
// deliberately refuses to own, written once for every surface that sends (plan §6b, AC-6).
//
// THE SPLIT, and why there are two modules rather than one. `combine.ts` owns WHICH steps go and
// WHEN: it imports nothing at run time, so `scripts/combine-control.test.mjs` can transpile it
// alone in the build gate, and that fence is only worth having if nothing drags an import back
// in. This module is the other half — it needs `eventPayload`, `movedKeys` and the cue verbs, so
// it lives beside that fence rather than behind it.
//
// WHY IT IS SHARED RATHER THAN WRITTEN PER SURFACE. The in-app production page and the hosted
// control page both send a combined control, and the rule they have to agree on is not "roughly
// the same": it is what a `+1` carries, which figure it counts from, which fields are mirrored
// back, and which step gets dropped. Two copies of that would look identical in review and
// disagree on air — the production page counting from the cue and the hosted page from the wire
// would move one show's score twice and the other's not at all. So the surfaces hand over a
// WORLD (how to read their own production) and get back the items, the mirrors and the drops.
//
// WHAT STAYS WITH THE SURFACE, on purpose: showing the drops (each page has its own feed), the
// mirror write-back (a stored cue in the app, the shared staging buffer on the hosted page), and
// the send itself. Those are genuinely three different things on three different planes.

import { eventPayload, movedKeys, pressVerb, type ControlButton } from './controlModel';
import { stepBlocked, type CombineNow, type StepGroup } from './combine';
import { clearCueItems, takeCueItems, COMMAND_BATCH_MAX, type ControlSendItem } from './hostedControl';
import { splitBoundWrites, type TreeWrite } from '../model/productionData';
import type { ProfileStep } from '../model/profile';

/**
 * THE PRODUCTION AS THE SENDING SURFACE CAN READ IT, at the moment a group fires.
 *
 * Every method is asked AT FIRE TIME rather than at press time, which is the design's one
 * non-obvious rule: a delayed `+1` counts from what the audience is looking at, not from what was
 * on screen three seconds ago. A surface implementing this against a closure captured at the
 * press would reintroduce exactly the staleness the scheduler exists to avoid.
 */
export interface CombineWorld {
  /** The controls one pool graphic declares. Empty for a graphic this surface does not carry. */
  buttons(graphic: string): ControlButton[];
  /** The values a Take or an Update of this cue would send — bindings and staging applied, the
   *  same values that surface's own ⟳ TAKE uses. Null when the cue is gone. */
  cueSendValues(cueId: string): Record<string, string> | null;
  /** The cue on air for one graphic and the values the operator sees for it: where an event
   *  step's UNMOVED fields read from, and where its moved figures are mirrored back. */
  onAir(graphic: string): { cueId: string; values: Record<string, string> } | null;
  /** What the WIRE last put on that graphic — the figure a MOVED field counts from. It is the
   *  wire and not the cue on purpose: another operator's surface moved the score too. */
  aired(graphic: string): Record<string, string> | undefined;
  /**
   * THE PRODUCTION DATA PATH one field is bound to, and what the TREE says it reads right now —
   * null for a field this production has not bound (plan §2.9, AC-7).
   *
   * A bound field is not a cue value and not a wire value the surface may write back: it is one
   * shared figure several graphics follow. So a bound field READS from the tree rather than from
   * the cue or the wire, and a press that MOVES it writes the tree instead of the field. The
   * surface answers this because only it knows which production is open.
   */
  bound(graphic: string, field: string): { path: string; current: string | undefined } | null;
}

/** A step the machine would refuse, with the sentence the feed prints. */
export interface DroppedStep {
  step: ProfileStep;
  /** The graphic it names — a verb step's is its cue's, which is why this is resolved here. */
  graphic: string;
  /** Why, in the operator's words (`combine.ts` `stepBlocked`). */
  why: string;
}

/** One cue's figures, moved by this press, to be written back where the surface keeps them. */
export interface CombineMirror {
  cueId: string;
  graphic: string;
  values: Record<string, string>;
}

/** Everything one fired pass produces. */
export interface CombineSend {
  /**
   * The wire items, in step order, ONE ENTRY PER STEP — never flattened here.
   *
   * A step's items are indivisible: a Take is `update` + `play` + `cue`, and an Out is `stop` +
   * `cue`. `commandBatches` packs whole steps so a refused batch can never be the one holding a
   * take's `cue` row on its own, which would put a graphic on air that no surface's ON AIR marker,
   * `liveCue` or ■ Out could then see.
   */
  steps: ControlSendItem[][];
  /** What to write back so the next ⟳ Take or ✎ Update cannot regress a moved figure. Only the
   *  fields this pass MOVED and only the UNBOUND ones: a bound field is never a cue value, and
   *  merging a whole cue read from the current render would put every other field back as it
   *  stood before the pass. */
  mirrors: CombineMirror[];
  /**
   * THE SHARED VALUES THIS PASS MOVED, in fire order — the half that does not ride the wire as a
   * field at all (plan §2.9).
   *
   * The surface applies them to the production's tree through its own patch road, and the update
   * rows come back out of that road for EVERY graphic bound to the path, which is the whole
   * point: a `+1` on the votes board moves the totals board too. In fire order because one press
   * can move the same path twice and the second write has to land on the first one's value.
   */
  tree: TreeWrite[];
  /**
   * Graphic -> the cue a verb step left it playing (null for an Out).
   *
   * Only a surface that tracks liveness ITSELF needs this: the in-app page does, because its
   * offline mode has no log to hear a `cue` row come back on. The hosted page follows the wire's
   * own `cue` rows (`takeCueItems` writes one) and can ignore it.
   */
  liveAfter: Map<string, string | null>;
  /** Dropped ALONE — the rest of the pass proceeded (§6b). */
  dropped: DroppedStep[];
}

/** The bound paths among the fields one press moved — the shape `splitBoundWrites` splits on.
 *  Asked per field rather than per graphic because a surface answers "is this bound" from its
 *  own production, and only these fields are about to be written. */
function boundPaths(graphic: string, moved: Record<string, string>, world: CombineWorld): Record<string, string> {
  const paths: Record<string, string> = {};
  for (const key of Object.keys(moved)) {
    const link = world.bound(graphic, key);
    if (link) paths[key] = link.path;
  }
  return paths;
}

/**
 * RESOLVE EVERYTHING DUE IN ONE PASS.
 *
 * `due` is a LIST of groups rather than one, and that is load-bearing. A background tab throttles
 * `setTimeout` to about a second, so one wake-up routinely has several groups due; resolving them
 * one call at a time made each read the same unchanged surface state, and five delayed `+1`s on
 * one field all sent the same figure. `ahead` below is what carries one step's move to the next
 * inside a single pass.
 */
export function resolveCombineSend(due: StepGroup[], now: CombineNow, world: CombineWorld): CombineSend {
  const steps: ControlSendItem[][] = [];
  const tree: TreeWrite[] = [];
  const mirrorByCue = new Map<string, CombineMirror>();
  const liveAfter = new Map<string, string | null>();
  const dropped: DroppedStep[] = [];
  /** What THIS pass has already moved, by graphic. Two `adjust` steps on one field must count
   *  from each other, or "+1 twice" would send the same figure twice and the receiver would
   *  apply it once. */
  const ahead = new Map<string, Record<string, string>>();
  /** The same, for the SHARED values: path -> what this pass has already written there. A bound
   *  field is one figure several graphics follow, so the chain is by path and not by graphic. */
  const aheadPath = new Map<string, string>();

  /**
   * THE PASS'S OWN VIEW OF WHAT IS UP, which is not the surface's until the rows land.
   *
   * A `take` earlier in this pass has not aired yet — no `cue` row has come back — so `now` still
   * says that graphic is off. Judged against `now` alone, the obvious composition "Take the board,
   * then +1 on it" drops its own second step and the feed reports a refusal that never happened.
   * Everything a verb step DOES decide about liveness is already in `liveAfter`, so this follows
   * it, rebuilt only when a verb step moves one — most passes never touch it at all.
   *
   * It deliberately does not touch the machine STATE: a take plays a graphic in and the state it
   * lands on is the graphic's to report, so a later step's legality is still judged against the
   * last report, exactly as §6b accepts.
   */
  let view = now;
  const relive = () => {
    view = {
      graphics: new Map(
        [...now.graphics].map(([name, g]) => [
          name,
          liveAfter.has(name) ? { ...g, live: liveAfter.get(name) !== null } : g,
        ]),
      ),
      cues: now.cues,
    };
  };

  for (const { step } of due.flatMap((group) => group.steps)) {
    // A verb step names a CUE; the graphic is whichever pool graphic that cue belongs to, which
    // only the production knows. Falling back to the cue id keeps the drop sentence printable
    // for a cue that has been deleted.
    const graphic = step.kind === 'verb' ? now.cues.get(step.cue) ?? step.cue : step.graphic;
    const why = stepBlocked(step, view);
    if (why) {
      dropped.push({ step, graphic, why });
      continue;
    }
    if (step.kind === 'patch') {
      steps.push([{ graphic: step.graphic, msg: { t: 'update', data: step.values } }]);
      continue;
    }
    if (step.kind === 'verb') {
      const values = world.cueSendValues(step.cue);
      if (step.verb === 'take' && values) {
        steps.push(takeCueItems({ id: step.cue, graphic, values }));
        liveAfter.set(graphic, step.cue);
        relive();
      } else if (step.verb === 'update' && values) {
        steps.push([{ graphic, msg: { t: 'update', data: values } }]);
      } else if (step.verb === 'next') {
        steps.push([{ graphic, msg: { t: 'next' } }]);
      } else if (step.verb === 'out') {
        steps.push(clearCueItems(graphic));
        liveAfter.set(graphic, null);
        relive();
      }
      continue;
    }
    const button = world.buttons(step.graphic).find((b) => b.event === step.control);
    if (!button) continue; // `stepBlocked` already refused this; belt and braces for the types
    // The cue this graphic is on — as THIS PASS left it, for the same reason the liveness is:
    // a `+1` after a Take in one press reads and mirrors the cue the Take put up, not the one it
    // replaced, which is where the figures would otherwise have been written back.
    const taken = liveAfter.get(step.graphic);
    const air =
      taken === undefined
        ? world.onAir(step.graphic)
        : taken === null
          ? null
          : { cueId: taken, values: world.cueSendValues(taken) ?? {} };
    const cueValues = air?.values ?? {};
    // Exactly the ⚡ block's own rule: a field the press MOVES counts from what AIR shows, a
    // field it only READS is the cue's own value — with this pass's earlier steps on top. A
    // BOUND field overrides both directions: it reads from the tree, because the tree is what
    // every graphic bound to that path is showing (plan §2.7).
    const moved = new Set(movedKeys(button));
    const already = ahead.get(step.graphic) ?? {};
    const boundOf = (key: string) => world.bound(step.graphic, key);
    const payload = eventPayload(button, (key) => {
      const link = boundOf(key);
      // A bound field counts from the PATH this pass has already moved, not from the graphic:
      // two graphics bound to one value are one figure, so "+1 here, +1 there" in a single press
      // must land on 2, not twice on 1.
      if (link) return aheadPath.get(link.path) ?? link.current ?? (moved.has(key) && button.adjust && key in button.adjust ? '0' : undefined);
      return moved.has(key)
        ? already[key] ??
            world.aired(step.graphic)?.[key] ??
            cueValues[key] ??
            (button.adjust && key in button.adjust ? '0' : '')
        : cueValues[key];
    });
    const movedNow = Object.fromEntries(
      movedKeys(button)
        .filter((key) => payload?.[key] !== undefined)
        .map((key) => [key, payload![key]]),
    );
    // The split the whole row turns on: a bound key leaves the field road entirely — off the
    // event's payload, out of the mirror — and becomes one write of the shared value instead.
    const { fields: adjusted, tree: writes } = splitBoundWrites(movedNow, boundPaths(step.graphic, movedNow, world), (key) =>
      pressVerb(button, key),
    );
    tree.push(...writes);
    for (const write of writes) aheadPath.set(write.path, write.text);
    if (Object.keys(adjusted).length > 0) ahead.set(step.graphic, { ...already, ...adjusted });
    if (Object.keys(adjusted).length > 0 && air) {
      const held = mirrorByCue.get(air.cueId);
      mirrorByCue.set(air.cueId, {
        cueId: air.cueId,
        graphic: step.graphic,
        values: { ...(held?.values ?? {}), ...adjusted },
      });
    }
    // A payload carrying ONLY bound fields leaves nothing to ride the event: the figures arrive
    // as the tree's own update rows, and the event fires bare — which is what it would have done
    // if the control had declared no payload at all.
    const rides = Object.fromEntries(Object.entries(payload ?? {}).filter(([key]) => !boundOf(key)));
    steps.push([
      {
        graphic: step.graphic,
        msg:
          Object.keys(rides).length > 0
            ? { t: 'event', event: button.event, payload: rides }
            : { t: 'event', event: button.event },
      },
    ]);
  }

  return { steps, mirrors: [...mirrorByCue.values()], liveAfter, dropped, tree };
}

/**
 * AT MOST EIGHT ITEMS PER RPC, AND NEVER A STEP SPLIT ACROSS TWO.
 *
 * `control_send_many` refuses a batch outside 1..8 outright (migration 0029), and A STEP IS NOT
 * ONE ITEM: a Take is three and an Out is two. An unchunked press of three Takes raises `not a
 * command batch` and loses the WHOLE press, which is the one failure a combined control must not
 * have. It bites only on a PUBLISHED production, so every offline spec passes straight over it.
 *
 * Packing by STEP rather than by item is the second half, and it is the half a plain slice gets
 * wrong: three Takes are nine items, so `[0,8) [8,9)` would put the third take's `cue` row alone
 * in the second batch. Every caller stops at the first refusal — the likeliest one is the log's
 * 50-per-5-s cap — so that graphic would be playing in on air with no cue row behind it: no ON AIR
 * marker anywhere, no entry in `liveCue`, and nothing left on any surface able to take it off.
 * A step is at most three items, so it always fits.
 */
export function commandBatches(steps: ControlSendItem[][]): ControlSendItem[][] {
  const batches: ControlSendItem[][] = [];
  for (const step of steps) {
    const last = batches[batches.length - 1];
    if (last && last.length + step.length <= COMMAND_BATCH_MAX) last.push(...step);
    else batches.push([...step]);
  }
  return batches;
}
