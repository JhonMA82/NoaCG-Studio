// WHEN AN OUTPUT MAY RELOAD ITSELF (docs/CLOUD_PLAYOUT.md §3; issue #757).
//
// An output reloads for what a frame cannot take (./prepare.ts: another stage resolution, a new
// renderer build) and, at boot, for a client chunk it can no longer fetch (./main.ts). Two rules
// hold every time:
//
//   Only once its own URL answers     a reload during an outage would put the browser's error
//                                     page on air. An answer that takes longer than PROBE_MS
//                                     counts as none (issue #1051): on a network that connects but
//                                     never answers, Prepare for Live and its retries would
//                                     otherwise wait on it until the browser gives up.
//   Only with nothing on air          read AGAIN after that answer, at the last synchronous moment
//                                     before the reload: the probe is a network round trip, and the
//                                     moment Prepare for Live runs is by design one an operator may
//                                     Take in. A Take that lands during the probe stays on air and
//                                     the reload waits for air to clear.
//
// A Take that reaches the log after the reload has started is not lost either: the reloaded page
// replays every row newer than its graphics' reports (control/outputRecovery.ts).
//
// Pure and DOM-free: scripts/output-reload.test.mjs runs it in Node.

/** How long an output waits for its own URL before it counts as not answering. */
export const PROBE_MS = 10_000;

/** `work`, given a signal that aborts after `ms`; `fallback` when it throws or takes longer.
 *  Old CEF: an AbortController and a timer, because CasparCG 2.3's Chromium 71 has no
 *  AbortSignal.timeout. */
export function within<T>(ms: number, work: (signal: AbortSignal) => Promise<T>, fallback: T): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      controller.abort();
      resolve(fallback);
    }, ms);
    const settle = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    try {
      work(controller.signal).then(settle, () => settle(fallback));
    } catch {
      settle(fallback);
    }
  });
}

export interface ReloadDoors {
  /** Whether this page's own URL answers now. A throw counts as no; so does an answer after the
   *  signal aborts. */
  probe: (signal: AbortSignal) => Promise<boolean>;
  /** How many graphics are on air on this output now. */
  onAir: () => number;
  /** Reload the page. */
  reload: () => void;
  /** How long the probe may take (default PROBE_MS). */
  probeMs?: number;
}

/** What a reload attempt came to: reloaded, or not because its own URL did not answer in time, or
 *  because something is on air. */
export type ReloadOutcome = 'reloaded' | 'unreachable' | 'on-air';

/** Reload if this page's own URL answers and nothing is on air once it has. */
export async function reloadWhenClear({ probe, onAir, reload, probeMs = PROBE_MS }: ReloadDoors): Promise<ReloadOutcome> {
  // Unreachable counts as no: the caller carries on and asks again later.
  const served = await within(probeMs, probe, false);
  if (!served) return 'unreachable';
  if (onAir() > 0) return 'on-air';
  reload();
  return 'reloaded';
}
