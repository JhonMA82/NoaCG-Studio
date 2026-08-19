#!/usr/bin/env node
// TheSportsDB connector for NoaCG - fetch a match, normalize it, show it, and optionally push it
// to a published production.
//
// The shape is scripts/weather-feed.mjs's, deliberately: a connector is an EXTERNAL process that
// reads a provider and writes through the API (docs/CLOUD_PLAYOUT.md §7,
// docs/PRODUCTION_DATA_PLAN.md §2.8). There is no in-app poller and no scheduler here - one loop,
// in one file, that Ctrl-C stops.
//
// Data by TheSportsDB (https://www.thesportsdb.com). The free V1 key is the public literal `123`.
//
//   Inspect (no key, no production - this is the developer view):
//     node scripts/sportsdb-feed.mjs --event 441613
//     node scripts/sportsdb-feed.mjs --team "Arsenal"
//     node scripts/sportsdb-feed.mjs --day 2026-05-24 --sport "Ice Hockey"
//     node scripts/sportsdb-feed.mjs --fixture scripts/sportsdb/fixtures/lookupevent-live-icehockey.json
//
//   Drive a published production (the shipped, graphic-addressed Data API):
//     node scripts/sportsdb-feed.mjs --event 441613 --key <production data key> --graphic "House Score"
//     node scripts/sportsdb-feed.mjs --team "Arsenal" --key <data key> --graphic "House Score" --watch
//
// Options:
//   --event <id>          a TheSportsDB event id
//   --team <name|id>      a team: its next match if it has one, else its most recent
//   --day <YYYY-MM-DD>    every event on a day (with --sport / --league to narrow it)
//   --sport <name>        e.g. "Soccer", "Ice Hockey" - narrows --day
//   --league <id>         a league id - narrows --day
//   --fixture <path>      read a captured JSON payload instead of the network (offline demo)
//   --api-key <key>       a TheSportsDB premium key (or set THESPORTSDB_API_KEY). Default: 123
//   --key <data key>      the PRODUCTION's data key - without it, nothing is posted
//   --url <origin>        the deployment (default https://noacg.studio - the canonical host,
//                         NOT the *.vercel.app one: that host 308-redirects and clients commonly
//                         drop POST bodies on redirect)
//   --graphic <name>      pool graphic name; repeat to drive several graphics
//   --target update|patch write path. `patch` is the production-data contract and is not
//                         shipped yet - it reports the dependency and exits (see
//                         scripts/sportsdb/productionData.mjs)
//   --root <name>         where the data hangs in the production tree (default `match`)
//   --watch               keep refreshing instead of running once
//   --interval <s>        seconds between refreshes with --watch (default 60, min 15)
//   --json                print the normalized event and the patch as JSON only
//
// Freeze/override semantics (docs/CLOUD_PLAYOUT.md §7): a failed provider fetch or a failed POST
// keeps the last posted values on air - the feed simply does not write - and retries next tick.
// An operator edit always wins until the next tick, because later log rows apply later.

import { readFileSync } from 'node:fs';
import { createSportsDbSource } from './sportsdb/source.mjs';
import { isTestKey, resolveApiKey } from './sportsdb/client.mjs';
import { isTransient, SportsDbError } from './sportsdb/errors.mjs';
import { describeEvent, normalizeEvents } from './sportsdb/normalize.mjs';
import {
  eventToFieldLabels,
  eventToProductionData,
  flattenPatch,
  resolveWriteTarget,
} from './sportsdb/productionData.mjs';

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}
function flagAll(name) {
  const values = [];
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === `--${name}`) values.push(args[i + 1]);
  }
  return values;
}
function has(name) {
  return args.includes(`--${name}`);
}

const eventId = flag('event', '');
const team = flag('team', '');
const day = flag('day', '');
const sport = flag('sport', '');
const league = flag('league', '');
const fixture = flag('fixture', '');
const providerKey = resolveApiKey({ key: flag('api-key', '') });
const dataKey = flag('key', '');
const origin = flag('url', 'https://noacg.studio').replace(/\/$/, '');
const graphics = flagAll('graphic');
const target = flag('target', 'update');
const root = flag('root', 'match');
const watch = has('watch');
const interval = Math.max(15, Number(flag('interval', '60')) || 60);
const asJson = has('json');

if (!eventId && !team && !day && !fixture) {
  console.error('Say what to fetch: --event <id>, --team <name>, --day <YYYY-MM-DD> or --fixture <path>.');
  console.error('Run with no key to inspect; add --key <production data key> to drive a production.');
  process.exit(1);
}

const write = resolveWriteTarget(target);
if (dataKey && !write.supported) {
  console.error(`Cannot write with --target ${target}.`);
  console.error(write.reason);
  process.exit(1);
}

const source = createSportsDbSource({ key: providerKey });

/** One read: whatever the flags asked for, normalized. Returns a list, newest/first-listed first. */
async function read() {
  if (fixture) {
    const payload = JSON.parse(readFileSync(fixture, 'utf8'));
    const rows = payload.events ?? payload.results ?? payload.event ?? [];
    return normalizeEvents(Array.isArray(rows) ? rows : [rows], { fetchedAt: new Date(), now: new Date() });
  }
  if (eventId) return [await source.event(eventId)];
  if (team) {
    const id = /^\d+$/.test(team) ? team : (await source.findTeam(team)).id;
    return [await source.currentEventForTeam(id)];
  }
  return source.eventsOnDay(day, { sport, league });
}

// The Data API writer - identical in shape to scripts/weather-feed.mjs, because it is the same
// endpoint with the same rules.
const endpoint = `${origin}${write.endpoint ?? ''}`;
let retryAfter = 0;

async function post(values, graphic) {
  const body = { values };
  if (graphic) body.graphic = graphic;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${dataKey}` },
    body: JSON.stringify(body),
  });
  const answer = await res.json().catch(() => ({}));
  const label = graphic ? ` [${graphic}]` : '';
  if (!res.ok) {
    console.error(`  ${res.status}${label} ${answer?.error?.message ?? ''}`);
    if (res.status === 401) {
      console.error('The production data key was refused - stopping the feed.');
      process.exit(1);
    }
    if (res.status === 429) retryAfter = Math.max(retryAfter, Number(res.headers.get('retry-after')) || 60);
    return;
  }
  const unmatched = [...(answer.ignored ?? []), ...(answer.ambiguous ?? [])];
  console.log(`  log row ${answer.event}${label}${unmatched.length ? `  (unmatched: ${unmatched.join(', ')})` : ''}`);
}

function report(events) {
  const patches = events.map((event) => eventToProductionData(event, { root }));
  if (asJson) {
    console.log(JSON.stringify({ events, patches }, null, 2));
    return;
  }
  events.forEach((event, index) => {
    console.log(`\n${describeEvent(event)}`);
    console.log(`  ${event.sport ?? 'sport unknown'} - ${event.league?.name ?? 'league unknown'}` +
      `${event.startsAt ? ` - ${event.startsAt}` : ''}`);
    console.log('  production data:');
    for (const [path, value] of Object.entries(flattenPatch(patches[index]))) {
      console.log(`    ${path.padEnd(22)} ${value}`);
    }
  });
}

async function tick() {
  const events = await read();
  if (events.length === 0) throw new SportsDbError('not_found', 'The provider answered no events');
  report(events);

  if (!dataKey) return;
  // TRANSITIONAL: today's endpoint writes field LABELS on a named graphic. The patch objects
  // above are the real contract, and land the day PATCH /api/data ships.
  const values = eventToFieldLabels(events[0]);
  if (graphics.length === 0) await post(values);
  else for (const graphic of graphics) await post(values, graphic);
}

console.log('Sports data by TheSportsDB - https://www.thesportsdb.com');
if (isTestKey(providerKey)) {
  console.log('Using the PUBLIC test key (123): 30 requests/minute, one result per query.');
}
if (dataKey) {
  console.log(`Writing ${endpoint}${graphics.length ? ` (graphics: ${graphics.join(', ')})` : ''}` +
    `${watch ? ` every ${interval}s` : ' once'}.`);
  console.log('Stopping the feed IS the freeze control: the graphics keep their last values.');
} else {
  console.log('Inspect only - no --key, so nothing is posted.');
}

for (;;) {
  try {
    await tick();
  } catch (err) {
    const code = err instanceof SportsDbError ? err.code : 'error';
    if (!watch || !isTransient(err)) {
      console.error(`\n${code}: ${err.message}`);
      // exitCode + break, never process.exit(): a hard exit while an undici socket is still
      // closing aborts the process with a libuv assertion on Windows instead of a clean code.
      process.exitCode = watch ? 1 : 2;
      break;
    }
    console.error(`  ${code}: ${err.message} - keeping last values, retrying next tick`);
    if (err instanceof SportsDbError && err.retryAfter) retryAfter = Math.max(retryAfter, err.retryAfter);
  }
  if (!watch) break;
  const wait = interval + retryAfter;
  retryAfter = 0;
  await new Promise((resolve) => setTimeout(resolve, wait * 1000));
}
