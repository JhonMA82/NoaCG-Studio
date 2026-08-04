# The saved-content model (the library, productions, and the graphic lifecycle)

**Status: adopted 2026-07-21; PACKAGES RETIRED 2026-08-04** (docs/GOALS.md "Student release"
step 3 - the audit found only empty folder shells, so removal needed no data migration).
This is the binding contract for how finished work is saved, organized, reopened, and
controlled.

## 1. The shape

```text
User
├── Graphic  (GraphicDoc — the FLAT library; every save is standalone)
│   └── Control panel + entries (ControlEntry[] ON the graphic)
├── Production  (model/shows.ts Show — the live unit: pool COPIES with a graphicId
│                back-link + cues + look + capability slugs — docs/CLOUD_PLAYOUT.md)
└── Video  (model/videoProject.ts — unchanged)
```

- **`GraphicDoc`** (`model/library.ts`, localStorage `spx-gfx-graphics`, sync kind
  `'graphic'`) is the durable unit: `{ id, name, packageId, template, baseline?,
  entries, activeEntryId, createdAt, updatedAt, deleted? }`. The id is a stable UUID —
  renaming never breaks references. `entries` are the control panel's named data rows
  (`{ id, label, values: Record<fieldId, string>, updatedAt }`). `packageId` is DEPRECATED
  inert data: never read by the UI, kept (not nulled) so retirement did not bump updatedAt
  across the whole library.
- **Packages are retired.** The `'packet'` sync kind is gone (existing cloud/local rows stay
  inert; nothing reads or destroys them), all package UI and writers are removed, and
  `#/package/*` lands on Home. The ONE surviving packet path is library.ts's v1 extraction:
  a pre-library packet found in localStorage still gets its embedded graphics migrated into
  the library on read (convergent; the packet is rewritten `graphics: [] + version: 2`).
- **Shows** (`model/shows.ts`) are the PRODUCTION unit (user-facing word: production): the
  graphic pool + the cue rundown + the production LOOK + the published capability slugs —
  docs/CLOUD_PLAYOUT.md §2. Grouping graphics for air happens HERE, nowhere else.

## 2. The working document and Save

`model/project.ts` (the autosaved working slot) gains `graphicId?: string | null` and
`dirty?: boolean` — which library record the open document IS, and whether it has changed
since the last explicit Save. The store (`templateStore`) tracks
`saved: { graphicId, dirty, status: 'idle' | 'saving' | 'failed' }`:

- Any template mutation marks `dirty` (the same subscription that autosaves).
- **Save** writes the template (+ baseline + entries) into the linked GraphicDoc; first
  save opens the SAVE DIALOG: name the graphic (every save is standalone in the flat
  library).
- **Save As / Duplicate** mints a new GraphicDoc id.
- The autosave slot is the crash-safety net (reload restores edits, dirty flag included);
  Save is the durable, named, synced record. Both survive; they are never conflated.
- Opening another document with unsaved changes asks first (Save / Discard / Cancel).

## 3. Navigation (hash routes, one application)

`src/app/router.ts` — hash routing (static-host safe, refresh restores, browser
Back/Forward are real history):

| Route | Surface |
|---|---|
| *(none)* | The editor, whichever kind `docKind` persisted (unchanged refresh behavior). |
| `#/home` (+`#/home/<section>`) | Home — recent, graphics, control panels, productions, videos, looks. |
| `#/graphic/<id>` | Open that library graphic in the SPX editor. |
| `#/control/<graphicId>` | The graphic's control panel (fields + entries + event buttons + live preview). |
| `#/production/<id>` | One production's page (pool, cues, links, publish, operating). |
| `#/video` | The video editor shell. |
| `#/new` | The creation wizard over the editor. |
| `#/package/*` | RETIRED — old links land on Home. |

`?control=<slug>` and `?chat=<slug>` query routes are untouched (hosted capability URLs).
Home and the control panel are ROUTED SURFACES, not modals, so Graphic → Control panel →
Back returns to the graphic, and Video ↔ Graphics is plain history.

**Card thumbnails are a LIVE render, never a stored picture** (`components/home/GraphicThumb.tsx`).
Every Home graphic card renders the real template through `preview/composeDocument`, in a small
iframe scaled from the template's own resolution and parked at its settled on-air state (the
editor canvas's own settle recipe: `update()` → `buildInTimeline().progress(1, true)` →
`update()`). Nothing about the record changes: no thumbnail field on `GraphicDoc`, so no format
version bump, no migration, and no second copy of the artwork riding every cloud sync. It also
cannot go stale — a template edited on another device shows its new look the moment it syncs,
which is exactly when a preview has to be trusted. The cost, re-rendering per Home visit, is paid
down by mounting each iframe only once its card scrolls into view. The card frames on the
GRAPHIC rather than the canvas (`preview/frameGraphic.ts`, the same recipe behind the wizard's
picker cards): most formats occupy a fraction of the frame, so it measures the graphic's own box
once the settle is done and zooms onto that, with the whole-canvas fit as the floor.

## 4. Control panel entries

An **entry** is a named, saved data row for one graphic ("Anna Andersson — Presenter"):
create / duplicate / edit / delete / select; the ACTIVE entry's values feed the editor
preview (sample data), the in-app control panel's Play, and the exported standalone
`controlpanel.html` (entries are baked into the panel spec as a switcher). Entries live
ON the GraphicDoc, so they save, reopen, and sync with the graphic.

The HOSTED control page (`?control=<slug>`) publishes them the same way: `publishControlShow`
reads each show graphic's entries out of the library into the `panel` spec, and the page
renders a READ-ONLY switcher. Picking an entry loads its values into the SHARED staging
buffer — the same path typing takes — so it airs on an explicit take, and the hosted
`staged`/`live` model stays per-graphic, not per-entry. Authoring stays in the app; a change
reaches operators on the next publish. A show's copy of a graphic records `graphicId` (the
library record it came from) so the lookup is by stable id, not by name — see
docs/CONTROL_LAYER.md.

The whole-SHOW export (`export/showExport.ts`) carries entries the same way, and through the
same resolver (`model/library.ts` `entriesForSavedGraphic` — graphicId, unique-name fallback):
each graphic's entries are read out of the library at export time and baked into both the
aggregated `show_controlpanel.html` and that graphic's own `controlpanel.html`. Entries are
never embedded in the `Show` record, so this is not a persisted-shape change and needs no
migration — the show export references the library graphic and resolves entries on export.

**Every export that bundles an operator page carries them.** The SINGLE-GRAPHIC export (the
Export panel's SPX and HTML-overlay targets) reads them back through `ExportContext.entries`,
resolved from the working project's `saved.graphicId` at export time; the whole-SHOW export
resolves them per pool graphic as above. (The whole-PACKAGE export retired with packages —
whole-show export covers the need.) So the panel an operator downloads has the same switcher
wherever it came from, and a graphic that was never saved simply has no entries to carry —
entries are authored on the RECORD, not on the code.

## 5. Versioning

`GraphicDoc` carries `version: 1`; `Show` carries `version: 2` (normalized on read, a
format stamp for future breaking changes); the retired `Packet` keeps `version: 2` for the
v1 extraction (doctrine: STATE_MACHINE_SCHEMA §5). Additive fields never bump; sync kind
`'graphic'` ships with Supabase migration `0009_graphic_kind.sql`.
