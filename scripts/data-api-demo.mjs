#!/usr/bin/env node
// A live match feed for the Production Data API demo (docs/DATA_API.md).
//
// Drives a scorebug on a PUBLISHED production: the match clock ticks every second, and goals
// land at scripted minutes - while the audience watches the production's /output page (or the
// operator page) update in real time. This is the "external data becomes ordinary update rows"
// walk of docs/CLOUD_PLAYOUT.md §7, run against the real deployed endpoint.
//
// Setup (once): publish a production whose pool has one scorebug (the house scorebug's field
// titles are the defaults here), read its data key (docs/DATA_API.md, "For the production
// owner"), open the output URL somewhere visible. Then:
//
//   node scripts/data-api-demo.mjs --url https://<host> --key <data key>
//
// Options:
//   --url <origin>       the deployment (default: this checkout's own dev server, port from
//                        scripts/dev-port.mjs - rehearsal against a local server with a real .env)
//   --key <data key>     REQUIRED - the production's data key
//   --graphic <name>     pool graphic name (omit for a single-graphic production)
//   --minutes <n>        how many match minutes to play (default 6)
//   --speed <n>          match seconds per real second (default 10 - a 6-minute
//                        match takes ~36 real seconds on screen)
//
// The clock advances SPEED match-seconds per real second and every tick is ONE request
// carrying clock + period + both scores - batching keeps the demo at 1 request/s, a fifth of
// the production's ingest budget, so an operator can type over it mid-demo (worth showing:
// the operator's value lands and the next tick takes the board back - later log rows win).

import { devPort } from './dev-port.mjs';

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

const url = flag('url', `http://localhost:${devPort()}`).replace(/\/$/, '');
const key = flag('key', '');
const graphic = flag('graphic', '');
const minutes = Number(flag('minutes', '6'));
const speed = Number(flag('speed', '10'));

if (!key) {
  console.error('Missing --key <data key>. Read it as the production owner - see docs/DATA_API.md.');
  process.exit(1);
}

// The scripted match: goal minutes for each side (relative to the played window).
const HOME_GOALS = new Set([2, 5]);
const AWAY_GOALS = new Set([4]);

const endpoint = `${url}/api/data/update`;
let home = 0;
let away = 0;
let failures = 0;

async function send(values) {
  const body = { values };
  if (graphic) body.graphic = graphic;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) {
    failures += 1;
    const retry = res.headers.get('retry-after');
    console.error(`  ${res.status} ${answer?.error?.message ?? ''}${retry ? ` (retry after ${retry}s)` : ''}`);
    if (res.status === 401 || failures > 5) process.exit(1);
    return null;
  }
  failures = 0;
  return answer;
}

console.log(`Driving ${endpoint}${graphic ? ` (graphic "${graphic}")` : ''} - Ctrl-C stops the feed.`);
console.log('Stopping the feed IS the freeze control: the board keeps its last values.\n');

const totalMatchSeconds = Math.round(minutes * 60);
for (let s = 0; s <= totalMatchSeconds; s += speed) {
  const minute = Math.floor(s / 60);
  const clock = `${minute}:${String(s % 60).padStart(2, '0')}`;
  if (HOME_GOALS.delete(minute)) home += 1;
  if (AWAY_GOALS.delete(minute)) away += 1;
  const values = {
    Clock: clock,
    Period: minute < minutes / 2 ? '1H' : '2H',
    'Score A': home,
    'Score B': away,
  };
  const answer = await send(values);
  if (answer) {
    const note = [...answer.ignored, ...answer.ambiguous];
    console.log(
      `  ${clock}  ${home}-${away}  -> log row ${answer.event}${note.length ? `  (unmatched: ${note.join(', ')})` : ''}`,
    );
  }
  await new Promise((r) => setTimeout(r, 1000));
}

console.log(`\nFull time: ${home}-${away}. The board keeps the final score - nothing to clean up.`);
