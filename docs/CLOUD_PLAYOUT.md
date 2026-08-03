# Cloud playout — the Browser Output workflow

The binding contract for **Productions**: one persistent browser-output URL a production client
(CasparCG HTML producer, OBS Browser Source, vMix Web Browser input, any Chromium) loads once,
plus the operator workflow that prepares and airs graphics through it. This doc governs
`src/output/`, the production surfaces in `src/components/home/`, the cue additions to
`src/model/shows.ts`, and migration `0029_cloud_playout.sql`.

Read `docs/CONTROL_LAYER.md` first — cloud playout is a THIN layer over the hosted-control
system (migration 0008), not a second control architecture. The command log, the RPC surface,
the staged-vs-take model, the recovery doctrine, and the receiver semantics are all inherited
unchanged.

## What was reused, and what is new

Reused verbatim (the audit that chose this is summarized in §9):

- **The durable command log** — `control_events` + `control_send`/`control_tail` (0008): the
  INSERT is the send, DB order is the truth, gap-fill + hole detection recover a reconnect.
- **The capability model** — an unguessable slug in the URL is the authorization; SECURITY
  DEFINER RPCs are the gate; owning/publishing needs sign-in (RLS), operating does not.
- **Staged-vs-take** — `control_stage` + the shared `staged` buffer: nothing airs because it
  was typed; airing is an explicit Take.
- **Recovery doctrine** — reset is two operations, recovery is both: the data half (update),
  then the visual half (snap — timers arm). The renderer rebuilds from its own last
  `control_report`.
- **Rendering** — `composeDocument(template, { liveControl: true })` in a
  `sandbox="allow-scripts"` iframe (the GraphicControlPage pattern), commands crossing as
  `previewProtocol` postMessages.
- **The record layer** — `Show` (sync kind `'show'`, packet conventions) grows cues
  additively; `ControlEntry` stays the per-graphic saved data row; the library resolvers
  (`resolveSavedGraphicDoc`, `templateForSavedGraphic`) stay the one lookup.

New:

- **`output.html`** — a 4th Vite MPA entry: the persistent transparent renderer page.
- **Cues on the Show record** — a first-class ordered cue list (§2).
- **Migration 0029** — `output_slug` + `output` payload on `control_shows`, two output RPCs,
  a `cue` status row in the send allowlist, owner pruning of old log rows.
- **The Productions UI** — the Home rail section + `#/production/<id>` page (§5).

## 1. The three activities, separated

1. **Create and edit graphics** — the editor, unchanged.
2. **Prepare a production** — the production page: pick graphics, write cues, publish.
3. **Operate the live production** — the operator surfaces driving the output URL.

A **production** is the user-facing name for the `Show` record (the UI word "Rundown" is
retired; the model file keeps its name — renaming `shows.ts` would churn sync kind `'show'`
for nothing). One production = one output URL + one control page + one cue rundown.

## 2. The data model

### Cues (local, additive on `Show`)

```ts
/** One prepared, orderable data row of the production — "what airs next", not a graphic. */
interface ShowCue {
  id: string;              // uuid — stable across edits and reorders
  sourceId: string;        // the pool entry (SavedGraphic.id) this cue drives
  label: string;           // "Anna Andersson — Presenter"
  values: Record<string, string>; // fieldId -> value, the cue's prepared data
  note?: string;           // operator note, shown in the rundown
}

interface Show {
  // ...existing fields unchanged...
  cues?: ShowCue[];        // ADDITIVE OPTIONAL — rundown order; absent = no cues authored
  outputSlug?: string;     // the published output URL's capability, like hostedSlug
}
```

- `Show.graphics` stays the graphic POOL: which templates the production can air, each once
  (the name-keyed add is unchanged — one renderer instance per pool graphic). **Cues are data
  rows over the pool**: many cues may reference the same pool graphic (`sourceId`), which is
  how "speaker lower third" airs Anna at cue 2 and Ben at cue 7 without a second copy of the
  template. This dissolves the same-graphic-twice problem without touching the name-keyed
  channel identity every receiver already ships with.
- Both fields are additive optional — no version bump, no migration, an older build reads and
  writes the record untouched (rule 6). `makeConflictCopy` strips `outputSlug` exactly as it
  strips `hostedSlug`: the published pages belong to the original record.
- Adding a graphic to a production auto-creates one cue seeded from the template's field
  defaults, so the cue rundown is never empty-but-working. Entries (`ControlEntry`) remain the
  per-graphic saved rows; the cue editor offers "from entry…" as a starting point, but a cue
  OWNS its values — editing a cue never writes back to an entry.

### The published payload (server, migration 0029)

`control_shows` grows two columns:

- **`output_slug text unique`** — a second, independent capability: holding it authorizes
  RENDERING the production, nothing else. It never appears in `control_show_by_slug`, so a
  control-page operator cannot derive it, and the output URL cannot operate the show beyond
  what rendering requires (`control_report`). Generated URL-safe
  (`translate(encode(gen_random_bytes(9),'base64'),'+/','-_')`) — the 0008 slug's raw base64
  survives only inside a query parameter; this one must also survive being hand-typed.
- **`output jsonb`** — the renderable payload, written at publish:

```jsonc
{
  "v": 1,
  "resolution": { "width": 1920, "height": 1080, "label": "…" }, // the production canvas
  "graphics": [{                                // one renderer instance per pool graphic
    "key": "Lower third",                       // = the 0008 graphic name key, unchanged
    "html": "…", "css": "…", "js": "…",
    "assets": [{ "path": "images/logo.png", "data": "data:…" }],
    "resolution": { "width": 1920, "height": 1080, "label": "…" }, "fps": 50
  }],
  "cues": [{ "id": "…", "graphic": "Lower third", "label": "Anna",
             "values": { "f0": "Anna Andersson" }, "note": "after the intro" }]
}
```

**Publishing pins a version.** The payload is a snapshot taken at publish; editing a graphic
in the library changes the output only on the next publish. This deliberately inverts the
live-resolution doctrine (`templateForSavedGraphic`) that the hosted PANEL spec keeps: an
operator page should always match the current design, but a renderer that has been on air for
three hours must never change under the operator's feet. The production page shows a "changes
not yet published" hint when the library template or cue list is newer than the last publish.

### Server changes (migration `0029_cloud_playout.sql`)

1. `control_shows.output_slug` + `control_shows.output` (above), plus
   `control_shows.output_seen_at timestamptz` — the renderer's heartbeat.
2. **`control_output_by_slug(p_output_slug)`** → `(id, title, output, live, last_event_id)`.
   SECURITY DEFINER, granted to anon — the renderer's one resolve call. Returns neither
   `panel`, `staged`, nor the control slug.
3. **`control_output_tail(p_output_slug, p_after)`** — `control_tail` addressed by the output
   capability (the renderer must not hold the control slug).
4. **`control_output_seen(p_output_slug)`** — stamps `output_seen_at`; the renderer calls it
   every 60 s. Operator surfaces read the staleness as the "renderer connected" indicator.
5. **`control_send` allowlist grows `'cue'`** — a STATUS row (`{t:'cue', cue: <id>}`) the
   control surfaces write on Take so every open page agrees on which cue is live. Receivers
   ignore unknown `t` by construction (verified against `receiverScript.ts` and
   `hostedReceiver.ts` — the row is backward-compatible with already-exported graphics).
   The row has always named its GRAPHIC (`control_events.graphic`), so the log was per-layer
   from the start; making a production multi-layer (0034) changed only the row snapshot below
   and the clients reading it, never the wire.
5b. **`control_send_many(p_slug, p_items)`** — a multi-part verb (Take is update → stop
   previous → play → cue) as ONE atomic, log-ordered insert: one RPC round-trip of on-air
   latency instead of four, and it cannot fail halfway. Validated per item, burst-checked
   once for the batch, capped at 8 items (a verb, not an ingest API).
6. **Owner pruning** — a DELETE policy on `control_events` for the show's owner; the publish
   path deletes rows older than 7 days. Keeps the append-only log from growing without bound
   under a 24/7 output URL (the 0008 schema has no retention at all).
7. `control_show_by_slug` grows `output` in its return — the hosted operator page uses the
   published templates for its local PREVIEW iframes (§4).

Entitlement: the whole surface rides **`control.hosted`** — publishing writes `control_shows`
(already gated by the 0022 restrictive policy), and every operator write already passes the
RPC-internal owner check. The output READ RPCs stay open like `control_show_by_slug`
(0022 doctrine: reads render and explain themselves; commands are what the gate refuses).
A separate `playout.*` key can split the two features later without schema changes.

## 3. The output renderer (`/output?production=<output_slug>`)

A 4th MPA entry (`output.html` → `src/output/`), following the `/admin` build shape (own
entry module, own CSS, no `styles.css`, no `trackPageVisit()`) with the OPPOSITE access
model (the `?chat=`/`?control=` capability pattern: the slug in the query IS the auth).

The page:

- **Stage** — a fixed-size stage at the production resolution, CSS-scaled to the viewport
  (predictable broadcast scaling: 1920×1080 design pixels regardless of window size),
  transparent background (`html, body, iframe { background: transparent }`,
  `<meta name="color-scheme" content="dark">` on BOTH the page and every srcdoc — the
  Chromium opaque-iframe rule).
- **One sandboxed iframe per pool graphic**, all built at load (preload). Each iframe is
  `composeDocument(reconstructedTemplate, { liveControl: true })` — templates start invisible
  by the SPX contract, so a stacked idle graphic shows nothing.
- **Every graphic is a LAYER, and pool order is the stack** — index 0 furthest back, the last
  entry on top, carried through the published payload's `graphics` array to the stage, which
  states it as an explicit `z-index` rather than relying on append order. The production page
  authors it (§5) and a re-publish is what moves it, like every other pinned fact. Several
  layers are on air at once by design: a bug, a lower third and a ticker are three graphics,
  so taking a cue on one leaves the other two exactly as they were. That is why a cue's
  identity is its GRAPHIC — one cue per layer, never one cue per production.
- **Transport** — the `hostedReceiver` behavior implemented app-side over supabase-js:
  resolve via `control_output_by_slug`, seed `lastId` from the RECOVERY BASELINE (below),
  rebuild each graphic from `live[key]` (update, then snap), subscribe to `control_events` INSERTs filtered by
  show id, **re-tail on every `SUBSCRIBED`** (the reconnect gap the audit found in the hosted
  page), dedupe by row id, tail-fill on holes, route each command to its graphic's iframe as
  a `previewProtocol` message, report applied state back via `control_report` (debounced),
  heartbeat `control_output_seen` every 60 s.
- **Nothing on air but graphics.** No UI, no connection text — a disconnected renderer keeps
  the last applied state and recovers silently. `&debug=1` overlays a status readout for
  setup and rehearsal; without it the page renders nothing but the stage.
- **The recovery baseline is per graphic, and it is what the renderer APPLIED** (migration
  0033). Every report writes `live[graphic].event` — the last log row that renderer had
  applied when it captured that truth. Boot rebuilds each graphic from its own report and
  then follows the log from the OLDEST of those baselines, dropping only rows a graphic's own
  snapshot already contains. The rule it replaces looked identical and was not: 0029 seeded
  the cursor with the log HEAD, so anything commanded between the last report and the boot
  counted as applied and was dropped. A running renderer reports within ~800 ms of any
  command, so the hole was invisible in rehearsal — but while the renderer is DOWN the hole is
  the whole outage, which is the exact case recovery exists for (kill the output page, take a
  cue, bring it back: the pre-kill picture returned and the cue never aired; found on prod
  2026-08-03 by §8's step 5). A snapshot with no baseline (pre-0033 row or renderer) is
  replayed rather than trusted — a needless re-animation is recoverable, a lost take is not.
  Catch-up is paged: the tail RPC answers 500 rows, so `followControlLog` keeps pulling while
  pages come back full instead of recovering only the first page of a long outage.
- **Recovery is never watchable.** The doctrine is data, then SNAP — instant, timers arm — and
  catch-up rows break it by their nature: they are ordinary commands, so replaying them animates.
  A reopened output would air the outage's history (a graphic entering, a cue leaving, another
  entering) before settling. So the whole boot pass — the rebuild AND the replay — runs with the
  stage hidden (`setVisible`, an opacity on the renderer's own surface, never the graphics'
  state), and the stage returns after a fixed settle. Nothing to replay hides nothing, so an
  ordinary reopen still paints at once. The settle is fixed rather than "wait for quiet": a
  recovered state can legitimately keep moving (a ticker, a clock), so a quiet-period test would
  never fire.
- **Snap resets the graphic first, and the reset is blunt** (`clearProps: 'all'` over the root's
  subtree). It clears inline styles the DATA layer owns, not just the motion's: an image field
  with no picture hides itself inline, so recovery used to put a broken-image box on air beside
  the caption (seen in CasparCG, 2026-08-03; every design with a `filelist` field was exposed).
  Two guards now, because the runtime lives in two places: the emitted interpreter re-hides every
  srcless field image after its reset, and the renderer restates the data AFTER the snap — which
  is what repairs graphics whose code was published before the interpreter learned the rule.
  `e2e/snap-recovery.spec.ts` is the gate: it drives every image-bearing design through recovery
  and fails if a snap changes what the fields decided to show.
- **It must parse on an OLD CEF.** CasparCG 2.3.x LTS — the ordinary school/student install
  — embeds a ~Chromium 65 browser. A real 2.3.2 server rejected the first build outright
  (`Uncaught SyntaxError: Unexpected token ?`: `?.`/`??` need Chromium 80), showing a dead
  layer with nothing on air and no clue why. Two rules follow, and neither is optional
  while 2.3.x is a supported target: **the Vite build target stays at `es2017`** (it covers
  every bundle, including the dynamically imported supabase client), and **`output.html`
  carries the runtime shims** for the APIs that engine lacks (`globalThis`,
  `Object.fromEntries`, `AbortController`, `queueMicrotask`). The template code inside the
  iframes is emitted text that Vite never transpiles, so the same bar applies to
  `ANIM_INTERPRETER_JS` and every design-owned runtime: no `?.`, no `??`. None of this is
  caught by `npm run build` or the e2e suite — only a real old-CEF server shows it, which
  is why it is written here.
- Offline build / bad slug: a neutral dark "not available" card (never on a production's
  air — this state only exists when the URL was wrong to begin with).

The URL is persistent by construction: the slug lives on the `control_shows` row and survives
every re-publish. Unpublishing deletes the row (the URL 404s honestly); re-publishing mints a
new slug only if the row was deleted in between.

## 4. The operator surfaces

Two clients of the same log — the four-renderers doctrine of `docs/CONTROL_LAYER.md` extended
by a cue vocabulary. Preview is LOCAL on both; program is only ever changed by an explicit
send.

**The production page** (`#/production/<id>`, in-app, the owner's cockpit — §5) and the
**hosted control page** (`?control=<slug>`, no login, phone-capable) both present:

- **The cue rundown** — ordered cues with label, graphic, note; every LIVE cue marked (from the
  `cue` status rows + `live` reports). Selecting a cue stages nothing by itself. There is no
  single live cue: one per layer that is up, so several rows carry the mark at once.
- **Preview** — a local sandboxed iframe settled with the selected cue's values. Pure local
  render; the wire is never touched, so editing or previewing can never modify program. The
  PRODUCTION page deliberately previews the LOCAL (to-be-published) template — it is the
  authoring cockpit, and the "changes not yet published" hint names any divergence from what
  the renderer runs. The hosted page ships no visual preview in the MVP (cue strip + fields +
  live status); the published payload already carries the templates, so adding one there is
  UI work, not schema work.
- **Field editing** — the selected cue's values through the shared `FieldDescriptor`
  controls; edits stage via `control_stage` (shared across operator pages, the 0008 model).
- **The verbs, and the layer each one addresses.** Every verb below Take acts on ONE LAYER —
  the layer of the SELECTED cue on the production page, the layer of the row the button sits on
  in the hosted page. There is no longer a "the live graphic" for a header button to mean, so
  the surface has to name which layer it is about, and the operator's own selection is the
  least ambiguous answer.
  - **Take** — air the selected cue AS PREPARED: `update` (the cue's values — on the
    production page including its unsaved draft edits) + `play` + the `cue` status row to its
    OWN graphic — one atomic batch (`control_send_many`). It stops nothing. Taking a second
    cue on the SAME graphic re-airs that one instance, which is what makes two cues over one
    lower third replace each other rather than stack; taking a cue on ANOTHER graphic leaves
    the first up, because that is another layer. Staged edits do NOT ride a cue Take; they air
    through the graphic card's own ⟳ Take, which exists for exactly that. The send RPCs mirror
    each cue marker onto `control_shows.live_cue` (0031, per-layer since 0034), so a reloading
    surface recovers what is on air from the row rather than scanning a log window that global
    event ids can defeat.
  - **Update** — send the selected cue's edited values to its layer without replaying it
    (`update`). Legal only while that cue is the one on air on its layer: pushing another
    cue's data onto a live layer would be a take nobody asked for.
  - **Next** — advance that layer's state machine (`next`).
  - **Out** — animate that layer off (`stop` — the SPX contract's out IS stop) + a `cue: null`
    status row. The other layers stay up.
  - **All out** — every live layer off, in batches of four layers (`control_send_many` takes
    eight items and Out costs two). With per-layer Out no single verb clears the frame any
    more, and "get everything off" is the one an operator reaches for under pressure.
  - **Preview** — no verb on the wire; the local iframe above.
- **Status** — renderer connected (from `output_seen_at` staleness, polled), every live layer
  with its cue + machine state + applied values (from `live` reports), publish freshness.

Mobile: the hosted page keeps its single-column layout; the cue strip, field editor, and the
verb row are the priority content (the preview collapses first).

## 4a. Rehearse vs Show

**Rehearsal is the whole operator workflow with the wire taken away.** The verbs drive a LOCAL
copy of the production's own output — `createOutputStage` over `buildOutputPayload`, the exact
two functions the published `/output` page is built from — and nothing is written to the log.
Practising a rundown, checking that a new lower third really does sit under the ticker, learning
the verbs: none of it needed to cost an airing, and before this there was no way to do any of it
except on air.

- **Each verb is defined ONCE, as the commands it is** (`takeCueItems`, `clearCueItems`,
  `clearAllCueBatches`), and the surface either SENDS those `ControlSendItem`s or APPLIES them to
  the rehearsal stage. That is what makes a rehearsal worth trusting: rehearsing and airing are
  the same commands in the same order through the same renderer, not two implementations that
  have to be kept in step by hand. `ProductionPage`'s `runVerb` is the one place the destination
  is decided.
- **The mode is this operator's, not the production's.** It lives in the page, never on the
  record or the server. Rehearsal only ever takes the wire AWAY, so a rehearsing operator cannot
  reach anyone else's air, and the mistake that actually matters — believing you were rehearsing
  while you were live — is the one this shape cannot produce. Two operators can therefore
  disagree about the mode safely: whoever is in Show is the one airing, and their page says so.
- **It is always opt-in, including before publishing.** Making an unpublished production rehearse
  by default read tidily and was wrong: the cue preview is how a rundown gets BUILT, and swapping
  it for a rehearsal output takes that away from everyone still authoring. So the strip carries
  three honest states — `NOT PUBLISHED` (nothing to air yet, verbs dead, cue preview), `SHOW`
  (published, verbs air), `REHEARSE` (verbs drive the local stage) — and the mode strip is
  always present and always coloured, because a mode you have to go looking for is a mode you can
  be wrong about.
- **The rehearsal has its own live map.** A rehearsal must never make the page report something
  about the real output, so the on-air marks, the layer chips and the verb legality all read
  whichever map the current mode owns. Entering or leaving rehearsal builds a fresh stage with
  nothing up, and empties that map with it.
- **The payload comes from the LOCAL show, not from what was published** — rehearsing is how you
  check a change before publishing it. It rebuilds only when the POOL changes (a graphic added,
  removed, reordered, or re-saved); cue values ride each Take as `update` data, so typing never
  restarts the rehearsal.
- The hosted phone page has no rehearsal: it exists to operate a live production, and it has no
  local stage. Adding one is UI work over the payload it already loads.

Because none of this touches the backend, it is the one part of §4 the OFFLINE e2e suite can
drive end to end — `e2e/productions.spec.ts` takes two cues, asserts both layers are up and that
the values reached the rendered documents, then Outs one layer and All-outs the rest.

## 5. Where it lives in the app

- **Home rail**: the `rundowns` section becomes **Productions** (`#/home/productions`) —
  create, list, open; shows the output + control links and renderer status per production.
- **`#/production/<id>`**: the production page — name, status, links (copy output URL / copy
  control URL), publish ("Start production" = publish + verify the renderer connects; it
  never airs anything), the cue rundown editor (add from library or pool, edit values/notes,
  reorder, delete), the **layer stack** (the pool, listed FRONT TO BACK like every layer panel,
  with ↑/↓ moving a graphic forward and back, its layer number, and an on-air mark), the
  **mode strip** (§4a) and the operator surface of §4. The stored pool stays in PAINT order — index 0 furthest back, which
  is what the payload and the stage read — and only the list is reversed, so there is one
  ordering in the data and one convention on screen.
- **The editor's Control tab**: its Rundowns block renames to Productions and links out to
  the production page; adding the current graphic to a production stays.
- The wizard Finish step and Home rows keep their existing doors; a graphic's "add to
  production" is reachable from the production page (pool + cue add), not a new wizard branch.

## 6. Export parity (nothing removed)

The six zip targets, the whole-package export, and the whole-show export are untouched.
`buildShowZip` keeps producing the offline `show_controlpanel.html` + per-graphic folders, and
a published production still bakes the hosted receiver into exported graphics — the
self-hosted/offline path is the same production operated over the same log, with the renderer
swapped from `/output` to the user's own hosting. The long-term output model:

1. **NoaCG Cloud Output** — the `/output` URL (this doc).
2. **Self-hosted NoaCG Output** — the exported package + hosted receiver (existing).
3. **Portable package export** — the six targets (existing; offline, archival, restricted
   networks).

## 7. The automatic-data direction (design constraint, not built)

The browser-output architecture must not need replacing when external data arrives. What this
milestone fixes in place:

- **One ingress.** External data becomes `update` rows in the SAME log, written server-side —
  a connector is a producer next to the operator, never a second path into the renderer. The
  renderer stays dumb: it applies log rows in order, whoever wrote them.
- **Normalized fields.** A connector maps provider payloads to the graphic's own `fN` fields
  server-side (the normalized-schema layer); the graphic never learns provider field names.
  The Google-Sheets polling block (`control/liveData.ts`) remains the client-side stopgap and
  is superseded by server-side connectors, not extended.
- **Credentials stay server-side.** Provider keys live in the backend (the sealed-key /
  gateway patterns already exist for AI); the output page never holds them. The backend
  fetches once, validates, caches, and fans out through the log — renderers never poll
  providers.
- **Operator precedence.** Operator commands and data updates are ordered by the one log, so
  "manual override / freeze" is a connector-side gate (stop writing), not renderer logic.
- **Local venue data** (timing/scoring systems on closed networks) will need a small local
  bridge maintaining an outbound connection that writes the same log — nothing in this
  design assumes a source is cloud-reachable.

Recommended first experiments, after this MVP is proven in a real production:
**A.** a published-CSV Google Sheet driving a ticker through a server-side poller (validates
mapping, freshness, override, reconnect); **B.** one legitimate stock-data provider through
the backend (validates credentials, caching, rate limits, delayed-data labeling,
last-known-good). Choose concrete providers only after licensing/cost review.

## 8. Live-verify checklist (real Supabase — a green build never counts)

1. `supabase db push` applies 0029 cleanly; `supabase migration list --linked` shows it.
2. Signed in: create a production, add two graphics, author 3 cues (two on one graphic),
   publish → both links appear; `control_shows` row has `output_slug` + `output` payload.
3. Load `/output?production=<slug>` in a plain browser tab: transparent, nothing visible,
   `&debug=1` shows connected + graphics loaded; `output_seen_at` advances.
4. From the production page: Preview cue 1 (program unchanged), Take cue 1 (airs), edit a
   field + Update (live text changes without replay), Next (state advances), Take cue 2 on
   the OTHER graphic — **both are now on air**, each on its own layer, cue 1 untouched — then
   Out on cue 2's layer (only that one exits) and All out (the frame clears).
4b. **Layers**: with two graphics up that overlap on screen, reorder them on the production
   page (↑/↓), re-publish, and reload the output — the one listed higher paints over the
   other. Take a third cue on the SAME graphic as cue 1: it replaces cue 1 rather than
   stacking, because a graphic is one layer and one renderer instance.
5. Kill the output tab, reload → it snaps back to the pre-kill on-air state (data, then
   snap). Kill the network briefly → commands sent meanwhile apply on reconnect, in order.
6. Open `?control=<slug>` on a phone (signed out): cue strip + fields + verbs usable; a Take
   from the phone airs on the output tab; the live chip agrees on both surfaces.
7. OBS Browser Source and CasparCG HTML producer (`CG ADD 1-20 "<url>" 1`): transparent,
   correct scale at 1920×1080, survives a CasparCG channel restart.
8. Unpublish → output URL and control URL both go dead honestly; re-publish → same record,
   new session, output URL unchanged only if the row was updated rather than deleted.

## 9. Why not… (decisions with their reasons)

- **A new `production` record kind?** The Show record already carries identity, order, sync,
  tombstones, and the hosted-control linkage (`control_shows.id = Show.id`). Cues are
  additive. A parallel kind would duplicate all of it and orphan existing rundowns.
- **A new command transport?** The 0008 log already has ordering, recovery, gap-fill, shared
  staging, and burst caps, and its RPCs are live on prod. The renderer is a new CONSUMER of
  the same log.
- **Realtime Broadcast for the renderer?** Fire-and-forget (no replay) — a renderer that
  reconnects must recover exactly what it missed; only the durable log gives that.
- **Serving composed HTML from a Vercel function?** Costs a function slot (2 of 12 left),
  loses HMR/dev parity, and duplicates `composeDocument`. A static entry + client-side
  compose reuses the proven path and keeps the renderer self-updating on deploy.
- **Templates in the panel spec instead of a second payload?** The panel spec is deliberately
  live-resolved and light (operator pages re-publish cheaply); the output payload is
  deliberately pinned and heavy. Different lifecycles, different columns.
- **`hello`/`graphic-online` on the wire?** The hosted path's boot recovery is self-service
  (the renderer rebuilds itself from `live`); the announce round-trip is a BroadcastChannel
  affordance and stays there.

## Known limits (deliberate, documented)

- **The `control_events` anon SELECT** (`0008:60-61`, `using (true)`) lets any holder of the
  anon key page through EVERY show's log via PostgREST — the show id is only a secret against
  Realtime filters. Narrowing it breaks receivers already baked into exported user files, so
  0029 does not touch it; field values on hosted shows remain effectively public. Owner
  pruning (7 days) now bounds the exposure window. Closing it fully needs a v2 receiver
  generation + a deprecation window — an explicit product decision, not a quick fix.
- **The 50-commands-per-5-s cap is per show**, shared by all operators AND the `cue` status
  rows. Fine for one operator + one renderer; a two-operator production hammering steppers
  can hit it (the page surfaces the slow-down error today). **All out** costs two commands per
  live layer, so it is the one verb whose price grows with the production — a twelve-layer
  clear is 24 of the 50, which is affordable but not free.
- **Payload size**: `output` inlines assets as data URLs; a production heavy on large images
  makes a heavy row (read once per renderer load, so tolerable, but not free). The HOSTED
  OPERATOR page pays the same row on every load while using only the cue list from it — a
  deliberate MVP trade (the templates are already there for a future preview); splitting the
  cues out of the operator resolve is the fix if a metered phone connection makes it bite.
  Asset externalization to a public bucket is the known next step if the renderer side bites.
- **One report authority**: two open output tabs both write `control_report`; last write
  wins. Harmless for state (they converge on the same log) but `output_seen_at` cannot tell
  two renderers apart. Multi-renderer awareness is Stage-2 work.
- **Graphic identity is still the pool NAME** (the 0008 key). Renaming a pool graphic
  between publishes orphans the old key's `live`/`staged` rows until the next publish.
- **`control_events.id` is a GLOBAL identity**, so per-show id sequences have legitimate gaps
  whenever other shows are active on the instance. A consumer cannot tell a benign gap from a
  missed row, so every suspected hole answers with a tail round-trip (correct either way; the
  cost is one extra RPC of latency on that command when the instance is busy). A per-show
  sequence number would remove the ambiguity — schema work for the multi-layer stage. The
  RECOVERY half of this ambiguity (an id-windowed scan for the on-air cue that busy traffic
  could defeat) is gone since 0031 mirrors the cue marker onto the row.
