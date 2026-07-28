# AI platform plan - one workflow for all AI assistance

**Status: PROPOSED PLAN (2026-07-28). Nothing in sections 4-15 is built.** Sections 1-3 and 5
are a verified audit of the current tree; everything after is recommendation. Review before
implementation. Binding neighbours: `docs/AI_PROVIDER_GATEWAY.md` (the gateway contract),
`src/ai/AGENTS.md` (the SPX harness doctrine), `docs/AI_LITE_BENCHMARK.md` (the Lite bench),
`docs/IMPORT_MVP.md` (the manual import contract this plan extends, never replaces).

The question this plan answers: **can NoaCG Lite become the shared foundation for all
lightweight AI assistance, or do some workloads need separate task harnesses on the same
gateway?** The evidence-based answer (section 3): Lite the *harness* stays a specialist;
Lite the *infrastructure* (server-owned profile, allowlist, quota ledger, ZDR policy,
benchmark pattern) generalizes into a task registry that every harness shares.

---

## 1. Current AI assistance inventory (verified repository facts)

Every workflow goes through one transport: browser harness -> `src/ai/modelGateway.ts` ->
`POST /api/ai/generate` (or the Lite endpoint) -> `api/_lib/aiGateway.ts` adapters
(Anthropic Messages, OpenAI Responses, OpenRouter Chat Completions). Structured output is
schema-revalidated server-side. There is **no provider-specific branch in any harness**.

### 1.1 SPX graphic generation (src/ai, entry: wizard AiStep + editor AIPromptPanel)

| # | Surface | Input | Output contract | Model route | Validation / repair | Tier |
|---|---|---|---|---|---|---|
| W1 | Create with AI, harness ON (default): `generateAlternatives` | brief, last 10 talk turns, images + style references (<=3, base64, no SVG), palette, custom font, optional `GenerationSpec`, seed spec | `emit_design_alternatives` -> 3 `DesignSpec`; catalog-fit specs assemble deterministically, custom specs go to the coder (`emit_template`) | client-selected; default `anthropic:claude-sonnet-5` | injected `productionSpxValidator` (static + runtime bench + safety screen); grounded: 0 repair rounds; custom: 2 rounds, re-validated | hosted: signed-in; offline/BYO-key: open |
| W2 | Harness OFF: `generateRaw` | same | one `emit_template` call, `RAW_SYSTEM` | same | static only, **no bench, no repair** (deliberate baseline) | same |
| W3 | **NoaCG Lite** | brief <=2000 ch, <=6 turns, compact `LiteGenerationSpec` (<=2 fields), palette, font descriptor, resolution; **no images** | `LiteDecision`: one allowlisted catalog `LiteDesignSpec` or typed `unsupported` | **server-owned**: `openrouter:google/gemini-2.5-flash-lite` primary, `openrouter:qwen/qwen3-coder-next` fallback (env-overridable) | regex pre-screen + server semantic validation (roles, intent, contrast) + 1 server repair within a 2-attempt ceiling + client compile through `litePipeline.ts` + full bench; bench failure = platform failure, never model-repaired | free, signed-in, quota'd |
| W4 | Spec-level refine (`modify` + spec) | prompt + prior DesignSpec + house-shaped template | new `DesignSpec` -> deterministic re-assembly | client-selected | as W1 grounded | as W1 |
| W5 | Code-level modify / "Fix these" | prompt + template code | `emit_template` | client-selected | injected validator, 2 repair rounds | as W1 |
| W6 | "3 more like this" (seeded alternatives) | seed `DesignSpec` | as W1 | client-selected | as W1 | as W1; hidden in Lite |
| W7 | Lite refine | prior spec via `/api/ai/lite/generations` | `LiteDecision` | server-owned | as W3 | as W3 |
| W8 | Convert imported .html/.zip | deterministically parsed template (never raw bytes) | `emit_template` | client-selected | injected validator, `source` exempts pre-existing constructs, 2 rounds | as W1; blocked in Lite |
| W9 | Brainstorm ("Talk it through") | conversation | plain text ending `BRIEF:` | client-selected | none (text) | BYO/advanced only; hidden in Lite |
| W10 | **Editor AI panel** (Generate/Modify/Fix/Explain/Make SPX-ready) | prompt + current template | `emit_template` / text | client-selected | **static `validateTemplate` only - the runtime bench and the safety-screen-in-repair NEVER run here** (undocumented gap); `mergeSafety` at display only | signed-in (hosted) |
| W11 | Polish stage (internal) | grounded template + flourish | bounded CSS/HTML patch, `applyPolish` gatekeeper, reverts on failure | client-selected | bench re-run; revert on fail | inside W1/W4; never Lite |
| W12 | Offline stub provider | keyword match | same `specToTemplate` pipeline, no model | none | caller-side | everyone (no key) |

### 1.2 Video generation (src/ai/video + src/video)

| # | Surface | Stages | Model route | Validation / repair |
|---|---|---|---|---|
| V1 | Video generation (Remotion / HyperFrames) | keyword skill detect (model call only on zero match, `modelRole:'fast'`) -> Motion Director (`emit_motion_plan`, ~3k-token system) -> engine coder (`emit_remotion_module` / `emit_hyperframes_composition`, ~5k-token system, `cacheSystem`) -> 2 bounded repair rounds | client-selected; per-project `aiModel` free-text override | all deterministic: compile, static contract (FORBIDDEN tables), live probe at 3 frames, readability at HOLD frames (`textChecks.js`), persistence filter, soft-finding demotion. **No telemetry, no safety screen** (mitigated structurally: opaque-origin sandbox) |
| V2 | Video refine | skips Director; 1-3 calls | same | same |

Video is gated by sign-in (hosted) + key availability; **no quota, rate limit, or ledger**.
Vision input: up to 3 project images to Director and coder (no downscaling, no size budget).

### 1.3 Server infrastructure

- `api/_lib/aiGateway.ts`: 3 `ProviderAdapter`s, explicit-fallback-only routing, bounded
  retry/timeout, schema revalidation, cost estimation (`AI_MODEL_PRICING_JSON` +
  OpenRouter-reported cost). Wire types are Anthropic-shaped (content blocks, tool-style
  `StructuredOutput`); other adapters translate.
- `api/_lib/aiLiteProfile.ts` + `aiLiteStore*` + `aiLiteRateLimit.ts`: the **only** policy
  layer in the repo. Server-owned routes + per-`provider:model` price table + fail-closed
  configuration + OpenRouter policy (`zdr`, `data_collection:'deny'`, endpoint allowlist,
  price ceilings) + quotas (3 successes/day, 20/month, concurrency, $25/day fleet spend,
  $0.007/call ceiling with up-front worst-case reservation) + IP burst gate + durable
  content-free `ai_generations` ledger (migrations 0010, 0011).
- `POST /api/ai/generate` has **none of that**: any `{provider, model}` string from the
  browser, no allowlist, no quota, no rate limit, no cost ceiling, no ledger row, no
  logging, no ZDR policy. Managed key requires sign-in (when Supabase configured); a BYO
  sealed-cookie key bypasses auth entirely. This is the largest asymmetry in the system.
- BYO keys: AES-256-GCM sealed HttpOnly cookie (`api/_lib/aiCredentials.ts`), all three
  providers, one-way localStorage migration, `check-client-secrets.mjs` build gate.
- **No server-side observability on `/api/ai/generate`** - zero log lines, zero rows.
  Client telemetry (`src/ai/telemetry.ts`) is SPX-only and localStorage-only.

### 1.4 Benchmark and evaluation infrastructure

- `scripts/ai-compare.mjs` - 4-arm harness value proof (raw / raw+iterate / pre-harness /
  harness), neutral bench, overlap detector, diversity tripwire. Spends tokens, no cost cap.
- `scripts/ai-bench.mjs` - single-arm off-catalog brief bank + gallery. Spends tokens.
- `scripts/video-bench.mjs` - drives real wizard example chips, hold-frame readability,
  `--stub` free mode. Spends tokens.
- `scripts/ai-lite-*.mjs` + `scripts/ai-lite-bench/` - the model-evaluation harness:
  versioned fixture bank (24 briefs), core/holdout/repair/challenge suites, gold-ceiling +
  seeded-floor calibration, blind human gallery with test-retest, 22-code failure taxonomy,
  pipeline-identity manifests, paid runner with hard caps (40 calls / $1.50). The paid
  OpenRouter **discovery funnel** (`bench:discover/qualify/confirm/compare` - structured
  output support, ZDR, pricing, provider pinning per candidate) is designed but deferred.
- Sibling worktree `noacg-lite-lower-thirds-f83be7` (unmerged, flag off): the skin-path
  spike (`AI_LITE_SKIN_ENABLED`, neutral `ltc01` canvas, polish-gate CSS overrides,
  silent revert) and `bench:sameness` (pairwise visual-distance tripwire).

### 1.5 Explicit negatives, duplication, dead code, bypasses

- **Import Graphic is fully manual** - `docs/IMPORT_MVP.md:25`: "no AI anywhere in it".
  No `src/ai` import in any of its steps. Community, showchat, assets (palette extraction,
  erase), teach/, control/, export/, render/ have **zero** AI touchpoints.
- **Duplicated across SPX and video** (no shared code): the 2-round repair loop, the
  injected-validator seam (`SpxValidator` vs `VideoValidator`), the forced-tool prompt
  scaffold ("contract + principles + one canonical example"), progress reporting, stub
  providers. Video lacks telemetry and the safety screen.
- **Duplicated inside video**: two ~5 kB contracts with ~40% shared prose, the same
  example design authored twice, two near-identical FORBIDDEN tables, two dead-control
  checks, two probe bridges.
- **Duplicated between harness and Lite**: `catalogDigest()` (generated, ~12k tokens) vs
  hand-authored `LITE_CATALOG` digest (~650 tokens) - a variant changing `maxLines`/`logo`
  silently diverges from Lite's contract; `SPEC_INPUT_SCHEMA` vs Lite `specSchema` (~80%
  overlap); `DesignSpec` vs `LiteDesignSpec` bridged by one unchecked cast.
- **Bypass paths**: W2 raw (documented, deliberate); **W10 editor panel** (undocumented -
  no bench, no safety in repair); Lite server output benched only client-side (by design).
- **Dead / inert**: `referenceSelect.ts` scoring machinery behind `SELECTION_MODE='legacy'`
  (plus a write-only recency ledger), `modelRole:'fast'` unused by SPX, Lite logo path
  (`limits.logos = 0` hardcoded), `LiteDesignSpec` category members beyond lower-third,
  `resetLiteGenerationStoreForTests`, `configuredProviders`, stale HyperFrames parity
  comment in `playerBridge.ts`, stale Anthropic-only copy in `AIPromptPanel`.
- **No consent/disclosure UI exists anywhere.** `.env.example` references a "Lite
  first-use retention notice" that is not in the repo.
- **No paid tier exists in the codebase.** Tiers today: anonymous / signed-in / BYO-key.
- **The free path is not open-weight today**: Lite's default primary is Gemini 2.5 Flash
  Lite (proprietary, via OpenRouter). This is one env var, but it is a policy gap against
  the "free = open models" requirement.

---

## 2. Workload classification (by capability, not UI)

### A. Lightweight structured assistance
Choose a chassis/category, suggest fields and labels, recommend animation presets, produce
a small validated design spec, explain a validation error, repair a known-code failure.
Today: W3/W7 (built), the unsupported-decision explanations, the Lite server repair.
**Verdict: the Lite pattern is exactly right** - one small structured call, enum-constrained
schema, deterministic compile, server-owned route. New A-tasks become new *task profiles*
on the generalized Lite infrastructure (section 4), not extensions of the lower-third
prompt. Free tier, open-model allowlist.

### B. Multimodal graphic analysis
Analyze an imported raster graphic: type, text regions, field roles, typography class,
nearest bundled font, colors, safe margins, logo regions, animation suggestion.
Today: **does not exist**. The Lite harness cannot serve it: text-only by deliberate
policy (`limits.logos = 0`), 32 KB body cap, catalog-grounded prompt, lower-third-only
schema. **Verdict: a separate versioned `imported-graphic-analysis` harness** on the same
gateway/policy/ledger, with a vision-capable open model. Proposal-only output (section 6).
Free tier (quota'd), open-model allowlist.

### C. Code or template generation
The SPX custom coder (W1 custom arm, W5, W8, W10) and both video coders (V1/V2); state
machine and timeline logic ride inside those emits. **Verdict: keep as the two existing
code harnesses; extract the duplicated repair-loop/validator/prompt-scaffold seam into
shared infrastructure** (section 5). These are 16k-token outputs with multi-round repair -
too expensive for the free quota'd tier at launch. They stay BYO-key / (future) paid, with
open coding models (Qwen3-coder family is already Lite's fallback) as benchmark candidates
for a later free code-repair task profile.

### D. High-cost creative generation
Three alternatives x repair, polish, full video generation, long-context iterative repair.
**Verdict: BYO-key or paid-only workflows on the same gateway.** Never on the free
open-model quota at launch; a benchmark may later promote individual D-tasks (e.g. one
grounded alternative) into A-shaped profiles.

Per-category answer to the Phase 2 question:

| Category | Lite harness unchanged | Extended Lite infra | Separate harness, shared infra | Specialist model | Paid-only |
|---|---|---|---|---|---|
| A | lower-third creation: yes | yes (new task profiles) | - | small text model | no |
| B | no | policy/ledger only | **yes** | open VLM | no |
| C | no | policy/ledger later | yes (existing SPX/video coders) | coding model | mostly (BYO now) |
| D | no | no | existing | strong model | yes |

---

## 3. NoaCG Lite: evaluation and verdict

**What Lite is today** (all four at once, verified): a *product tier* (free, signed-in,
quota'd), a *pipeline restriction* (catalog-only structured spec, no code paths, typed
`LiteRequestError` on every disallowed op), a *server-owned model policy* (routes, prices,
ZDR, prompt version - config, not code), and a *prompt contract* (6 audited chassis,
semantic line roles, versioned `lite-lower-third-v2`). It is **not a separate harness**:
a ready decision rejoins the identical `groundedResult` / `litePipeline.ts` compile path
the main harness uses, pinned by `ai-lite-bench.test.mjs`.

- Input/output contracts: `LiteGenerationRequest` -> `LiteDecision` (versioned by prompt
  id + `LiteGenerationSpec.version: 1`). Text-only, deliberately.
- Optimized for catalog-grounded creation: yes, aggressively (650-token curated digest vs
  the main harness's 12k-token full digest; semantic role validation; contrast checks).
- Can it serve editor assistance and image analysis? Editor assistance of A-shape: yes,
  as sibling task profiles. Image analysis: no - every design decision in it (no images,
  tiny body, enum-locked schema, lower-third semantics) points the other way. Extending
  the Lite prompt/schema to carry vision would produce exactly the oversized universal
  harness the constraints forbid, and would put the multimodal privacy surface inside the
  most privacy-sensitive free path.
- What extending would cost: the semantic validator, the unsupported screen, and the
  benchmark suites are all lower-third-specific; each new capability grafted onto them
  multiplies the versioning surface of one prompt instead of adding an independent one.

**Verdict: CONFIRM the proposed architecture.** Keep NoaCG Lite as the lightweight
catalog-grounded creation harness, unchanged in scope. Generalize its *infrastructure*
(profile, allowlist, quota ledger, rate limit, ZDR policy, outcome telemetry, benchmark
pattern) into a shared task layer that new focused harnesses plug into. Components shared
even when harnesses are separate: the gateway adapters, schema revalidation, the policy/
budget/ledger layer, the compile/validation pipeline (`litePipeline`, `validateTemplate`,
`runtimeBench`, safety screen), the repair-loop seam, and the bench calibration pattern.

---

## 4. Shared architecture (recommendation)

```
                         browser
  ┌──────────────────────────────────────────────────────────┐
  │ harnesses (focused, versioned)                           │
  │  lite design-spec │ imported-graphic │ SPX coder │ video │
  │  (exists)         │ analysis (NEW)   │ (exists)  │(exists)│
  └────────┬──────────┴───────┬──────────┴────┬──────┴───┬───┘
           │  typed task requests (schema-versioned)     │
           ▼                                             ▼
  POST /api/ai/tasks/<taskId>            POST /api/ai/generate
  (managed, free/quota'd)                (BYO-key / advanced)
           │                                             │
  ┌────────▼─────────────────────────────────────────────▼───┐
  │ TASK REGISTRY (server)   api/_lib/aiTaskRegistry.ts      │
  │  per task: input/output schema+version, tiers, limits,   │
  │  timeout/retry, route policy, ledger kind                │
  ├──────────────────────────────────────────────────────────┤
  │ POLICY + BUDGET (generalized from aiLiteProfile/Store)   │
  │  open-model allowlist, prices, quotas, concurrency,      │
  │  fleet spend, cost ceilings, IP burst, ZDR policy        │
  ├──────────────────────────────────────────────────────────┤
  │ MODEL GATEWAY (exists)   api/_lib/aiGateway.ts           │
  │  anthropic │ openai │ openrouter │ (future: ollama/vllm) │
  │  explicit fallback only, schema revalidation, usage/cost │
  ├──────────────────────────────────────────────────────────┤
  │ OBSERVABILITY (generalized ai_generations ledger)        │
  │  task, route, prompt/schema version, tokens, cost,       │
  │  latency, validation codes, outcome - never content      │
  └──────────────────────────────────────────────────────────┘
```

Layer notes (all generalizations of code that exists):

1. **AI task registry** (`api/_lib/aiTaskRegistry.ts`, NEW): a typed map
   `taskId -> TaskProfile`. `TaskProfile` is `LiteProfile` generalized: schema refs +
   versions, allowed tiers (`anonymous | free | byo | paid`), token/image/resolution
   limits, timeout/retry, `routePolicy`, ledger kind. Browser mirror exposes only what
   `/api/ai/lite/status` exposes today: availability, limits, allowance - never routes.
2. **Shared model gateway**: unchanged (`aiGateway.ts`). Add `openWeightsOnly` to the
   route policy: a server-side allowlist of `provider:model` ids flagged open-weight;
   free-tier tasks fail closed (`profile_not_configured`) rather than fall back to a
   proprietary route - the exact fail-closed pattern `liteProfileConfigured()` has.
3. **Task harnesses**: Lite design-spec (exists), imported-graphic-analysis (new,
   section 6), SPX coder (exists), repair (exists inside both coders; extract the seam),
   video (exists). Each owns its prompt + schema + version; none owns routes or quotas.
4. **Canonical structured contracts**: every task schema carries an explicit version
   (Lite's prompt-version pattern + `GenerationSpec`'s `version: 1` pattern); server
   revalidation already exists; add per-task deterministic normalizers (Lite's
   `normalizeLiteSpec` is the template) and stable error codes (Lite's taxonomy).
5. **Policy and budget**: `aiLiteProfile` + `aiLiteStore` + `aiLiteRateLimit`
   parameterized by task id. Reservation-then-reconcile cost accounting stays.
6. **Observability**: extend `ai_generations` with a `task` column (migration; additive)
   and route the currently-unobserved paths through it where a managed key is used.
   Keep the content-free rule absolute.

**Not** one universal prompt; **not** a second scene model; provider selection stays in
config; product features reference task ids only.

## 5. Harness boundaries and shared seams

Keep four harnesses: **lite-design-spec**, **imported-graphic-analysis**,
**spx-coder** (generate/modify/convert/fix), **video** (director+coder per engine).
Extract into `src/ai/shared/` (browser) without changing behavior:

- the bounded repair loop (`MAX_REPAIR_ROUNDS`, re-validate each round, exact-findings
  feedback, soft-finding demotion) - today duplicated in `claudeProvider.ts` and
  `claudeVideoProvider.ts`;
- the injected-validator seam (unify `SpxValidator` / `VideoValidator` shapes);
- the forced-tool prompt scaffold (contract + principles + one canonical example);
- telemetry (`startAiRun`) - wire the video harness in (it records nothing today);
- the safety screen policy - the SPX regex screen where code runs same-origin; the video
  side keeps its structural sandbox but gains the same telemetry hooks.

Inside video, collapse the two FORBIDDEN tables, the duplicated example design, and the
two dead-control checks behind the existing `emitConfig(engine)` seam.
Close the W10 gap: `AIPromptPanel` must inject the same `productionSpxValidator`
composition `AiStep` uses (bench + safety in the repair loop), and its Anthropic-only
copy is updated. This is a correctness fix independent of everything else.

## 6. Import Graphic AI assistant (design)

The manual flow stays untouched and complete (`docs/IMPORT_MVP.md`). AI is one optional,
proposal-only action.

### 6.1 UX flow

1. **Entry**: after artwork lands (Design step) and on the Prepare/Text steps, one button:
   **"Analyze graphic with AI"**, with the standing disclosure line and a first-use consent
   notice (section 9). Invisible/disabled in offline builds and when signed out (same
   `needsSignIn` pattern as Lite); the manual path never regresses.
2. **Run**: the artwork is downscaled client-side for analysis (longest side <=1280 px,
   JPEG/PNG re-encode; the original is never uploaded at full size), sent with optional
   user instructions to `POST /api/ai/tasks/imported-graphic-analysis`.
3. **Proposal review**: a panel lists suggestions grouped (type, text regions, fonts,
   colors, logo/image regions, animation), each with a confidence badge and a checkbox;
   region suggestions draw as outlined overlays on the placement canvas. Warnings render
   verbatim. Buttons: **Apply selected**, **Apply all**, **Dismiss**,
   **Re-run with instructions** (a one-line text input, counts against quota).
4. **Apply**: accepted suggestions become a single `DraftPatch` - `designFields:
   DesignFieldSpec[]` (normalized coords converted to design px), per-field `fontId`/
   `fontSize`/`weight`/`color`/`align`/`lineHeight`/`letterSpacing`, draft-level `fontId`,
   and `animation` (preset/direction/easing/speed from the four `DESIGN_PRESETS`). The
   template is rebuilt by `buildDraftTemplate` -> `addPlacedLine` / `setLineTextStyle` /
   `setLineFit` - the same canonical transforms manual placement uses. **No new
   representation of fields, layers, animations, or states is created.**
5. **Undo / reject**: at wizard time a dismissed or replaced proposal is just a draft
   patch away (manual edits keep working on the same `designFields`). If the action is
   ever offered post-create, all accepted suggestions compose into ONE template and apply
   via a single `applyTemplate(next)` - one undo step through the store choke point.
6. **Outcome telemetry**: accepted / partially-accepted / dismissed (+ enumerated reason)
   posts to the outcome endpoint, content-free - the Lite outcome pattern.

### 6.2 Structured contract (`imported-graphic-analysis` v1)

```ts
// src/ai/importAnalysis/contract.ts (browser) + served by the task endpoint
interface ImportedGraphicAnalysisV1 {
  version: 1;
  graphicType: 'lower-third' | 'title-card' | 'scoreboard' | 'info-graphic'
    | 'quote-card' | 'name-strap' | 'other';
  graphicTypeConfidence: number;            // 0..1
  canvas: { aspect: number };               // echo, sanity check
  regions: Array<{
    kind: 'text' | 'logo' | 'image' | 'decorative';
    bbox: { x: number; y: number; w: number; h: number };  // normalized 0..1
    confidence: number;
    // text regions only:
    role?: 'person-name' | 'person-role' | 'organization' | 'team-name'
      | 'story-headline' | 'event-name' | 'location' | 'score' | 'time'
      | 'supporting-context' | 'other';
    suggestedTitle?: string;                // operator-facing field label
    sampleText?: string;                    // transcription of visible text
    align?: 'left' | 'center' | 'right';
    typography?: {
      classification: 'serif' | 'sans' | 'slab' | 'condensed' | 'mono'
        | 'display' | 'script';
      matchQuality: 'similar-available' | 'general-classification';
        // NEVER 'exact' from a raster - see 6.3
      suggestedFontId: 'inter' | 'space-grotesk' | 'jetbrains-mono' | 'manrope'
        | 'archivo' | 'oswald' | 'bebas-neue' | null;   // enum = the 7 bundled fonts
      approxWeight?: 300 | 400 | 500 | 600 | 700 | 800 | 900;
      fontSizeNorm?: number;                // cap height / canvas height
      letterSpacing?: 'tight' | 'normal' | 'wide';
      lineHeightRatio?: number;
      color?: string;                       // #rrggbb
    };
  }>;                                        // maxItems bounded (e.g. 12)
  safeMargins?: { top: number; right: number; bottom: number; left: number }; // normalized
  animation?: {
    presetId: 'design-fade' | 'design-slide' | 'design-pop' | 'design-blur';
    direction: 'both' | 'in' | 'out';
    easing?: string; speed?: 0.75 | 1 | 1.5;
  };
  warnings: string[];                        // uncertainty, verbatim to the user
}
```

Deterministic normalization clamps bboxes to 0..1, drops regions below a confidence
floor, converts normalized coords to design px against `DesignArt.width/height`, snaps
`approxWeight` into the target font's real `weights` range, and validates `suggestedFontId`
against `FONTS`. Server revalidates against the schema exactly as every task already is.

### 6.3 The font-honesty rule

Exact font identification from a raster is not claimable and the schema makes the claim
inexpressible: `matchQuality` has no `exact` member, `suggestedFontId` is enum-locked to
the seven bundled fonts (mapped via their `styleTags` facet), and the prompt instructs the
model to classify, transcribe, and pick the *nearest available* face with a confidence
score. "Probable match to a known commercial font" may appear only inside `warnings` as
prose, clearly labelled unverified.

## 7. Open-model gateway, allowlist, and routing

- **Allowlist** (`api/_lib/aiModelCatalog.ts`, NEW, server-only): entries
  `{ route, openWeights: boolean, capabilities: {vision, coding, structuredOutput,
  contextWindow}, price, zdrAvailable, notes }`. Free-tier task profiles may only
  reference `openWeights: true` entries; the registry fails closed otherwise. The
  browser never sees this file's content.
- **Routing is capability-based per task**, configured not coded: A-tasks -> small text
  model; B-tasks -> open VLM; C-tasks -> coding model; a stronger *allowlisted* fallback
  only after validation failure (the Lite primary/fallback + 2-attempt ceiling pattern,
  unchanged). Paid/BYO routes only for explicitly paid features; free tasks never
  silently reach a proprietary route.
- **Candidate pool** (recommendation, to be verified by the benchmark and current
  OpenRouter listings, never hardcoded into product logic): text/structured - Qwen3
  small instruct, Mistral Small (both already in Lite's price table), Llama 3.3/4 small;
  vision - Qwen VL family, Gemma 3 27B, Llama 4 multimodal, InternVL, Mistral Small
  multimodal; coding - Qwen3-coder (already Lite's fallback), DeepSeek coder family.
  Hugging Face serves as the discovery/metadata/license source feeding the allowlist,
  and optionally as an inference provider through a future `ProviderAdapter` - never a
  direct dependency of product code.
- **Policy change required**: Lite's default primary (Gemini 2.5 Flash Lite) is
  proprietary. Under the open-weight mandate the primary must move to a benchmark-verified
  open model (env change + bench run, no code change). Owner decision - section 15.

## 8. Benchmark design

Extend the existing `ai-lite-bench` machinery (fixtures, holdout, gold/floor calibration,
manifest identity, blind gallery, taxonomy, hard cost caps) rather than building anew.

- **Lite structured suite**: exists (`lite-spec-v1`). Add fixtures for long names (partly
  present in the holdout), CJK and RTL scripts, contrast-hostile custom palettes, and
  sparse briefs. Run the deferred discovery funnel (`bench:discover/qualify/confirm/
  compare`) against open-weight candidates only.
- **Vision suite** (`import-analysis-v1`, NEW): a hand-labelled dataset of 40-60 images -
  lower thirds, name straps, full-screen infographics, scoreboards, title cards, quote
  cards, logo-bearing, light/dark, transparent/flattened, odd aspect ratios, multi-region,
  no-editable-text, hostile typography. Ground truth: type, region bboxes, roles, font
  classification, nearest bundled font, colors. Metrics: type accuracy, region precision/
  recall, bbox IoU, role accuracy, font-class accuracy, bundled-font pick quality, color
  delta, schema success rate, hallucination rate (regions where none exist; the
  no-editable-text images are the tripwire), simulated user-edit effort (fields needing
  correction), latency, cost. Public dev cases separate from a hidden holdout, exactly as
  Lite does. Gold ceiling = hand-authored proposals; floor = seeded random valid output.
- **Code/template suite**: reuse `ai-compare.mjs` / `ai-bench.mjs` / `video-bench.mjs`
  arms with open coding models as additional candidates; metrics already exist (build
  success, runtime validity, bench findings, repair success, overlap/readability,
  determinism via pipeline identity). Add the sibling worktree's `bench:sameness` once
  that branch lands.
- Per-model scorecards per suite; different winners per category are expected and fine.
  Promotion follows `docs/AI_LITE_PROMOTION.md` once its owner thresholds are set.

## 9. Privacy, consent, quota, and cost controls

- **Disclosure (build first - it gates everything free)**: a first-use notice on every
  managed AI action: content is sent to an external AI provider; do not upload sensitive
  or confidential material; ZDR routing is used where available but provider retention/
  training policies carry residual uncertainty; "open model" does not mean "private".
  Consent recorded (timestamp + notice version) in the user record. The `.env.example`
  reference to this notice finally becomes true.
- **Data minimization**: analysis images downscaled/cropped client-side; only the
  relevant catalog subset/schema context sent per task (Lite's 650-token digest is the
  model); no project data beyond the task inputs; ledger stays content-free.
- **ZDR**: the Lite OpenRouter policy (`zdr`, `data_collection:'deny'`, endpoint
  allowlist, price ceilings) becomes the default for every free task route; fail closed.
- **Quota/cost**: per-task profiles reuse the reservation ledger - daily/monthly starts
  and successes, per-user + fleet concurrency, per-call cost ceiling, daily fleet spend,
  IP burst gate. Vision tasks add max images (1) and max resolution to the profile.
- **Hardening `/api/ai/generate`** (managed-key path): add a modest rate limit and a
  ledger row (task `'byo-generate'`, content-free). BYO-key traffic spends the user's own
  key but still gets the rate limit. Also worth closing: the credentials endpoint's
  missing sign-in requirement on shared browsers (flag for owner).
- AI stays optional everywhere a manual workflow exists (import stays manual-first;
  "Open as code (no AI)" stays one click).

## 10. Migration plan (preserve everything that works)

1. Additive only: the task registry mounts beside the existing endpoints;
   `/api/ai/lite/*` keeps working unchanged (Lite becomes task id `lite-design-spec`
   internally; public URLs unchanged until a major cleanup).
2. `ai_generations` gains a nullable `task` column (additive migration, no backfill).
3. Browser: `liteClient.ts` patterns generalize into a small `taskClient.ts`; Lite's
   client keeps its API.
4. Shared-seam extraction (repair loop, validator seam, telemetry) is behavior-neutral
   refactoring, each step proven by `ai-compare.mjs` regression mode + the free Lite
   regression suite (`bench:regress` pipeline-identity hashes).
5. Provider-specific paths: none need removing - Anthropic/OpenAI stay for BYO and future
   paid routes; the open-weight allowlist constrains only free-tier task profiles.
6. W10 fix and stale-copy cleanup land independently of the platform work.

## 11. Testing strategy

- **Build gate** (free): extend `run-ai-gateway-tests.mjs` with registry tests (schema
  validation, tier gating, fail-closed allowlist, quota math); `ai-lite-bench.test.mjs`
  pattern pins "one compile path" for the analysis normalizer too.
- **E2E** (offline, stub-backed): an `import-analysis.spec.ts` driving the proposal panel
  with the stub provider (the `ai-more-control.spec.ts` pattern) - propose, partial
  accept, re-run, dismiss, manual-path-unaffected, offline build shows no AI UI
  (`e2e/auth.spec.ts` doctrine).
- **Paid benches** (never CI): the vision suite runner with hard call/cost caps; Lite
  discovery funnel; `ai-compare.mjs` for any repair-seam refactor.
- **Mutation-test the guards** (repo doctrine): a spec asserting "no AI call happened"
  must fail when the guard is removed.

## 12. Rollout stages

1. **Stage 0 - hygiene** (no product change): W10 validator fix, stale copy, dead-code
   removals, `/api/ai/generate` rate limit + ledger row.
2. **Stage 1 - platform**: task registry + model catalog/allowlist + generalized policy
   layer; Lite re-expressed as the first task profile (behavior-identical, proven by
   `bench:regress`).
3. **Stage 2 - disclosure**: consent notice + recording; ZDR-by-default for free routes;
   open-weight primary decision executed for Lite (env + bench).
4. **Stage 3 - Import analysis**: harness + proposal UI behind a server flag
   (`AI_TASK_IMPORT_ANALYSIS_ENABLED`, default off), stub-first e2e, then the vision
   benchmark (>=3 open VLMs) picks the launch route; enable for override users, then free.
5. **Stage 4 - consolidation**: shared repair-loop seam, video telemetry, video-internal
   dedup; open-model candidates added to the code benches.

## 13. Risks and unresolved questions

- **Open VLM quality on broadcast graphics is unproven** - the benchmark is the gate; the
  feature ships proposal-only precisely so a mediocre model wastes a click, not a graphic.
- **Bbox precision** may be the weakest VLM skill; mitigation: normalized coords + snapping
  to detected ink (`RegionInk` from the erase pass can cross-check text regions
  deterministically - a genuinely nice fusion the manual pipeline already computes).
- **Cost drift on OpenRouter open-model endpoints** - price ceilings + fail-closed pricing
  already handle this; keep them mandatory for every free route.
- **Registry over-engineering** - keep `TaskProfile` a literal generalization of
  `LiteProfile`; resist adding capability negotiation until a third harness needs it.
- **Consent UX friction** vs legal safety - one-time notice per account, not per call.
- Open: where does the analysis button live exactly (Design vs Prepare vs Text step);
  should post-create re-analysis exist at v1 (recommend: no); does the credentials
  endpoint gain a sign-in requirement (separate decision); when do paid tiers exist at
  all (out of scope here).

## 14. Files likely added / modified

**Added**: `api/_lib/aiTaskRegistry.ts`, `api/_lib/aiModelCatalog.ts`,
`api/ai/tasks/import-analysis.ts` (+ status/outcome or shared task endpoints),
`src/ai/importAnalysis/{contract,client,normalize}.ts`,
`src/components/wizard/steps/design/AnalyzeProposalPanel.tsx`,
`src/ai/shared/{repairLoop,validatorSeam,promptScaffold}.ts`,
`scripts/ai-vision-bench/` (+ dataset), `supabase/migrations/0012_ai_task_ledger.sql`,
`e2e/import-analysis.spec.ts`, consent notice component + storage,
`docs/AI_TASK_REGISTRY.md`.
**Modified**: `api/_lib/{aiLiteProfile,aiLiteStore,aiLiteStoreSupabase,aiLiteRateLimit}.ts`
(parameterize by task), `api/ai/generate.ts` (rate limit + ledger),
`src/ai/{claudeProvider,liteClient,telemetry}.ts`, `src/ai/video/claudeVideoProvider.ts`
(telemetry + shared seam), `src/components/AIPromptPanel.tsx` (validator + copy),
`src/components/wizard/steps/{ImportDesignStep,PrepareDesignStep,PlaceFieldsStep}.tsx`
(entry button + overlays), `src/components/wizard/draft.ts` (proposal->DraftPatch),
`.env.example`, `src/ai/AGENTS.md`, `docs/AI_PROVIDER_GATEWAY.md`.

## 15. First implementation slice and owner decisions

**First slice** (matches the suggested sensible slice):
1. Land this audit/plan for review (this document).
2. Introduce `aiTaskRegistry` + `aiModelCatalog` (open-weight allowlist), re-express Lite
   as the first task profile with `bench:regress` proving byte-identical behavior.
3. Ship the consent/disclosure notice (gates everything free).
4. Build the `imported-graphic-analysis` harness v1 + proposal-only UI behind its flag,
   applying only through `DraftPatch`/`addPlacedLine`.
5. Benchmark >=3 vision-capable open models on the labelled dataset; pick the launch route
   by scorecard; enable for override users.

**Owner decisions required**:
- **The open-weight mandate for free routes** (the most important one): confirming it
  means replacing Lite's current Gemini Flash Lite primary with a benchmark-verified
  open-weight model and accepting whatever quality/cost position the bench measures.
  Infrastructure enforces the policy either way; the tradeoff is the owner's.
- Consent notice wording and whether consent is recorded server-side.
- Free-tier quota levels for the vision task (image count, daily runs).
- Whether `/api/ai/credentials` gains a sign-in requirement.
