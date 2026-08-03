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

// ── Source-area → spec globs ────────────────────────────────────────────────
// Order does not matter; every matching rule contributes its specs (union).
const MAP = [
  [/^src\/ai\/video\//, ['video-project.spec.ts', 'video-inputs.spec.ts', 'video-settings.spec.ts', 'video-player-host.spec.ts', 'video-hyperframes.spec.ts', 'video-readability.spec.ts']],
  // creative-routing covers the mode + intent ROUTER and the brief-satisfaction check, both
  // of which live here - it was previously nightly-only for src/ai changes, which is exactly
  // the surface it exists to protect.
  [/^src\/ai\/pro\//, ['pro.spec.ts', 'import-graphic.spec.ts']],
  [/^src\/ai\//, ['ai.spec.ts', 'ai-depth.spec.ts', 'ai-lite.spec.ts', 'ai-retrieval.spec.ts', 'adapt-first.spec.ts', 'import-graphic.spec.ts', 'creative-routing.spec.ts', 'creative-pilot.spec.ts', 'pro.spec.ts']],
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
  [/^src\/export\//, ['exports.spec.ts', 'package.spec.ts', 'offline.spec.ts', 'control.spec.ts', 'shows.spec.ts', 'template-pack-10.spec.ts']],
  [/^src\/control\//, ['control.spec.ts', 'exports.spec.ts', 'shows.spec.ts', 'hosted-control.spec.ts', 'productions.spec.ts', 'snap-recovery.spec.ts']],
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
  [/^src\/templates\//, ['catalog-baseline.spec.ts', 'graphic-types.spec.ts', 'bench.spec.ts', 'house.spec.ts', 'wave2.spec.ts', 'timeline-v2.spec.ts', 'wizard-filters.spec.ts', 'wizard-logo.spec.ts', 'wizard-preview.spec.ts', 'format.spec.ts', 'ux.spec.ts', 'state-machine.spec.ts', 'machine-graph.spec.ts', 'template-pack-10.spec.ts', 'stream-notification.spec.ts', 'creative-routing.spec.ts', 'ai-retrieval.spec.ts', 'snap-recovery.spec.ts']],
  [/^src\/components\/wizard\//, ['wizard-filters.spec.ts', 'wizard-logo.spec.ts', 'wizard-preview.spec.ts', 'wizard-entry-fit.spec.ts', 'flows.spec.ts', 'ux.spec.ts', 'import.spec.ts', 'import-graphic.spec.ts', 'project.spec.ts', 'video-project.spec.ts', 'video-hyperframes.spec.ts', 'pro.spec.ts']],
  [/^src\/components\/Canvas/, ['canvas-selection.spec.ts', 'canvas-keyframe.spec.ts', 'multi-select.spec.ts', 'wysiwyg.spec.ts', 'inline-edit.spec.ts', 'pasteboard.spec.ts', 'import-graphic.spec.ts', 'asset-workflow.spec.ts']],
  [/^src\/components\/(StepTimeline|TimelineDock|LegacyTimeline|Inspector|PlayoutSimulator)/, ['timeline-v2.spec.ts', 'legacy-timeline.spec.ts', 'inspector.spec.ts', 'anim-engine.spec.ts', 'canvas-keyframe.spec.ts', 'ux.spec.ts', 'import-graphic.spec.ts', 'machine-graph.spec.ts', 'asset-workflow.spec.ts']],
  [/^src\/components\/MachineGraph/, ['machine-graph.spec.ts', 'state-machine.spec.ts', 'timeline-v2.spec.ts']],
  [/^src\/components\/(fields|SampleDataPanel|ControlPanel|HostedControlPage)/, ['control.spec.ts', 'shows.spec.ts', 'hosted-control.spec.ts', 'productions.spec.ts', 'images.spec.ts', 'ux.spec.ts', 'video-inputs.spec.ts', 'import-graphic.spec.ts']],
  [/^src\/components\/(AssetsPanel|assetInfo|InsertTemplateDialog)/, ['assets.spec.ts', 'images.spec.ts', 'asset-workflow.spec.ts', 'template-insert.spec.ts']],
  [/^src\/components\/(home|save)\//, ['library.spec.ts', 'packets.spec.ts', 'hosted-control.spec.ts', 'productions.spec.ts']],
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
// Add to this list only for a file that genuinely cannot change what a spec sees. The script's
// safety comes from failing TOWARD running more (an unmapped path escalates), so a wrong entry
// here silently runs FEWER specs - the one failure mode with no alarm attached.
const IGNORE = [/^docs\//, /\.md$/, /^scripts\/(?!.*(renderDevPlugin|aiDevPlugin|build-player-host))/, /^e2e\/configured\//, /^render-worker\//, /^supabase\//, /^NoaCG-Brand-Kit\//, /^example_projects\//, /^benchmarks\/corpus-eval\//, /^\.dependency-cruiser\.cjs$/, /^\.gitignore$/];

// Anything matching these also needs the catalog-wide gate (npm run test:e2e:catalog -
// e2e/catalog/catalog-bench.spec.ts, excluded from the default suite above). Same reasoning as
// type-floor.mjs/overflow-sweep.mjs: it only needs to run when the catalog itself, or the
// runtime bench it's calibrated against, could have changed.
const CATALOG_TRIGGERS = [/^src\/templates\//, /^src\/blocks\//, /^src\/assets\//, /^src\/validation\/runtimeBench\.ts$/];

const args = process.argv.slice(2);
// --json prints the plan as one machine-readable object and runs nothing, which is how CI
// decides between "skip the suite", "run these specs" and "run everything". It implies
// --list, and it silences the human commentary: in this mode stdout is a data channel and a
// stray progress line would corrupt it.
const asJson = args.includes('--json');
const listOnly = asJson || args.includes('--list');
const baseArg = args.find((a) => !a.startsWith('--'));
const log = asJson ? () => {} : console.log;

function git(...cmd) {
  return execFileSync('git', cmd, { encoding: 'utf8' }).trim();
}

/** The plan, as CI consumes it. `mode` covers the specs to run; `catalog` is independent of it,
 *  because a catalog change can need the calibration gate while needing no feature spec. */
function emitJson({ mode, specs, catalog, base, changed }) {
  process.stdout.write(`${JSON.stringify({ mode, specs, catalog, base, changed })}\n`);
}

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
  process.exit(0);
}

const specs = new Set();
let full = false;
let catalogAffected = false;
const unmapped = [];
for (const file of changed) {
  if (IGNORE.some((r) => r.test(file))) continue;
  if (CATALOG_TRIGGERS.some((r) => r.test(file))) catalogAffected = true;
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
    // Unknown territory: be safe, run everything, and say why.
    unmapped.push(file);
    full = true;
  } else {
    for (const [, list] of rules) for (const s of list) specs.add(s);
  }
}
// A core/unmapped change gets the same conservative default the offline suite gets: assume it
// could touch the catalog too, rather than trusting CATALOG_TRIGGERS to have named every path.
if (full) catalogAffected = true;

if (unmapped.length > 0) {
  log('e2e-affected: no mapping for these files (falling back to the full suite):');
  for (const f of unmapped) log('  -', f);
}

const plan = full ? [] : [...specs].sort();
if (full) {
  log(`e2e-affected: core/unmapped change detected - running the FULL suite (${changed.length} changed files).`);
} else if (plan.length === 0 && !catalogAffected) {
  if (asJson) emitJson({ mode: 'none', specs: [], catalog: false, base, changed: changed.length });
  log('e2e-affected: changes touch nothing the offline e2e suite covers - nothing to run.');
  process.exit(0);
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
  emitJson({
    mode: full ? 'full' : plan.length > 0 ? 'subset' : 'none',
    specs: plan,
    catalog: catalogAffected,
    base,
    changed: changed.length,
  });
  process.exit(0);
}

if (listOnly) process.exit(0);

let status = 0;
if (plan.length > 0 || full) {
  const result = spawnSync('npx', ['playwright', 'test', ...plan], { stdio: 'inherit', shell: true });
  status = result.status ?? 1;
}
if (catalogAffected) {
  const catalogResult = spawnSync('npx', ['playwright', 'test', '--config=playwright.catalog.config.ts'], { stdio: 'inherit', shell: true });
  status = status || (catalogResult.status ?? 1);
}
process.exit(status);
