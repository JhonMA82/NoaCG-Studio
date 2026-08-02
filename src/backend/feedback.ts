// Sending feedback. One function, and everything about it is best-effort.
//
// The rule this file exists to hold: NOTHING ON THIS PATH MAY EVER SURFACE. A person who just
// told us their graphic was unusable must not then be shown an error - the flow is optional and
// one click deep, and a failure in it converts somebody willing to help into somebody who will
// not bother again. The endpoint answers `{ recorded: true }` to a dropped submission for the
// same reason, so there is nothing here to branch on either.
//
// It is also inert where there is nowhere to send: a self-hosted instance with no Supabase
// configuration has no feedback inbox, so `feedbackAvailable()` is false and the UI does not
// render the entry point at all. That mirrors the auth posture (root AGENTS.md) - an offline
// build grows no surface that cannot work.

import { isBackendConfigured } from './config';
import { getAccessToken } from './auth';
import { currentVisitorId } from './events';
import type { FeedbackSubmission } from '../feedback/contract';

/** Whether this deployment can accept feedback at all. The UI asks before offering. */
export function feedbackAvailable(): boolean {
  return isBackendConfigured();
}

/**
 * Send one submission. Resolves when the attempt is over, never rejects, and tells the caller
 * nothing about whether the server kept it.
 *
 * The caller awaits it only so the UI can stop showing a spinner - the acknowledgement a user
 * sees ("thanks") is honest about what happened locally, not a claim about the database.
 */
export async function sendFeedback(submission: FeedbackSubmission): Promise<void> {
  if (!feedbackAvailable()) return;
  try {
    // The account, when there is one, comes from the TOKEN on the server side; the body never
    // carries an identity. The visitor id is read, never minted (src/backend/events.ts), so
    // feedback cannot create a tracking identifier for somebody who had none.
    const token = await getAccessToken().catch(() => null);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    await fetch('/api/me/feedback', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...submission, visitorId: currentVisitorId() ?? undefined }),
      keepalive: true,
    });
  } catch {
    /* offline, blocked, or refused - the note is lost and the person is never told */
  }
}
