import { useEffect, useMemo, useRef, useState } from 'react';
import { useStorageAlert } from '../../store/storageAlert';
import { formatBytes, measureStorage } from '../../model/storageHealth';
import { storageEstimate } from '../../model/durableStore';
import { useRouter } from '../../app/router';
import { useModalGate } from '../spaceKey';

/**
 * The failed-write dialog (docs/SAVED_CONTENT_MODEL.md §2). Mounted ONCE in App.tsx, because the
 * surface that discovers the failure has usually already closed itself.
 *
 * It says three things, in order: what did not happen, what the storage layer actually reported,
 * and — measured, never guessed — what is taking up the room. Naming the biggest saved graphics
 * by name is the difference between an honest error and a dead end: a user who is told "storage
 * is full" with no candidates has no move except to delete at random.
 *
 * It offers no delete button of its own. Deletion belongs to the surfaces that already own it
 * (Home's library rows, a production's page, the saved-videos modal), each with its own two-step
 * arming; a modal that removed a graphic from under the whole app would be the one destructive
 * control with no context around it.
 */
export default function StorageAlertDialog() {
  const alert = useStorageAlert((s) => s.alert);
  const dismiss = useStorageAlert((s) => s.dismiss);
  useModalGate(!!alert);
  // Measured when the dialog opens, not on every render: the numbers describe the moment the
  // write failed, and re-measuring under the user would make the list move as they read it.
  const report = useMemo(() => (alert ? measureStorage() : null), [alert]);
  const pressedOnBackdrop = useRef(false);

  // How much room the BROWSER says there is. There is no synchronous quota API, so this
  // arrives just after the dialog opens and the sentence below stands without it - a missing
  // estimate is a real answer ("we cannot tell you"), never a number we invent.
  const [room, setRoom] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    if (!alert) return;
    let live = true;
    void storageEstimate().then((e) => {
      if (live) setRoom(e);
    });
    return () => {
      live = false;
    };
  }, [alert]);

  useEffect(() => {
    if (!alert) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alert, dismiss]);

  if (!alert || !report) return null;

  const biggest = report.items.slice(0, 5);
  const goHome = () => {
    dismiss();
    useRouter.getState().navigate({ view: 'home', section: 'graphics' });
  };

  return (
    <div
      className="gallery-backdrop"
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) dismiss();
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        className="wz-modal save-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Could not save"
        data-testid="storage-alert"
      >
        <div className="wz-header">
          <h2>Could not save</h2>
          <button className="gallery-close" onClick={dismiss} title="Close">✕</button>
        </div>
        <div className="save-dialog-body">
          <p data-testid="storage-alert-action"><strong>{alert.action}</strong> did not complete.</p>
          <p className="status-bad" data-testid="storage-alert-error">{alert.error}</p>
          {alert.outcome && <p className="hint">{alert.outcome}</p>}

          <p className="hint" data-testid="storage-alert-total">
            Browser storage currently holds {formatBytes(report.totalBytes)} of NoaCG data.
            {room
              ? ` This browser reports ${formatBytes(room.usage)} used of about ${formatBytes(room.quota)} available to this site.`
              : ' This browser will not say how much room is left.'}
          </p>

          {biggest.length > 0 && (
            <>
              <p className="hint">The biggest items — removing one frees that much room:</p>
              <ul className="storage-alert-list" data-testid="storage-alert-items">
                {biggest.map((item) => (
                  <li key={`${item.kind}:${item.name}`}>
                    <span className="storage-alert-name">{item.name}</span>
                    <span className="storage-alert-kind">{item.kind}</span>
                    <span className="storage-alert-bytes">{formatBytes(item.bytes)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="hint">
            Export anything you want to keep before removing it — an exported package is a real
            file on your computer and does not count against this limit.
          </p>

          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={dismiss} data-testid="storage-alert-close">Close</button>
            <button className="primary" onClick={goHome} data-testid="storage-alert-home">
              Open my graphics
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
