# TheSportsDB fixtures - where each file came from

Every file here is a REAL response, captured on **2026-08-19** from the V1 API with the public
test key `123`, then pretty-printed (formatting only - no field was added, removed or renamed).
They exist so `scripts/sportsdb.test.mjs` never needs the network: a provider outage must not be
able to turn this repo's build red, and a test that quietly depends on the internet is a test
nobody can trust offline.

| File | Request | Why it is kept |
| --- | --- | --- |
| `lookupevent-finished-soccer.json` | `lookupevent.php?id=441613` | A finished match. `strStatus` is **null** and both badges are **null** - the case a naive parser gets wrong twice. |
| `lookupevent-live-icehockey.json` | derived (see below) | A match in progress: `strStatus` `2H`, both scores present. |
| `eventsnext-team-soccer.json` | `eventsnext.php?id=133602` | An upcoming match: scores **null**, status `NS`. |
| `eventslast-team-soccer.json` | `eventslast.php?id=133602` | The `results` envelope - this endpoint does not use `events`. |
| `eventsday-icehockey.json` | `eventsday.php?d=2026-05-24&s=Ice%20Hockey` | Three events, another sport, and a real `AP` (after penalties) status. |
| `searchteams-arsenal.json` | `searchteams.php?t=Arsenal` | A full team record, with the badge under the current field name `strBadge`. |
| `lookupevent-not-found.json` | `lookupevent.php?id=999999999` | The provider's "nothing here": HTTP **200** with `{"events": null}`. |

**The one derived file.** `lookupevent-live-icehockey.json` is `eventsday-icehockey.json`'s first
event with `strStatus` set to `2H` and the scores set to 2-2, wrapped in the `events` envelope.
TheSportsDB's free tier carries no reliable way to catch a match mid-play on demand (livescores
are a premium V2 feature - `docs/SPORTSDB.md` §"Live data"), so this one payload is edited rather
than captured. Every other file is verbatim.

**Re-capturing.** These are dated, not eternal: the provider renames fields (a team badge used to
be `strTeamBadge` and is now `strBadge`, which is why the normalizer reads both). If a live walk
disagrees with a fixture, capture a fresh one with the same request above and update this table
in the same commit.
