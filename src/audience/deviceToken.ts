// THE DEVICE TOKEN — the whole of what the audience plane knows about a viewer.
//
// It is a random string this phone mints for itself and keeps in localStorage. It is not an
// identity: nobody signs in to send a question, nothing is looked up by it, and it is never
// shown to an operator (`audience_list` does not even select the column). It exists for exactly
// three things, all of them in the viewer's own interest:
//   * the per-device submission cap, so one person cannot fill an inbox;
//   * "what I already sent", so the join page can say thanks instead of inviting a double post;
//   * the votes table's primary key, which is what makes changing your mind an upsert rather
//     than a second vote.
//
// **No IP address is stored, hashed or otherwise** (owner decision, 2026-08-07): the use case is
// a classroom or an auditorium behind one NAT, where an IP cap throttles a whole room as if it
// were one abuser while a real spammer switches to mobile data. The defence is this token, the
// database's trigger caps, and — the one that actually decides what airs — operator approval.

const KEY = 'noacg-audience-device';

/** The alphabet and length the database's guard trigger accepts (`^[A-Za-z0-9_-]{8,128}$`). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function mint(): string {
  const bytes = new Uint8Array(16);
  // crypto.getRandomValues is present on every engine that can run this page; the fallback is
  // for a hardened environment that has taken it away, where a weaker token costs a viewer
  // nothing worse than sharing a rate-limit bucket.
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/**
 * This device's token, minted once and reused. A browser with storage blocked (private mode on
 * some engines) gets a fresh token per page load — which costs the viewer only their "what I
 * sent" list, never the ability to take part.
 */
export function deviceToken(): string {
  try {
    const held = localStorage.getItem(KEY);
    if (held && /^[A-Za-z0-9_-]{8,128}$/.test(held)) return held;
    const made = mint();
    localStorage.setItem(KEY, made);
    return made;
  } catch {
    return mint();
  }
}
