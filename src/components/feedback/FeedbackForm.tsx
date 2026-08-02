// The body both feedback surfaces share: pick a sentiment, optionally say why.
//
// THE ONE RULE THE SHAPE FOLLOWS: nothing after the first click is required. The two buttons
// ARE the submission - pressing one sends immediately - and the reason picker plus the text box
// appear afterwards as an OFFER, never as a step between the click and the send. A person who
// clicks and walks away has already told us something useful; a person who wants to explain
// finds the box already open.
//
// The reasons only appear on a NEGATIVE rating, and that is not laziness about praise. A
// complaint is actionable and needs a category to be findable in the inbox; a compliment is
// already complete at "this was good", and asking why would turn the cheap half of the flow
// into the expensive one.

import { useState } from 'react';
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_REASON_LABELS,
  reasonsFor,
  type FeedbackKind,
  type FeedbackSentiment,
} from '../../feedback/contract';

export interface FeedbackFormProps {
  kind: FeedbackKind;
  /** Wording above the two buttons. The surfaces ask different questions of the same shape. */
  question: string;
  positiveLabel: string;
  negativeLabel: string;
  /** Called on the FIRST click and again on every later change, so an abandoned explanation is
   *  never lost - the rating landed the moment it was given. */
  onSubmit: (value: { sentiment: FeedbackSentiment; reasons: string[]; message: string }) => void;
  /** Shown once something has been sent. */
  acknowledgement?: string;
}

export function FeedbackForm({
  kind,
  question,
  positiveLabel,
  negativeLabel,
  onSubmit,
  acknowledgement = 'Thanks — that helps.',
}: FeedbackFormProps) {
  const [sentiment, setSentiment] = useState<FeedbackSentiment | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [sentDetail, setSentDetail] = useState(false);

  const rate = (next: FeedbackSentiment) => {
    setSentiment(next);
    // Sent on the click, before any reason exists. A rating that waited for a "submit" would
    // collect only from the people who were going to write a paragraph anyway.
    onSubmit({ sentiment: next, reasons: [], message: '' });
    setReasons([]);
    setMessage('');
    setSentDetail(false);
  };

  const toggleReason = (reason: string) => {
    const next = reasons.includes(reason) ? reasons.filter((value) => value !== reason) : [...reasons, reason];
    setReasons(next);
    if (sentiment) onSubmit({ sentiment, reasons: next, message });
  };

  const sendMessage = () => {
    if (!sentiment) return;
    onSubmit({ sentiment, reasons, message: message.trim() });
    setSentDetail(true);
  };

  return (
    <div className="fb-form" data-testid={`feedback-form-${kind}`}>
      <p className="fb-question">{question}</p>
      <div className="fb-choice" role="group" aria-label={question}>
        <button
          type="button"
          className={sentiment === 'positive' ? 'fb-pick active' : 'fb-pick'}
          aria-pressed={sentiment === 'positive'}
          data-testid="feedback-positive"
          onClick={() => rate('positive')}
        >
          <span aria-hidden="true">👍</span> {positiveLabel}
        </button>
        <button
          type="button"
          className={sentiment === 'negative' ? 'fb-pick active' : 'fb-pick'}
          aria-pressed={sentiment === 'negative'}
          data-testid="feedback-negative"
          onClick={() => rate('negative')}
        >
          <span aria-hidden="true">👎</span> {negativeLabel}
        </button>
      </div>

      {sentiment === 'positive' && (
        <p className="fb-ack" role="status" data-testid="feedback-ack">{acknowledgement}</p>
      )}

      {sentiment === 'negative' && (
        <div className="fb-why" data-testid="feedback-why">
          <p className="fb-ack" role="status">
            {acknowledgement} <span className="hint">Anything more is optional.</span>
          </p>
          <div className="fb-reasons">
            {reasonsFor(kind).map((reason) => (
              <button
                type="button"
                key={reason}
                className={reasons.includes(reason) ? 'fb-reason active' : 'fb-reason'}
                aria-pressed={reasons.includes(reason)}
                data-testid={`feedback-reason-${reason}`}
                onClick={() => toggleReason(reason)}
              >
                {FEEDBACK_REASON_LABELS[reason] ?? reason}
              </button>
            ))}
          </div>
          <textarea
            className="fb-message"
            rows={3}
            maxLength={FEEDBACK_MESSAGE_MAX}
            placeholder="What went wrong? (optional)"
            aria-label="What went wrong"
            data-testid="feedback-message"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setSentDetail(false);
            }}
          />
          <div className="fb-send">
            <button
              type="button"
              className="primary"
              disabled={message.trim().length === 0 || sentDetail}
              data-testid="feedback-send"
              onClick={sendMessage}
            >
              {sentDetail ? 'Sent' : 'Send'}
            </button>
            <span className="hint">
              {message.length}/{FEEDBACK_MESSAGE_MAX}. We see what you write here, the graphic
              type and which model produced it — never your brief or your uploads.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
