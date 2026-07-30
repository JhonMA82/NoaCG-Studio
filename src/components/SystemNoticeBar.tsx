// The maintenance notice, if one is published (docs/ADMIN.md section 7).
//
// Deliberately unobtrusive and dismissible: it is information, not an interruption, and a
// banner that cannot be closed becomes something people stop reading. Dismissal is per
// message, so publishing a NEW notice shows again even to someone who dismissed the last one.
//
// Renders nothing at all when there is no notice, when there is no backend, or when the
// lookup fails - the app must never be worse off for having asked.

import { useEffect, useState } from 'react';
import { loadSystemNotice, type SystemNotice } from '../backend/systemNotice';

const DISMISSED_KEY = 'noacg.notice.dismissed';

export function SystemNoticeBar() {
  const [notice, setNotice] = useState<SystemNotice | null>(null);
  const [dismissed, setDismissed] = useState<string>(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) ?? '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    let cancelled = false;
    void loadSystemNotice().then((state) => {
      if (!cancelled) setNotice(state.notice);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!notice || notice.message === dismissed) return null;

  return (
    <div className={`system-notice system-notice-${notice.level}`} role="status">
      <span>{notice.message}</span>
      <button
        type="button"
        aria-label="Dismiss this notice"
        onClick={() => {
          setDismissed(notice.message);
          try {
            localStorage.setItem(DISMISSED_KEY, notice.message);
          } catch {
            // A full or blocked storage quota is not a reason to keep the banner up.
          }
        }}
      >
        ✕
      </button>
    </div>
  );
}
