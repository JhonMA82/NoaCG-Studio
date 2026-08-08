// The general "how is the beta going" door: a topbar button and the sheet it opens.
//
// WHY IT IS IN THE TOPBAR rather than behind Settings or a help menu. The brief asks for an
// entry point that is easy to FIND, and the only reliable way to be found is to be visible from
// wherever the person is standing when they get annoyed. It is the least prominent thing on the
// bar - a small labelled button, no colour, no badge - because a feedback prompt that competes
// with the product is a feedback prompt people learn to ignore.
//
// It is entirely optional and never opens itself. Nothing in this product will ever ask "how
// are we doing?" unprompted.

import { useEffect, useRef, useState } from 'react';
import { FeedbackForm } from './FeedbackForm';
import { feedbackAvailable, sendFeedback } from '../../backend/feedback';
import type { FeedbackArea, FeedbackSentiment } from '../../feedback/contract';

/**
 * `area` is not only telemetry: it also NAMES THE INSTANCE. The wizard is a full-screen modal
 * over whichever shell is mounted, so two of these buttons are in the document at once - the
 * wizard's, and the occluded one on Home or in the editor behind it. They are genuinely
 * different doors reporting different areas, so `data-area` lets anything that has to mean one
 * of them say which, instead of leaving a bare test id matching two elements. (Every other
 * control on a shell topbar is duplicated the same way while the wizard is open; this is the
 * one pair that shares an id.)
 */
export function BetaFeedbackButton({ area = 'editor' }: { area?: FeedbackArea }) {
  const [open, setOpen] = useState(false);
  if (!feedbackAvailable()) return null;
  return (
    <>
      <button
        type="button"
        className="fb-open"
        title="Tell us how the beta is going"
        data-testid="beta-feedback-open"
        data-area={area}
        onClick={() => setOpen(true)}
      >
        Feedback
      </button>
      {open && <BetaFeedbackDialog area={area} onClose={() => setOpen(false)} />}
    </>
  );
}

function BetaFeedbackDialog({ area, onClose }: { area: FeedbackArea; onClose: () => void }) {
  // The same backdrop-click guard SaveDialogs documents: a text selection that STARTS in the
  // textarea and releases over the backdrop routes its click to the backdrop, which would
  // discard what the person just wrote.
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (value: { sentiment: FeedbackSentiment; reasons: string[]; message: string }) => {
    void sendFeedback({ kind: 'beta', area, ...value });
  };

  return (
    <div
      className="gallery-backdrop"
      onMouseDown={(event) => { pressedOnBackdrop.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        className="wz-modal fb-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Beta feedback"
        data-testid="beta-feedback-dialog"
        data-area={area}
      >
        {/* THE HEADER RULE (handoff §6): the ✕ is a 32px bordered square, hard right, ALWAYS
            last. This sheet used to carry a labelled "Close" button one gap after the title,
            held there by a `.spacer` div that flexed nowhere — the exact defect §6 names, on
            a dialog the student release now puts in front of its main user. `.gallery-close`
            is the shared shape and `.wz-header` already pushes it. */}
        <div className="wz-header">
          <strong>How is NoaCG Studio working out?</strong>
          <button
            type="button"
            className="gallery-close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            data-testid="beta-feedback-close"
          >
            ✕
          </button>
        </div>
        <div className="fb-body">
          <p className="hint">
            NoaCG Studio is in beta and this goes straight to the person building it. Say as much
            or as little as you like — a thumb on its own is useful.
          </p>
          <FeedbackForm
            kind="beta"
            question="Overall, is it working for you?"
            positiveLabel="Working well"
            negativeLabel="Not really"
            onSubmit={submit}
          />
          <p className="hint fb-privacy">
            Sent with your note: which part of the app you were in, and your account if you are
            signed in. <strong>Not sent:</strong> your graphics, your prompts, your uploads, or
            anything you have typed into the editor.
          </p>
        </div>
      </div>
    </div>
  );
}
