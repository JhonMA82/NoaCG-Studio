#!/usr/bin/env node
// A live weather feed for the Production Data API (docs/DATA_API.md, "Worked example").
//
// Polls Open-Meteo and drives the WEATHER mini-pack (lt62 "House Weather", ig37 "House
// Forecast", bug37 "House Temp") on a PUBLISHED production - external data becoming ordinary
// update rows, the docs/CLOUD_PLAYOUT.md §7 walk. The connector is a CALLER of the endpoint:
// it maps provider payloads (WMO weather codes, wind degrees) to the graphics' own field
// LABELS, and the templates stay dumb - they render whatever strings arrive.
//
// Weather data by Open-Meteo.com (https://open-meteo.com), free for non-commercial use,
// licensed CC BY 4.0.
//
// Setup (once): publish a production holding the weather graphics, read its data key
// (docs/DATA_API.md, "For the production owner"), open the output URL somewhere visible. Then:
//
//   node scripts/weather-feed.mjs --key <data key> --graphic "House Weather"
//
// Options:
//   --url <origin>       the deployment (default https://noacg.studio - the canonical host,
//                        NOT the *.vercel.app one: that host 308-redirects and clients
//                        commonly drop POST bodies on redirect)
//   --key <data key>     REQUIRED - the production's data key
//   --graphic <name>     pool graphic name; repeat the flag to drive several graphics
//                        (each gets the full value set - unmatched labels are ignored).
//                        Omit for a single-graphic production.
//   --lat / --lon        coordinates (default Helsinki, 60.17 / 24.94)
//   --place <name>       the "Place" label shown on air (default HELSINKI)
//   --lang en|fi         condition words and weekday names (default en)
//   --interval <s>       seconds between polls (default 600, min 60 - weather does not
//                        change per second, and one POST per graphic per tick sits far
//                        inside the 25-per-5s ingest budget)
//
// Freeze/override semantics (docs/CLOUD_PLAYOUT.md §7): a failed Open-Meteo fetch or a
// failed POST keeps the last posted values on air - the feed simply does not write - and
// retries next tick. Ctrl-C stops the feed; the boards keep their last values. An operator
// edit always wins until the next tick, because later log rows apply later.

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

const url = flag('url', 'https://noacg.studio').replace(/\/$/, '');
const key = flag('key', '');
const graphics = flagAll('graphic');
const lat = Number(flag('lat', '60.17'));
const lon = Number(flag('lon', '24.94'));
const place = flag('place', 'HELSINKI');
const lang = flag('lang', 'en') === 'fi' ? 'fi' : 'en';
const interval = Math.max(60, Number(flag('interval', '600')) || 600);

if (!key) {
  console.error('Missing --key <data key>. Read it as the production owner - see docs/DATA_API.md.');
  process.exit(1);
}

// ── WMO weather code -> a short on-air condition word ───────────────────────
// The mapping lives HERE, never in a template (docs/CLOUD_PLAYOUT.md §7): the graphics render
// whatever string arrives, so an operator can type "Sunny" over the feed at any time.
const CONDITIONS = [
  // [codes, English, Finnish]
  [[0], 'Clear', 'Selkeää'],
  [[1], 'Mostly clear', 'Melko selkeää'],
  [[2], 'Partly cloudy', 'Puolipilvistä'],
  [[3], 'Overcast', 'Pilvistä'],
  [[45, 48], 'Fog', 'Sumua'],
  [[51, 53, 55], 'Drizzle', 'Tihkusadetta'],
  [[56, 57], 'Freezing drizzle', 'Jäätävää tihkua'],
  [[61], 'Light rain', 'Heikkoa sadetta'],
  [[63], 'Rain', 'Sadetta'],
  [[65], 'Heavy rain', 'Rankkasadetta'],
  [[66, 67], 'Freezing rain', 'Jäätävää sadetta'],
  [[71], 'Light snow', 'Heikkoa lumisadetta'],
  [[73], 'Snow', 'Lumisadetta'],
  [[75], 'Heavy snow', 'Sakeaa lumisadetta'],
  [[77], 'Snow grains', 'Lumijyväsiä'],
  [[80, 81], 'Showers', 'Sadekuuroja'],
  [[82], 'Heavy showers', 'Rankkoja kuuroja'],
  [[85, 86], 'Snow showers', 'Lumikuuroja'],
  [[95], 'Thunderstorm', 'Ukkosta'],
  [[96, 99], 'Thunder, hail', 'Ukkosta ja rakeita'],
];

function conditionWord(code) {
  const row = CONDITIONS.find(([codes]) => codes.includes(code));
  if (!row) return lang === 'fi' ? 'Vaihtelevaa' : 'Changeable';
  return lang === 'fi' ? row[2] : row[1];
}

// Weekday names for the forecast columns, by getDay() index (Sunday first).
const WEEKDAYS = {
  en: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
  fi: ['SU', 'MA', 'TI', 'KE', 'TO', 'PE', 'LA'],
};
function weekday(isoDate) {
  return WEEKDAYS[lang][new Date(`${isoDate}T12:00:00`).getDay()];
}

// Wind direction in 8 compass points (Finnish weather services use their own letters).
const COMPASS = {
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  fi: ['P', 'KO', 'I', 'KA', 'E', 'LO', 'L', 'LU'],
};
function compass(degrees) {
  return COMPASS[lang][Math.round(degrees / 45) % 8];
}

// ── Open-Meteo -> the pack's field labels ───────────────────────────────────
// Current conditions drive the strap and the bug; the daily rows from TOMORROW onward drive
// the three forecast columns (today's conditions are already on the current-conditions strap).
const provider =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${lat}&longitude=${lon}` +
  '&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
  '&wind_speed_unit=ms&timezone=auto&forecast_days=4';

async function readWeather() {
  const res = await fetch(provider);
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  const data = await res.json();
  const cur = data.current;
  const daily = data.daily;
  if (!cur || !daily?.time?.length) throw new Error('Open-Meteo answered without the expected fields');

  // Every value lands as a STRING - the fields are text, and the graphics render them as-is.
  const values = {
    Place: place,
    Temperature: `${Math.round(cur.temperature_2m)}°`,
    Condition: conditionWord(cur.weather_code),
    Wind: `${compass(cur.wind_direction_10m)} ${Math.round(cur.wind_speed_10m)} m/s`,
  };
  for (let day = 1; day <= 3 && day < daily.time.length; day += 1) {
    values[`Day ${day} name`] = weekday(daily.time[day]);
    values[`Day ${day} high`] = `${Math.round(daily.temperature_2m_max[day])}°`;
    values[`Day ${day} low`] = `${Math.round(daily.temperature_2m_min[day])}°`;
    values[`Day ${day} condition`] = conditionWord(daily.weather_code[day]);
  }
  return values;
}

// ── The Data API writer ─────────────────────────────────────────────────────
const endpoint = `${url}/api/data/update`;
let retryAfter = 0; // extra seconds a 429 asked us to wait before the next tick

async function post(values, graphic) {
  const body = { values };
  if (graphic) body.graphic = graphic;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const answer = await res.json().catch(() => ({}));
  const label = graphic ? ` [${graphic}]` : '';
  if (!res.ok) {
    console.error(`  ${res.status}${label} ${answer?.error?.message ?? ''}`);
    if (res.status === 401) {
      console.error('The data key was refused - stopping the feed.');
      process.exit(1);
    }
    if (res.status === 429) retryAfter = Math.max(retryAfter, Number(res.headers.get('retry-after')) || 60);
    return;
  }
  const note = [...(answer.ignored ?? []), ...(answer.ambiguous ?? [])];
  console.log(`  log row ${answer.event}${label}${note.length ? `  (unmatched: ${note.join(', ')})` : ''}`);
}

console.log('Weather data by Open-Meteo.com (CC BY 4.0) - https://open-meteo.com');
console.log(`Driving ${endpoint}${graphics.length ? ` (graphics: ${graphics.join(', ')})` : ''} every ${interval}s - Ctrl-C stops the feed.`);
console.log('Stopping the feed IS the freeze control: the graphics keep their last values.\n');

for (;;) {
  try {
    const values = await readWeather();
    console.log(`${new Date().toISOString()}  ${values.Place} ${values.Temperature} ${values.Condition}, ${values.Wind}`);
    if (graphics.length === 0) {
      await post(values);
    } else {
      for (const graphic of graphics) await post(values, graphic);
    }
  } catch (err) {
    // Freeze = stop writing: the graphics keep the last posted values; retry next tick.
    console.error(`  fetch failed (${err.message}) - keeping last values, retrying next tick`);
  }
  const wait = interval + retryAfter;
  retryAfter = 0;
  await new Promise((r) => setTimeout(r, wait * 1000));
}
