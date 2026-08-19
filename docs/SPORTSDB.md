# TheSportsDB connector

NoaCG's first external SPORTS source. It reads TheSportsDB, normalizes what it finds into
NoaCG's own vocabulary, and hands that on as production data. It is a **connector**, not a
feature of the studio: an external process that fetches and pushes, the shape
`docs/CLOUD_PLAYOUT.md` §7 asks for and `scripts/weather-feed.mjs` already follows.

```
TheSportsDB V1 API
      |
      v  scripts/sportsdb/client.mjs        HTTP, the key, timeouts, provider error shapes
      |
      v  scripts/sportsdb/normalize.mjs     provider rows  ->  normalized NoaCG shapes
      |
      v  scripts/sportsdb/source.mjs        the two composed: "give me the match"
      |
      v  scripts/sportsdb/productionData.mjs   normalized  ->  a production-data patch
      |
      X  production data write                 BLOCKED - see "Integration point" below
```

Everything above the last line is built and tested offline. The last line waits on the HTTP verb
that reaches production data, and is deliberately not improvised here (§4).

---

## 1. What the provider actually offers (verified 2026-08-19)

Checked against the live API, not against memory. The findings that changed the implementation
are marked.

| | |
| --- | --- |
| **V1 base** | `https://www.thesportsdb.com/api/v1/json/<key>/<endpoint>.php?<query>` |
| **Free key** | the literal `123`, in the URL PATH. It is published on their own docs page - it is documentation, not a credential. |
| **Free rate limit** | 30 requests/minute. Premium 100/min, business 120/min. A `429` means wait ~60 s. |
| **Free result cap** | **one result per query** on most endpoints (`eventslast.php` answers one event, not five). Measured: `eventsday.php` still returned 3. |
| **Premium key** | in the `X-API-KEY` **header**, and it unlocks the V2 API. $9/month. |
| **V2** | premium only: livescores (~2 min), video highlights, larger result caps. **Not implemented here** - a connector that needs a paid key to run at all is not a first integration. |

### Endpoints used

| Purpose | Endpoint | Envelope key |
| --- | --- | --- |
| Event by id | `lookupevent.php?id=441613` | `events` |
| Team search | `searchteams.php?t=Arsenal` | `teams` |
| Team by id | `lookupteam.php?id=133604` | `teams` |
| A team's last events | `eventslast.php?id=133602` | **`results`** |
| A team's next events | `eventsnext.php?id=133602` | `events` |
| Everything on a day | `eventsday.php?d=2026-05-24&s=Ice%20Hockey` | `events` |
| League by id | `lookupleague.php?id=4328` | `leagues` |

**Two provider behaviours worth knowing, both found by asking rather than assuming:**

1. **The envelope key is not constant.** `eventslast.php` answers `results`, everything else
   answers `events` (and `searchevents.php` answers `event`). A client that hard-codes one key
   silently reads nothing from the others.
2. **"Not found" is HTTP 200.** An unknown id answers `200 {"events": null}`. The status code
   never says it, so `not_found` is decided by reading the envelope.

### Live data - the honest limitation

**TheSportsDB is not a real-time scoring feed, and nothing here should be sold as one.**

- Livescores are a **premium V2 feature** with a stated ~2 minute cadence. The free V1 API has
  no livescore endpoint at all: the only way to see a score change is to re-read the event.
- The data is **community-maintained**. Coverage, latency and even the `strStatus` vocabulary
  vary by sport and by league; large parts of the catalog carry `strStatus: null` for a match
  that plainly finished (the captured `lookupevent-finished-soccer.json` is exactly that).
- So: **never** point this at a live scorebug and expect it to track play. A goal will appear
  late, or not at all, and there is no clock.

What it is genuinely good for, and what this connector is built to serve: pre-match graphics
(teams, badges, venue, kickoff), schedules and fixture lists, **final** results, team
information, demos and template development, and proving the data path end to end. A
professional timing/scoring provider plugs into the same production-data layer later, and
nothing about this connector has to change for that to happen.

---

## 2. The normalized contract

Provider fields stop at `normalize.mjs`. Everything downstream sees this:

```jsonc
{
  "id": "2396300",
  "name": "Canterbury Red Devils vs Botany Swarm",
  "sport": "Ice Hockey",
  "league": { "id": "5068", "name": "New Zealand Ice Hockey League", "badge": "https://..." },
  "season": "2026",
  "round": 0,
  "status": "live",          // scheduled | live | halftime | finished | postponed | cancelled | unknown
  "statusLabel": "2H",       // the provider's own word, for an operator - never bind to it
  "startsAt": "2026-05-24T05:10:00.000Z",
  "venue": { "name": null, "city": null, "country": "New Zealand" },
  "home": { "id": "142098", "name": "Canterbury Red Devils", "score": 2, "badge": "https://..." },
  "away": { "id": "142097", "name": "Botany Swarm",         "score": 2, "badge": "https://..." },
  "source": { "provider": "thesportsdb", "eventId": "2396300", "updatedAt": "2026-08-19T07:39:38.418Z" }
}
```

The decisions inside that shape, each of which is a test:

- **Scores are numbers or `null`.** The provider sends `"4"` as a string and `null` for an
  unplayed match. `Number()` on that yields `0` before kickoff and `NaN` for a walkover - two
  on-air errors from one careless cast.
- **`status` is a closed set we control.** `FT`, `AP`, `AET`, `2H`, `P2`, `67'`, `NS`, `PST`,
  `CANC` and friends map into it; an unrecognised word maps to `unknown` rather than a guess.
  `strPostponed` is a separate column and beats the status word.
- **`startsAt` is UTC.** `strTimestamp` arrives without a zone marker, so the `Z` is added
  explicitly - otherwise the same payload means a different moment in Helsinki than in London.
- **Missing means `null`**, uniformly: the provider mixes `""`, `null` and absent fields.
- **`source` is three keys.** Provider bookkeeping must not dominate an operator's data tree.
- Not normalized, on purpose: extra-time/penalty sub-scores, spectators, weather, descriptions,
  posters, fanart, social links. Add one when a graphic actually needs it.

A team normalizes to `{ id, name, shortName, sport, league, badge, logo, country, venue, source }`.
Note the provider **renamed** the team badge field (`strTeamBadge` -> `strBadge`); both are read,
and the normalized shape has exactly one `badge`.

---

## 3. The production-data patch

`eventToProductionData(event)` turns the normalized event into the patch a production merges:

```jsonc
{
  "match": {
    "id": "2396300",
    "sport": "Ice Hockey",
    "league": { "name": "New Zealand Ice Hockey League", "badge": "https://..." },
    "season": "2026",
    "status": "live",
    "startsAt": "2026-05-24T05:10:00.000Z",
    "country": "New Zealand",
    "home": { "name": "Canterbury Red Devils", "score": 2, "logo": "https://..." },
    "away": { "name": "Botany Swarm",          "score": 2, "logo": "https://..." },
    "source": { "provider": "thesportsdb", "eventId": "2396300", "updatedAt": "..." }
  }
}
```

Graphics then bind to `match.home.name`, `match.home.score`, `match.home.logo`, `match.status`
and so on - several graphics to the same paths, none of them known to this connector.

- **The root is `match`** because that is the grammar the production-data resolver walks
  (migration `0048_production_data_tree.sql`), and its own examples read `match.home.score`.
  Two simultaneous matches use `--root matchA` / `--root matchB`; that is one flag, not a
  framework.
- **A value the provider does not have is ABSENT, never `null`.** In an RFC 7386 merge patch a
  `null` DELETES the key, while an unresolvable path simply writes nothing (0048's
  `production_data_resolve` yields no row for one) - so a feed that knows nothing cannot wipe
  an operator's manual value.

---

## 4. Integration point (the one blocked line)

```js
const event = await source.event(id);              // done
const patch = eventToProductionData(event);        // done
await productionData.patch(productionId, patch);   // BLOCKED - the other worktree owns this
```

The production-data write has landed by **halves**. The database half is on `main`: migration
`0048_production_data_tree.sql` carries `control_data_patch(p_key, p_patch)` - an RFC 7386 merge
with bindings resolved and diffed inside one locked transaction, authorized by the same
per-production data key, and rate limited by the same ingest budget. **The HTTP half is not**:
`api/data/[...path].ts` still routes `update` and nothing else, so nothing outside the database
can reach that RPC.

Wiring a stand-in here - a direct service-role call, or a second endpoint of our own - would be
exactly the second production-data ingress this connector exists not to become. So
`resolveWriteTarget('patch')` **reports the dependency** instead of inventing an endpoint, and
the feed refuses to run in that mode.

**Transitional path, so the connector is demonstrable today:** the shipped, graphic-addressed
Data API (`POST /api/data/update`, `docs/DATA_API.md`). `eventToFieldLabels` maps a normalized
event onto field LABELS (`Team A`, `Score A`, `Home Team`, `League`, ...); the operator names the
graphic with `--graphic`. The connector still contains no template id and no graphic knowledge -
labels that match nothing come back in the API's `ignored` list. **Delete `eventToFieldLabels`
when the patch path lands**; it is the only place in the connector that mentions field titles.

---

## 5. Running it

```bash
# Inspect - no key, no production. Prints the match and the exact production-data paths.
node scripts/sportsdb-feed.mjs --team "Arsenal"
node scripts/sportsdb-feed.mjs --event 441613
node scripts/sportsdb-feed.mjs --day 2026-05-24 --sport "Ice Hockey"

# Offline, from a captured payload - no network at all.
node scripts/sportsdb-feed.mjs --fixture scripts/sportsdb/fixtures/lookupevent-live-icehockey.json

# Drive a published production through the shipped Data API.
node scripts/sportsdb-feed.mjs --event 441613 --key <production data key> --graphic "House Score"
node scripts/sportsdb-feed.mjs --team "Arsenal" --key <data key> --graphic "House Score" --watch --interval 60
```

`--watch` is the ONLY refresh mechanism, and it lives in this process. There is no in-app
poller, no scheduler and no second global service. If scheduled refresh ever belongs anywhere,
it belongs to the Data Hub, which owns every source equally - not to this connector.

**Failure behaviour is freeze**, exactly as `weather-feed.mjs`: a failed provider read or a
failed POST writes nothing, so the graphics keep their last values, and the next tick retries.
A refused key stops the feed instead of hammering. An operator edit always wins until the next
tick, because later log rows apply later.

### Keys and configuration

- **The provider key**: `--api-key`, or `THESPORTSDB_API_KEY` in the environment (added to
  `.env.example`). Server/CLI only - **never** a `VITE_` name, which would bundle it into the
  browser (`scripts/check-client-secrets.mjs` is the gate). Unset falls back to the public `123`.
- **The production data key**: `--key`, the per-production key from `docs/DATA_API.md`. Same
  rules as every other integrator - it is a server-side credential, never a web page's.
- No user-facing key vault is built here. If a hosted SportsDB source is ever wanted, it uses
  whatever generic provider-credential system exists then.

---

## 6. Team badges as on-air images

Badges come back as absolute `https://r2.thesportsdb.com/...` URLs, and they are the most
tempting thing in the payload for a demo. What holds today:

- **In the browser output renderer / cloud playout, a remote URL works.** The deployment's CSP
  (`vercel.json`) sets no `img-src`, so a remote image loads; the r2 CDN serves permissive
  images. The risks are ordinary ones: a dead link renders nothing, and load time is the
  provider's, not ours.
- **In an EXPORT, it does not.** AGENTS.md's non-negotiable 3 is that exports carry relative
  paths and no CDN references - a package played from a CasparCG machine with no internet must
  still work. So a badge URL is fine for a live, connected production, and is **not** a way to
  put a logo into a downloadable package.
- Turning a remote badge into a persistent project asset is an ASSET-pipeline concern, not a
  connector one. It is not built here and should not be: the connector's job ends at "here is
  the URL the provider published".

---

## 7. Tests

`scripts/sportsdb.test.mjs` (`npm run test:sportsdb`, and part of `npm run build`). 31 tests,
**no network**: every one runs off a captured fixture and an injected `fetch`. Covered: URL and
key resolution, all four envelope shapes, `not_found` from a 200, 401/429/5xx/timeout/malformed,
argument refusal before a request is made, score and timestamp parsing, the whole status table,
missing badges, a provider field-name leak check, the source's team-to-match policy, the patch
shape, absent-not-null, path flattening, the transitional label map, and the blocked write
target reporting its dependency.

Fixture provenance: `scripts/sportsdb/fixtures/SOURCES.md`.
