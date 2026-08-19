// TheSportsDB rows -> the NoaCG normalized sports shapes.
//
// THE BOUNDARY THIS FILE EXISTS TO HOLD: everything above it speaks TheSportsDB's vocabulary
// (`strHomeTeam`, `intAwayScore`, `strPostponed`); everything below it speaks NoaCG's. A second
// provider (a timing system, OpenF1, a federation feed) writes its own file next to this one and
// emits the same shapes - nothing downstream changes. That is the whole point of the layer, so
// nothing here may be exported in provider spelling.
//
// Pure: no network, no clock of its own (pass `fetchedAt` when you want the source stamp),
// no imports beyond the error type. Every case below is exercised from a captured fixture in
// scripts/sportsdb.test.mjs.

import { SportsDbError } from './errors.mjs';

export const PROVIDER = 'thesportsdb';

/**
 * The closed set of statuses NoaCG understands. Every provider word maps into one of these, so
 * a graphic binds to `match.status` and never learns that "AP" means "after penalties".
 * `unknown` is honest rather than a guess: the provider genuinely leaves `strStatus` null on
 * a large part of its catalog.
 */
export const EVENT_STATUSES = /** @type {const} */ ([
  'scheduled',
  'live',
  'halftime',
  'finished',
  'postponed',
  'cancelled',
  'unknown',
]);

/**
 * Provider status words seen in the wild, grouped by what they mean to us. Compared
 * upper-cased and trimmed. TheSportsDB carries several sports' conventions in one column, so
 * this list is deliberately generous and the fallback is `unknown`, never a guess.
 */
const STATUS_WORDS = [
  ['finished', ['FT', 'AET', 'AOT', 'AP', 'PEN', 'MATCH FINISHED', 'FINISHED', 'FINAL', 'FULL TIME']],
  ['halftime', ['HT', 'HALF TIME', 'HALFTIME', 'BREAK']],
  [
    'live',
    ['1H', '2H', '3H', 'P1', 'P2', 'P3', 'ET', 'BT', 'PT', 'LIVE', 'IN PLAY', 'IN PROGRESS', 'PLAYING'],
  ],
  ['scheduled', ['NS', 'NOT STARTED', 'TBD', 'SCHEDULED', 'PRE']],
  ['postponed', ['PST', 'POST', 'POSTP', 'POSTPONED', 'SUSP', 'SUSPENDED', 'DELAYED']],
  ['cancelled', ['CANC', 'CANCELLED', 'CANCELED', 'ABD', 'ABANDONED', 'AWD', 'WO']],
];

/** A trimmed string, or null - the provider uses "", null and absent interchangeably. */
function text(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * A score as a NUMBER, or null when the provider has none yet.
 *
 * The provider sends scores as STRINGS ("4") and an unplayed match as null - so a graphic that
 * did `Number(intHomeScore)` would show `0` for a match that has not kicked off, and `NaN` for
 * a walkover. Both are on-air errors, which is why this returns null and the patch layer then
 * writes nothing (productionData.mjs).
 */
export function parseScore(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** An integer field (round, spectators) or null. */
function parseInteger(value) {
  const parsed = parseScore(value);
  return parsed === null ? null : Math.trunc(parsed);
}

/**
 * The kickoff instant as an ISO-8601 UTC string, or null.
 *
 * `strTimestamp` is UTC without a zone marker ("2026-08-23T15:30:00"), so the Z is added rather
 * than letting the runtime read it as local time - the same payload would otherwise mean a
 * different moment in Helsinki than in London.
 */
export function parseStartsAt(raw) {
  const stamp = text(raw?.strTimestamp);
  if (stamp) {
    const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(stamp) ? stamp : `${stamp}Z`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const date = text(raw?.dateEvent);
  if (!date) return null;
  const time = text(raw?.strTime) ?? '00:00:00';
  const parsed = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * The provider's status column plus its postponed flag, mapped into EVENT_STATUSES.
 *
 * Derivation order matters: `strPostponed` is a separate column that stays "yes" while
 * `strStatus` still reads "NS", so the flag wins. When the provider says nothing at all, a
 * played-looking scoreline is read as finished and a future kickoff as scheduled - anything
 * else is `unknown`, which the operator can see and override.
 */
export function deriveStatus(raw, { now } = {}) {
  if (text(raw?.strPostponed)?.toLowerCase() === 'yes') return 'postponed';

  const word = text(raw?.strStatus)?.toUpperCase();
  if (word) {
    for (const [status, words] of STATUS_WORDS) {
      if (words.includes(word)) return status;
    }
    // A bare minute ("45", "67'") is how several sports report a running clock.
    if (/^\d{1,3}'?$/.test(word)) return 'live';
  }

  const hasScore = parseScore(raw?.intHomeScore) !== null || parseScore(raw?.intAwayScore) !== null;
  if (hasScore) return 'finished';

  const startsAt = parseStartsAt(raw);
  if (startsAt && now instanceof Date && !Number.isNaN(now.getTime())) {
    return new Date(startsAt).getTime() > now.getTime() ? 'scheduled' : 'unknown';
  }
  return 'unknown';
}

function sourceStamp(kind, id, { fetchedAt } = {}) {
  const stamp =
    fetchedAt instanceof Date
      ? fetchedAt.toISOString()
      : typeof fetchedAt === 'string' && fetchedAt
        ? fetchedAt
        : null;
  return {
    provider: PROVIDER,
    [kind]: id,
    ...(stamp ? { updatedAt: stamp } : {}),
  };
}

/**
 * One TheSportsDB event row -> a NormalizedSportsEvent.
 *
 * @param {Record<string, unknown>} raw the provider row, exactly as it arrived
 * @param {{ fetchedAt?: Date | string, now?: Date }} [options]
 */
export function normalizeEvent(raw, options = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SportsDbError('malformed', 'An event must be a JSON object');
  }
  const id = text(raw.idEvent);
  if (!id) throw new SportsDbError('malformed', 'An event without an idEvent is not usable');

  return {
    id,
    name: text(raw.strEvent),
    sport: text(raw.strSport),
    league: {
      id: text(raw.idLeague),
      name: text(raw.strLeague),
      badge: text(raw.strLeagueBadge),
    },
    season: text(raw.strSeason),
    round: parseInteger(raw.intRound),
    status: deriveStatus(raw, options),
    /** The provider's own word ("FT", "AP", "2H"), for an operator reading the panel. Never
     *  bind a graphic to this - bind to `status`, whose vocabulary we control. */
    statusLabel: text(raw.strStatus),
    startsAt: parseStartsAt(raw),
    venue: {
      name: text(raw.strVenue),
      city: text(raw.strCity),
      country: text(raw.strCountry),
    },
    home: {
      id: text(raw.idHomeTeam),
      name: text(raw.strHomeTeam),
      score: parseScore(raw.intHomeScore),
      badge: text(raw.strHomeTeamBadge),
    },
    away: {
      id: text(raw.idAwayTeam),
      name: text(raw.strAwayTeam),
      score: parseScore(raw.intAwayScore),
      badge: text(raw.strAwayTeamBadge),
    },
    source: sourceStamp('eventId', id, options),
  };
}

/**
 * One TheSportsDB team row -> a NormalizedSportsTeam.
 *
 * The badge field was renamed provider-side: an EVENT row carries `strHomeTeamBadge`, a TEAM row
 * carries `strBadge`, and older integrations still expect `strTeamBadge`. All three are read
 * here so a stale payload still yields a logo, and the normalized shape has exactly one `badge`.
 */
export function normalizeTeam(raw, options = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SportsDbError('malformed', 'A team must be a JSON object');
  }
  const id = text(raw.idTeam);
  if (!id) throw new SportsDbError('malformed', 'A team without an idTeam is not usable');

  return {
    id,
    name: text(raw.strTeam),
    shortName: text(raw.strTeamShort),
    sport: text(raw.strSport),
    league: {
      id: text(raw.idLeague),
      name: text(raw.strLeague),
    },
    badge: text(raw.strBadge) ?? text(raw.strTeamBadge),
    logo: text(raw.strLogo) ?? text(raw.strTeamLogo),
    country: text(raw.strCountry),
    venue: {
      name: text(raw.strStadium),
      city: text(raw.strLocation),
    },
    source: sourceStamp('teamId', id, options),
  };
}

/** Normalize a list, keeping provider order. A single malformed row fails the whole list on
 *  purpose: a feed that silently drops the row it could not read is worse than one that stops. */
export function normalizeEvents(rows, options = {}) {
  if (!Array.isArray(rows)) throw new SportsDbError('malformed', 'An event list must be an array');
  return rows.map((row) => normalizeEvent(row, options));
}

export function normalizeTeams(rows, options = {}) {
  if (!Array.isArray(rows)) throw new SportsDbError('malformed', 'A team list must be an array');
  return rows.map((row) => normalizeTeam(row, options));
}

/** "Liverpool 4 - 1 Swansea", or the fixture line before a match: a one-line log/preview
 *  summary for humans. Graphics bind to the fields, never to this. */
export function describeEvent(event) {
  const home = event.home.name ?? 'Home';
  const away = event.away.name ?? 'Away';
  const score =
    event.home.score === null && event.away.score === null
      ? 'vs'
      : `${event.home.score ?? '-'} - ${event.away.score ?? '-'}`;
  return `${home} ${score} ${away} (${event.status})`;
}
