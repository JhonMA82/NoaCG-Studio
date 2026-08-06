// THE "it did not save" announcement. A failed write to browser storage must never be swallowed:
// the acceptance pass of 2026-08-06 found "add to production" returning early on a full quota,
// leaving the user parked in the editor with no production, no graphic and nothing said.
//
// It lives in its own module store (not in a component) for the same reason ExportWindow's does:
// the surface that DISCOVERS the failure is often already unmounting — the wizard closes itself
// the moment a create replaces the route — so the message has to outlive it. The dialog mounts
// once in App.tsx, beside the routed surface.

import { create } from 'zustand';

export interface StorageAlert {
  /** What the user was trying to do, in their words: "Add “Clean Clock” to a production". */
  action: string;
  /** The failure as the storage layer reported it — never paraphrased away. */
  error: string;
  /** What actually happened to the work, so the user knows where it is. */
  outcome?: string;
}

interface StorageAlertState {
  alert: StorageAlert | null;
  raise: (alert: StorageAlert) => void;
  dismiss: () => void;
}

export const useStorageAlert = create<StorageAlertState>((set) => ({
  alert: null,
  raise: (alert) => set({ alert }),
  dismiss: () => set({ alert: null }),
}));

/** Raise from a non-React caller (the wizard's create handlers run outside render). */
export function raiseStorageAlert(alert: StorageAlert): void {
  useStorageAlert.getState().raise(alert);
}
