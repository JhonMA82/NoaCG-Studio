# Verification - the full procedure

The root `AGENTS.md` carries the six rules. This file carries the detail behind them: which
suite to run, why the gate moved off the laptop, and what each catalog gate measures. Moved here
from `AGENTS.md` on 2026-08-08 to keep the always-loaded contract short; nothing was dropped.

## The build gate

`npm run build` (tsc + eslint + vite) after every change. The tree stays lint-clean: fix findings
properly rather than sprinkling eslint-disable comments.

Its first, fastest step is `node scripts/check-shared-instructions.mjs` - the drift guard for the
AGENTS.md/CLAUDE.md split and the `.agent-workflows/` shared-workflow pattern: it validates thin
imports, Claude commands, Codex skills under `.agents/skills/`, metadata, explicit-invocation
safety, referenced scripts, and the configured instruction-size budget. It self-discovers
`AGENTS.md` and shared workflow files, so a new nested area or shared command needs no separate
registration - only correct adapters. The complete maintenance contract is
`docs/AGENT_WORKFLOWS.md`.

Its second step, `scripts/check-workflows.mjs`, validates every `.github/workflows/*.yml` against
the GitHub Actions schema: a misspelled key, a wrong-typed value, a `needs:` naming a job that does
not exist - the last being exactly what editing the CI gate's dependency set can introduce. Never
wait for GitHub to catch it instead; during the 2026-08-06 outage two pushes produced no run at all.

There is **no application unit-test suite**; focused Node tests cover infrastructure scripts.
Verify product changes with `npm run build` plus in-browser checks; never mark work done on a green
build alone if the behaviour is observable.

## E2E is TIERED

`npm run test:e2e:affected` maps changed files to covering specs (`scripts/e2e-affected.mjs`) and
is both the inner loop AND what CI runs per change - except on **`main`, which always runs the FULL
suite** (a spec no change maps to is never selected, so it can sit red through green run after
green run - measured, eight of them), and NIGHTLY.

**During the student-release sprint, `npm run test:e2e:focus` is THE student-critical suite
command** (`--focus`, or `E2E_SPRINT_FOCUS=1`, which is what ci.yml sets): a core-file change runs
the focus set (`scripts/e2e-lists.mjs`, 34 specs) instead of all 103 files; the nightly still runs
everything and its verdict separates focus failures from paused-area drift. Prefer the npm script -
the env-var spelling cannot be baked into a package script, because Windows runs those through
`cmd.exe` where a `VAR=1 cmd` prefix is a syntax error, which is why every local run escalated to
103 files while CI quietly ran 34.

When you add a spec, add its mapping in the same commit, or it only ever runs at night. Bootstrap
non-wizard specs with `createProject` (`e2e/_create.ts`).

## The pre-merge gate belongs to CI, not the laptop

`ci.yml` runs on every branch push and does strictly more than a local run can (build, the affected
plan sharded eight ways, the factory gates, the catalog tripwire when raised) in six to nine
minutes, free, on a clean checkout. The safe-merge workflow's Phase 3 prefers a CI run green on
exactly the commit being promoted and falls back to the local pair only when there isn't one.

## One browser-driving job per MACHINE, not per worktree

A suite, a catalog sweep and a bench are the same workload under different names - a dev server
plus a pile of headless Chromium - and several worktrees are normally live. Two starting in the
same minute asks a 16 GB laptop for double everything: measured at 59 live
`chrome-headless-shell` processes, 10.9 GB held by the test tree and available RAM down to 35 MB,
at which point every other app is being paged out.

The guard hook refuses the second job and names the checkout holding the first
(`scripts/e2e-runs.mjs`, which scans processes rather than keeping a lock file, so there is nothing
stale to clear), and `e2e/_offline-guard.ts` WAITS instead - the universal net, since a hook only
sees tool calls, never your terminal. Use the **`:queued`** form of any e2e script to wait rather
than fail, `node scripts/e2e-runs.mjs --all` to see what is running, and `--orphans` /
`--kill-orphans` to reap browsers a killed run left behind. `NOACG_ALLOW_PARALLEL_E2E=1` in the
command overrides.

Anything the named list misses is absorbed by the worker ladder (`scripts/e2e-workers.mjs`): it
reads FREE MEMORY at start and takes fewer workers when something heavy is already resident, which
is why the local worker count is not a constant.

## Logic checks without UI (fast path)

Vite serves source modules, so in a browser context you can
`await import('/src/blocks/registry.ts?t=' + Date.now())`, apply blocks to
`createBlankTemplate(...)`, run `validateTemplate`, and load `composeDocument(tpl)` into a hidden
iframe to call `update()/play()/stop()`; store state via `useTemplateStore.getState()`.

## Template catalog sweep

`node scripts/l3-sweep.mjs <shots-dir> <category>` (dev server must be running; any
`TemplateCategory` id - `lower-third`, `info-card`, `end-credits`, `ticker`, `quiz`, `poll`,
`audience`, …) validates every variant × preset × easing. Run it for the affected category after
template changes. A category whose contract differs from the standard one gets its own branch in
the script rather than a waiver (audience and quiz each have one).

## The five catalog quality gates

Run after any catalog-wide change:

- `node scripts/type-floor.mjs` fails on any text under its category size floor.
- `node scripts/overflow-sweep.mjs --baseline` fails on any box that newly escapes the 1920x1080
  frame or clips its own content, diffing against `scripts/overflow-baseline.json` (~200 variants
  clip by design - reveal masks, ticker/crawl scroll - so it is a diff gate, re-recorded with
  `--update-baseline` on a deliberate look change). **`--with-images` adds a second pass with a
  mark in every image field**, recorded as `<id>@image` in the same baseline: a logo is the one
  operator action that can spend a strap's remaining width (+35% on lt54,
  `docs/ADAPT_FIRST_PLAN.md` §1.5) and every gate here otherwise runs on the EMPTY build.
  Re-record with `--update-baseline --with-images`; the script refuses a bare re-record once image
  rows exist, because that would silently retire half the gate.
- `npm run test:e2e:catalog` (the calibration tripwire in `e2e/catalog/catalog-bench.spec.ts`) is
  the ONLY gate that catches a design growing past its width budget - it doubles every text value.
  Excluded from the default `npm run test:e2e` suite: benching every catalog variant across every
  category is the single heaviest thing here, and (like the two gates above) it only needs to run
  when the catalog or `src/validation/runtimeBench.ts` actually changed.
- `node scripts/field-coverage.mjs` is about DATA: it drives every data field to a sentinel
  through `update()` and re-reads the screen, so anything that did not move is not
  operator-reachable (an `id="fN"` scan cannot see a standings row, ticker item or credits line,
  which a runtime BUILDS from one `lines` field).
- `node scripts/numerals.mjs` is about MOVEMENT: it substitutes every digit in turn and measures,
  failing any live number whose box changes width (DESIGN_LANGUAGE §1) - `tabular-nums` is a NO-OP
  on six of the seventeen bundled faces, so grepping for it would have passed every jiggling
  scoreboard. `--fonts` re-measures the registry's `tabularFigures` flags.

`node scripts/engine-floor.mjs` is about the PLAYOUT BROWSER: what CSS/JS an older engine silently
drops, per design and per declaration (`--engine casparcg-24`, `--chromium 80`, `--fail` to gate).
It shares its scanner with the export screen's Playout-compatibility section
(`src/validation/engineSupport.ts`), so gate and warning cannot disagree, and it REPORTS at exit 0 -
a standing account (179 of 430 designs at the Chromium 88 bar) rather than a line the catalog
currently holds.

**The doctrine these share:** they MEASURE the rendered graphic rather than grepping the source,
because every source check here would have passed a catalog that was visibly broken. Each script
documents its own exemptions, with the reason written beside them.

**None of the five is left to memory:** `npm run test:e2e:affected` raises the tripwire
automatically when relevant and CI runs it on that flag, and the NIGHTLY sweep runs all five
unconditionally - so an unrun catalog gate is caught by morning rather than never.

## Freshness is TIME-driven, never commit-driven

`docs/STACK_FRESHNESS.md` owns this. `npm run check:freshness` is not in the build gate, because
its answer changes when upstream publishes. It runs weekly in `weekly-audit.yml` and REPORTS -
nothing auto-upgrades, since Remotion's three-file exact pin and the es2017 output floor can both
be broken by a bump that passes every check.
