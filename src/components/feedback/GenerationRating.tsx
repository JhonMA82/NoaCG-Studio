// The optional rating under an AI result.
//
// It sits at the BOTTOM of the result card, after the readiness rows and the cost line, and it
// blocks nothing: Create project, Refine and Regenerate are all reachable without ever looking
// at it. That placement is the feature - a rating step between a person and their finished
// graphic is a toll, and a toll collects resentment rather than data.
//
// It renders once per generation and resets when the generation changes, so rating a result and
// then regenerating gives a fresh question about the new one rather than a stale "sent" state.

import { useEffect, useState } from 'react';
import { FeedbackForm } from './FeedbackForm';
import { feedbackAvailable, sendFeedback } from '../../backend/feedback';
import type { FeedbackSentiment } from '../../feedback/contract';

interface Props {
  /** The Lite ledger row, when there is one. Only NoaCG Lite writes one and hands it to the
   *  browser - a Pro result, a BYO run and the offline stub have none, and the rating is
   *  offered for all of them anyway. Without it the server simply attaches less context. */
  generationId?: string;
  /** What the browser legitimately knows about its own run. The server prefers the ledger
   *  wherever the ledger has an answer. */
  tier?: 'lite' | 'pro' | 'custom';
  variantId?: string;
}

export function GenerationRating({ generationId, tier, variantId }: Props) {
  // A key that changes with the RESULT, so a new generation gets a new question. Falling back
  // to the variant means a Pro result still resets when the design changes, which is the
  // closest honest approximation available without a ledger id.
  const identity = generationId ?? variantId ?? '';
  const [shown, setShown] = useState(identity);
  useEffect(() => setShown(identity), [identity]);

  // Nowhere to send it on a self-hosted instance with no backend, so nothing is offered. The
  // same rule the auth surfaces follow: an offline build grows no UI that cannot work.
  if (!feedbackAvailable()) return null;

  const submit = (value: { sentiment: FeedbackSentiment; reasons: string[]; message: string }) => {
    void sendFeedback({
      kind: 'generation',
      area: 'wizard',
      generationId,
      tier,
      variantId,
      ...value,
    });
  };

  return (
    <div className="fb-inline" key={shown} data-testid="generation-rating">
      <FeedbackForm
        kind="generation"
        question="Is this graphic any good?"
        positiveLabel="Good"
        negativeLabel="Not good"
        onSubmit={submit}
        acknowledgement="Thanks — logged against this generation."
      />
    </div>
  );
}
