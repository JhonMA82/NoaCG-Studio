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
  "resolution": { "w": 1920, "h": 1080 },     // the production canvas
  "graphics": [{                                // one renderer instance per pool graphic
    "key": "Lower third",                       // = the 0008 graphic name key, unchanged
    "html": "…", "css": "…", "js": "…",
    "assets": [{ "path": "images/logo.png", "data": "data:…" }],
    "resolution": { "w": 1920, "h": 1080 }, "fps": 50
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
- **One sandboxed iframe per pool graphic**, all built at load (preload), stacked in rundown
  order (z-order = layer order later; the MVP airs one primary layer but the model is
  per-graphic instances, so layers are an ordering feature, not a rearchitecture). Each
  iframe is `composeDocument(reconstructedTemplate, { liveControl: true })` — templates start
  invisible by the SPX contract, so a stacked idle graphic shows nothing.
- **Transport** — the `hostedReceiver` behavior implemented app-side over supabase-js:
  resolve via `control_output_by_slug`, seed `lastId = last_event_id`, rebuild each graphic
  from `live[key]` (update, then snap), subscribe to `control_events` INSERTs filtered by
  show id, **re-tail on every `SUBSCRIBED`** (the reconnect gap the audit found in the hosted
  page), dedupe by row id, tail-fill on holes, route each command to its graphic's iframe as
  a `previewProtocol` message, report applied state back via `control_report` (debounced),
  heartbeat `control_output_seen` every 60 s.
- **Nothing on air but graphics.** No UI, no connection text — a disconnected renderer keeps
  the last applied state and recovers silently. `&debug=1` overlays a status readout for
  setup and rehearsal; without it the page renders nothing but the stage.
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

- **The cue rundown** — ordered cues with label, graphic, note; the LIVE cue marked (from the
  `cue` status rows + `live` reports). Selecting a cue stages nothing by itself.
- **Preview** — a local sandboxed iframe composed from the PUBLISHED template
  (`output.graphics`), settled with the selected cue's values (staged edits included). Pure
  local render; the wire is never touched. Editing or previewing can never modify program.
- **Field editing** — the selected cue's values through the shared `FieldDescriptor`
  controls; edits stage via `control_stage` (shared across operator pages, the 0008 model).
- **The five verbs**:
  - **Take** — air the selected cue: `update` (cue values + staged edits) + `play` to its
    graphic, `stop` to the previously-live graphic when different, and the `cue` status row.
  - **Update** — send the edited values to the LIVE graphic without replaying it (`update`).
  - **Next** — advance the live graphic's state machine (`next`).
  - **Out** — animate the live graphic off (`stop` — the SPX contract's out IS stop) + a
    `cue: null` status row.
  - **Preview** — no verb on the wire; the local iframe above.
- **Status** — renderer connected (from `output_seen_at` staleness, polled), live cue +
  graphic + machine state + applied values (from `live` reports), publish freshness.

Mobile: the hosted page keeps its single-column layout; the cue strip, field editor, and the
verb row are the priority content (the preview collapses first).

## 5. Where it lives in the app

- **Home rail**: the `rundowns` section becomes **Productions** (`#/home/productions`) —
  create, list, open; shows the output + control links and renderer status per production.
- **`#/production/<id>`**: the production page — name, status, links (copy output URL / copy
  control URL), publish ("Start production" = publish + verify the renderer connects; it
  never airs anything), the cue rundown editor (add from library or pool, edit values/notes,
  reorder, delete), the operator surface of §4.
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
   the OTHER graphic (cue 1's graphic plays out, cue 2 enters), Out (clean exit).
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
  can hit it (the page surfaces the slow-down error today).
- **Payload size**: `output` inlines assets as data URLs; a production heavy on large images
  makes a heavy row (read once per renderer load, so tolerable, but not free). Asset
  externalization to a public bucket is the known next step if it bites.
- **One report authority**: two open output tabs both write `control_report`; last write
  wins. Harmless for state (they converge on the same log) but `output_seen_at` cannot tell
  two renderers apart. Multi-renderer awareness is Stage-2 work.
- **Graphic identity is still the pool NAME** (the 0008 key). Renaming a pool graphic
  between publishes orphans the old key's `live`/`staged` rows until the next publish.
