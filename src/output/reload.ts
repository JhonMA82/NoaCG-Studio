// WHEN AN OUTPUT MAY RELOAD ITSELF (docs/CLOUD_PLAYOUT.md §3; issue #757).
//
// An output reloads for what a frame cannot take (./prepare.ts: another stage resolution, a new
// renderer build) and, at boot, for a client chunk it can no longer fetch (./main.ts). Two rules
// hold every time:
//
//   Only once its own URL answers     a reload during an outage would put the browser's error
//                                     page on air.
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

export interface ReloadDoors {
  /** Whether this page's own URL answers now. A throw counts as no. */
  probe: () => Promise<boolean>;
  /** How many graphics are on air on this output now. */
  onAir: () => number;
  /** Reload the page. */
  reload: () => void;
}

/** Reload if this page's own URL answers and nothing is on air once it has; whether it reloads. */
export async function reloadWhenClear({ probe, onAir, reload }: ReloadDoors): Promise<boolean> {
  // Unreachable counts as no: the caller carries on and asks again later.
  const served = await probe().catch(() => false);
  if (!served || onAir() > 0) return false;
  reload();
  return true;
}
