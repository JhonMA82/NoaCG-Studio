# AGENTS.md

Guidance for AI agents working in this repo. Keep it accurate - update it when architecture or
conventions change. This root file holds the product identity, the non-negotiables, and the working
practices; **deep per-area contracts live in nested `AGENTS.md` files** (directories marked * in the
map below, each paired with a thin `CLAUDE.md` that imports it) - read the relevant one before
editing that area from outside it.

Be concise with all of your responses.

## What this is

**NoaCG Studio** - an **AI-assisted, multi-platform** browser tool for creating modern, premium
HTML broadcast graphics and exporting them to **many broadcast/streaming environments**
("anything-goes export": SPX Graphics, CasparCG, OGraf, OBS/vMix overlays today; more over time).
For TV channels, streamers, organizations, and universities, technical and non-technical users
alike - it's used in teaching, but it is a production tool, not a code tutorial. Brand: dark
control-room, one amber "on-air" accent, restrained glow (`NoaCG-Brand-Kit/BRAND-MANUAL.md`).
**Free forever for the core; the only paid surface is hosted AI without a BYO key; the current
goal is users/adoption, not revenue.** Binding docs, read before generating or judging templates:
**`docs/DESIGN_LANGUAGE.md`** (taste + motion + code style) and **`docs/GOALS.md`** (north star +
milestones - keep it checked off as work lands).

**Current push (2026-08): the STUDENT RELEASE** - the binding 10-step roadmap is the "Student
release" section of `docs/GOALS.md`. The primary workflow is WIZARD-FIRST: choose a template or
pack, customize supported fields and branding manually, add it to a PRODUCTION, export or
publish, operate live (CasparCG + OBS are the primary verification targets). The editor is
being demoted to an Advanced mode over those steps; AI work is postponed until template-to-live
is dependable. Prefer work that serves that north star.

**The pillars (keep every change true to these):**
- **Best & easiest to create - and put on air** - premium output with the least friction; a
  non-technical user can make a great graphic AND run it live without ever touching code.
  **AI-assisted** (later), but a pro keeps full control.
- **Export anywhere, SPX-canonical** - SPX is the canonical *internal* format and the strictest
  validation target; every other target is an adapter off the same source. SPX compatibility stays
  rock-solid, but the product is not "an SPX generator."
- **Code is real & always available, view optional** - every visual/AI action writes real
  HTML/CSS/JS; **nothing hides behind a visual-only scene model**. No-code users keep the view
  hidden, pros work in it. Generated code is clean and commented; exports are always plug-and-play.
  The wizard and every production write real code; the student release demotes only the VIEW
  (the editor becomes Advanced mode), never the code.

## Commands

```bash
npm install
npm run dev      # Vite dev server (landing at /, THE STUDIO AT /app: home, wizard,
                 # productions - the editor is its Advanced surface)
npm run build    # tsc && eslint && vite build -> dist/   <-- run after changes; it's the CI gate
npm run lint     # eslint . --max-warnings 0 (also part of build)
npm run test:worktree-safety # isolated Git-safety regression tests for shared workflows
npm run check:freshness      # what npm CANNOT see: vendored GSAP/Lottie + pinned model ids
```

**Freshness is TIME-driven, never commit-driven** (`docs/STACK_FRESHNESS.md`): `check:freshness`
is not in the build gate, because its answer changes when upstream publishes. It runs weekly in
`weekly-audit.yml` and REPORTS - nothing here auto-upgrades, since Remotion's three-file exact
pin and the es2017 output floor can both be broken by a bump that passes every check.

**The dev port is per-checkout** (`scripts/dev-port.mjs`, which prints it): 5174 in the main
checkout (5175 for the live e2e suite), a RESERVED port from the 5180-5298 block in a linked
worktree - Vite, both Playwright configs, the guard hooks and the dev scripts all read the same
number, so parallel worktrees never fight over one server. The number is preferred by a hash of
the checkout path and then reserved through a ticket in `<git-common-dir>/noacg-dev-ports/`, so
two worktrees that hash alike still both start (**`docs/DEV_PORTS.md`** - assignment, storage,
troubleshooting a stuck server). `.claude/launch.json` and `.claude/dev-port.json` are GENERATED
from that reservation (gitignored - never hand-edit or commit them). `DEV_PORT=n` overrides
everything. `npm run test:ports` covers the allocator.

**Four pages (Vite MPA):** `index.html` is the static landing at `/` (no React; carries a redirect
shim so old root `?chat=`/`?template=` share links land on `/app` with their query); `app.html` is
the editor at `/app` (clean URL from the `app-clean-url` plugin in dev/preview, Vercel `cleanUrls`
in production); `admin.html` is the PRIVATE admin surface at `/admin` - unlinked from everything,
`noindex`, and a plain 404 for everyone the server does not recognise (**`docs/ADMIN.md`**);
`output.html` is the browser-output RENDERER at `/output?production=<slug>` - the transparent
capability-URL page a production client (CasparCG/OBS/vMix) loads once (**`docs/CLOUD_PLAYOUT.md`**).
E2E specs navigate to `/app`.

There is **no application unit-test suite**; focused Node tests cover infrastructure scripts.
Verify product changes with `npm run build` plus in-browser checks (below); never mark work done
on a green build alone if the behaviour is observable.

## Non-negotiable principles (these override default behaviour)

1. **Code is the single source of truth.** `SpxTemplate` (html/css/js + parsed definition) is
   canonical. Visual/AI/block actions emit *deterministic, readable code patches*, never a hidden
   scene model; the editor always reflects exactly what was written.
2. **Generated code must be clean, commented, and easy to edit.** Prefer simple, obvious code over
   clever code; rich-but-commented CSS is the house style.
3. **Offline-first, no unnecessary dependencies.** GSAP is bundled locally
   (`src/assets/gsap.min.js`); so is the Lottie player (`src/assets/lottie.min.js`, lottie_light/
   MIT - injected only when the template uses a Lottie asset; detector in `assets/lottieSupport.ts`).
   No runtime deps or CDN references in generated templates; exports use relative paths only.
4. **Validate before export.** `validation/validateTemplate.ts` is the gate; export is blocked on
   errors. Keep it authoritative - the platform owns SPX compatibility, not the AI.
5. **Blocks and AI are deterministic transforms** `(template) => template` inserting clean code.
6. **Every persisted format carries a version, and a breaking change ships its migration in the
   same commit.** The catalog is large and templates are saved documents, so a shape change
   without a migration is data loss. The pattern (`docs/STATE_MACHINE_SCHEMA.md` §5, implemented
   in `blocks/animData.ts` and `model/layout.ts`): additive optional fields never bump the
   version; a breaking change bumps it and migrates ON READ, normalizing so everything
   downstream sees one shape; serialization always writes the current version; an unknown
   version degrades honestly (read-only, never a crash), so an older build never eats newer data.

## SPX template format (the contract)

Full reference: **`docs/SPX_TEMPLATE_FORMAT.md`** (derived from `example_projects/`). Essentials:

- A global `window.SPXGCTemplateDefinition = { ...settings, DataFields: [...] }` describes the
  operator's fields. Fields are `f0`, `f1`, … with an `ftype` (textfield, number, dropdown, …).
- SPX calls global `play()`, `stop()`, `update(data)` (a **JSON string**), and `next(data)`.
- **Field -> DOM convention (this project): each field `fN` maps to one element `id="fN"`**, which
  `update()` writes into via `getElementById`. **No hidden `.spx-data` holders, no `_gfx` display
  split** - that older "premium pack" style is documented but not what we generate. An input-only
  value (e.g. a countdown duration) may live in a hidden `<div id="fN" style="display:none">`.

## The state-machine model (what a graphic IS)

Full reference: **`docs/STATE_MACHINE_SCHEMA.md`**. A graphic is data fields + one or more
PARALLEL state groups, all inside the one `NOACG_ANIM` data block (format version 2) in the
marked ANIMATION region - no second scene model, no parallel format. Essentials:

- A **state** is what the graphic looks like; its content is a timeline. A **transition** is an
  animated change, fired by an operator **event** or a **timer**. Guarding is STRUCTURAL - a
  transition fires only if the author drew that arrow from the current state. No expression
  language, ever.
- **The default path** is the ordered walk `next` follows - the SPX/CasparCG compatibility
  contract. Every template, however complex, degrades to dumb-stepping along it. `steps` IS that
  path: `defaultPath[i]`'s timeline is `steps[i]` (the positional binding), which is why the
  multi-step reveal feature became the default path rather than being duplicated by it.
- **Data updates never cause transitions.** `update()` writes fields; state changes come only
  from events (a payload may ride an accepted event, which is what makes a multi-part change
  atomic). **Parameterize with data, not states** - one `Selected` state plus a field, never
  four near-identical states.
- **Every state is enterable two ways:** by transition (animated) or by SNAP (instant - recovery,
  emergency jumps, preview without playback). **Reset is two operations**, never conflated: reset
  visual state (snap every group to its initial) and reset data.
- Events are processed SERIALLY through one queue per graphic, and that queue lives INSIDE the
  template - so the determinism holds identically in the editor, in an exported overlay, and
  under SPX.
- **Control pages are GENERATED from the machine** (docs/CONTROL_LAYER.md): every operator
  event becomes a button (labels/sections/payloads ride in the additive `machine.controls`
  metadata), every field an input, legality = the structural guard mirrored as greying.
  Staged data airs only on an explicit take; the event log is what makes refresh/crash
  recovery possible (data half, then snap - reset is two operations, recovery is both).
- A template with no `machine` key IS the implicit one-group linear machine, derived on read and
  never persisted: the whole existing catalog behaves exactly as before. A **graphic type**
  (`docs/GRAPHIC_TYPES.md`) follows the same rule - it persists a machine only when the derived
  one is wrong, which is why most types add nothing to what they emit.

## Architecture map

Directories marked * have their own `AGENTS.md` (with a thin `CLAUDE.md` importing it) holding
the binding per-area contracts. The cross-domain rules -
layers, allowed import edges, where new code goes, UI thinness, the grandfathered-debt list - are
binding in **`docs/ARCHITECTURE.md`**; a change that adds a domain-to-domain edge updates that doc
in the same PR.

```
src/
  app/         router.ts - HASH ROUTING for /app (docs/SAVED_CONTENT_MODEL.md §3): #/home,
               #/package/<id>, #/graphic/<id>, #/control/<id>, #/video, #/new - real history
               (Back/Forward walk surfaces, refresh restores); ?control=/?chat= query routes
               stay in App.tsx
  model/ *     SpxTemplate types, SPX parse/serialize, catalog data, fonts, brand, packets;
               library.ts (the GRAPHICS LIBRARY - docs/SAVED_CONTENT_MODEL.md: GraphicDoc
               stable-id records + control ENTRIES + the packet v1->v2 migration; sync kind
               'graphic', supabase migration 0009); shows.ts (the PRODUCTION unit - the graphic
               pool + the CUE rundown + both hosted capability slugs, docs/CLOUD_PLAYOUT.md +
               docs/CONTROL_LAYER.md); structure.ts (element identity) + fieldModel.ts (the
               FieldDescriptor contract)
  templates/ * the wizard catalog: shared assemblers + 21 categories (11 core + frames = chrome
               around a camera HOLE + transitions = a full-frame cover that clears itself on a
               timer + the COMPETITION PACK's four - docs/COMPETITION_PACK.md + poll = the live
               VOTE board + audience = viewer questions, Q&A, chat highlights, queues, requests
               + the PUBLIC-SERVICE PACK's alerts + public info - docs/PUBLIC_SERVICE_PACK.md);
               :root style contract;
               types/ = the GRAPHIC TYPE registry (docs/GRAPHIC_TYPES.md) - what a graphic IS,
               independent of its look; compiles into catalog variants, replacing by id
  store/ *     templateStore.ts (zustand) - applyTemplate/undo choke point + editor UI state
               + the save LINK (`saved`); saveActions.ts - Save/Save As/open + the
               unsaved-changes guard over the library (useSaveUi)
  preview/     composeDocument.ts - inlines CSS + GSAP + JS + assets into the iframe srcdoc
  editor/      Monaco VIEW-only helpers, shared by the SPX and video code panes: comment
               visibility (normal/dimmed/hidden) as tokenizer-derived DECORATIONS - it never
               edits the code, so undo/cursors/export are untouched
  blocks/ *    deterministic transforms: block registry, field editing, the Timeline v2 engine,
               animMachine.ts (the STATE MACHINE's graph seam - docs/STATE_MACHINE_SCHEMA.md)
               + machineEdit.ts (the NODE EDITOR's mutators; UI = components/MachineGraph.tsx)
  ai/ *        the SPX GENERATION HARNESS: catalog-fit briefs assemble deterministically through
               the wizard assemblers; off-catalog briefs go to the coder + a 2-round repair loop;
               NoaCG Lite is the server-owned, one-result, catalog-only DesignSpec profile
  ai/video/    the VIDEO motion harness: skills + reference cards -> Motion Director -> the
               engine's coder -> bounded repair; engines 'remotion' and 'hyperframes'
  video/       the video pipeline: compile.ts, validate.ts (static + live probe + readability at
               two HOLD frames), textChecks.js (plain JS - it is INLINED into two opaque-origin
               runtimes), videoFonts.ts (SINGLE SOURCE of fonts, so preview == render), hyperframes/
  validation/  validateTemplate.ts (export + AI gate) + runtimeBench.ts (the live-iframe bench)
  control/     the CONTROL LAYER (docs/CONTROL_LAYER.md): ONE generator - fields off shared
               FieldDescriptors + event buttons off the state machine; the ControlMessage
               protocol, three receivers (BroadcastChannel / Realtime / the hosted log),
               the staged-vs-take model, and the hosted-control client (migration 0008)
  export/ *    the export registry - 6 targets + whole-packet + whole-SHOW export (one
               aggregated control page) + packaging conventions
  render/ *    RenderManifest, HOLD schedule, tier limits, virtual clock, job store; docs/RENDER.md
  landing/ *   the landing page's GSAP motion system. POLICY: never fakes product UI
  backend/     the OPTIONAL Supabase backend: config.ts isBackendConfigured is the ONE
               feature-detection point (unset env = pure offline mode); auth, sync, assets
  community/   shared templates (signed-in only), validated + benched at publish AND import;
               showchat/ is audience send-in (SendIn page, ModerationPanel, chatGraphicBlock)
  entitlements/ the PURE access contract (docs/ADMIN.md): ONE resolver, precedence
               default < plan < temporary grant < manual override, every value carrying WHY
  feedback/    the PURE feedback contract (docs/ADMIN.md §10): the two-valued rating axis, the
               enumerated reason vocabularies (the generation set IS 0011's, minus the two the
               app writes), areas, triage states. Read by the browser form, api/, the admin
               inbox and 0028's CHECK constraints - one vocabulary, four consumers
  admin/       the PRIVATE admin page (its own MPA entry at /admin) - unlinked, noindex,
               a plain 404 for anyone api/admin/* does not recognise. Never a security boundary.
               Usage sections count OTHER PEOPLE by default: the ScopePicker's external /
               internal / all scope excludes accounts marked internal (migration 0027), and
               says on the page which scope is showing and what it cannot reach
  output/      the browser-output RENDERER (its own MPA entry at /output) - one persistent
               transparent capability URL per production for CasparCG/OBS/vMix; follows the
               hosted-control log with boot recovery + tail-fill (docs/CLOUD_PLAYOUT.md)
  components/ * the React app: AppShell (topbar Save controls + 🏠 Home), CodeEditor, canvas,
               timeline dock, Inspector, the five-tab SidePanel, wizard/, auth/, save/
               (SaveControls + the save/guard dialogs), home/ (the routed HomePage +
               GraphicControlPage + ProductionPage - packages, entries, per-graphic operator
               panel, and the production cockpit: cues, links, publish, the operator verbs), and
               video/ (the PARALLEL video shell, topbar Graphics/Home escape hatches)
public/fonts/  the 7 bundled woff2 fonts (served at /fonts, copied into exports); src/assets/ has
               the bundled gsap.min.js, lottie.min.js, OFL.txt (the ONE licence source -
               src/export/AGENTS.md) + data-URL asset helpers, src/teach/ the Monaco tooltips
scripts/       dev-port.mjs + port-registry.mjs (the per-worktree port RESERVATION - docs/
               DEV_PORTS.md) + port-probe.mjs, l3-sweep.mjs, type-floor.mjs + overflow-sweep.mjs (catalog
               quality gates), ai-compare.mjs + ai-bench.mjs (both SPEND TOKENS),
               render-smoke*.mjs, worktree-activity.mjs (who else is in flight) +
               merge-order.mjs (which branch should land FIRST - see Git below),
               hooks/ (guard hooks wired in .claude/settings.json)
  api/         server-only Vercel functions: the render service plus the Creative AI model
               gateway, NoaCG Lite profile/allowance endpoints, sealed user-key endpoints, and
               api/admin/* behind _lib/adminAuth.ts (404 for every refusal - docs/ADMIN.md);
               typechecked by tsconfig.api.json
render-worker/ the Remotion renderer and player-host/ the preview host - own exact-pinned packages
player-host/   so the non-OSI license never enters the AGPL bundle. The player host is built into
               public/player-host/ as ONE self-contained page (JS, fonts, textChecks.js inlined -
               the opaque origin can fetch nothing), loaded with sandbox="allow-scripts" ONLY
               (never add allow-same-origin), postMessage with a per-session nonce
```

### Auth posture (the open studio)

**There is no login wall, ever.** The studio - create, preview, export, local saves - is open to
everyone, hosted or self-hosted. Only *account features* gate themselves: cloud sync, community,
show chat, and AI (hosted mode). Offline builds (no Supabase env) must grow **zero** auth UI
(E2E-pinned in `e2e/auth.spec.ts`). Don't reintroduce an app-wide gate; the `needsSignIn`/
`SignInPrompt` pattern lives in src/components/AGENTS.md.

### The choose-first creation flow (primary UX)

New projects go through the **CreationWizard** (Entry -> Browse -> Fields -> Style -> Animation
-> Finish, persistent live preview); the Browse step is a FACETED template storefront
(docs/TEMPLATE_TAXONOMY_PROPOSAL.md: search + programme ranking + category tiles + field/style/
capability facets over src/model/taxonomy.ts + src/templates/templateMeta.ts);
`variant.create(options)` generates the complete, commented
template, applied with `resetSampleData: true` so a project starts from its own field defaults.
The **Finish** step names the graphic and holds the flow's one branch: open it in the editor,
or **export it without the editor ever opening** - that door saves the graphic to the library,
lands on Home, and opens the standalone export window (the same surface as the editor's Export
panel, also reachable from any saved graphic on Home). Export is not a reward for opening the
editor.
The Entry step leads with **Continue working** (recent library graphics + the door to Home),
then the broadcast-graphics cards: templates, **"Create with AI"** (THE one AI door - a brief plus
optional images and/or an existing .html/.zip; its ⚙ AI settings pick the execution TIER:
NoaCG Lite, NoaCG Pro (the image-guided pipeline on pinned routes, docs/NOACG_PRO_PLAN.md §7),
or the advanced Custom/BYO provider surface - every AI result runs the harness with the runtime
bench injected, and the no-AI "Open as code" import stays one click away, never gated on sign-in),
**"Import graphic"** (manual: artwork -> erase/scale -> PLACE text fields -> fonts -> in/out
animation), and blank; **"Video or animation with AI"** sits in its own visually separated
strip marked Beta (the parallel VIDEO project kind, engine chosen at create - creating/opening
a video flips the persisted doc-kind switch and every SPX create path flips it back). After creation, code
is the source of truth and two **live panels** keep working via deterministic patches: the **Style
panel** writes the `:root` style contract and **the step timeline** touches ONLY the marked
ANIMATION region - user code outside the markers is never modified. The timeline dock picks its
surface from the CODE, never the category, which keeps pre-migration templates working.

## Verifying changes

Always `npm run build` (typecheck + lint + build) after changes. The tree stays lint-clean: fix
findings properly rather than sprinkling eslint-disable comments. Its first, fastest step is
`node scripts/check-shared-instructions.mjs` - the drift guard for the AGENTS.md/CLAUDE.md
split and the `.agent-workflows/` shared-workflow pattern: it validates thin imports, Claude
commands, Codex skills under `.agents/skills/`, metadata, explicit-invocation safety, referenced
scripts, and the configured instruction-size budget. It self-discovers `AGENTS.md` and shared
workflow files, so a new nested area or shared command needs no separate registration - only
correct adapters. The complete maintenance contract is `docs/AGENT_WORKFLOWS.md`.

- **UI flows -> Playwright.** Verify user-facing flows with the E2E suite in `e2e/` (specs drive the
  real dev server): `npm run test:e2e`, and add a spec for any new flow. **Testing is TIERED**
  (docs/DEPLOYMENT.md): `npm run test:e2e:affected` maps changed files to covering specs
  (`scripts/e2e-affected.mjs`) and is both the inner loop AND what CI runs per change; the FULL
  suite runs NIGHTLY. So use `affected` before a merge - the full local run is no longer the
  gate, and the mapper escalates to everything whenever it is unsure. **During the
  student-release sprint, `E2E_SPRINT_FOCUS=1 npm run test:e2e:affected` is THE
  student-critical suite command**: a core-file change runs the focus set
  (scripts/e2e-lists.mjs, ~28 specs) instead of all 96 files; the nightly still runs
  everything and its verdict separates focus failures from paused-area drift. When you add a spec, add
  its mapping in the same commit, or it only ever runs at night. Bootstrap non-wizard specs
  with `createProject` (`e2e/_create.ts`).
- **Logic checks without UI (fast path):** Vite serves source modules, so in a browser context you
  can `await import('/src/blocks/registry.ts?t=' + Date.now())`, apply blocks to
  `createBlankTemplate(...)`, run `validateTemplate`, and load `composeDocument(tpl)` into a hidden
  iframe to call `update()/play()/stop()`; store state via `useTemplateStore.getState()`.
- **Template catalog sweep:** `node scripts/l3-sweep.mjs <shots-dir> <category>` (dev server must
  be running; any `TemplateCategory` id - `lower-third`, `info-card`, `end-credits`, `ticker`,
  `quiz`, `poll`, `audience`, …) - validates every variant × preset × easing. Run it for the
  affected category after template changes. A category whose contract differs from the standard
  one gets its own branch in the script rather than a waiver: the audience sweep checks the
  MESSAGE wraps and clamps (its `#f0` is a kicker, not the text), and the quiz sweep reads the
  correct-answer field off the template instead of assuming a four-answer layout.
- **Catalog quality gates (run after any catalog-wide change):** `node scripts/type-floor.mjs`
  fails on any text under its category size floor; `node scripts/overflow-sweep.mjs --baseline`
  fails on any box that newly escapes the 1920x1080 frame or clips its own content, diffing
  against `scripts/overflow-baseline.json` (~200 variants clip by design - reveal masks, ticker/
  crawl scroll - so it is a diff gate, re-recorded with `--update-baseline` on a deliberate look
  change). **`--with-images` adds a second pass with a mark in every image field**, recorded as
  `<id>@image` in the same baseline: a logo is the one operator action that can spend a strap's
  remaining width (+35% on lt54, docs/ADAPT_FIRST_PLAN.md §1.5) and every gate here otherwise runs
  on the EMPTY build. Re-record with `--update-baseline --with-images`; the script refuses a bare
  re-record once image rows exist, because that would silently retire half the gate.
  Neither measures capacity: `npm run test:e2e:catalog` (the calibration tripwire in
  `e2e/catalog/catalog-bench.spec.ts`) is the ONLY gate that catches a design growing past its
  width budget (it doubles every text value), so run it too. It is excluded from the default
  `npm run test:e2e` suite - benching every catalog variant across every category is the single
  heaviest thing here, and (like the other two gates above) it only needs to run when the
  catalog or `src/validation/runtimeBench.ts` actually changed. **None of the four is left to
  memory:** `npm run test:e2e:affected` raises the tripwire automatically when relevant and CI
  runs it on that flag, and the NIGHTLY sweep runs all four unconditionally - so an unrun
  catalog gate is now caught by morning rather than never.
  The fourth gate is about DATA, not looks: `node scripts/field-coverage.mjs` fails on any
  meaningful visible string an operator cannot reach through a data field. It does not read the
  markup for `id="fN"` - a standings row, a ticker item and a credits line are all BUILT by a
  runtime from ONE `lines` field, so an id check would either miss them or need a special case
  per category. Instead it renders the graphic, drives EVERY data field to a sentinel through
  `update()`, and re-reads the screen: anything that did not move is not operator-reachable.
  Two kinds of thing are excused IN THE SCRIPT, each with its reason written down - an
  empty-slot placeholder for an image (`filelist`) field, which IS a field and is replaced by
  the picked file, and a value the runtime computes rather than anyone types (a wall clock).
  A `filelist` cannot be driven (there is no image to point at), so the run reports those
  variants as NOT DRIVEN rather than counting them as passes.

**Gotchas:**
- The app declares `color-scheme: dark` (styles.css `:root`) and composeDocument injects the
  matching `<meta name="color-scheme" content="dark">` into the preview srcdoc. **Keep them
  paired** - Chromium paints an iframe opaque (white stage) when the schemes disagree.
- The e2e suite pins **offline mode** via `webServer.env`, but `reuseExistingServer: true` means a
  dev server already running on THIS checkout's port (started by hand, with the real `.env`) gets
  reused - backend-sensitive specs then fail confusingly. Kill any manual server on this
  checkout's port first. Other worktrees' servers are harmless.
- The dev server can serve a **stale module** after many edits (HMR lag) - restart it. Worse,
  `import('/src/store/…')` in an eval context can then resolve a **different module instance** than
  the running app (a "ghost store"): if state reads disagree with visible UI, restart and reload
  before trusting the assertion. Monaco also isn't fully interactive headless and GSAP doesn't
  visibly tick (rAF) - assert on DOM/state there.
- In Playwright specs, **never clear localStorage via `addInitScript`** - it also runs in the
  same-origin srcdoc preview iframe, so every rebuild wipes the key (this silently deleted the
  project brand). Fresh browser contexts already isolate storage per test.
- The preview rebuilds on a debounce after `applyTemplate` - 350 ms when authoring, **50 ms under
  the e2e suite** (`VITE_PREVIEW_DEBOUNCE_MS`, pinned in playwright.config.ts). Never sleep out
  either number; a spec that hard-codes one is wrong at the other. Use
  `awaitPreviewRebuild` (`e2e/_preview.ts`) before clicking Play or asserting inside the iframe,
  wrapping the action when anything slow sits between action and wait.
- **A spec that presses Space (or Enter) must first say where FOCUS is.** Clicking a control leaves
  it focused, and Space belongs to a focused button by design (spaceKey.ts) - so the press lands on
  that button, not on the surface under test. Which one answers can even depend on a timer the spec
  never mentions: a new field arrives selected and the Inspector's deferred reveal unmounts the
  Data tab's `+ Add` half a second later, dropping focus to the body. Call `parkFocusOffControls`
  (`e2e/_keys.ts`) rather than inheriting whatever the bootstrap left behind.
- A wizard-created VIDEO project auto-runs its first generation, which lands as its own undoable
  snapshot ~0.1-2.6 s after `video-shell` appears (unbounded: the validation probe waits on the
  player host with no timeout). A spec that makes an undoable change before that lands is racing
  it - the generation becomes the newest undo target, so a later Ctrl+Z rewinds the generation
  instead, and an assertion that the project did NOT change can pass vacuously. Wait for the
  assistant reply first (`waitForGeneration`, `.ai-msg.assistant`), never a fixed timeout.

## Git

- Most work happens on a **feature branch**, usually in a worktree - several are typically active
  at once, so `node scripts/worktree-activity.mjs` prints what is in flight elsewhere before you
  start something that collides: every OTHER worktree's uncommitted and not-yet-merged files,
  then every branch ahead of `main` that no worktree has checked out (a closed session leaves its
  work there, so it still collides even though nobody is in it). If a session starts on `main`
  with work to do, branch first. The rhythm: **commit
  each completed, verified phase/step** to the FEATURE BRANCH with a descriptive message. **Never add a
  `Co-Authored-By` trailer or any agent co-author.** Don't commit `dist/` in feature work.
- **`main` is only ever touched when the user asks for it, in that message - from ANY checkout.**
  Nothing lands on your own initiative: no commit made while sitting on `main`, no `git merge` into
  main, no `git push origin main`. Being in the primary checkout on `main` is not
  permission to land - the user decides when work lands, *after* they know the change is safe.
  Commit verified work to the feature branch, report what you did and verified, and STOP.
- **The one exception is the user invoking the repo's merge-to-main flow** (`/safe-merge` in
  Claude Code or `$safe-merge` in Codex). Invoking it IS the ask: run that flow to completion for
  the named branch - preflight, merge into `main`, and push - without asking again for the merge
  or push. **Selecting the safe-merge option from a pick the `next` workflow offered counts as
  invoking it** - the user chose that branch deliberately, so run the flow rather than telling
  them to type the command; see `.agent-workflows/next.md` §2c. It does not authorize branch or
  worktree cleanup, with one carve-out: a branch with no worktree (a closed session leaves those
  behind) has nowhere to integrate `main` and run the gate, so the flow creates a TEMPORARY
  worktree for it and removes that same one at the end - never any other, never with `--force`.
  The permission is scoped to that invocation and that branch; it never carries
  to another branch, a later turn, or any other route onto `main`. If the flow's checks fail,
  stop and report - permission to run the flow is not permission to land something broken.
- **A finished session can clean up its own worktree, but only the USER starts it.** The
  cleanup-worktrees workflow run from inside a worktree (`cleanup-worktrees.mjs --self`) removes
  that one, under the same rules as the bulk sweep. Handoff only REPORTS whether that is
  available - a verdict written by a model must never trigger an irreversible action.
  **A clean `git status` does not mean a worktree is disposable:** it says nothing about ignored
  files, and removal deletes them regardless - `.env`, bench output that cost real money, logs.
  The script lists every non-regenerable ignored path with its size and refuses to apply until
  that loss is explicitly acknowledged.
- **Merge ORDER is checked, not guessed.** `node scripts/merge-order.mjs` ranks every branch
  ahead of `main` by what landing it FIRST costs the other worktrees, measuring real conflicts
  with `git merge-tree` (read-only - no working tree, no ref) and naming the collisions git
  merges cleanly and still gets wrong: a rename over another branch's edits, two branches minting
  the same migration number, a stacked branch jumping its ancestor. `next` uses it to avoid
  recommending an expensive landing; `safe-merge` runs it in Phase 1 and stops for a go-ahead
  only on a `hold`. It is advisory about order alone and never overrides a Hard safety rule.
- **Commit messages:** clear and human-readable, explaining the actual change - understandable to an
  outside developer reading the history cold. No chat/session language, internal planning names, or
  AI-sounding phrases ("as requested", "starting era 5", "continued work"). Never mention Claude,
  agents, prompts, or the conversation unless the commit is specifically about AI tooling.
