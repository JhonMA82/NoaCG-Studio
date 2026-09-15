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

import { eventPayload, movedKeys, type ControlButton } from './controlModel';
import { stepBlocked, type CombineNow, type StepGroup } from './combine';
import { clearCueItems, takeCueItems, COMMAND_BATCH_MAX, type ControlSendItem } from './hostedControl';
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
  /** The wire items, in step order. Chunk with `commandBatches` before sending. */
  items: ControlSendItem[];
  /** What to write back so the next ⟳ Take or ✎ Update cannot regress a moved figure. Only the
   *  fields this pass MOVED: merging a whole cue read from the current render would put every
   *  other field back as it stood before the pass. */
  mirrors: CombineMirror[];
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
  const items: ControlSendItem[] = [];
  const mirrorByCue = new Map<string, CombineMirror>();
  const liveAfter = new Map<string, string | null>();
  const dropped: DroppedStep[] = [];
  /** What THIS pass has already moved, by graphic. Two `adjust` steps on one field must count
   *  from each other, or "+1 twice" would send the same figure twice and the receiver would
   *  apply it once. */
  const ahead = new Map<string, Record<string, string>>();

  for (const { step } of due.flatMap((group) => group.steps)) {
    // A verb step names a CUE; the graphic is whichever pool graphic that cue belongs to, which
    // only the production knows. Falling back to the cue id keeps the drop sentence printable
    // for a cue that has been deleted.
    const graphic = step.kind === 'verb' ? now.cues.get(step.cue) ?? step.cue : step.graphic;
    const why = stepBlocked(step, now);
    if (why) {
      dropped.push({ step, graphic, why });
      continue;
    }
    if (step.kind === 'patch') {
      items.push({ graphic: step.graphic, msg: { t: 'update', data: step.values } });
      continue;
    }
    if (step.kind === 'verb') {
      const values = world.cueSendValues(step.cue);
      if (step.verb === 'take' && values) {
        items.push(...takeCueItems({ id: step.cue, graphic, values }));
        liveAfter.set(graphic, step.cue);
      } else if (step.verb === 'update' && values) {
        items.push({ graphic, msg: { t: 'update', data: values } });
      } else if (step.verb === 'next') {
        items.push({ graphic, msg: { t: 'next' } });
      } else if (step.verb === 'out') {
        items.push(...clearCueItems(graphic));
        liveAfter.set(graphic, null);
      }
      continue;
    }
    const button = world.buttons(step.graphic).find((b) => b.event === step.control);
    if (!button) continue; // `stepBlocked` already refused this; belt and braces for the types
    const air = world.onAir(step.graphic);
    const cueValues = air?.values ?? {};
    // Exactly the ⚡ block's own rule: a field the press MOVES counts from what AIR shows, a
    // field it only READS is the cue's own value — with this pass's earlier steps on top.
    const moved = new Set(movedKeys(button));
    const already = ahead.get(step.graphic) ?? {};
    const payload = eventPayload(button, (key) =>
      moved.has(key)
        ? already[key] ??
          world.aired(step.graphic)?.[key] ??
          cueValues[key] ??
          (button.adjust && key in button.adjust ? '0' : '')
        : cueValues[key],
    );
    const adjusted = Object.fromEntries(
      movedKeys(button)
        .filter((key) => payload?.[key] !== undefined)
        .map((key) => [key, payload![key]]),
    );
    if (Object.keys(adjusted).length > 0) {
      ahead.set(step.graphic, { ...already, ...adjusted });
      if (air) {
        const held = mirrorByCue.get(air.cueId);
        mirrorByCue.set(air.cueId, {
          cueId: air.cueId,
          graphic: step.graphic,
          values: { ...(held?.values ?? {}), ...adjusted },
        });
      }
    }
    items.push({
      graphic: step.graphic,
      msg: payload ? { t: 'event', event: button.event, payload } : { t: 'event', event: button.event },
    });
  }

  return { items, mirrors: [...mirrorByCue.values()], liveAfter, dropped };
}

/**
 * ONE RPC PER EIGHT ITEMS. `control_send_many` refuses a batch outside 1..8 outright (migration
 * 0029), and A STEP IS NOT ONE ITEM: a Take is three and an Out is two. An unchunked press of
 * three Takes raises `not a command batch` and loses the WHOLE press, which is the one failure a
 * combined control must not have. It bites only on a PUBLISHED production, so every offline spec
 * passes straight over it — which is how it reached review rather than the room.
 */
export function commandBatches(items: ControlSendItem[]): ControlSendItem[][] {
  const batches: ControlSendItem[][] = [];
  for (let i = 0; i < items.length; i += COMMAND_BATCH_MAX) batches.push(items.slice(i, i + COMMAND_BATCH_MAX));
  return batches;
}
