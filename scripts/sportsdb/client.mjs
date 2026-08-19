// The TheSportsDB HTTP layer: URLs, the key, timeouts, and the provider's error shapes.
//
// This module knows the PROVIDER and nothing else. It returns TheSportsDB's own JSON rows
// untouched - normalizing them is normalize.mjs's job, and putting the two in one file is how
// provider vocabulary leaks into the rest of a product. Nothing here imports from the app.
//
// Verified against the live V1 API on 2026-08-19 (docs/SPORTSDB.md records the walk):
//   - V1 base is https://www.thesportsdb.com/api/v1/json/<key>/<endpoint>.php?<query>
//   - the free/test key is the literal `123` and is PUBLIC - it is documentation, not a secret
//   - V2 (livescores, header auth) is premium-only and deliberately NOT implemented here
//   - the envelope key differs per endpoint: `events`, `event`, `results` or `teams`
//   - "nothing found" is HTTP 200 with the envelope null or empty, never a 404
//
// The `fetch` implementation is injectable so every test in scripts/sportsdb.test.mjs runs
// offline against the captured fixtures - no test in this repo may need the internet.

import { SportsDbError } from './errors.mjs';

export const SPORTSDB_V1_BASE = 'https://www.thesportsdb.com/api/v1/json';

/** TheSportsDB's public test key. Published on their own docs page, rate limited to 30
 *  requests/minute and capped at one result per query - fine for development and demos. */
export const SPORTSDB_TEST_KEY = '123';

/** The environment variable a premium key is read from. Server/CLI only: it must never take a
 *  VITE_ prefix, or it would be bundled into the browser (scripts/check-client-secrets.mjs). */
export const SPORTSDB_KEY_ENV = 'THESPORTSDB_API_KEY';

/**
 * The key to use, preferring an explicit one, then the environment, then the public test key.
 * @param {{ key?: string, env?: Record<string, string | undefined> }} [options]
 */
export function resolveApiKey({ key, env = process.env } = {}) {
  const explicit = (key ?? '').trim();
  if (explicit) return explicit;
  const fromEnv = (env?.[SPORTSDB_KEY_ENV] ?? '').trim();
  return fromEnv || SPORTSDB_TEST_KEY;
}

/** True when the key in use is the public test key - the callers that print a warning need it. */
export function isTestKey(key) {
  return key === SPORTSDB_TEST_KEY;
}

function requireArg(value, what) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (!text) throw new SportsDbError('invalid', `${what} is required`);
  return text;
}

/** The provider takes ISO dates on eventsday.php; anything else silently answers nothing. */
function requireIsoDate(value) {
  const text = requireArg(value, 'A date (YYYY-MM-DD)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new SportsDbError('invalid', `Date must be YYYY-MM-DD, got "${text}"`);
  }
  return text;
}

/**
 * Pull the rows out of whichever envelope this endpoint uses.
 *
 * The provider answers 200 with a null or empty envelope when it holds no such record, so this
 * is where an empty result is RECOGNISED - the HTTP status never says it.
 */
function rowsFromEnvelope(payload, keys, endpoint) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SportsDbError('malformed', `${endpoint} answered something that is not a JSON object`, {
      endpoint,
    });
  }
  const key = keys.find((candidate) => candidate in payload);
  if (key === undefined) {
    throw new SportsDbError(
      'malformed',
      `${endpoint} answered without any of the expected keys (${keys.join(', ')})`,
      { endpoint },
    );
  }
  const rows = payload[key];
  if (rows === null || rows === undefined) return [];
  if (!Array.isArray(rows)) {
    throw new SportsDbError('malformed', `${endpoint} answered a "${key}" that is not a list`, {
      endpoint,
    });
  }
  return rows;
}

/**
 * Create a client bound to one key and one fetch implementation.
 *
 * @param {{
 *   key?: string,
 *   baseUrl?: string,
 *   fetch?: typeof globalThis.fetch,
 *   timeoutMs?: number,
 *   env?: Record<string, string | undefined>,
 * }} [options]
 */
export function createSportsDbClient(options = {}) {
  const key = resolveApiKey(options);
  const baseUrl = (options.baseUrl ?? SPORTSDB_V1_BASE).replace(/\/$/, '');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10000;

  if (typeof fetchImpl !== 'function') {
    throw new SportsDbError('invalid', 'No fetch implementation available');
  }

  /** The request URL. The key is a PATH segment on V1, which is why it must never be logged. */
  function urlFor(endpoint, params = {}) {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && String(value) !== '') query.set(name, String(value));
    }
    const search = query.toString();
    return `${baseUrl}/${key}/${endpoint}${search ? `?${search}` : ''}`;
  }

  /** One request: HTTP, JSON, envelope. Returns the provider's own rows, untouched. */
  async function request(endpoint, params, envelopeKeys) {
    const url = urlFor(endpoint, params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
    } catch (cause) {
      const aborted = Boolean(cause && (cause.name === 'AbortError' || controller.signal.aborted));
      throw new SportsDbError(
        aborted ? 'timeout' : 'unavailable',
        aborted
          ? `TheSportsDB did not answer ${endpoint} within ${timeoutMs} ms`
          : `TheSportsDB could not be reached for ${endpoint}`,
        { endpoint, cause },
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new SportsDbError('unauthorized', 'TheSportsDB refused the API key', {
        status: response.status,
        endpoint,
      });
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers?.get?.('retry-after')) || 60;
      throw new SportsDbError('rate_limited', 'TheSportsDB rate limit reached', {
        status: response.status,
        retryAfter,
        endpoint,
      });
    }
    if (response.status === 404) {
      throw new SportsDbError('not_found', `TheSportsDB has no endpoint ${endpoint}`, {
        status: response.status,
        endpoint,
      });
    }
    if (!response.ok) {
      throw new SportsDbError('unavailable', `TheSportsDB answered ${response.status} for ${endpoint}`, {
        status: response.status,
        endpoint,
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (cause) {
      // An HTML error page or a truncated body: a provider fault, never data.
      throw new SportsDbError('malformed', `${endpoint} answered a body that is not JSON`, {
        endpoint,
        cause,
      });
    }
    return rowsFromEnvelope(payload, envelopeKeys, endpoint);
  }

  /** The rows, or a `not_found` error - for the lookups where "no rows" IS the failure. */
  async function requireRows(endpoint, params, envelopeKeys, missing) {
    const rows = await request(endpoint, params, envelopeKeys);
    if (rows.length === 0) throw new SportsDbError('not_found', missing, { endpoint });
    return rows;
  }

  return {
    key,
    baseUrl,
    urlFor,
    request,

    /** One event by its provider id. `lookupevent.php?id=441613` */
    async lookupEvent(eventId) {
      const id = requireArg(eventId, 'An event id');
      const rows = await requireRows('lookupevent.php', { id }, ['events'], `No event ${id}`);
      return rows[0];
    },

    /** Teams whose name matches. `searchteams.php?t=Arsenal` (the free key answers ONE). */
    async searchTeams(name) {
      const t = requireArg(name, 'A team name');
      return request('searchteams.php', { t }, ['teams']);
    },

    /** One team by its provider id. `lookupteam.php?id=133604` */
    async lookupTeam(teamId) {
      const id = requireArg(teamId, 'A team id');
      const rows = await requireRows('lookupteam.php', { id }, ['teams'], `No team ${id}`);
      return rows[0];
    },

    /** A team's most recent finished events. `eventslast.php?id=133602` - envelope `results`. */
    async teamLastEvents(teamId) {
      const id = requireArg(teamId, 'A team id');
      return request('eventslast.php', { id }, ['results', 'events']);
    },

    /** A team's upcoming events. `eventsnext.php?id=133602` */
    async teamNextEvents(teamId) {
      const id = requireArg(teamId, 'A team id');
      return request('eventsnext.php', { id }, ['events', 'results']);
    },

    /**
     * Everything on one calendar day, optionally narrowed to a sport or a league.
     * `eventsday.php?d=2026-05-24&s=Ice%20Hockey`
     */
    async eventsOnDay(date, { sport, league } = {}) {
      const d = requireIsoDate(date);
      return request('eventsday.php', { d, s: sport, l: league }, ['events']);
    },

    /** One league by its provider id. `lookupleague.php?id=4328` */
    async lookupLeague(leagueId) {
      const id = requireArg(leagueId, 'A league id');
      const rows = await requireRows('lookupleague.php', { id }, ['leagues'], `No league ${id}`);
      return rows[0];
    },
  };
}
