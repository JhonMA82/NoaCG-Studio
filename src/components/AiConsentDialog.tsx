// The first-use AI disclosure notice (docs/AI_PLATFORM_PLAN.md §9, ratified decision 2).
// Surfaces that send content to an external AI provider gate their call through
// useAiConsent().ensureAiConsent() - it resolves true immediately once the current notice
// version is accepted (locally, or on the signed-in user's server record), and otherwise
// opens this dialog and resolves with the user's answer. The OFFLINE STUB provider never
// gates: nothing leaves the machine, so there is nothing to disclose - callers only invoke
// ensureAiConsent() on a remote path.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AI_NOTICE_ACCEPT_LABEL,
  AI_NOTICE_DECLINE_LABEL,
  AI_NOTICE_LINES,
  AI_NOTICE_TITLE,
} from '../ai/consentNotice';
import { loadNoticeAccepted, noticeAcceptedLocally, recordNoticeAcceptance } from '../ai/consent';
import { useModalGate } from './spaceKey';

function AiConsentDialog({ open, onClose }: { open: boolean; onClose: (accepted: boolean) => void }) {
  // Stays mounted and renders null when closed, so the gate keys on the OPEN state.
  useModalGate(open);
  // Only dismiss on a backdrop click whose press ALSO began on the backdrop (see SaveDialogs).
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="gallery-backdrop"
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) onClose(false);
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        className="wz-modal consent-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={AI_NOTICE_TITLE}
        data-testid="ai-consent"
      >
        <div className="wz-header">
          <h2>{AI_NOTICE_TITLE}</h2>
          <button className="gallery-close" onClick={() => onClose(false)} title="Close">✕</button>
        </div>
        <div className="consent-body">
          <ul className="consent-lines">
            {AI_NOTICE_LINES.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={() => onClose(false)}>{AI_NOTICE_DECLINE_LABEL}</button>
            <button className="primary" data-testid="ai-consent-accept" onClick={() => onClose(true)}>
              {AI_NOTICE_ACCEPT_LABEL}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The first-use acknowledgement retained by AI surfaces that still require it. Create with
 * AI no longer uses this hook: its disclosure contract lives in the public Terms and Privacy
 * Policy linked at account creation. Acceptance here is recorded locally and, when signed in,
 * server-side.
 */
export function useAiConsent(): {
  ensureAiConsent: () => Promise<boolean>;
  consentDialog: ReactNode;
} {
  const [pending, setPending] = useState<((accepted: boolean) => void) | null>(null);

  const ensureAiConsent = useCallback(async (): Promise<boolean> => {
    if (noticeAcceptedLocally()) return true;
    if (await loadNoticeAccepted()) return true;
    return new Promise<boolean>((resolve) => setPending(() => resolve));
  }, []);

  const settle = useCallback((accepted: boolean) => {
    setPending((current: ((accepted: boolean) => void) | null) => {
      current?.(accepted);
      return null;
    });
    if (accepted) void recordNoticeAcceptance();
  }, []);

  return {
    ensureAiConsent,
    consentDialog: <AiConsentDialog open={pending !== null} onClose={settle} />,
  };
}
