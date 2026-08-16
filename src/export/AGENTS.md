# src/export - export targets & packaging

Loaded alongside the root AGENTS.md when working in this directory (Claude reads it via this directory's CLAUDE.md import; Codex reads it directly). Keep it accurate. Exported
packages must be plug-and-play - relative paths, bundled GSAP, no CDN references - and
validation gates every export (root non-negotiables 3 and 4).

Every package preserves `SpxTemplate.resolution` and `fps`. HTML entry points carry the
`noacg-project-format` meta tag for exact round-trip detection; OGraf/LiveOS carry the same
authored-format statement in readable package code/instructions. This is metadata, never
export-time reflow, stretching, or cropping.

- **registry.ts** - 6 targets, each with its own successMessage + ExportContext (the Data
  panel's sampleData rides along so serverless targets can bake it, and the graphic's saved
  control-panel `entries`, which the CALLER resolves - ExportPanel reads them out of the library
  by the working project's `saved.graphicId`, fresh at export time, and they are simply absent
  for a project that was never saved. Only the two targets that bundle an operator page - SPX
  and the HTML overlay - consume them).
- **slug.ts** - shared slug helper (lives here to avoid an import cycle).
- **selfContained.ts** - single-file composer: inline CSS/GSAP/JS/assets/FONTS + extra body
  scripts. ASYNC, because the fonts are fetched to be embedded.
- **bundledFonts.ts** - the one place that knows how a builder font leaves the app. Generated CSS
  always says `url("fonts/<file>")`; there are exactly two ways to honour that, and the package
  shape picks one. A FOLDER package ships the file beside the HTML (common.ts
  `addReferencedFonts`); a SINGLE-FILE package has no sibling to ship to, so `inlineBundledFonts`
  embeds the bytes as a data: URL. Call it AFTER inlineAssetRefs - an imported font is an asset
  and is already substituted by then, so whatever still matches is builder-bundled. A font that
  cannot be fetched THROWS here (the folder writer only skips): nothing downstream fails when a
  face is missing, because `font-display: swap` just paints the fallback, so the graphic would
  play out in the wrong typeface with no error anywhere. That was a real shipped bug in all three
  single-file targets. Pinned by exports.spec.ts, which opens each one alone over `file://` -
  setContent() and srcdoc both inherit the dev server's base URL and hide exactly this class of
  defect.
- **targets/spxStarter.ts** - the one SPX export = spxTarget, id 'spx'; + buildStarterInto,
  reused by the show export. **The template file carries the graphic's own slug**
  (`hairline/hairline.html`, never index.html): SPX rundowns list FILES, and an
  index.html-per-folder package listed every NoaCG template as "index" (real SPX packs name
  every template file - see example_projects/). The show export passes `fileName` so a
  collision-suffixed folder and its file agree (`ticker_2/ticker_2.html`).
- **outputEmbed.ts** - the OUTPUT EMBED: one standalone .html that frames a published production's
  `/output?production=<slug>` URL, downloaded from the production page's Links block beside the URL
  itself (never from the export dialog - it packages no graphics, it IS that link in another
  shape). It exists because an SPX rundown lists template FILES out of ASSETS/templates and has
  nowhere to paste a URL, so the cloud output reached every playout host except the canonical one.
  It is a legal SPX template (definition + the classic play/stop/update/next globals) whose verbs
  move the FRAME only: Play shows it, Stop hides it, and cues stay with the NoaCG operator, because
  the file carries the OUTPUT capability alone - a template that could air a cue would have to
  carry the control slug onto every playout machine. The emitted script is **ES5 with a
  color-scheme meta**, for the two failure modes docs/CLOUD_PLAYOUT.md §3 records: CasparCG 2.3.x's
  ~Chromium 65 CEF rejects the whole file on a `?.`, and Chromium paints a framed page opaque when
  the schemes disagree. `update()` re-points the frame at another production and only reloads on a
  REAL change - a repeat would throw the connection away and rebuild what is on air. Pinned by the
  two embed cases in e2e/productions.spec.ts, which run the generated file for real.
- **onAirGuide.ts** - GETTING-ON-AIR.md, the playout-side quick guide bundled into the SPX,
  CasparCG, HTML-overlay and show packages (condensed from docs/PLAYOUT_INTEGRATION.md - keep
  them in agreement). It carries the control panel's connectivity truth: BroadcastChannel is
  origin-scoped, so the panel pairs only over one http(s) origin in one browser - never over
  file:// (private opaque origins) and never into OBS/vMix/CasparCG's own engine.
  **IT ONLY DESCRIBES WHAT THE CALLER ACTUALLY BUNDLED** (`onAirGuideMd({ localController })`,
  acceptance round 2): one text served every flavour, so a CasparCG or SPX package - which
  carries no relay ON PURPOSE - told its reader to double-click a "Start controller.cmd" that
  was never written into it. A guide that names a missing file reads as a broken export. The
  no-launcher flavours instead say what DOES steer them and point at the overlay target for a
  double-click operator page; the launcher FILENAMES appear only in packages that carry them,
  which is what `e2e/exports.spec.ts` asserts by absence.
- **fieldReference.ts** - FIELDS.md, the package's DATA CONTRACT: the ID/field/type/default
  table plus dropdown values, filelist/checkbox/hidden notes, the steps line, buttons, and
  paste-ready JSON + CasparCG `componentData` payloads built from the graphic's OWN ids.
  `casparClientStepsMd` is the **CasparCG Client** walkthrough (the official SVT client, which
  is what the owner's students use): find the template in the Library, drag it into the
  rundown, set the video layer to the number the graphic declares, fill the key/value grid with
  IDS not names, then Play/Update/Next/Stop. It carries THAT graphic's own template name, layer
  and default values, so the steps are followed rather than adapted - a student who has never
  sent a CG command cannot turn `CG 1-20 ADD …` into "which box do I type the name in". The
  AMCP form stays below it for another client, a script, or a bug report. It ships in the two
  packages a CasparCG server actually receives (the CasparCG target and the SPX folder package,
  which the README tells you to drop into an SPX **or** CasparCG templates directory) and
  nowhere else - on a host that shows the fields by name, the steps would be noise.
  **Every package ships it** - all six single-graphic targets and both production builders -
  because a playout client speaks ids (`{"f0": "…"}`) and nothing on its screen says which id
  is the title. `showFieldReferenceMd` is the production edition: an index of every graphic by
  its playout layer, then one table each. One generator for all of them, so a package's
  documented ids can never disagree with the ids it ships.
- **localControl.ts + local-relay/** - the LOCAL-CONTROL bundle the overlay flavors ship
  (single overlay + the production overlay package): relay.ps1 (Windows PowerShell 5.1) and
  relay.py (python3), TWO stdlib implementations of ONE versioned protocol (v1: /relay/ping,
  /relay/head, /relay/log?after=N, POST /relay/send, static files from the package root,
  rows persisted to relay-log.jsonl), plus double-click launchers per OS and payload.json
  (the package manifest). The panel gains a relay SEND transport (controlPanelHtml
  `sendRelay`, probe on /relay/ping) and every overlay graphic carries the relay RECEIVER
  (control/localReceiver.ts - polls the log, `?stream=` aware, inert over file:// or plain
  static hosting). This is the only route into a graphic loaded by OBS/vMix's separate
  browser engine. Both servers are conformance-tested for real by
  `npm run test:local-relay` (scripts/local-relay.test.mjs - keep protocol changes in BOTH
  implementations and that harness); the browser ends are pinned by e2e/local-relay.spec.ts
  against an in-spec v1 implementation. SPX/CasparCG packages carry NO relay on purpose -
  the playout host is the controller there.
- **targets/htmlOverlay.ts** - OBS/vMix browser source: an autoplay block fills fields from baked
  sampleData -> definition defaults, then play(). An auto-out `out` = N ms setting rides
  along: the block measures the entrance from a paused throwaway timeline and schedules
  stop() at entrance + delay (the bundled control panel's Stop still works sooner). Receiver
  + controlpanel.html bundled.
- **targets/h2r.ts** - H2R Custom HTML: GDD block from DataFields + play()-toggle shim.
- **targets/casparcg.ts** - selfContained + JSON/XML data shim.
- **targets/ograf.ts** - EBU OGraf v1: manifest from DataFields + graphic.mjs Web Component;
  AMD-guarded gsap loader. Export intent maps to live/non-real-time manifest capabilities.
  Non-real-time seeks rebuild an isolated document and replay the OGraf action schedule through
  `render/runtimeScript.ts`'s virtual clock, so timestamp order cannot leak state. The target's
  conservative compatibility gate must pass before `supportsNonRealTime` is advertised.
  `addOgrafPackage` is reused by **targets/liveos.ts** in explicit live-only mode - LiveOS's HTML5
  graphics engine is OGraf-compliant, so that target is the same live package with NetOn.Live
  install steps in the README.
- **showExport.ts** - whole SHOW -> one zip: a Starter folder per graphic + ONE aggregated
  show_controlpanel.html (a card per graphic, each on its own channel). Each graphic's saved
  control-panel ENTRIES are resolved out of the LIBRARY at export time (model/library.ts
  `entriesForSavedGraphic`, by graphicId with a unique-name fallback - the SAME resolver the
  hosted control page uses) and baked into both the aggregated panel and each graphic's own
  controlpanel.html; entries are never embedded in the show, so there is no persisted-shape
  change to migrate (docs/SAVED_CONTENT_MODEL.md §4). **Two playout rules it owns
  (student-release acceptance, 2026-08-05): NO hosted receiver, published or not** - the
  package is the offline door and SPX/CasparCG are the controller; a baked log follower's boot
  recovery snapped graphics to their last reported (off) state right after the host's play()
  ("flashes in and disappears" on real hardware; cloud-driven browser sources are the
  HTML-overlay flavor's opt-in job) - **and DISTINCT playout layers per pool graphic**
  (`showGraphicLayer`: 5 + pool index, capped at SPX's webplayout 20), because every generated
  template declaring playlayer '7' meant two templates in one rundown evicted each other.
  **`buildShowZipFor(show, targetId)` is the production TARGET PICKER's build** (the
  acceptance round's "couldn't choose the platform"): 'spx' keeps the dedicated builder
  above; every other registry id runs the generic merge - each pool graphic goes through the
  per-graphic `target.build()` VERBATIM (so a target fix reaches the production package by
  construction) and the files merge under one show folder, with the same playout rules
  applied through `exportTemplateFor` (live template, receiver strip, layers,
  collision-suffixed names). The overlay flavor adds the aggregated show_controlpanel.html
  (inline assets); the UI is components/home/ProductionExportDialog.tsx, opened from the
  production page and the Home row, validation-gated per graphic (non-negotiable 4).
- **common.ts** - addSharedAssets, addReferencedFonts, injectControlReceiver + addControlPanel,
  FONT_LICENSES.md.

## Font licensing (the rule: the licence follows the BYTES)

The seven bundled faces are OFL 1.1. §2 requires every redistributed copy of the font software
to CONTAIN the copyright notice and the licence - as a stand-alone text file, a human-readable
header, or readable metadata. A LINK satisfies none of those, and §2 is triggered by
REDISTRIBUTION, not by sale, so the product being free does not retire it. The binaries have
name ID 13 stripped and an empty WOFF2 metadata block, so there is no in-binary fallback either.

`src/assets/OFL.txt` is the single source: the full licence plus all seven copyright lines. It
sits in `src/assets/` beside the other bundled-and-inlined sources rather than next to the fonts
in `public/`, because Vite refuses `?raw` imports out of the public directory. It is imported
into `model/fonts.ts` as `FONT_LICENSE_NOTE` (stand-alone form) and `fontLicenseComment()`
(header form), and read from disk by the two build scripts that embed font bytes. Two
consequences worth remembering:
`addReferencedFonts` keys the notice off the BYTES in the package (CSS refs OR a font in
`template.assets`) rather than off a regex match, and a surface that embeds fonts and cannot
ship a sibling file - a single-file export, the player host, the generated worker CSS - carries
the header instead. exports.spec.ts asserts every package that ships font bytes also ships the
text.

## Packaging conventions

- Asset paths: uploads land at `images/<file>` (fonts at `fonts/<file>`); the export zip wraps
  everything in one project folder, so extracting into a templates folder yields
  `[TemplatesFolder]/<project>/<project>.html` + `<project>/images/<file>` - the layout SPX and
  CasparCG expect. Both of those exporters use `zip.folder(slug(name))`.
- Uploads are base64 data URLs in `template.assets[]`; the preview inlines them, the exporter
  decodes them to real files. The Assets panel may nest ONE user folder inside a bucket
  (`images/logos/<file>`) - every writer zips `asset.path` verbatim, so nesting flows through.
- Lottie: a template that uses a Lottie animation (detector `assets/lottieSupport.ts`) ships
  the bundled player - `js/lottie.min.js` in folder packages (addSharedAssets), inlined in
  single-file targets, `lib/lottie.min.js` + an `ensureLottie()` loader in OGraf packages,
  where the embedded TEMPLATE_HTML also gets its `.json` assets inlined as data: URLs (an
  embedded string has no base URL to resolve a relative path against). The generated
  bootstrap decodes data: URLs inline (atob, no fetch), so single-file exports play from
  file:// too; the folder starter keeps the real `lottie/<file>.json` and plays over http
  (SPX's normal serving mode).
