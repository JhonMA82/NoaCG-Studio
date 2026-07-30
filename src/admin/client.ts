// The admin page's only way to reach the server.
//
// Two rules it exists to keep. First, every request carries the Supabase access token the
// browser already holds - the admin surface has no credential of its own to steal. Second,
// every failure collapses to one shape: the caller cannot tell a 404 from a 403 because the
// server never sends a 403 (docs/ADMIN.md section 1), and this module does not invent a
// distinction the protocol deliberately lacks.
//
// There is no sign-in flow here on purpose. A sign-in form at /admin would confirm that an
// admin system exists to anyone who typed the URL. The owner signs in through the normal
// app, on the same origin, and then opens this page; with no session, /admin is a 404 and
// stays one.

import { getAccessToken } from '../backend/auth';

export class AdminUnavailable extends Error {
  constructor() {
    super('not found');
    this.name = 'AdminUnavailable';
  }
}

/**
 * Call an admin endpoint. Resolves with the parsed body, or throws AdminUnavailable for
 * anything that is not a success - refused, offline, malformed, unreachable.
 *
 * The single throw type is the point: a caller cannot accidentally branch on "forbidden"
 * versus "missing" and leak the difference into the UI.
 *
 * It deliberately does NOT pre-check for a backend or a token and refuse locally. That
 * would be a second place deciding "may I be here", and a second decision is a second thing
 * that can disagree with the first. The server is the authority; a request with no
 * Authorization header simply gets the same 404 as every other refusal.
 */
export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken().catch(() => null);

  let response: Response;
  try {
    response = await fetch(`/api/admin/${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new AdminUnavailable();
  }

  if (!response.ok) throw new AdminUnavailable();
  try {
    return (await response.json()) as T;
  } catch {
    throw new AdminUnavailable();
  }
}

/** A mutating call. Split out so a handler cannot forget the method and silently GET. */
export async function adminPost<T>(path: string, body: unknown): Promise<T> {
  return adminFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}
