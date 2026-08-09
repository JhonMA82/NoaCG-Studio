import { create } from 'zustand';

/**
 * Tiny UI store for the on-demand sign-in dialog. Any feature gate (topbar button, AI panel,
 * community, publish) calls openSignIn(reason) and the dialog opens over the app — the app itself
 * is never walled. The optional reason line tells the user WHY they are being asked to sign in.
 */
interface AuthUiStore {
  signInOpen: boolean;
  /** One short sentence shown under the logo, e.g. "Sign in to browse the community gallery." */
  reason: string | null;
  /**
   * Which half of the dialog the caller asked for. A gate whose answer is "make a free account"
   * (the AI door for a student who has none) opens on 'signup', so the account it just described
   * is one form away rather than one toggle plus one form. Everything else keeps 'signin'.
   */
  intent: 'signin' | 'signup';
  openSignIn: (reason?: string, intent?: 'signin' | 'signup') => void;
  closeSignIn: () => void;
}

export const useAuthUi = create<AuthUiStore>((set) => ({
  signInOpen: false,
  reason: null,
  intent: 'signin',
  openSignIn: (reason, intent) =>
    set({ signInOpen: true, reason: reason ?? null, intent: intent ?? 'signin' }),
  closeSignIn: () => set({ signInOpen: false, reason: null, intent: 'signin' }),
}));
