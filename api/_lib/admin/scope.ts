// WHOSE ACTIVITY IS THIS SECTION COUNTING? One vocabulary, read the same way by every handler
// that reports usage (docs/ADMIN.md §8).
//
// The problem it solves was measured before it was written: on this instance every AI figure on
// the dashboard was a figure about the operator. All 43 rows in `ai_generations`, 92 of 93
// gateway calls, all three renders and four of six creates came from accounts belonging to the
// person reading the page. A dashboard that cannot tell its owner from its users cannot answer
// the question it exists for.
//
// EXTERNAL IS THE DEFAULT, deliberately. The operator's own testing is the noise and everybody
// else is the signal, so the page opens on the signal. `internal` is the exact complement, kept
// because the owner still needs to inspect their own activity when debugging, and `all` is what
// these endpoints returned before the scope existed. External and internal partition all - the
// property migration 0027's self-check asserts against the live tables.
//
// AN UNKNOWN VALUE FALLS BACK TO EXTERNAL rather than raising. This is a query parameter on a
// read-only page, so the useful behaviour is the page rendering its default view; and the
// fallback direction is the safe one - external can only ever show FEWER rows than the caller
// might have meant, never more. The SQL guard raises instead (`public.admin_scope`), because by
// the time a value reaches the database it came from this file rather than from a URL.

import { ADMIN_ACTIVITY_SCOPES, type AdminActivityScope } from '../../../src/admin/types.js';

export const DEFAULT_SCOPE: AdminActivityScope = 'external';

export function readScope(req: Request): AdminActivityScope {
  const value = new URL(req.url).searchParams.get('scope');
  return (ADMIN_ACTIVITY_SCOPES as readonly string[]).includes(value ?? '')
    ? (value as AdminActivityScope)
    : DEFAULT_SCOPE;
}

/**
 * Does a row belong in this scope, given whether its account is internal?
 *
 * The JavaScript twin of the predicate migration 0027 repeats in SQL, and it exists because two
 * admin sections aggregate in two different places: the overview counts in the database, while
 * Usage and cost reads `ai_generations` straight through PostgREST and classifies here
 * (docs/ADMIN.md §6). That split has already produced one disagreement between two sections
 * reading one ledger - `0026` corrected the overview's failure and spend rules and could not
 * reach `usage.ts`, so production showed 26 failures beside 19 for a day. One exported function
 * is the smallest thing that stops the scope repeating it.
 */
export function inScope(scope: AdminActivityScope, internal: boolean): boolean {
  return scope === 'all' || internal === (scope === 'internal');
}
