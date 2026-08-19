// Unit tests for the TheSportsDB connector (scripts/sportsdb/, docs/SPORTSDB.md).
//
// These run in the BUILD GATE rather than in Playwright because there is no browser in the
// question: the connector is JSON in, normalized data out. Every test reads a CAPTURED fixture
// and an injected fetch - NOTHING here touches the network, so the suite is identical on a
// laptop, in CI and on a plane, and a provider outage can never turn the build red.
//
// The fixtures are real responses recorded on 2026-08-19 with the public test key; their
// provenance is scripts/sportsdb/fixtures/SOURCES.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createSportsDbClient, resolveApiKey, SPORTSDB_TEST_KEY } from './sportsdb/client.mjs';
import { SportsDbError, isTransient } from './sportsdb/errors.mjs';
import {
  deriveStatus,
  describeEvent,
  normalizeEvent,
  normalizeEvents,
  normalizeTeam,
  parseScore,
  parseStartsAt,
} from './sportsdb/normalize.mjs';
import {
  eventToFieldLabels,
  eventToProductionData,
  flattenPatch,
  resolveWriteTarget,
  teamToProductionData,
} from './sportsdb/productionData.mjs';
import { createSportsDbSource } from './sportsdb/source.mjs';

function fixture(name) {
  const url = new URL(`./sportsdb/fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
}

const FINISHED_SOCCER = fixture('lookupevent-finished-soccer.json');
const LIVE_HOCKEY = fixture('lookupevent-live-icehockey.json');
const UPCOMING_SOCCER = fixture('eventsnext-team-soccer.json');
const LAST_SOCCER = fixture('eventslast-team-soccer.json');
const DAY_HOCKEY = fixture('eventsday-icehockey.json');
const TEAM_ARSENAL = fixture('searchteams-arsenal.json');
const NOT_FOUND = fixture('lookupevent-not-found.json');

/** A fetch stand-in. `routes` maps a substring of the URL to what the provider answers. */
function stubFetch(routes, { status = 200, headers = {}, body } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const match = Object.entries(routes).find(([fragment]) => url.includes(fragment));
    const payload = match ? match[1] : body;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      json: async () => {
        if (typeof payload === 'string') return JSON.parse(payload); // throws like a real body would
        return payload;
      },
    };
  };
  impl.calls = calls;
  return impl;
}

function clientWith(fetchImpl, options = {}) {
  return createSportsDbClient({ key: 'test-key', fetch: fetchImpl, ...options });
}

// ── The client: URLs, envelopes, failures ───────────────────────────────────

test('the key is a path segment and the query carries the parameters', async () => {
  const client = clientWith(stubFetch({ 'lookupevent.php': FINISHED_SOCCER }));
  assert.equal(
    client.urlFor('lookupevent.php', { id: '441613' }),
    'https://www.thesportsdb.com/api/v1/json/test-key/lookupevent.php?id=441613',
  );
  // Empty parameters are dropped rather than sent as "s=" - the provider treats those as filters.
  assert.equal(
    client.urlFor('eventsday.php', { d: '2026-05-24', s: '', l: undefined }),
    'https://www.thesportsdb.com/api/v1/json/test-key/eventsday.php?d=2026-05-24',
  );
});

test('an explicit key wins, then the environment, then the public test key', () => {
  assert.equal(resolveApiKey({ key: 'mine', env: { THESPORTSDB_API_KEY: 'env' } }), 'mine');
  assert.equal(resolveApiKey({ env: { THESPORTSDB_API_KEY: 'env' } }), 'env');
  assert.equal(resolveApiKey({ env: {} }), SPORTSDB_TEST_KEY);
});

test('each endpoint reads its own envelope key', async () => {
  const client = clientWith(
    stubFetch({
      'lookupevent.php': FINISHED_SOCCER, // { events: [...] }
      'eventslast.php': LAST_SOCCER, //      { results: [...] }
      'searchteams.php': TEAM_ARSENAL, //    { teams: [...] }
      'eventsday.php': DAY_HOCKEY, //        { events: [...] }
    }),
  );
  assert.equal((await client.lookupEvent('441613')).idEvent, '441613');
  assert.equal((await client.teamLastEvents('133602')).length, 1);
  assert.equal((await client.searchTeams('Arsenal'))[0].strTeam, 'Arsenal');
  assert.equal((await client.eventsOnDay('2026-05-24', { sport: 'Ice Hockey' })).length, 3);
});

test('an unknown event is not_found even though the provider answers 200', async () => {
  const client = clientWith(stubFetch({ 'lookupevent.php': NOT_FOUND }));
  await assert.rejects(client.lookupEvent('999999999'), (err) => {
    assert.ok(err instanceof SportsDbError);
    assert.equal(err.code, 'not_found');
    return true;
  });
});

test('a search that matches nothing is an empty list, not an error', async () => {
  const client = clientWith(stubFetch({ 'searchteams.php': { teams: null } }));
  assert.deepEqual(await client.searchTeams('Nobody FC'), []);
});

test('a refused key, a rate limit, a server fault and a timeout each have their own code', async () => {
  const unauthorized = clientWith(stubFetch({}, { status: 401 }));
  await assert.rejects(unauthorized.lookupEvent('1'), (err) => err.code === 'unauthorized');

  const limited = clientWith(stubFetch({}, { status: 429, headers: { 'retry-after': '30' } }));
  await assert.rejects(limited.lookupEvent('1'), (err) => {
    assert.equal(err.code, 'rate_limited');
    assert.equal(err.retryAfter, 30);
    assert.ok(isTransient(err));
    return true;
  });

  const down = clientWith(stubFetch({}, { status: 503 }));
  await assert.rejects(down.lookupEvent('1'), (err) => err.code === 'unavailable' && isTransient(err));

  const aborting = clientWith(async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  });
  await assert.rejects(aborting.lookupEvent('1'), (err) => err.code === 'timeout' && isTransient(err));
});

test('an HTML error page is malformed, and is NOT retried as if it were an outage', async () => {
  const client = clientWith(stubFetch({ 'lookupevent.php': '<html>nope</html>' }));
  await assert.rejects(client.lookupEvent('1'), (err) => {
    assert.equal(err.code, 'malformed');
    assert.equal(isTransient(err), false);
    return true;
  });
});

test('a payload in an unexpected shape is malformed, never half-read', async () => {
  const noEnvelope = clientWith(stubFetch({ 'lookupevent.php': { unexpected: [] } }));
  await assert.rejects(noEnvelope.lookupEvent('1'), (err) => err.code === 'malformed');

  const notAList = clientWith(stubFetch({ 'lookupevent.php': { events: { idEvent: '1' } } }));
  await assert.rejects(notAList.lookupEvent('1'), (err) => err.code === 'malformed');
});

test('the caller is refused before a request is made when the arguments are unusable', async () => {
  const fetchImpl = stubFetch({});
  const client = clientWith(fetchImpl);
  await assert.rejects(client.lookupEvent('   '), (err) => err.code === 'invalid');
  await assert.rejects(client.eventsOnDay('24/05/2026'), (err) => err.code === 'invalid');
  assert.equal(fetchImpl.calls.length, 0);
});

// ── Normalization ───────────────────────────────────────────────────────────

test('a finished match normalizes to numbers, an ISO instant and a closed status', () => {
  const event = normalizeEvent(FINISHED_SOCCER.events[0], { fetchedAt: '2026-08-19T09:00:00.000Z' });
  assert.equal(event.id, '441613');
  assert.equal(event.sport, 'Soccer');
  assert.equal(event.league.name, 'English Premier League');
  assert.equal(event.season, '2014-2015');
  assert.equal(event.home.name, 'Liverpool');
  assert.equal(event.away.name, 'Swansea');
  assert.equal(event.home.score, 4); // the provider sent the string "4"
  assert.equal(event.away.score, 1);
  assert.equal(typeof event.home.score, 'number');
  assert.equal(event.status, 'finished'); // strStatus is null here; the scoreline says it
  assert.equal(event.statusLabel, null);
  assert.equal(event.startsAt, '2014-12-29T20:00:00.000Z');
  assert.equal(event.venue.name, 'Anfield');
  assert.equal(event.round, 19);
  assert.deepEqual(event.source, {
    provider: 'thesportsdb',
    eventId: '441613',
    updatedAt: '2026-08-19T09:00:00.000Z',
  });
});

test('a badge the provider does not have becomes null, not an empty string or a broken URL', () => {
  const event = normalizeEvent(FINISHED_SOCCER.events[0]);
  assert.equal(event.home.badge, null);
  assert.equal(event.away.badge, null);

  const withBadges = normalizeEvent(DAY_HOCKEY.events[0]);
  assert.match(withBadges.home.badge, /^https:\/\//);
  assert.match(withBadges.away.badge, /^https:\/\//);
});

test('an upcoming match has null scores rather than zeroes', () => {
  const event = normalizeEvent(UPCOMING_SOCCER.events[0]);
  assert.equal(event.home.score, null);
  assert.equal(event.away.score, null);
  assert.equal(event.status, 'scheduled'); // the provider's own "NS"
  assert.equal(event.startsAt, '2026-08-23T15:30:00.000Z');
});

test('with no status word and no scores, a future kickoff is scheduled and a past one is unknown', () => {
  // The large part of the catalog where strStatus is null - the finished-soccer fixture is one.
  const raw = { ...UPCOMING_SOCCER.events[0], strStatus: null };
  assert.equal(deriveStatus(raw, { now: new Date('2026-08-19T00:00:00Z') }), 'scheduled');
  // A kickoff that has passed with no score reported is NOT called finished: the honest answer
  // is that we do not know, and an operator can see that and override.
  assert.equal(deriveStatus(raw, { now: new Date('2026-09-01T00:00:00Z') }), 'unknown');
  assert.equal(deriveStatus(raw), 'unknown'); // no clock passed at all
});

test('provider status words map into the closed set, and an unknown word never guesses', () => {
  const cases = [
    ['FT', 'finished'],
    ['AP', 'finished'], // after penalties - real, from the ice-hockey day fixture
    ['AET', 'finished'],
    ['HT', 'halftime'],
    ['2H', 'live'],
    ['P2', 'live'],
    ["67'", 'live'],
    ['NS', 'scheduled'],
    ['PST', 'postponed'],
    ['CANC', 'cancelled'],
    ['SOMETHING NEW', 'unknown'],
  ];
  for (const [word, expected] of cases) {
    assert.equal(deriveStatus({ strStatus: word }), expected, `${word} -> ${expected}`);
  }
  assert.equal(normalizeEvent(LIVE_HOCKEY.events[0]).status, 'live');
  assert.equal(normalizeEvent(DAY_HOCKEY.events[1]).status, 'finished'); // "AP"
});

test('the postponed flag beats the status column, which still reads as scheduled', () => {
  assert.equal(deriveStatus({ strStatus: 'NS', strPostponed: 'yes' }), 'postponed');
  assert.equal(deriveStatus({ strStatus: 'NS', strPostponed: 'no' }), 'scheduled');
});

test('a score that is empty, absent or not a number is null, never NaN and never 0', () => {
  assert.equal(parseScore('4'), 4);
  assert.equal(parseScore(0), 0);
  assert.equal(parseScore(''), null);
  assert.equal(parseScore(null), null);
  assert.equal(parseScore(undefined), null);
  assert.equal(parseScore('walkover'), null);
});

test('a timestamp without a zone is read as UTC, and a missing one falls back to date + time', () => {
  assert.equal(parseStartsAt({ strTimestamp: '2026-08-23T15:30:00' }), '2026-08-23T15:30:00.000Z');
  assert.equal(parseStartsAt({ strTimestamp: '2026-08-23T15:30:00Z' }), '2026-08-23T15:30:00.000Z');
  assert.equal(parseStartsAt({ dateEvent: '2026-05-24', strTime: '05:10:00' }), '2026-05-24T05:10:00.000Z');
  assert.equal(parseStartsAt({ dateEvent: '2026-05-24' }), '2026-05-24T00:00:00.000Z');
  assert.equal(parseStartsAt({}), null);
  assert.equal(parseStartsAt({ strTimestamp: 'not a date' }), null);
});

test('a row without an id is refused rather than normalized into a nameless record', () => {
  assert.throws(() => normalizeEvent({ strHomeTeam: 'A' }), (err) => err.code === 'malformed');
  assert.throws(() => normalizeEvent(null), (err) => err.code === 'malformed');
  assert.throws(() => normalizeEvent([]), (err) => err.code === 'malformed');
  assert.throws(() => normalizeEvents({ events: [] }), (err) => err.code === 'malformed');
});

test('a team normalizes, and the badge is found under the field name the provider uses now', () => {
  const team = normalizeTeam(TEAM_ARSENAL.teams[0]);
  assert.equal(team.id, '133604');
  assert.equal(team.name, 'Arsenal');
  assert.equal(team.shortName, 'ARS');
  assert.equal(team.sport, 'Soccer');
  assert.equal(team.league.name, 'English Premier League');
  assert.match(team.badge, /^https:\/\//);
  assert.equal(team.venue.name, 'Emirates Stadium');

  // A payload in the OLDER spelling still yields a badge - the provider renamed this field.
  const legacy = normalizeTeam({ idTeam: '1', strTeam: 'Old', strTeamBadge: 'https://x/badge.png' });
  assert.equal(legacy.badge, 'https://x/badge.png');
  // And a team with no badge at all is null, not undefined.
  assert.equal(normalizeTeam({ idTeam: '2', strTeam: 'No badge' }).badge, null);
});

test('NO provider-spelled field survives normalization', () => {
  const records = [
    normalizeEvent(DAY_HOCKEY.events[0]),
    normalizeEvent(UPCOMING_SOCCER.events[0]),
    normalizeTeam(TEAM_ARSENAL.teams[0]),
  ];
  for (const record of records) {
    const keys = [];
    const walk = (value) => {
      if (value === null || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        keys.push(key);
        walk(child);
      }
    };
    walk(record);
    const leaked = keys.filter((key) => /^(str|int|id[A-Z]|date[A-Z])/.test(key));
    assert.deepEqual(leaked, [], `provider field names leaked: ${leaked.join(', ')}`);
  }
});

test('the human summary reads correctly before and after a match', () => {
  assert.equal(describeEvent(normalizeEvent(FINISHED_SOCCER.events[0])), 'Liverpool 4 - 1 Swansea (finished)');
  assert.match(describeEvent(normalizeEvent(UPCOMING_SOCCER.events[0])), / vs .*\(scheduled\)$/);
});

// ── The source (client + normalizer composed) ───────────────────────────────

test('the source returns normalized data and never the provider payload', async () => {
  const source = createSportsDbSource({
    key: 'test-key',
    fetch: stubFetch({ 'lookupevent.php': FINISHED_SOCCER, 'searchteams.php': TEAM_ARSENAL }),
    now: () => new Date('2026-08-19T09:00:00Z'),
  });
  const event = await source.event('441613');
  assert.equal(event.home.score, 4);
  assert.equal(event.source.updatedAt, '2026-08-19T09:00:00.000Z');
  assert.equal((await source.findTeam('Arsenal')).name, 'Arsenal');
});

test('a team with an upcoming match uses it; with none, the most recent one', async () => {
  const upcoming = createSportsDbSource({
    key: 'k',
    fetch: stubFetch({ 'eventsnext.php': UPCOMING_SOCCER, 'eventslast.php': LAST_SOCCER }),
  });
  assert.equal((await upcoming.currentEventForTeam('133602')).status, 'scheduled');

  const finishedOnly = createSportsDbSource({
    key: 'k',
    fetch: stubFetch({ 'eventsnext.php': { events: null }, 'eventslast.php': LAST_SOCCER }),
  });
  assert.equal((await finishedOnly.currentEventForTeam('133602')).id, '2482899');

  const nothing = createSportsDbSource({
    key: 'k',
    fetch: stubFetch({ 'eventsnext.php': { events: null }, 'eventslast.php': { results: null } }),
  });
  await assert.rejects(nothing.currentEventForTeam('1'), (err) => err.code === 'not_found');
});

test('findTeam refuses rather than returning an empty result', async () => {
  const source = createSportsDbSource({ key: 'k', fetch: stubFetch({ 'searchteams.php': { teams: null } }) });
  await assert.rejects(source.findTeam('Nobody FC'), (err) => err.code === 'not_found');
});

// ── The Production Data adapter boundary ────────────────────────────────────

test('a normalized event becomes the production-data patch, under one root', () => {
  const event = normalizeEvent(DAY_HOCKEY.events[0], { fetchedAt: '2026-08-19T09:00:00.000Z' });
  const patch = eventToProductionData(event);
  assert.deepEqual(Object.keys(patch), ['match']);
  assert.equal(patch.match.home.name, 'Canterbury Red Devils');
  assert.equal(patch.match.home.score, 5);
  assert.match(patch.match.home.logo, /^https:\/\//);
  assert.equal(patch.match.away.score, 4);
  assert.equal(patch.match.sport, 'Ice Hockey');
  assert.equal(patch.match.status, 'finished');
  assert.deepEqual(patch.match.source, {
    provider: 'thesportsdb',
    eventId: '2396300',
    updatedAt: '2026-08-19T09:00:00.000Z',
  });

  assert.deepEqual(Object.keys(eventToProductionData(event, { root: 'matchB' })), ['matchB']);
  assert.equal(eventToProductionData(event, { includeSource: false }).match.source, undefined);
});

test('a value the provider does not have is ABSENT from the patch, never null', () => {
  // A null in a merge patch DELETES the key (RFC 7386), and a graphic would then keep a stale
  // value with no way to tell. Writing nothing is what docs/PRODUCTION_DATA_PLAN.md §2.6 asks for.
  const patch = eventToProductionData(normalizeEvent(UPCOMING_SOCCER.events[0]));
  assert.equal('score' in patch.match.home, false);
  assert.equal('score' in patch.match.away, false);
  assert.equal(patch.match.home.name, 'Newcastle United');
  assert.equal(JSON.stringify(patch).includes('null'), false);

  // An event with nothing but an id yields a patch with nothing but the id (and its source).
  const bare = eventToProductionData(normalizeEvent({ idEvent: '7' }), { includeSource: false });
  assert.deepEqual(bare, { match: { id: '7', status: 'unknown' } });
});

test('the patch flattens to the dot paths a binding uses', () => {
  const paths = flattenPatch(eventToProductionData(normalizeEvent(DAY_HOCKEY.events[0])));
  assert.equal(paths['match.home.name'], 'Canterbury Red Devils');
  assert.equal(paths['match.away.score'], 4);
  assert.equal(paths['match.league.name'], 'New Zealand Ice Hockey League');
  assert.equal(paths['match.source.provider'], 'thesportsdb');
});

test('a team becomes its own patch, for the pre-match graphics', () => {
  const patch = teamToProductionData(normalizeTeam(TEAM_ARSENAL.teams[0]), { includeSource: false });
  assert.deepEqual(Object.keys(patch), ['team']);
  assert.equal(patch.team.name, 'Arsenal');
  assert.equal(patch.team.shortName, 'ARS');
  assert.match(patch.team.logo, /^https:\/\//);
});

test('the transitional label map carries values only, and no graphic id anywhere', () => {
  const values = eventToFieldLabels(normalizeEvent(FINISHED_SOCCER.events[0]));
  assert.equal(values['Team A'], 'Liverpool');
  assert.equal(values['Score A'], 4);
  assert.equal(values['Team B'], 'Swansea');
  assert.equal(values['Score B'], 1);
  assert.equal(values.League, 'English Premier League');
  assert.equal(values.Status, 'finished');
  // No template or graphic identifier may appear in a connector payload.
  assert.equal(/sb\d\d|lt\d\d|graphic/i.test(JSON.stringify(values)), false);

  // An unplayed match sends no score labels rather than zeroes.
  const upcoming = eventToFieldLabels(normalizeEvent(UPCOMING_SOCCER.events[0]));
  assert.equal('Score A' in upcoming, false);
  assert.equal('Score B' in upcoming, false);
});

test('the production-data write target reports its dependency instead of guessing an endpoint', () => {
  const update = resolveWriteTarget('update');
  assert.equal(update.supported, true);
  assert.equal(update.endpoint, '/api/data/update');

  const patch = resolveWriteTarget('patch');
  assert.equal(patch.supported, false);
  assert.equal(patch.endpoint, null);
  assert.match(patch.reason, /BLOCKED/);
  assert.match(patch.reason, /PRODUCTION_DATA_PLAN/);

  assert.equal(resolveWriteTarget('something-else').supported, false);
});

// ── Offline discipline ──────────────────────────────────────────────────────

test('every fixture parses, and the suite needs no network', () => {
  assert.equal(FINISHED_SOCCER.events.length, 1);
  assert.equal(DAY_HOCKEY.events.length, 3);
  assert.equal(TEAM_ARSENAL.teams.length, 1);
  assert.deepEqual(NOT_FOUND, { events: null });
  // Normalizing every captured event proves the fixtures and the parser agree.
  assert.equal(normalizeEvents(DAY_HOCKEY.events).length, 3);
});
