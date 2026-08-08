#!/usr/bin/env node
// Run the e2e specs that cover the files you changed - the inner loop locally, and the per-merge
// tier in CI (docs/DEPLOYMENT.md; the nightly still runs the whole suite).
//
//   npm run test:e2e:affected            # diff against the merge-base with main + working tree
//   npm run test:e2e:affected -- <ref>   # diff against an explicit base ref
//   npm run test:e2e:affected -- --list  # print the plan without running Playwright
//   npm run test:e2e:affected -- --json  # print the plan as JSON, for CI to branch on
//
// The mapping below is CURATED, not traced: it errs toward running more. Anything touching the
// shared core (store, model, preview composer, validation, the shell, the e2e helpers, build
// config) runs the full suite, because those files feed every flow.
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOCUS } from './e2e-lists.mjs';

/**
 * True only when this file was RUN, not imported. `planFor` below is exported for tests, and
 * without this guard importing it executes the CLI at the bottom - which, given no `--list` or
 * `--json`, means spawning Playwright and the whole offline suite. That is not hypothetical:
 * it happened on the first attempt to import this module, and a 150-test run had to be killed.
 */
const isEntrypoint =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() ===
    resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();

// ── Source-area → spec globs ────────────────────────────────────────────────
// Order does not matter; every matching rule contributes its specs (union).
const MAP = [
  [/^src\/ai\/video\//, ['video-project.spec.ts', 'video-inputs.spec.ts', 'video-settings.spec.ts', 'video-player-host.spec.ts', 'video-hyperframes.spec.ts', 'video-readability.spec.ts']],
  // creative-routing covers the mode + intent ROUTER and the brief-satisfaction check, both
  // of which live here - it was previously nightly-only for src/ai changes, which is exactly
  // the surface it exists to protect.
  [/^src\/ai\/pro\//, ['pro.spec.ts', 'import-graphic.spec.ts']],
  [/^src\/ai\//, ['ai.spec.ts', 'ai-depth.spec.ts', 'ai-lite.spec.ts', 'ai-retrieval.spec.ts', 'adapt-first.spec.ts', 'import-graphic.spec.ts', 'creative-routing.spec.ts', 'creative-pilot.spec.ts', 'pro.spec.ts', 'lite-line-fit.spec.ts', 'lite-type-floor.spec.ts', 'lite-parity.spec.ts', 'lite-field-paint.spec.ts']],
  // The AI step and its child panels are what the ai-* specs actually drive; the generic
  // wizard rule below does not name them, which silently left an AiStep edit unpinned.
  [/^src\/components\/wizard\/steps\/(AiStep|ai\/)/, ['ai.spec.ts', 'ai-depth.spec.ts', 'ai-lite.spec.ts', 'ai-more-control.spec.ts', 'ai-consent.spec.ts', 'image-purpose.spec.ts', 'adapt-first.spec.ts', 'pro.spec.ts']],
  // The pilot brief bank is read by the anchor re-verification (the decay rule) - a bank edit
  // needs that spec and nothing else.
  [/^benchmarks\/creative\//, ['creative-routing.spec.ts']],
  // The Pro brief bank + fixtures feed scripts/pro-bench.mjs; the offline product flow they
  // relate to is pinned by pro.spec.ts.
  [/^benchmarks\/pro\//, ['pro.spec.ts']],
  [/^scripts\/pro-bench\.mjs$/, ['pro.spec.ts']],
  [/^src\/video\//, ['video-project.spec.ts', 'video-inputs.spec.ts', 'video-settings.spec.ts', 'video-player-host.spec.ts', 'video-hyperframes.spec.ts', 'video-readability.spec.ts']],
  [/^src\/components\/video\//, ['video-project.spec.ts', 'video-inputs.spec.ts', 'video-settings.spec.ts', 'video-player-host.spec.ts', 'video-hyperframes.spec.ts', 'video-readability.spec.ts']],
  [/^player-host\//, ['video-player-host.spec.ts', 'video-project.spec.ts', 'video-readability.spec.ts']],
  // The host BUILD is load-bearing for the preview: it inlines the player JS and the bundled
  // video fonts into public/player-host/index.html, which the video specs load.
  [/^scripts\/build-player-host/, ['video-player-host.spec.ts', 'video-project.spec.ts', 'video-readability.spec.ts']],
  [/^src\/render\//, ['render.spec.ts', 'render-schedule.spec.ts']],
  [/^api\/(ai\/|_lib\/ai)/, ['ai.spec.ts', 'ai-depth.spec.ts', 'ai-more-control.spec.ts', 'video-project.spec.ts', 'video-inputs.spec.ts', 'video-settings.spec.ts']],
  [/^api\//, ['render.spec.ts', 'render-schedule.spec.ts']],
  [/^scripts\/aiDevPlugin/, ['ai.spec.ts', 'ai-depth.spec.ts', 'ai-more-control.spec.ts']],
  [/^src\/export\//, ['exports.spec.ts', 'package.spec.ts', 'offline.spec.ts', 'control.spec.ts', 'shows.spec.ts', 'local-relay.spec.ts', 'template-pack-10.spec.ts']],
  [/^src\/control\//, ['control.spec.ts', 'exports.spec.ts', 'shows.spec.ts', 'local-relay.spec.ts', 'hosted-control.spec.ts', 'productions.spec.ts', 'production-controls.spec.ts', 'snap-recovery.spec.ts']],
  // The readable audience name is minted by the publish path but READ on the audience surfaces,
  // and rules union rather than shadowing - so this adds to the src/control/ list above.
  [/^src\/control\/joinName/, ['production-audience.spec.ts']],
  // The browser-output renderer (docs/CLOUD_PLAYOUT.md): its own MPA entry + the stage module.
  [/^src\/output\//, ['productions.spec.ts', 'snap-recovery.spec.ts']],
  [/^output\.html$/, ['productions.spec.ts']],
  [/^src\/blocks\//, ['anim-engine.spec.ts', 'timeline-v2.spec.ts', 'inspector.spec.ts', 'canvas-keyframe.spec.ts', 'legacy-timeline.spec.ts', 'multi-select.spec.ts', 'pasteboard.spec.ts', 'ux.spec.ts', 'bench.spec.ts', 'import-graphic.spec.ts', 'state-machine.spec.ts', 'machine-graph.spec.ts', 'asset-workflow.spec.ts', 'template-insert.spec.ts']],
  // creative-routing rides along because ROUTING and SATISFACTION resolve live against the
  // catalog and the type registry (src/templates/structuralAnchor.ts): a structure the
  // catalog gains or loses moves a route, which is the decay rule the spec enforces.
  // ai-retrieval rides along for the same reason one level down: the shortlist is RANKED over
  // the catalog's own metadata and FILTERED by the same anchor table, so a design added,
  // renamed or re-declared moves what a brief retrieves.
  // The quiz runtime is also the exported control panel's recovery subject and the audience
  // pack's answer boards - the generic src/templates rule below unions with this one.
  [/^src\/templates\/quiz\//, ['control.spec.ts', 'audience-pack.spec.ts', 'production-controls.spec.ts', 'quiz-pilot.spec.ts']],
  // The scoreboards are the OTHER stateful family with a runtime of their own - the match
  // clock, the club-colour lift and the period rebuild - and sports.spec.ts is the only place
  // any of that is driven. It had been mapped nowhere at all, so a scoreboard change reached
  // air having run none of its 13 tests until the nightly. control.spec.ts rides along because
  // its exported-panel case is built from a scorebug (sb01).
  [/^src\/templates\/(scoreboards|types\/(sportsBugs|scoreboard))/, ['sports.spec.ts', 'control.spec.ts', 'production-controls.spec.ts']],
  // WHAT A KIT CONTAINS is resolved in kit.ts + packs.ts and offered by the Browse step's kit
  // half, so a pack edit or a change to `kitChoices` moves what the picker offers, what the
  // count promises and what the production ends up holding. Unions with the generic
  // src/templates rule below (which never named this spec).
  [/^src\/templates\/(kit|packs)\.ts$/, ['wizard-kit.spec.ts']],
  [/^src\/templates\//, ['catalog-baseline.spec.ts', 'graphic-types.spec.ts', 'bench.spec.ts', 'house.spec.ts', 'wave2.spec.ts', 'timeline-v2.spec.ts', 'wizard-filters.spec.ts', 'wizard-logo.spec.ts', 'wizard-preview.spec.ts', 'format.spec.ts', 'ux.spec.ts', 'state-machine.spec.ts', 'machine-graph.spec.ts', 'template-pack-10.spec.ts', 'stream-notification.spec.ts', 'creative-routing.spec.ts', 'ai-retrieval.spec.ts', 'snap-recovery.spec.ts', 'lite-parity.spec.ts']],
  // wizard-finish, wizard-kit and wizard-shell were MISSING from this list, so a FinishStep,
  // kit-flow or wizard-header change ran neither the spec named after it nor anything that
  // walks to its step - the "runs FEWER specs" failure mode with no alarm attached
  // (scripts/e2e-affected.mjs's own safety argument is that it fails toward running more).
  [/^src\/components\/wizard\//, ['wizard-filters.spec.ts', 'wizard-logo.spec.ts', 'wizard-preview.spec.ts', 'wizard-entry-fit.spec.ts', 'wizard-finish.spec.ts', 'wizard-kit.spec.ts', 'wizard-shell.spec.ts', 'flows.spec.ts', 'ux.spec.ts', 'import.spec.ts', 'import-graphic.spec.ts', 'project.spec.ts', 'video-project.spec.ts', 'video-hyperframes.spec.ts', 'pro.spec.ts', 'storage-full.spec.ts']],
  // WHAT HAPPENS WHEN A WRITE FAILS is its own contract (e2e/storage-full.spec.ts) and it cuts
  // across the storage layer, the two save paths over it, and the surface that announces the
  // failure. It is mapped separately because the failure mode it guards - a door that saves
  // nothing and says nothing - reads as "worked" to every other spec in the suite.
  [/^src\/(model\/(library|shows|prefs|storageHealth)|store\/(saveActions|storageAlert)|ai\/settings)/, ['storage-full.spec.ts']],
  [/^src\/components\/save\/StorageAlertDialog/, ['storage-full.spec.ts']],
  // The AUDIENCE plane (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5). Its whole workflow runs on
  // the local provider, so the offline suite really does cover it - which is why the seam was
  // built before the backend.
  [/^src\/audience\//, ['production-audience.spec.ts']],
  [/^src\/components\/home\/ProductionAudienceWorkspace/, ['production-audience.spec.ts']],
  // The public join page is its own MPA entry, so it needs its own mapping: a change to
  // join.html or src/join/ touches no module the app imports, and would otherwise map to
  // nothing at all.
  [/^(join\.html|src\/join\/)/, ['production-audience.spec.ts']],
  [/^src\/components\/Canvas/, ['canvas-selection.spec.ts', 'canvas-keyframe.spec.ts', 'multi-select.spec.ts', 'wysiwyg.spec.ts', 'inline-edit.spec.ts', 'pasteboard.spec.ts', 'import-graphic.spec.ts', 'asset-workflow.spec.ts']],
  [/^src\/components\/(StepTimeline|TimelineDock|LegacyTimeline|Inspector|PlayoutSimulator)/, ['timeline-v2.spec.ts', 'legacy-timeline.spec.ts', 'inspector.spec.ts', 'anim-engine.spec.ts', 'canvas-keyframe.spec.ts', 'ux.spec.ts', 'import-graphic.spec.ts', 'machine-graph.spec.ts', 'asset-workflow.spec.ts']],
  [/^src\/components\/MachineGraph/, ['machine-graph.spec.ts', 'state-machine.spec.ts', 'timeline-v2.spec.ts']],
  [/^src\/components\/(fields|SampleDataPanel|ControlPanel|HostedControlPage)/, ['control.spec.ts', 'shows.spec.ts', 'hosted-control.spec.ts', 'productions.spec.ts', 'images.spec.ts', 'ux.spec.ts', 'video-inputs.spec.ts', 'import-graphic.spec.ts']],
  [/^src\/components\/(AssetsPanel|assetInfo|InsertTemplateDialog)/, ['assets.spec.ts', 'images.spec.ts', 'asset-workflow.spec.ts', 'template-insert.spec.ts']],
  // wizard-kit rides along: the kit's export door lands on ProductionPage and asks it to open
  // THE production export dialog (templateStore `pendingProductionExport`), so a change to
  // that page can break a wizard flow whose name says nothing about productions.
  [/^src\/components\/(home|save)\//, ['library.spec.ts', 'library-bulk.spec.ts', 'hosted-control.spec.ts', 'productions.spec.ts', 'production-controls.spec.ts', 'production-data.spec.ts', 'production-persistence.spec.ts', 'playout-drills.spec.ts', 'storage-full.spec.ts', 'wizard-kit.spec.ts']],
  // The EXPORT SCREEN and the compatibility panel it mounts. Same spec set as `src/export/`
  // above, because they are the same surface from the other side: those specs drive the Export
  // panel, so they are what renders these components at all. Unmapped, each of them escalated a
  // one-component edit to the whole suite - measured 2026-08-07, when a comment fix in
  // PlayoutCompatibility.tsx ran 759 specs to prove nothing.
  // NOTE: no spec asserts the compatibility panel's CONTENT yet (its `playout-compat` testids
  // are unused). These specs mount it, so a crash or a render fault is caught; a wrong VERDICT
  // is not. That gap wants a spec, not a wider mapping.
  [/^src\/components\/(ExportSurface|PlayoutCompatibility)/, ['exports.spec.ts', 'package.spec.ts', 'offline.spec.ts', 'control.spec.ts', 'shows.spec.ts', 'local-relay.spec.ts', 'template-pack-10.spec.ts']],
  [/^src\/components\/auth\//, ['auth.spec.ts', 'sync.spec.ts']],
  [/^src\/backend\//, ['auth.spec.ts', 'sync.spec.ts', 'offline.spec.ts']],
  [/^src\/community\//, ['community.spec.ts']],
  [/^src\/showchat\//, ['community.spec.ts']],
  [/^src\/landing\//, ['landing.spec.ts']],
  [/^index\.html$/, ['landing.spec.ts']],
  [/^src\/teach\//, ['lazy-editor.spec.ts']],
  // pro + import-graphic ride along because assets/eraseRegion.ts is not only an assets
  // helper: it is the deterministic flat-fill erase behind the Import Graphic Prepare step
  // AND, since the erase slice, the Pro compiler's baked-text removal and ring matte. Those
  // two behaviours are pinned ONLY by pro.spec.ts (the checked-in Pro fixtures exercise
  // neither path - their text is panel-covered and their backdrops non-flat, so the spec
  // builds flat and gradient concepts by hand). Without this edge, editing the file the
  // behaviour lives in runs the assets specs and never the one that would catch a break,
  // leaving it to the nightly.
  [/^src\/assets\//, ['assets.spec.ts', 'images.spec.ts', 'bench.spec.ts', 'asset-workflow.spec.ts', 'pro.spec.ts', 'import-graphic.spec.ts']],
  [/^src\/admin\//, ['admin.spec.ts']],
  [/^admin\.html$/, ['admin.spec.ts']],
  [/^api\/admin\//, ['admin.spec.ts']],
  [/^api\/_lib\/admin/, ['admin.spec.ts']],
  [/^scripts\/adminDevPlugin/, ['admin.spec.ts']],
  [/^api\/me\//, ['admin.spec.ts', 'render.spec.ts', 'feedback.spec.ts']],
  [/^scripts\/meDevPlugin/, ['admin.spec.ts', 'feedback.spec.ts']],
  // The feedback flow. Its OFFLINE contract is that no surface renders at all, which is the
  // half this suite can check; the interactive half is e2e/configured/feedback.spec.ts and
  // needs a configured backend. src/components/AppShell is already in CORE, so the topbar
  // button's own file does not need naming here - but the contract and the client do.
  [/^src\/feedback\//, ['feedback.spec.ts', 'ai.spec.ts']],
  [/^src\/components\/feedback\//, ['feedback.spec.ts', 'ai.spec.ts']],
  [/^src\/backend\/feedback/, ['feedback.spec.ts']],
  [/^api\/_lib\/feedbackStore/, ['feedback.spec.ts']],
  // The caller's own entitlement drives format greying, the template browser and the gallery.
  [/^src\/backend\/myEntitlement/, ['admin.spec.ts', 'render.spec.ts', 'wizard-filters.spec.ts', 'community.spec.ts']],
  [/^src\/components\/useMyEntitlement/, ['admin.spec.ts', 'render.spec.ts', 'wizard-filters.spec.ts']],
  // The entitlement contract is what the render and AI paths gate on, so a change there can
  // move behaviour in either - and in the admin surface that explains it.
  [/^src\/entitlements\//, ['admin.spec.ts', 'render.spec.ts', 'ai.spec.ts']],
  // These files are assertions over catalog output, not shared application foundations.
  // Refreshing them should verify the catalog baseline without expanding to every UI flow.
  [/^e2e\/catalog(?:-render)?-baseline\.json$/, ['catalog-baseline.spec.ts']],
];

// Anything matching these runs the FULL suite - shared foundations with fan-out everywhere.
const CORE = [
  /^src\/store\//,
  /^src\/model\//,
  /^src\/preview\//,
  /^src\/validation\//,
  /^src\/components\/(AppShell|PreviewFrame|WorkspaceDock|CodeEditor|App\.)/,
  /^src\/(App|main)\./,
  /^src\/styles/,
  // The bundled GSAP build is a shared foundation that happens to live under src/assets/, and
  // the `src/assets/` MAP entry below is written for asset HELPERS (eraseRegion, assetInfo,
  // lottieSupport) - so without this line an upgrade of the animation engine ran the assets
  // and Pro specs and never anim-engine.spec.ts. Measured on the 3.10.4 -> 3.15.0 upgrade: 57
  // specs, none of them the one that pins editor-vs-runtime motion parity. Every preview and
  // every export inlines this file verbatim (imported `?raw`, so Vite never even transpiles
  // it), which is the definition of fan-out. Matching CORE as well as MAP is harmless - the
  // full suite is a superset - and it fails toward running MORE, the direction this script
  // says its safety comes from.
  /^src\/assets\/gsap\.min\.js$/,
  /^e2e\/_/,
  // The suite's own machinery, which lives under scripts/ but is imported by the Playwright
  // configs and by the offline globalSetup: the port every spec connects to, the worker count,
  // and the cross-checkout queue that runs before any test does. Naming them here rather than
  // leaving them to the unmapped fallback records WHY they escalate - they are foundations, not
  // files nobody got round to mapping. Their exception in IGNORE above is what lets them reach
  // this list at all.
  /^scripts\/(dev-port|port-registry|e2e-runs|e2e-workers)\.mjs$/,
  /^playwright\.config\.ts$/,
  /^(package|package-lock)\.json$/,
  /^vite\.config/,
  /^app\.html$/,
];

// Files that never affect the offline e2e surface.
//
// `.gitignore` is here because it is VCS metadata: nothing imports it, nothing serves it, and
// no spec can observe it. Left unmapped it escalated a branch to the FULL suite on its own -
// measured on the 2026-07-31 merge of claude/ai-benchmark-harness-routing, where it was the
// only unmapped file and cost a 619-spec run plus the catalog gate to prove nothing.
//
// `benchmarks/corpus-eval/` is the visual eval set's CURATION (docs/SPX_EXAMPLES_CORPUS.md
// workstream 4): pairings and written observations, read only by scripts/spx-eval-set.mjs,
// which is local-only and already ignored above. It ships no code and no spec loads it -
// unlike benchmarks/creative/, whose brief bank creative-routing.spec.ts really does read.
//
// `scripts/` is ignored WHOLESALE on the premise that it is local tooling the app never loads,
// which makes the exception list load-bearing: anything under it that the SUITE ITSELF imports
// must be named here, or a change to it runs no spec at all. The Playwright configs and the
// offline globalSetup import dev-port (hence port-registry, which it imports in turn) for the
// port, e2e-workers for the worker count, and e2e-runs for the cross-checkout queue. A fault in
// any of those does not break one flow - it breaks every spec in the suite, which is the exact
// profile of a file that must escalate. Measured the hard way on 2026-08-06: a commit rewriting
// e2e-runs' checkout attribution, which globalSetup calls before a single test starts, produced
// plan `mode: none` and a green gate that had run zero specs.
//
// Add to the IGNORE list only for a file that genuinely cannot change what a spec sees. The
// script's safety comes from failing TOWARD running more (an unmapped path escalates), so a
// wrong entry here silently runs FEWER specs - the one failure mode with no alarm attached.
// `e2e-affected` and `e2e-lists` are here for a different reason than the rest: they cannot
// break a spec, they decide WHICH specs run. Left ignored, the one change guaranteed to go
// unverified is a change to the thing that chooses the verification - a mistake in this file
// reports `mode: none`, the gate goes green, and nothing ran. Covering them costs one focus run.
// `.github/` is CI configuration. No spec can observe it: Playwright drives a local dev server
// and never reads a workflow file, so running one spec - let alone all 103 - proves exactly
// nothing about a change to it. Its real gate is `scripts/check-workflows.mjs`, which validates
// every workflow against the GitHub Actions schema and runs FIRST in `npm run build`.
//
// The one entry that looks like an exception is not one. `ci.yml` sets `E2E_SPRINT_FOCUS=1`, so
// it decides WHICH specs run - the same category as `e2e-affected`/`e2e-lists`, which are
// deliberately NOT ignored above. The difference is that escalating cannot catch the fault:
// running the full suite locally tells you nothing about whether a workflow's env block is
// right. Nothing is given up by ignoring it, because nothing was being gained. Measured
// 2026-08-07: `nightly.yml` was the unmapped file that turned a two-line gate addition into a
// 759-spec run.
const SUITE_CRITICAL_SCRIPTS =
  'renderDevPlugin|aiDevPlugin|build-player-host|dev-port|port-registry|e2e-runs|e2e-workers|e2e-affected|e2e-lists';
const IGNORE = [/^docs\//, /\.md$/, new RegExp(`^scripts/(?!.*(${SUITE_CRITICAL_SCRIPTS}))`), /^e2e\/configured\//, /^render-worker\//, /^supabase\//, /^NoaCG-Brand-Kit\//, /^example_projects\//, /^benchmarks\/corpus-eval\//, /^\.dependency-cruiser\.cjs$/, /^\.gitignore$/, /^\.github\//];

// Anything matching these also needs the catalog-wide gate (npm run test:e2e:catalog -
// e2e/catalog/catalog-bench.spec.ts, excluded from the default suite above). Same reasoning as
// type-floor.mjs/overflow-sweep.mjs: it only needs to run when the catalog itself, or the
// runtime bench it's calibrated against, could have changed.
// `src/model/fonts.ts` is here because a font change is a catalog-wide LOOK change: the
// registry decides every design's default face, and `tabularFigures` decides what its live
// numbers are set in (scripts/numerals.mjs). Editing it without the calibration gate is how a
// width budget silently moves under 430 designs at once.
const CATALOG_TRIGGERS = [
  // The gate's own config. It is the one file that can change what the tripwire MEASURES -
  // its worker count, its timeouts, its offline pinning - while touching no catalog source at
  // all, so no other rule here would ever raise it. Left unmapped it escalates to `full`
  // instead, and under sprint focus a `full` escalation deliberately drops the catalog
  // coupling: the change to the catalog gate would be the one change that never runs it.
  /^playwright\.catalog\.config\.ts$/,
  /^src\/templates\//,
  /^src\/blocks\//,
  /^src\/assets\//,
  /^src\/model\/fonts\.ts$/,
  /^src\/model\/themeTokens\.ts$/,
  /^src\/validation\/runtimeBench\.ts$/,
];

/**
 * THE CLASSIFICATION, as a pure function of a changed-file list.
 *
 * Split out from the CLI so it can be tested without a git repository and a real diff. That is
 * not tidiness: this function decides how much of the suite runs, and its worst failure - saying
 * "nothing to run" when something should have - is silent by construction. It shipped exactly
 * that on 2026-08-06 (a change to files the Playwright configs import, hidden by the blanket
 * `scripts/` exemption) and the gate went green having executed zero specs. A pure function is
 * one that can be pinned with a list of realistic merges and an expected size for each.
 *
 * @param {string[]} changed        repo-relative paths, forward slashes
 * @param {{ sprintFocus?: boolean }} [opts]
 * @returns {{ mode: 'none'|'subset'|'full', specs: string[], catalog: boolean,
 *             unmapped: string[], focusApplied: boolean }}
 */
export function planFor(changed, { sprintFocus = false } = {}) {
  const specs = new Set();
  let full = false;
  let catalog = false;
  const unmapped = [];

  for (const file of changed) {
    if (IGNORE.some((r) => r.test(file))) continue;
    if (CATALOG_TRIGGERS.some((r) => r.test(file))) catalog = true;
    if (/^e2e\/[^/]+\.spec\.ts$/.test(file)) {
      specs.add(file.replace(/^e2e\//, ''));
      continue;
    }
    if (CORE.some((r) => r.test(file))) {
      full = true;
      continue;
    }
    const rules = MAP.filter(([r]) => r.test(file));
    if (rules.length === 0) {
      unmapped.push(file); // Unknown territory: be safe, run everything, and say why.
      full = true;
    } else {
      for (const [, list] of rules) for (const s of list) specs.add(s);
    }
  }

  // Under sprint focus, the escalation that would have run everything runs the focus set
  // (union with whatever the mapped rules already named). The full->catalog coupling below is
  // deliberately skipped for an intercepted run: a styles.css tweak stops paying the 25-minute
  // catalog gate, while a direct CATALOG_TRIGGERS match above still raises the flag.
  let focusApplied = false;
  if (full && sprintFocus) {
    full = false;
    focusApplied = true;
    for (const s of FOCUS) specs.add(s);
  }
  // A core/unmapped change gets the same conservative default the offline suite gets: assume it
  // could touch the catalog too, rather than trusting CATALOG_TRIGGERS to have named every path.
  if (full) catalog = true;

  const list = full ? [] : [...specs].sort();
  const mode = full ? 'full' : list.length === 0 && !catalog ? 'none' : 'subset';
  return { mode, specs: list, catalog, unmapped, focusApplied };
}

/**
 * THE RUN LIST, as a pure function of a plan. One entry per Playwright invocation this command
 * is responsible for: the mapped/full suite, and the catalog calibration tripwire, which is a
 * SEPARATE config and therefore a separate process.
 *
 * @param {{ mode: 'none'|'subset'|'full', specs: string[], catalog: boolean }} plan
 * @returns {{ name: string, args: string[] }[]}
 */
export function runsFor({ mode, specs, catalog }) {
  const runs = [];
  // An empty spec list handed to Playwright is not "no tests", it is EVERY test - which is why
  // `full` names the suite with no arguments and `subset` only ever runs with a non-empty list.
  if (mode === 'full' || specs.length > 0) {
    runs.push({ name: 'suite', args: ['playwright', 'test', ...specs] });
  }
  if (catalog) {
    runs.push({ name: 'catalog gate', args: ['playwright', 'test', '--config=playwright.catalog.config.ts'] });
  }
  return runs;
}

/**
 * Run everything the plan named and report the FIRST FAILURE's status, never the last run's.
 *
 * This command can spawn two Playwright processes, and the catalog gate is the one that usually
 * goes second. Returning only its status would mean a failing suite followed by a passing gate
 * exits 0 - a green light over a red run, on the command that IS the per-merge gate
 * (docs/DEPLOYMENT.md). Both runs still execute on a failure: the gate's verdict is information
 * worth having even once the suite has gone red, and skipping it would turn one red run into two
 * round trips.
 *
 * `runOne` is injected so this is testable without spawning Playwright - the point being that a
 * defect here is silent by construction, exactly like `planFor`'s.
 *
 * @param {{ mode: 'none'|'subset'|'full', specs: string[], catalog: boolean }} plan
 * @param {(run: { name: string, args: string[] }) => number|null|undefined} runOne
 * @returns {{ status: number, runs: { name: string, args: string[], status: number }[] }}
 */
export function runPlan(plan, runOne) {
  const runs = [];
  let status = 0;
  for (const run of runsFor(plan)) {
    // A spawn that was killed by a signal, or never started, reports a null status. That is a
    // failure, not a pass - the one case where "no exit code" must not read as zero.
    const code = runOne(run) ?? 1;
    runs.push({ ...run, status: code });
    if (code !== 0 && status === 0) status = code;
  }
  return { status, runs };
}

/** The one-line verdict, naming each run - so a red overall status says WHICH run went red. */
export function summariseRuns(runs, status) {
  const parts = runs.map((r) => `${r.name} ${r.status === 0 ? 'passed' : `FAILED (exit ${r.status})`}`);
  return `e2e-affected: ${parts.join('; ')}. Overall: ${status === 0 ? 'passed' : `FAILED (exit ${status})`}.`;
}

function git(...cmd) {
  return execFileSync('git', cmd, { encoding: 'utf8' }).trim();
}

/** The plan, as CI consumes it. `mode` covers the specs to run; `catalog` is independent of it,
 *  because a catalog change can need the calibration gate while needing no feature spec. */
function emitJson({ mode, specs, catalog, base, changed }) {
  process.stdout.write(`${JSON.stringify({ mode, specs, catalog, base, changed })}\n`);
}

/** Everything the CLI does: resolve the diff, classify it, report it, and run what it named. */
function main() {
  const args = process.argv.slice(2);
  // SPRINT FOCUS (docs/GOALS.md "Student release", scripts/e2e-lists.mjs): while the sprint
  // runs, a CORE/unmapped escalation runs the student-critical focus set instead of the full
  // suite. Opt-in via env so nothing changes for a checkout that has not set it; --no-focus
  // forces the honest full escalation for a one-off. Mapped subsets are NOT intersected - they
  // are already small and precisely targeted, and intersecting would run zero relevant specs
  // for a paused-area fix. The nightly still runs everything.
  // `--focus` is the same switch as the env var, spelled so an npm script can carry it: Windows
  // runs package scripts through cmd.exe, where the posix `VAR=1 cmd` prefix is a syntax error,
  // so the env-only form could never be baked into `npm run` and every local run had to remember
  // it by hand. It could not, which is why a core change on this laptop kept escalating to the
  // full 103-file suite while CI - where ci.yml does set the env - ran the 34-file focus set.
  const sprintFocus =
    (process.env.E2E_SPRINT_FOCUS === '1' || args.includes('--focus')) && !args.includes('--no-focus');
  // --json prints the plan as one machine-readable object and runs nothing, which is how CI
  // decides between "skip the suite", "run these specs" and "run everything". It implies
  // --list, and it silences the human commentary: in this mode stdout is a data channel and a
  // stray progress line would corrupt it.
  const asJson = args.includes('--json');
  const listOnly = asJson || args.includes('--list');
  const baseArg = args.find((a) => !a.startsWith('--'));
  const log = asJson ? () => {} : console.log;

  const base = baseArg ?? git('merge-base', 'HEAD', 'main');
  const committed = git('diff', '--name-only', `${base}...HEAD`).split('\n');
  // Porcelain lines are `XY path` (a rename is `XY old -> new`); a global trim() would eat the
  // first line's leading status space, so strip the prefix by pattern, not by position.
  const working = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.replace(/^.{2} /, '').replace(/^.* -> /, '').trim());
  const changed = [...new Set([...committed, ...working])].filter(Boolean).map((f) => f.replace(/\\/g, '/'));

  if (changed.length === 0) {
    if (asJson) emitJson({ mode: 'none', specs: [], catalog: false, base, changed: 0 });
    log('e2e-affected: no changes vs', base, '- nothing to run.');
    return 0;
  }

  const { mode, specs: plan, catalog: catalogAffected, unmapped, focusApplied } = planFor(changed, { sprintFocus });
  const full = mode === 'full';

  if (unmapped.length > 0) {
    log(`e2e-affected: no mapping for these files (falling back to the ${focusApplied ? 'SPRINT FOCUS set' : 'full suite'}):`);
    for (const f of unmapped) log('  -', f);
  }

  if (focusApplied) {
    log(`e2e-affected: SPRINT FOCUS - a core/unmapped change would run the full suite (103 files); running the ${plan.length}-spec student-critical set instead (npm run test:e2e:focus; nightly still runs everything).`);
  }
  if (full) {
    log(`e2e-affected: core/unmapped change detected - running the FULL suite (${changed.length} changed files).`);
  } else if (mode === 'none') {
    if (asJson) emitJson({ mode: 'none', specs: [], catalog: false, base, changed: changed.length });
    log('e2e-affected: changes touch nothing the offline e2e suite covers - nothing to run.');
    return 0;
  } else if (plan.length > 0) {
    log(`e2e-affected: ${changed.length} changed files -> ${plan.length} spec files:`);
    for (const s of plan) log('  -', s);
  }
  if (catalogAffected) {
    log('e2e-affected: catalog/bench-affecting change detected - will also run npm run test:e2e:catalog.');
  }

  if (asJson) {
    // `mode` is only ever none/subset/full; the catalog gate rides alongside as its own flag,
    // because a catalog-only change needs that gate and no feature spec at all - and that case
    // is exactly why the empty plan must report 'none' rather than 'subset'. An empty spec list
    // handed to Playwright is not "no tests", it is EVERY test, so a mislabelled subset would
    // quietly run the whole suite.
    emitJson({ mode, specs: plan, catalog: catalogAffected, base, changed: changed.length });
    return 0;
  }

  if (listOnly) return 0;

  const { status, runs } = runPlan(
    { mode, specs: plan, catalog: catalogAffected },
    ({ args }) => spawnSync('npx', args, { stdio: 'inherit', shell: true }).status,
  );
  if (runs.length > 1 || status !== 0) log(summariseRuns(runs, status));
  return status;
}

if (isEntrypoint) process.exit(main());
