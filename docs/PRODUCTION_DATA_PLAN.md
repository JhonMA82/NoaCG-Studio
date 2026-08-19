# Production Data - plan

A production holds a **tree of live values** that its graphics read from, so an external system
says *"the home score is 4"* and never *"sb03 is on air"*. This document is the design; nothing
in it is built yet.

Read `docs/CLOUD_PLAYOUT.md` (§7 is the ingress doctrine), `docs/DATA_API.md` (the shipped
first slice) and `docs/INTERACTIVE_PLAYOUT_PLAN.md` D3/D5 first - this plan is a thin layer
over all three, not a fourth data system.

---

## 1. Current-state assessment

### What already exists

| Piece | Where | What it is |
|---|---|---|
| **`ShowDataset`** | `model/shows.ts`, `components/home/ProductionDataWorkspace.tsx` | Production-scoped **tables** (columns with operator labels, rows of strings), additive-optional on `Show`, edited at `#/production/<id>/data`. Bound to fields by WORDS (`datasetValuesForFields`: column label = field title). Loaded into a cue's DRAFT by deliberate operator action. Explicitly **"never a live wire"** (D3). |
| **Production Data API** | `api/data/[...path].ts`, `api/_lib/dataIngest.ts`, migration 0047 | `POST /api/data/update` - per-production `data_key`, labels mapped to `fN` server-side, written as ordinary `update` rows through `control_data_send`. **Graphic-addressed** (`graphic:` or `cue:` names the target). |
| **The command log** | `control_events`, `control/hostedControl.ts` | The durable, DB-ordered transport. Realtime nudge + `control_tail` gap-fill + `control_report` snapshots with per-graphic baselines. The renderer applies rows in order, whoever wrote them. |
| **The local path** | `ProductionPage.runVerb` | Unpublished, verbs drive the local ProgramStage directly. This is what makes the whole surface work offline, with no account. |
| **Contextual controls** | `productionControllerHtml.ts` ~l.620, the two React surfaces | A `-`/`+` press on a **number field of the on-air cue** sends a PARTIAL `update` straight to program (`docs/PLAYOUT_DASHBOARD.md` §7c). Per graphic, per field. |
| **`liveData.ts`** | `control/liveData.ts` | A published-CSV poller **injected into the template's own JS**. Already declared superseded by server-side connectors and "not extended" (CLOUD_PLAYOUT §7). |
| **The audience plane** | `audience/` | Deliberately has **no** method reaching the command log. Not a data source; not touched by this plan. |
| **`prvar`** | `model/types.ts:177` | SPX's own "project variable shared across templates". Parsed and serialized, otherwise inert. |

### Are we accidentally already implementing this?

**Yes - twice, in two incompatible shapes, and neither is what was asked for.**

- `ShowDataset` is **production-scoped but not live**: a bank of authored rows an operator picks
  from.
- The Data API is **live but graphic-scoped**: the caller must name the graphic or a cue.

The middle - *production-scoped **and** live* - is exactly the hole. This plan fills it, and
does not add a third vocabulary.

### The criticism worth stating up front

**The shipped Data API already violates the principle in the brief.** `docs/DATA_API.md` sells
graphic addressing as a feature ("addressing by cue label"), which forces a scoreboard to know
the production's rundown. That is the coupling the brief wants removed. The fix is not to delete
it - it is a legitimate direct-write escape hatch and it works today - but production data
becomes **the primary address**, and `/update` is documented as the low-level path.

### The second thing inspection changed

`Show` is synced **record-level LWW with conflict copies** (D3's named limit, and a conflict copy
drops the production's slugs). Writing live values into the `Show` record on every score bump
would bump `updatedAt` at feed rate and push a doc sync per tick - a reliable way to mint a
conflict copy and un-publish a live production. **Live data must not live in the synced show
document.** §5 splits seed from live state for exactly this reason.

---

## 2. Recommended architecture

### 2.1 Two values, not one

| | **Seed** | **Live tree** |
|---|---|---|
| What | what this production *starts from* | what is true *right now* |
| Where | `Show.data` (additive-optional, synced) | a local durable key, per show id; **and** `control_shows.data` once published |
| Written by | the author, deliberately | operators, contextual controls, the ingress API |
| Travels with | duplicate, export, cloud sync | nothing - it is runtime state |

`Reset` = live := seed. `Clear` = live := `{}`. This mirrors the house doctrine already in
`fieldDescriptors` (`defaultValue` is the per-field Reset target) and "reset is two operations".

### 2.2 Representation

Plain JSON. `string | number | boolean | null | object | array`, nested freely. **No schema, no
declared types, no validation layer** - the brief's instinct is right and the codebase gives no
reason to overrule it. The only typing that exists is the formatting rule at the binding
boundary (§2.4), which is where a type actually has consequences.

Path syntax: dot segments with numeric indices - `match.home.score`, `drivers.0.gap`. One
grammar, no bracket alternative.

### 2.3 Binding: on the production, resolved by the sender

**Reject** `productionData.match.home.score` inside template code. SPX has no such object, so an
exported graphic would stop working the moment it left the studio - that breaks the
"export anywhere, plug-and-play" pillar and adds the parallel rendering architecture the brief
warns against.

**Recommended:** a binding is production state that resolves to ordinary `update()` field values
before anything is sent. The graphic stays a dumb SPX template with `fN` fields; the renderer
learns nothing new.

```
production data  --(bindings)-->  { f1: "4" }  -->  the same `update` row  -->  the same log
```

Stored on the Show, keyed by pool-graphic name then field id:

```ts
/** graphic name -> field id -> production-data path. */
bindings?: Record<string, Record<string, string>>;
```

On `Show` rather than on `SavedGraphic` because a saved graphic is a library record shared with
other productions, and the binding is production-scoped.

**Default, then confirm.** When a graphic is added, each data-carrying field is offered a path
whose last segment matches its title case- and separator-insensitively (`Score A` -> a leaf
`scoreA`). Exactly one match auto-binds; **two matches bind nothing and are reported**, the same
never-guess doctrine as the API's `ambiguous`. Everything is visible and editable in one table.

This is a small explicit mapping surface, which D3 avoided for datasets. It is justified here:
paths are nested and field titles are flat, so the words cannot carry the binding on their own.
The datasets' label rule stays exactly as it is.

### 2.4 Formatting at the boundary

SPX field values are strings. One rule set, applied when a path resolves:

| Value | Becomes |
|---|---|
| string | itself |
| number, boolean | `String(v)` |
| array of scalars | joined with a newline (this is what a `lines`/textarea field wants - a ticker binds to `headlines`) |
| object, array of objects | **not bindable** - bind a deeper path (`drivers.0.name`) |
| missing path | **nothing is written** (§2.6) |

Number formatting (thousands separators, decimals, numerals) stays in the template, where it
already lives. The boundary does not format; it stringifies.

### 2.5 Update model: JSON Merge Patch, absolute values only

One write verb: a **deep merge** with RFC 7386 semantics - `null` deletes a key, arrays replace
wholesale. `match.home.score = 4` is simply the patch `{"match":{"home":{"score":4}}}`, so the
UI's `+1` button, a contextual control and an external POST all speak one language.

**The wire carries absolute values only.** No `+1` on the wire, ever. An increment is a UI
affordance that reads the current value and writes the absolute result - which is exactly what
today's stepper already does. This removes a whole class of concurrent-increment semantics for
free.

Whole-object replacement is a later `PUT`, not needed for Phase 1.

### 2.6 Propagation: resolve at the sender, ride the existing log

1. A patch is merged into the live tree.
2. Bindings are resolved, and the result is **diffed against the last resolved values**.
3. Only fields whose string value **changed** are sent, grouped per graphic, as ordinary
   `update` rows - one row per affected graphic.

Nothing new crosses the wire. Unpublished, this is `runVerb`'s local branch. Published, it is
`sendHostedControlBatch`. Both already exist.

**No new transport.** No WebSockets, no SSE, no polling, no second Realtime channel. The log's
existing Realtime nudge plus `control_tail` gap-fill and `control_report` recovery apply
unchanged, including the renderer-reboot case.

**Graphics that are not live still receive updates.** The output stage preloads every published
graphic, and a hidden graphic's `update()` is harmless. So a bound graphic is already correct
when it is taken - no fill-on-take machinery, no "stale on air" window. The diff in step 3 is
what keeps that affordable.

### 2.7 Bound fields vs cue values - the rule that prevents the worst trap

If a cue carried a value for a bound field, taking that cue after a data update would re-air the
stale prepared value. So:

> **A bound field is not a cue value.** Cues carry unbound fields only. Bound fields come from
> production data, always.

In the cue editor a bound field renders read-only with a link chip, its path, and the current
live value. To override, the operator **unbinds** - one deliberate, visible act. Typing directly
into a live field still works and still wins until the next data write, because later log rows
win; that is the existing doctrine and it is left alone.

### 2.8 Relationship to Data Hub, connectors, PUSH and PULL

The existing boundary is already right and this plan does not move it:

- **PUSH** = an external system patches production data. That is this plan.
- **PULL** = a connector process fetches from a provider and pushes. `scripts/weather-feed.mjs`
  is already exactly that, and it stays outside the app. **No in-app pollers.**
- **`ShowDataset` stays what it is**: a bank of authored rows for deliberate load. It answers a
  different question (many candidate rows) from production data (one current truth). Same tab,
  two panels, no merge.
- **`liveData.ts` is the actual second-system risk** - a CSV poller living inside template code,
  outside the log, invisible to the operator. Recommendation: freeze it now, and schedule its
  retirement once production data ships. Do not extend it.

### 2.9 Contextual controls - agree with the direction, disagree with the timing

`Home +1` **should** ultimately be `patch match.home.score = <current+1>`, and then contextual
controls, the Data workspace and the external API all move one state.

But converting the shipped stepper in Phase 1 is the wrong trade. Today it writes one field on one
on-air cue; on production data it would move every bound graphic. That is a behaviour change to a
verified surface across **three** renderers (two React, one vanilla in
`productionControllerHtml.ts`) in service of an abstraction that has not yet proven itself live.

**Phase 1:** data-scoped steppers live in the Data panel. The field-scoped stepper stays for
unbound fields, unchanged. **Converge in Phase 3**, once bindings have run a real show.

---

## 3. Phase 1 scope - the Manual Data Playground

Local-first, no backend required, no API. Ships behind nothing.

1. **`model/productionData.ts`** - a pure, import-free module: merge-patch, path get/set/delete,
   flatten-to-leaves (for the picker), the stringify rule, and `resolveBindings(data, bindings)`
   returning `Record<graphicName, Record<fieldId, string>>`. Import-free is deliberate: it makes
   `scripts/production-data.test.mjs` possible (§8) and lets `api/_lib` reuse the file later.
2. **Storage** - `Show.data` (seed, additive-optional) plus a local durable key for the live
   tree, keyed by show id, never synced.
3. **`Show.bindings`** - additive-optional, per §2.3.
4. **The Data tab grows a second panel, above the tables**: `Production data`.
   - A tree/table of path and value, edit in place.
   - Add field (path + value, type inferred from the literal: `4` number, `true` boolean, bare or
     quoted text string, `[...]`/`{...}` JSON).
   - Delete field. Reset to seed. Clear. Save current as seed.
   - A raw JSON view that is editable and round-trips - this is the honest view of a nested tree
     and doubles as the paste target for a sample payload.
   - Test controls, **generated not hard-coded**: every numeric leaf gets a minus/plus pair; there
     is one "randomise" button that perturbs numeric leaves. No sports vocabulary anywhere.
5. **The bindings table** - per pool graphic, its fields against paths, with the live resolved
   value shown beside each. Unresolved and ambiguous rows are called out, not hidden.
6. **Cue editor** - bound fields render read-only with the link chip and live value (§2.7).
7. **Wiring** - any change to the live tree resolves, diffs, and dispatches through the existing
   `runVerb` path.

**Not in Phase 1:** the server column, the API verbs, read-back, connectors, converting the
existing stepper, arrays-of-objects repeat binding, any schema.

---

## 4. Future API path

Phase 1's write path is already `patch -> merge -> resolve -> diff -> log rows`. The API replaces
*who calls it* and *where the tree lives* - not the shape.

**Phase 2 (server ingress), migration 0048:**

- `control_shows.data jsonb not null default '{}'` - the live tree once published.
- `control_shows.bindings jsonb` - pinned at publish beside `panel`/`output`.
- `control_data_patch(p_key text, p_patch jsonb)` - `control_data_send`'s sibling, service-role
  only, same `data_key`, same ingest budget marking. In ONE transaction, with the row locked:
  deep-merge the patch, resolve bindings, diff, insert the resulting `update` rows. Atomic, so two
  writers cannot lose an update, and ordering is the log's own.
- `PATCH /api/data` and `GET /api/data` as **new segments on the existing catch-all** -
  `api/data/[...path].ts` already routes one segment (`check:api-route-depth` measures it). **Zero
  new functions**, which matters: `docs/DATA_API.md` records the endpoint as function 11 of a
  12-function budget.
- `POST /api/data/update` stays, documented as the low-level graphic-addressed path.

The deep merge then exists twice - TypeScript for the local path, plpgsql for the atomic one.
That is a real cost, named rather than hidden. It is pinned by one shared fixture table asserted
on both sides, and the SQL side must be verified by **calling** the function, not by inspecting
its shape.

**Phase 3:** contextual controls converge onto patches (§2.9); `liveData.ts` retires; a Data page
prints the ready-to-paste `curl` for this production, making the playground its own
documentation.

---

## 5. Data model changes

```ts
// model/shows.ts - both ADDITIVE OPTIONAL, so no version bump and no migration (rule 6).
interface Show {
  /** The production's data SEED - what Reset returns to. The live tree is runtime state and
   *  is deliberately NOT here: writing it would bump updatedAt at feed rate and push a doc
   *  sync per tick, which is how a live production mints a conflict copy (D3's named limit). */
  data?: JsonObject;
  /** graphic name -> field id -> production-data path. */
  bindings?: Record<string, Record<string, string>>;
}
```

New local durable key `spx-gfx-production-data` - `{ [showId]: JsonObject }`, never synced, never
exported.

Migration 0048 (Phase 2 only) adds `control_shows.data` + `.bindings` + `control_data_patch`.
Nothing in Phase 1 touches the database.

**Lifecycle answers:**

| Question | Answer |
|---|---|
| Survives refresh? | Seed always (show doc). Live tree yes - the local durable key, or the server row when published. |
| Unpublished? | Server row dies with the other capabilities, exactly as the data key does. Seed and local live tree survive. |
| Duplicated? | Seed and bindings copy (they are show state). Live tree does not - a copy starts from its seed. |
| Exported? | Neither. An exported graphic has no feed; its fields keep their authored defaults. Bindings are a studio-side concept. |
| In the published output payload? | No. The payload is pinned at publish; live data must ride the log or it would be a second, staler truth. Bindings **are** pinned (they are authored state). |
| History? | None. No event sourcing. The command log already is the durable history, already prunable - the brief's instinct is right and the infrastructure is free. |

---

## 6. UI plan

Everything lands on the **existing Data tab** (`#/production/<id>/data`) - no new route, no new
top-level surface.

```
+-- Production data ------------------------ [Reset] [Clear] [Save as seed] --+
|   match.home.name      Finland                                    -  +  x   |
|   match.home.score     3                         number           -  +  x   |
|   match.clock          12:31                                            x   |
|   + Add field                                      [ Raw JSON ]             |
+-- Bindings -----------------------------------------------------------------+
|   House Scorebug   f1 Score A  <- match.home.score   3                      |
|                    f2 Score B  <- match.away.score   2                      |
|                    f4 Referee     (unbound)          [ pick a path ]        |
+-----------------------------------------------------------------------------+
```

Below it, the existing tables panel, unchanged.

The Playout tab stays an operating surface: it gains only the link chip on bound cue fields, and
(Phase 3) steppers that patch. Nothing about the playground clutters a live show, because it is a
different tab - the separation D6 already established.

---

## 7. Security model

**Phase 1: nothing new.** Local, manual, no endpoint, no credential. This is the strongest reason
to keep Phase 1 manual-only.

**Phase 2** reuses 0047 verbatim rather than inventing anything:

- The per-production **`data_key`** authorizes the patch. It is already update-only *by
  construction in the database*, per-production, and rotated by re-publish.
- `control_data_patch` writes nothing but `update` rows and the data column. It still cannot
  play, stop, take or clear - a feed is never an operator.
- The three-layer rate limit (IP / per-production ingest budget / the log's own cap) applies
  unchanged, and the ingest budget stays enforced in the database so operator headroom holds
  across serverless instances.
- 16 KB body cap stays. Scenario C (20 drivers by 5 values) is about 3 KB.
- Cross-production writes are structurally impossible: the key **is** the production address.

**One honest change to flag:** adding `GET /api/data` makes the key read+write, which weakens the
"update-only by construction" claim in `docs/DATA_API.md`. Read-back is genuinely useful (an
integrator reconciling after a restart), so the recommendation is to add it and **amend the doc**,
not to add a second key scope. Split scopes only if a real customer needs write-without-read.

**Not now:** per-key scopes, multiple keys per production, key naming/rotation UI, audit trails,
per-path permissions. All enterprise API-key management, none of it earned yet.

---

## 8. Testing plan

**Extend, do not duplicate:**

| Existing | Add |
|---|---|
| `scripts/csv.test.mjs` pattern | **new** `scripts/production-data.test.mjs` - transpile the real `model/productionData.ts` and unit-test merge (nested, `null` delete, array replace), path get/set on missing parents, the stringify rule, ambiguous-suggestion refusal, and the resolve+diff. Wired into the build gate's `node --test` list. |
| `e2e/production-data.spec.ts` | the playground walk: add / edit / delete a field, nested paths, an array into a `lines` field, bind a field, live value reaches the preview, reset to seed, reload persistence, deep-link. |
| `e2e/productions.spec.ts` | production isolation (two productions, same paths, no bleed) and duplicate behaviour (seed copies, live tree does not). |
| `e2e/production-controls.spec.ts` | a bound field is read-only in the cue editor; Take does not re-air a stale prepared value; two graphics bound to one path both move. |
| `e2e/production-persistence.spec.ts` | the live tree survives reload while the show doc's `updatedAt` did **not** move - the anti-sync-churn claim, asserted rather than assumed. |
| `e2e/data-api.spec.ts` (Phase 2) | refusal shapes for `PATCH`/`GET`: 401, 503 offline, 405, 413. |
| `e2e/configured/scorebug-output.spec.ts` (Phase 2) | the live path: patch through the real API, the real `/output` renderer moves, a renderer reboot mid-show recovers the bound value. |
| `scripts/*-migration.test.mjs` pattern (Phase 2) | 0048's grants and refusals, **calling** `control_data_patch`, not inspecting it. |

Malformed input is a unit-test concern (bad JSON, a path with empty segments, a cyclic value, a
number where an object was) and belongs in `scripts/production-data.test.mjs`, not in Playwright.

`npm run build` covers typecheck, lint, dependency-cruiser and the unit tests. No catalog change,
so the five catalog gates are not in scope.

---

## 9. Migration and backward-compatibility risks

- **Both new `Show` fields are additive-optional** - no version bump, and an older build reads and
  rewrites the record untouched (rule 6). A production with no `data` and no `bindings` behaves
  exactly as today.
- **Sync churn is the headline risk** and §2.1 is the mitigation. It must be asserted, not
  assumed - hence the `updatedAt` assertion in the persistence spec.
- **The cue-value rule (§2.7) changes existing behaviour** for any field an operator later binds:
  the cue stops carrying it. Bindings are opt-in and start empty, so nothing changes for existing
  productions until someone binds a field.
- **`dataIngest.ts` reuse** - `mapLabelsToFields` stays for `/update`; the patch path must not
  route through it, or graphic addressing sneaks back in.
- **A published production predating 0048** has no `data` column value; normalize to `{}` on read
  rather than failing, per the degrade-honestly rule.
- **`api/` compiles under `tsconfig.api.json` but Vercel typechecks with the ROOT tsconfig** -
  a shared `model/productionData.ts` must stay inside the root config's target.

---

## 10. Explicitly do NOT build

1. Any schema, type declaration or validation layer for the data tree.
2. A runtime `productionData.*` object inside template code (§2.3).
3. A new transport of any kind - WebSocket, SSE, polling, a second Realtime channel.
4. Event sourcing, history, time-travel or an audit trail for data values.
5. In-app connectors or pollers (weather, sports, OpenF1, sheets). Connectors are external
   processes calling the API; `scripts/weather-feed.mjs` is the pattern.
6. Any extension of `liveData.ts`.
7. Repeat/loop binding for arrays of objects. Phase 1 handles Scenario C with indexed paths -
   verbose, honest, and zero new machinery. Revisit only with a real leaderboard in a real show.
8. Enterprise API-key management (scopes, multiple keys, rotation UI).
9. Expression or formatting language in the binding (`{{score}} pts`). Formatting lives in the
   template.
10. Merging `ShowDataset` into production data.
11. Converting the shipped stepper controls in Phase 1 (§2.9).

---

## 11. Architectural concerns

- **The biggest risk is fan-out, not transport.** N bound graphics times M updates per second is
  the only way this saturates the log's 50-per-5s cap. The diff in §2.6 is not an optimisation, it
  is the mechanism that keeps a 1 Hz clock inside budget - it must ship with Phase 1, not after.
- **The two deep-merge implementations (§4)** are the one genuine duplication this design accepts,
  bought for write atomicity. If that trade sours, the fallback is optimistic read-modify-write in
  the API with a version check, at the cost of a retry loop.
- **Ambiguity in binding suggestions will be common** - `Name` matching four paths. Refusing to
  guess is right, but the picker must make manual binding fast or operators will bind nothing.
- **`prvar` is a red herring.** SPX's project-variable field exists in the model but is inert
  here, and adopting its semantics would import an SPX-side behaviour we do not control into a
  studio-side concept. Leave it alone.
- **Phase 1's local-only live tree means a published production's data lives in one operator's
  browser.** That is exactly how cues already work, so it is consistent - but it is the honest
  reason Phase 2 is not optional if this is ever used on a real show with two operators.
