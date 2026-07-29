# NoaCG Lite - model evaluation benchmark

How NoaCG Lite's model-and-provider route is measured, regressed, and (eventually)
promoted. The question: *which route produces the cheapest consistently usable, editable,
broadcast-appropriate Lite graphic* - cost per **accepted** graphic, not per call, against
the Lite ceiling of $0.01 per accepted graphic.

Lite's model never writes HTML: it emits one constrained structured decision that the
platform compiles deterministically through the real catalog assemblers. So the benchmark
measures constrained design judgement and structured-output reliability - generic coding
benchmarks are weak priors here.

## 1. Context-assembly trace (what the model actually receives)

Findings from the 2026-07 inspection, kept here because they shape the whole design:

- **Lite sends a curated compact digest, never a full-catalog dump.** The server-owned
  system prompt (`src/ai/liteContract.ts` `liteSystemPrompt`) always contains the whole
  *Lite* catalog - the audited allowlist (6 lower-third chassis at first release), one
  pipe-delimited line each. There is no separate category-selection call and no per-call
  filtering: with one supported category there is nothing to filter yet. `'auto'` versus an
  explicit requested category changes only the ledger's `requestedCategory` and the
  `requested_category_ignored` semantic check.
- **Measured size (chars/4 approximation):** roughly **2.5k input tokens per call**
  (system prompt incl. the ~650-token catalog digest, plus the structured-output schema and
  the small request), well inside the profile's 12k estimate. The exact current numbers are
  not frozen here on purpose: `bench:calibrate` and `bench:regress` re-measure and record
  them on every run (`context` in the summaries) - that series is the catalog-growth cost
  curve made visible.
- **Refusals are deterministic-only.** The model's structured schema is ready-only
  (`LITE_READY_OUTPUT`); `deterministicUnsupportedDecision` (requested-category check +
  prompt patterns, pre-inference, zero cost) is the ONLY refusal path. Consequence for the
  benchmark: `UNSUPPORTED_FORCED` measures the deterministic screen's misses, not model
  judgement - an unsupported brief that slips the screen WILL be forced into a lower third.
  The screen's coverage of the expected-unsupported briefs is regression-pinned in
  `bench:regress` and the build-gate tests.
- **Scaling:** the Lite digest grows ~110 tokens per audited chassis plus schema-enum
  growth. Growth is governed by *curation into* `LITE_CATALOG`, not by the raw catalog -
  widening the allowlist is a deliberate, benchmarked act (src/ai/AGENTS.md).
- **The full-catalog dump lives in the full harness, not Lite:** `catalogDigest()`
  (src/ai/designSpec.ts) puts every category and variant into `claudeProvider`'s design-call
  system prompt on every call, pinned category or not (pinning narrows the tool schema via
  `narrowedSpecTool`, never the digest). Measured ≈ 12k tokens and growing linearly with the
  catalog; `fullHarnessDigestTokens` in the calibration context records the exact number.
  When Lite grows toward many categories, the staged approach (classify → shortlist →
  compact digest → validate server-side) applies there; **preserve current behaviour until
  the benchmark's retrieval-accuracy and wrong-category metrics show a change is safe.**
- **Eval-vs-production drift:** closed. The model-call side was already identical (the eval
  runner calls the production endpoint); the compile side drifted (the old eval skipped
  `applySpecLocks`/`ensureSpecFonts`/`applySpecOutPreset` and the safety screen). The whole
  deterministic half now lives once in **`src/ai/litePipeline.ts`** and both production and
  every runner import it; `scripts/ai-lite-bench.test.mjs` pins that no second copy exists.
- **Key exposure:** none found. Provider keys are server-only (`managedAiKey`); the eval
  runner authenticates with a bearer token and never sees keys, models, or provider bodies;
  `src/ai/settings.ts` carries a one-way migration erasing the historical localStorage key;
  `scripts/check-client-secrets.mjs` gates src/e2e/scripts/docs and the built `dist/` on
  every build. E2E specs seed only non-secret routing preferences.
- **Routing config:** the brief's `config/ai-model-routes.json` and `lite.theme` route do
  not exist in this codebase and are not built. Routing is server env configuration read by
  `api/_lib/aiLiteProfile.ts` (`AI_LITE_PRIMARY_*`, `AI_LITE_FALLBACK_*`, prices, ZDR,
  provider pinning, structured mode) - one place, no model identifier in production code,
  changeable without a browser deploy. Theming was never a separate call: palette and
  typography are DesignSpec properties. The repair route is pinned to whichever model
  produced the invalid decision, inside the same two-attempt session ceiling.

## 2. The shared pipeline

`src/ai/litePipeline.ts` is the one grounded compile path:

- `normalizeLiteSpec` - the lite decision's normalization (`fit: 'catalog'`, no flourish,
  `applySpecLocks` for the user's structured setup).
- `assembleGroundedTemplate` - `specToTemplate` → `applyDesignAdjustments` →
  `ensureSpecFonts` → `applySpecOutPreset`, exactly production's order.
- `productionSpxValidator` - static `validateTemplate` + live `benchTemplateRuntime`,
  wrapped in the safety screen; the same composition AiStep injects.
- `compileLiteDecision` - all of the above; what every benchmark runner calls.

Production (`claudeProvider`) is built FROM these functions; benchmark mode may capture
extra artifacts but never a better prompt or a different compilation path. The equivalence
pins live in `scripts/ai-lite-bench.test.mjs` (run in the build gate).

## 3. Two comparison modes - never conflate

- **Model comparison:** commit, prompt, schema, compiler, catalog, validators, parameters
  fixed; only model + provider endpoint vary.
- **NoaCG regression:** model fixed (or absent); pipeline varies.

Every run records a manifest (`scripts/ai-lite-bench/manifest.mjs`): suite id, git commit,
hashes of the Lite contract / shared pipeline / whole catalog / validators / suite,
environment, candidate identity, timestamp. `pipelineIdentityMatches` decides whether two
runs support a model comparison. **Never attribute a score change to a model when the
pipeline hashes also changed.**

Because the catalog is immature and changes weekly, **regression mode is the mode that pays
for itself now**; model comparison waits until a frozen suite stays meaningful for more
than a few weeks. Model choice at Lite's cost profile is one env-var edit - the catalog is
the irreversible investment.

## 4. Suites (`scripts/ai-lite-bench/`, suite id `lite-spec-v1`)

- **Core (frozen, visible)** - 8 briefs in `suites.mjs`, each with a labelled expected
  outcome (category, intent, roles; or expected-unsupported with its code). Lower-third
  briefs reuse the exact prompts from `ai-lite-lower-third-fixtures.mjs` (drift-pinned).
  Off-category and video briefs are expected-unsupported - and expected to be caught by the
  zero-cost pattern screen, so they cost nothing.
- **Hidden holdout** - `holdout.mjs`. Never used for prompt tuning, never in development
  reports; validates promotion decisions and detects overfitting (Finnish/Swedish names,
  hyphenated titles, long orgs, refusals).
- **Repair suite** - malformed/inconsistent decisions with the exact rule codes
  `validateLiteDecision` must emit. Scored separately; regression-checked in CI.
- **Rotating challenge** - `challenge.mjs`; diagnostic only, seeded with the named stress
  classes (extreme length, CJK + RTL Unicode, difficult contrast, rapid updates, sparse
  content) and grown from real failures - never retroactively into core.
  `bench:calibrate -- --challenge` compiles floor-style picks over it as a CATALOG
  capacity probe; results are reported separately and never gate the run.

Any change to a frozen brief, gold spec, expectation, or the prompt contract is a NEW suite
version. History stays queryable, never presented as comparable across versions.

## 5. Calibration - run this before comparing anything

`npm run bench:calibrate` (dev server required; zero model calls, zero cost):

- **Gold ceiling** - hand-written specs for three core briefs, compiled through the
  production pipeline, screenshot + motion clip captured for review. If gold does not
  review well, the catalog is the ceiling and no model choice will move it.
- **Trivial floor** - seeded-random valid chassis carrying the labelled fields. A model
  that does not clearly beat this contributes nothing.

Report every candidate as a position between floor and ceiling, never as an absolute.

## 6. Commands

```bash
npm run bench:calibrate   # gold ceiling + trivial floor (free; dev server required)
npm run bench:regress     # fixed-model pipeline regression (free; --update-baseline records)
npm run bench:lite        # the PAID eval runner (= eval:ai-lite; hard caps: 40 calls / $1.50)
npm run bench:spike -- --label=candidate-a   # Phase 0 spike: DRY RUN with cost preview by
                          # default; --confirm-spend executes 6 briefs x 3 runs for the
                          # server's current route (repeat per candidate with a new label)
npm run bench:spike -- --label=candidate-a --suite=skin   # the SKIN spike: the six
                          # skin-* fixture briefs (distinctive styles no house chassis
                          # carries) against a server started with AI_LITE_SKIN_ENABLED=1;
                          # a paid run REFUSES to start when the flag is off, and metrics
                          # count skinApplied (skinned canvas vs house-chassis revert).
                          # With AI_LITE_JUDGE_ENABLED=1 the run also exercises the
                          # VISION JUDGE (below) on every skinned result - the full
                          # production-shaped funnel including judge-reverted counts
npm run bench:gallery     # blind review gallery over any out-dir
npm run bench:sameness    # visual-diversity metric over an out-dir's hold captures (free,
                          # offline): per-label mean + MIN pairwise distance (the
                          # "different briefs must produce different designs" tripwire)
                          # and, when house references exist (default <out>/calibration,
                          # or --house=<dir>), each item's nearest house look - for the
                          # skin suite, "looks like no house chassis" made checkable.
                          # Distances are relative to one capture setup, never absolute.
npm run bench:report      # aggregate results + judgements into the honest report
                          # (folds in sameness.json when bench:sameness has run)
npm run test:ai-lite-bench  # the benchmark self-tests (also in the build gate)
```

`bench:regress` checks three things: pipeline-identity drift vs the committed baseline
(reported, not failed - drift means old model runs stopped being comparable), the repair
suite + zero-cost unsupported screen (behavioral, fails the run), and gold+floor compile
through the production pipeline (fails on any machine-invalid arm).

The paid runner keeps its own guardrails: bearer-token identity, per-run call and cost
hard stops, evaluation-ledger isolation, and no provider key or body ever reaching the
client. **Never run it during implementation work; every paid run is announced with its
cost cap first.**

Deferred (gated on catalog stability, by design): `bench:discover`, `bench:qualify`,
`bench:confirm`, `bench:compare`, `bench:review` - the model discovery funnel (OpenRouter
catalogue filtering on structured-output support, ZDR, pricing, provider pinning;
qualification → screening → confirmation with candidate identity = model + endpoint +
revision + parameters + reasoning config, `model@reasoning=low` as its own candidate).
Build them when a frozen suite survives more than a few weeks.

## 6b. The skin vision judge (`POST /api/ai/lite/judge`)

Phase 2 of the skin uniqueness strategy (the paid spike's verdict: capability exists,
CONSISTENCY is the fight). A skin that compiles and benches clean can still be a bad
broadcast graphic - a squat box, a wrapped name, decoration burying the text. The judge
is one server-owned, cost-capped vision call over the rendered HOLD frame, scoring four
integer axes 1-5: `legibility`, `hierarchy`, `briefFit`, `strapShape`. A pass requires
EVERY axis at or above `AI_LITE_JUDGE_THRESHOLD`; below it the caller reverts to the
house chassis, so a weak skin costs a judgement call, never an on-air graphic.

Boundaries, same posture as the generation route: the browser/rig supplies only the frame
(downscaled PNG), the brief, and the skin's claimed treatment - never a model, route,
prompt, or policy. The judge fails closed (enabled + priced + audited-allowlist or it
refuses), spends only behind a generation the caller owns, adds its provider cost to that
generation's ledger row (so the fleet spend ceiling sees it), and stores nothing - the
screenshot is judged and dropped. Config: `AI_LITE_JUDGE_*` in `.env.example`. A judge
TRANSPORT failure fails open in the rig (the deterministic gates already passed) and is
recorded as `judge: error`, never hidden.

**Calibration before trust.** The gallery stays blind - judge scores never appear in it,
or they would bias the reviewer. `bench:report` prints per-candidate judge pass rates and
mean per-axis scores next to (separate) human acceptance; agreement between the judge's
verdicts and blind review is what earns the threshold. Until that correlation is
measured, the judge runs in the eval rig only - production wiring additionally needs an
in-app hold-frame capture path, which does not exist yet (rig captures are Playwright
screenshots).

`bench:report` now **computes** that correlation rather than leaving it to the eye. For
every item carrying both a judge verdict and a blind decision it reports raw agreement,
**Cohen's kappa**, and the two error cells. Raw agreement alone flatters a lopsided judge -
one that passes nearly everything scores well against reviewers who also accept most
things - so kappa is the number that counts, and below 0.4 the report states plainly that
the judge has not earned a threshold. With no paired items the report says agreement is
UNMEASURED, so no judge-based threshold can be claimed by omission.

The cell to read first is **waved through** (judge passed, human rejected): each one is a
defect class the judge cannot see. The rule that follows is *prefer a deterministic gate
to a wider judge remit* - the 2026-07-29 review rejected two skins for clipped text
("cuts of", "looks like its cut of") that the judge passed, and the answer was a bench
detector for `clip-path` clipping (`bench-overflow`, measured at the text's own height so
a sheared bar cannot hide behind its bounding box), not a stricter judge prompt.

## 6c. Measured: the skin prompt has a load ceiling

Four paid rounds isolated the skin teaching, one variable at a time. Among JUDGED skins
(the per-brief figure moves with transport failures; this one does not):

| prompt | pass rate | briefFit | legibility | what changed |
| --- | --- | --- | --- | --- |
| v3 | 47% | 2.60 | 3.47 | strap rule RESTATED as geometry, prohibitions deleted |
| v4 | 33% | 2.58 | 3.75 | +3 lines teaching brief fit |
| v5 | 27% | 2.36 | 2.91 | +1 line binding motif to strap |

**Both attempts to raise briefFit lowered it, and v5 took legibility with it.** The skin
block went from roughly six simultaneous requirements to eleven; every line was defensible
alone and drawn from the judge's own words, and the aggregate still degraded every axis.

Two rules follow, and they cost about $0.05 to learn:

- **Prefer replacing to adding.** v3 - the one change that clearly won - deleted as much as
  it wrote. A prompt at this length is a fixed budget, not an append-only log.
- **Watch the axis you are NOT targeting.** v4 got what it asked for: the first briefFit
  5s. Both scored strapShape 2 ("a small, squat box in the corner rather than a
  lower-third strap") and reverted. Instructions compete; a win on one axis that nobody
  measured against the others is not a win.

briefFit stays the weak axis (2.60 at best). The next mechanism to try is worked EXAMPLES -
one or two high-scoring skins shown rather than described, or the curated skins the nightly
factory is meant to produce - not more sentences.

## 7. Human review

One reviewer; fatigue is the binding constraint. `bench:gallery` builds a blind gallery:
neutral item codes, seeded shuffle, candidate/cost/arm invisible, ~20-item sessions with
resume, one planted unmarked repeat per session (test-retest consistency), and per item
exactly two inputs - the broadcast decision (yes / yes-after-minor-edits / no) and one
1-5 score. Judgements download as JSONL; `bench:report` joins them through `blind-key.json`
and reports machine validity, human acceptance, and visual score **separately**, plus
reviewer self-consistency (low agreement → widen promotion thresholds). The full-rubric
confirmation pass (top two candidates, blind pairwise) stays manual until Phase 7+.

## 8. Storage and boundaries

- Definitions, gold specs, expectations, manifest logic: committed under
  `scripts/ai-lite-bench/`. Runners at `scripts/ai-lite-*.mjs` (repo convention - this
  project keeps infrastructure in `scripts/`, so no top-level `bench/`).
- Output: `lite-bench-out*/` and `lite-eval-out*/` (gitignored): append-only
  `results.jsonl`, run summaries, screenshots, clips, galleries, judgements. Raw provider
  bodies are never stored anywhere (the server never returns them). SQLite is deliberately
  not used - JSONL + `bench:report` covers the query needs without a dependency.
- **Dependency rule:** benchmark → production only. Benchmark code lives outside `src/`
  (never bundled); the build-gate test additionally pins that no `src/` file imports from
  `scripts/` and `check-client-secrets` scans both the tree and `dist/`.

## 9. Failure taxonomy

`scripts/ai-lite-bench/taxonomy.mjs` - the brief's 22 codes, classification ordered by
pipeline stage (earliest failure wins): provider/limit errors → truncation → schema →
UNSUPPORTED_FORCED / CATEGORY_WRONG → semantic (VARIANT_INVALID / FIELD_CONTRACT_INVALID)
→ compile → validation-rule mapping (timeline/state/runtime/reflow) → export → visual.
One primary code per failure; secondary findings ride the row.

Alpha/compositing note: on the Lite track the model authors no CSS, so an alpha or
compositing failure is a **catalog** bug - route it to the platform regression suite (the
reflow/ticker/alpha probes belong there), never into a model score.

## 10. Promotion

Policy and thresholds: `docs/AI_LITE_PROMOTION.md` (thresholds are owner-set TODOs until
the first calibrated run). The system only ever RECOMMENDS - output is a recommendation
plus a proposed env-route change; the product owner promotes by editing server config.
A candidate can be *recommended for manual broadcast verification*, never
*broadcast-approved*, until the manual checklist there is complete.
