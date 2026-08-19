// The Production Data ADAPTER BOUNDARY - the last file on the SportsDB side.
//
// ============================================================================================
// BLOCKED INTEGRATION POINT
// ---------------------------------------------------------------------------------------------
// The finished shape of this connector is:
//
//     const event = await source.event(id);            // done, in source.mjs
//     const patch = eventToProductionData(event);      // done, below
//     await productionData.patch(productionId, patch); // NOT DONE - not ours to build
//
// The third line needs the production-data write path, which is being built in another worktree
// and has landed by HALVES. The database half is on main: migration
// 0048_production_data_tree.sql carries `control_data_patch(p_key, p_patch)` - RFC 7386 merge,
// bindings resolved and diffed in one locked transaction, authorized by the same per-production
// data key. The HTTP half is NOT: `api/data/[...path].ts` still routes `update` and nothing
// else, so no caller outside the database can reach that RPC yet.
//
// Wiring a stand-in here (a direct service-role call, a second endpoint) would be the second
// production-data ingress - the thing this connector exists NOT to become.
//
// So this file stops at the patch OBJECT. `resolveWriteTarget('patch')` reports the dependency
// instead of faking it, and the transitional path below drives the SHIPPED graphic-addressed
// API (`POST /api/data/update`, docs/DATA_API.md) so the connector is demonstrable today.
// When the contract lands, the wiring is one call.
// ============================================================================================
//
// Everything here is pure. No fetch, no process, no clock.

/**
 * Where the connector's data hangs in the production's tree.
 *
 * `match` rather than `sports.event` on purpose: the production-data work writes its worked
 * examples as `match.home.score`, and migration 0048_production_data_tree.sql resolves exactly
 * that grammar - a connector that invents a parallel vocabulary makes every one of those
 * bindings wrong. It is a single option because a production running two matches at once needs
 * two roots (`matchA`, `matchB`), which costs one flag, not a framework.
 */
export const DEFAULT_ROOT = 'match';

/** Drop null/undefined leaves and any object left empty by that, recursively.
 *
 *  This is what makes "no score yet" behave: an unresolvable path writes nothing (migration
 *  0048's `production_data_resolve` contributes no row for one), whereas a null in an RFC 7386
 *  patch would DELETE the key. Sending neither is the honest option - the graphic keeps its
 *  authored default until a real value arrives, and an operator's manual value is not wiped by
 *  a feed that knows nothing. */
export function pruneEmpty(value) {
  if (Array.isArray(value)) return value;
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === null || child === undefined) continue;
    const pruned = pruneEmpty(child);
    if (pruned === null || pruned === undefined) continue;
    if (typeof pruned === 'object' && !Array.isArray(pruned) && Object.keys(pruned).length === 0) continue;
    out[key] = pruned;
  }
  return out;
}

/**
 * A normalized event -> the production-data patch a production would merge.
 *
 * The shape mirrors the normalized event exactly, minus the fields no graphic has a use for
 * (the provider's own status word, the event's own name). One shape, so a binding path can be
 * read straight off the normalized object an operator is looking at.
 *
 * @param {ReturnType<import('./normalize.mjs').normalizeEvent>} event
 * @param {{ root?: string, includeSource?: boolean }} [options]
 */
export function eventToProductionData(event, { root = DEFAULT_ROOT, includeSource = true } = {}) {
  const tree = {
    id: event.id,
    sport: event.sport,
    league: { name: event.league?.name ?? null, badge: event.league?.badge ?? null },
    season: event.season,
    round: event.round,
    status: event.status,
    startsAt: event.startsAt,
    venue: event.venue?.name ?? null,
    city: event.venue?.city ?? null,
    country: event.venue?.country ?? null,
    home: { name: event.home?.name ?? null, score: event.home?.score ?? null, logo: event.home?.badge ?? null },
    away: { name: event.away?.name ?? null, score: event.away?.score ?? null, logo: event.away?.badge ?? null },
    // Kept small on purpose: a production's data tree is the operator's surface, and provider
    // bookkeeping must not dominate it. Three keys, all of which answer a real question -
    // "where did this come from, which record, and how stale is it".
    ...(includeSource ? { source: event.source } : {}),
  };
  return { [root]: pruneEmpty(tree) };
}

/**
 * A normalized team -> a patch, for the pre-match/team-information use case.
 * @param {ReturnType<import('./normalize.mjs').normalizeTeam>} team
 */
export function teamToProductionData(team, { root = 'team', includeSource = true } = {}) {
  const tree = {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    sport: team.sport,
    league: team.league?.name ?? null,
    logo: team.badge ?? team.logo ?? null,
    country: team.country,
    venue: team.venue?.name ?? null,
    ...(includeSource ? { source: team.source } : {}),
  };
  return { [root]: pruneEmpty(tree) };
}

/**
 * A patch object -> its leaf paths, in the dot grammar the production-data resolver walks
 * (`match.home.score`, `drivers.0.gap` - migration 0048).
 * Useful for printing what a fetch would write, and for the binding picker later.
 */
export function flattenPatch(patch, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenPatch(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

/**
 * TRANSITIONAL. A normalized event -> the field LABELS the shipped Data API writes by
 * (docs/DATA_API.md, "Field-label mapping").
 *
 * This exists because no HTTP verb reaches the production-data patch yet, and a connector
 * nobody can run is not evidence of anything. It is label-addressed, never graphic-addressed: the connector still has
 * no idea which graphic is on air (the operator names that with `--graphic`), and it contains no
 * template id anywhere. `Team A`/`Score A` are the scoreboard family's own field titles
 * (src/templates/scoreboards/shared.ts); the home/away aliases let the same payload land on
 * packs that name their fields that way. Labels that match nothing come back in the API's
 * `ignored` list, which is a report, not an error.
 *
 * DELETE THIS FUNCTION once `PATCH /api/data` exists - the patch object above is the real
 * contract, and this map is the only place in the connector that mentions field titles at all.
 */
export function eventToFieldLabels(event) {
  const values = {};
  const put = (label, value) => {
    if (value !== null && value !== undefined && value !== '') values[label] = value;
  };
  put('Team A', event.home?.name);
  put('Team B', event.away?.name);
  put('Score A', event.home?.score);
  put('Score B', event.away?.score);
  put('Home Team', event.home?.name);
  put('Away Team', event.away?.name);
  put('Home Score', event.home?.score);
  put('Away Score', event.away?.score);
  put('League', event.league?.name);
  put('Competition', event.league?.name);
  put('Status', event.status);
  put('Venue', event.venue?.name);
  return values;
}

/**
 * What a writer can actually do today.
 *
 * `update` is the shipped, graphic-addressed endpoint. `patch` is the production-data write the
 * other worktree owns: this reports it as unavailable rather than guessing at a URL, so the day
 * it lands the only change here is `supported: true` and the real path.
 *
 * @param {'update' | 'patch'} mode
 */
export function resolveWriteTarget(mode = 'update') {
  if (mode === 'update') {
    return {
      mode: 'update',
      supported: true,
      endpoint: '/api/data/update',
      method: 'POST',
      addressing: 'graphic + field labels',
      note: 'The shipped Data API (docs/DATA_API.md). Transitional for this connector.',
    };
  }
  if (mode === 'patch') {
    return {
      mode: 'patch',
      supported: false,
      endpoint: null,
      method: null,
      addressing: 'production data paths',
      reason:
        'BLOCKED: the production-data write has landed by halves. The database half is on main ' +
        '(migration 0048, control_data_patch), but no HTTP verb reaches it yet - api/data ' +
        'routes update only. The connector produces the patch object already; only the ' +
        'call is missing.',
    };
  }
  return {
    mode,
    supported: false,
    endpoint: null,
    method: null,
    reason: `Unknown write target "${mode}" - use "update" or "patch".`,
  };
}
