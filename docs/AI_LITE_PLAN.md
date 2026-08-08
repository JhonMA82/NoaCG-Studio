# NoaCG Lite - how it gets good and stays cheap

**Status: active plan, 2026-08-07.** Written after the first generation round the shipped
configuration has ever produced, and after Lite was switched on in production for the first
time. The benchmark machinery is `docs/AI_LITE_BENCHMARK.md`; promotion policy is
`docs/AI_LITE_PROMOTION.md`; the doctrine this builds on is `docs/ADAPT_FIRST_PLAN.md`. This
document is the architecture, the route table, the split between what the model decides and
what the platform decides, and the build order.

---

## 0. What changed on 2026-08-07

Lite had been off in production **for everyone** since it shipped - `AI_LITE_ENABLED` was
never set on the Vercel project, so the greyed-out door was an environment variable, not code.
Nobody had ever used the `lite-lower-third-v3` prompt in production, which means every prior
opinion about Lite's quality was formed on evidence that did not cover it: the 2026-07-27
calibration measured hand-written gold specs, rounds d-j measured the SKIN experiment (off in
production, a different code path), and the 2026-07-29 model comparison measured *machine
usability* - "compiles and benches clean", which a grey square also satisfies.

Three things had to be true before a single generation could run, and only one was known:

1. **`AI_LITE_ENABLED` alone is not enough.** `taskConfigured()` refuses any OpenRouter route
   with an empty `AI_LITE_GATEWAY_PROVIDERS`, so enabling alone moves the status endpoint
   from `disabled` to `not-configured` and nothing else.
2. **The pinned fallback could not be served at all.** `liteGatewayPolicy` derives
   `maxInputPerMillion` from the *audited catalog snapshot*, which prices
   `qwen/qwen3-coder-next` at 0.11/M in. Its cheapest live endpoint is parasail/bf16 at
   **0.12/M in**; every endpoint is dearer than the cap computed from our own stale figure, so
   the fallback route had zero eligible endpoints. Repointed at
   `mistralai/mistral-small-24b-instruct-2501`, whose live price (0.05/0.08 on deepinfra/fp8)
   matches the catalog entry exactly.
3. **The 89% `provider_rejected` round has a structural explanation.** The historical allowlist
   was `google-vertex,google-ai-studio` - endpoints that serve the *primary* only. `only` is
   ONE list applied to every route, and `allowProviderFallbacks` is pinned false, so a primary
   hiccup had nowhere to go. The list now covers both routes.

Production now answers `enabled: true`, `reason: "sign-in"` - `configured` passed, which
independently re-confirms that both routes are catalog-approved, priced, allowlisted, keyed and
ledger-backed.

**Anonymous access remains OFF and is not ours to change.** `ANONYMOUS_PLAN['ai.lite'] = false`
puts OpenRouter spend behind an account. The proposal, with numbers, is §7.

### ZDR is provable per provider, for free

`?zdr=true` is a listing-level filter and no endpoint field carries a data policy, which is why
provider pinning has been guesswork. It need not be: **a model that appears in the ZDR listing
and has exactly ONE endpoint proves that endpoint's provider is ZDR-servable.** Measured over
the 30 qualified candidates: `deepinfra` (4 models, including `google/gemma-3-12b-it` and
`mistralai/mistral-small-24b-instruct-2501`), `coreweave`, `together`, `groq`, `parasail`,
`reka`. **Not** proven: `streamlake`, which is the cheapest endpoint of
`qwen/qwen3-30b-a3b-instruct-2507` - the 24/24 leader of the 2026-07-29 comparison. So that
route is a gamble rather than a free upgrade, and it is listed below as a candidate, not a
promotion.

---

## 1. The first round: what the shipped configuration actually produces

`bench:spike --suite=core`, 6 frozen briefs x 3 runs = **18 generations, $0.0051 total**,
prompt `lite-lower-third-v3`, primary `google/gemini-2.5-flash-lite`. Artifacts:
`lite-bench-out/round-2026-08-07/`.

| measure | result |
|---|---|
| machine-usable | **18 / 18** |
| validation rule codes raised | **none, on any generation** |
| repairs / second attempts | 2 / 3 |
| mean cost per generation | **$0.000285** (1.3k in, ~460 out) |
| mean latency | 17.8 s |
| chassis stable across 3 runs | 4 of 6 briefs |

**Cost is not the constraint and should stop being discussed as one.** The owner's ceiling is
~€0.01 (~$0.011) per generation. The measured figure is **2.6% of it**, and every open-weight
candidate in §3 is cheaper still. Nothing in this plan should be traded against price; the
budget has 30-100x headroom and the scarce resource is human review.

### The defect the frames show and every gate missed

Machine-usable was 18/18 with zero rule codes. Then the frames:

- **`long-name`** (lt11 House Strap): the name wrapped to 2 lines and the role to **3**. Five
  text lines, a ~350px-tall "lower third" - a card, not a strap. The brief had asked in so many
  words to "preserve hierarchy and fit without tiny text".
- **`news-reporter`** (lt25 Masthead): role wrapped to 2 lines, breaking its relationship with
  the design's own rule above it.
- **`multilingual`** (lt02 Underline): Ukrainian role wrapped to 2 lines. Same shape.
- **`story-headline`** (lt11): good. A two-line *headline* over a one-line location kicker is
  correct broadcast practice - the wrap is only a defect when the line carries identity
  metadata that belongs on one line.

Three of six frames, one mechanism. **No gate can see it**, and that is not an oversight in any
one of them: `overflow-sweep` asks whether a box escapes the frame and a wrapped line does not
(the panel grows downward); the runtime bench's stress pass doubles every value and asks the
same question; `type-floor` measures font *size*. A five-line lower third passes everything the
platform owns.

### The cause is ours, not the model's

The obvious reading - "the model picked bad typography" - is wrong, and checking cost one grep.
`lt02`, `lt11` and `lt25` all set `text-transform: uppercase` plus the family's wide
`--label-tracking` on their supporting line **in the design's own CSS**. The model never chose
it. Had this gone into the prompt it could never have worked.

What the model *did* do was believe `LITE_CATALOG`, which is the only capacity information it
has. `scripts/lite-line-capacity.mjs` renders each chassis, drives the real supporting field
through `update()`, and reads the painted result back - the field-coverage technique, inverted:

| chassis | advertised | measured 1-line max | transform | tracking |
|---|---|---|---|---|
| lt32 Scrim | **high** | **28 chars** | uppercase | 6.8px |
| lt11 House Strap | **high** | **39** | uppercase | 4.84px |
| lt25 Masthead | high | 47 | uppercase | 4.8px |
| lt05 Angle Slab | **medium** | **55** | none | normal |
| lt02 Underline | high | 58 | uppercase | 0.92px |
| lt15 Frost Strap | **medium** | **66** | none | normal |

*(The first pass bisected the frozen bank's longest role and reported exactly 48 for three
designs - the probe's length, not a measurement. The probe is now longer than any design can
hold, which is what turned "≥48" into 55, 58 and 66.)*

**The metadata was anti-correlated with reality.** Both designs advertising `medium` measure
widest - `lt15` holds **66 characters, 2.4x** the `lt32` that advertised `high` loudest and
holds 28. Tracked uppercase costs roughly a third of the characters a reader expects, and
`lt32` pays most for it (widest tracking, smallest size). The model was told to send long text
to `lt11` and `lt32`, which is exactly backwards, and the frames are what that instruction
produces.

**Fixed 2026-08-07.** `textCapacity: 'medium' | 'high'` is gone; `supportingLineChars` carries
the measured number, the digest states it with its unit, and the prompt's capacity clause names
it instead of asking for "realistic text capacity". Prompt version `lite-lower-third-v4`.
`node scripts/lite-line-capacity.mjs --check` is the gate, mutation-tested in both directions -
a claim above the measurement fails as a lie, a claim more than 4 characters below it fails as
stale.

## 1a. The A/B round: the capacity fix did not work, and the real cause is `scaleRatio`

Same 6 briefs x 3 runs, same model, same fixture bank; only the platform moved (v4 digest,
capacity clause, wrap check). **18 generations, $0.0053.** Artifacts:
`lite-bench-out/round-2026-08-07b/`.

| | round A (`v3-baseline`) | round B (`v4-capacity`) |
|---|---|---|
| mean capacity of the chassis CHOSEN | 48.6 chars | **49.3 chars** |
| `long-name` (needs ~48) | lt11, lt11, lt11 | lt11, lt25, lt11 |
| `multilingual` | lt02, lt25, lt02 | lt25, lt25, lt25 |
| identity lines that wrapped | 0 reported | **11 of 18** |
| machine-usable | 18/18 | 7/18 |

**+0.7 characters is noise** - round A varied its own chassis on two of six briefs. The design
the round failed on, `long-name`, still picks the 39-character `lt11` in two runs of three.
Telling the model the truth about capacity changed the metadata and not the behaviour, and the
claim in the commit that landed it ("fixes the round's headline defect at its source") was
wrong. **The A/B is the only reason that is known.**

**Why it could not have worked, measured afterwards.** `applyDesignAdjustments` rewrites the
very property `supportingLineChars` measures. The supporting line's size is derived from the
spec's `typography.scaleRatio` - `clamp(namePx / ratio, 14, namePx * 0.92)` - so the number the
digest states describes the design *as authored* and the pipeline then overwrites it:

| chassis | as authored | `scaleRatio: 1.2` | `scaleRatio: 2.6` |
|---|---|---|---|
| lt25 Masthead | 20px / **47 chars** | 48px / **19** | 22px / 42 |
| lt02 Underline | 23px / 58 | 47px / **28** | 22px / 61 |
| lt11 House Strap | 22px / 39 | 45px / **19** | 21px / 42 |
| lt32 Scrim | 20px / 28 | 45px / **14** | 21px / 26 |

A ratio of **1.2 - the legal minimum, and unbounded in the schema until this change** - nearly
doubles the supporting line and cuts capacity by 2-3x. That is the `university-speaker` frame
exactly: a 38-character role against a capacity of 19.

**So `scaleRatio` is the lever, not the chassis word**, and step 3 moves from hazard-closing to
the actual fix. Two things were also ruled out by measurement rather than argument: `sizeScale`
does NOT change capacity (the auto-fit cap is expressed per scale unit, so box and type scale
together - 58 chars at 1.0, 1.2 and 1.4 alike), and the wrap is not a per-design limit (every
design wraps at the same 806px shared cap).

**`bench-line-wrap` is therefore a WARNING, and that severity is measured too.** As an error it
failed 11 of 18; Lite has no repair loop on the grounded path, so it would have refused two
thirds of requests for a graphic that is mediocre but airable. It becomes an error the day
something can act on it.

**What the round is worth keeping for:** the check itself. Round A scored 18/18 machine-usable
with zero rule codes while three of six frames carried the defect. Round B names 11 of 18. The
gate is the deliverable; the metadata correction is true and inert.

## 1b. Round C, and the number that measured nothing

A third round (`v5-ratio-ceiling`, 18 generations, $0.0052) tested the fix §1a pointed at:
`applyDesignAdjustments` may no longer enlarge the supporting line past the size its design
authored. Verified deterministically first, across all six chassis - at `scaleRatio: 1.2`, which
previously produced 45-48px, every design now emits its authored size, so **no chassis can be
enlarged at all**.

The round then reported machine-usable **7/18 → 17/18** and wrapped identity lines **11 → 0**.

**That second number is worthless, and it is worth writing down why.** `bench-line-wrap` moved
from error to warning between round B and round C, and `scripts/ai-lite-eval.mjs` recorded
`ruleCodes` from `validation.errors` ONLY. So round B counted the findings and round C stopped
counting them. Nothing in the artifacts said so - the count simply went to zero, in exactly the
direction the change was hoping for.

It was caught by opening a frame. Round C's `long-name` is lt25, reported clean, and its role is
plainly on two lines. Reproducing that decision directly through `compileLiteDecision` raises
**two** `bench-line-wrap` findings. So:

- **The ratio ceiling is verified to do what it says** (no design can be enlarged) and is NOT
  verified to remove wraps. A 47-character role on lt25's 47-character capacity still wraps.
- **Round C's true wrap count is unknown** and cannot be recovered from its artifacts.
- `warningCodes` is now recorded beside `ruleCodes`, so the next round can be read at all.

**Round D (`v5-measured`, 18 generations, $0.0052) is round C's configuration re-measured with
that instrument.** The comparison that means something is B against D - each read at the
severity its own finding carried:

| round | wrapped identity lines | readable | machine-usable | `generation_failed` |
|---|---|---|---|---|
| A `v3-baseline` | 0 - the check did not exist | no | 18/18 | 0 |
| B `v4-capacity` | **11** (errors) | errors only | 7/18 | 0 |
| C `v5-ratio-ceiling` | 0 - counted nothing | **no** | 17/18 | 1 |
| D `v5-measured` | **6** (warnings) | yes | 17/18 | 1 |

**11 → 6.** The ceiling removes roughly half the wraps, and the residue is precise rather than
scattered: **all six findings are `long-name`, in all three runs** - the deliberately hostile
brief, whose 32-character name and 47-character role exceed every chassis in the allowlist. The
five other briefs are clean. That is the honest shape of the fix: it stops the pipeline
*creating* the problem, and it cannot invent width that does not exist (§1a).

**One regression to watch, and it may be ours.** `esports-player` returned `generation_failed`
in run 3 of BOTH v5 rounds, and in neither v3 nor v4 round - 2 of 2 under the new contract, 0 of
2 before it. `generation_failed` is REPAIR_FAILED, a semantic exhaustion rather than transport
(§9), so it is a quality signal.

**The mechanism was then established rather than assumed, and it is real.** `schemaAccepts` in
`api/_lib/aiGateway.ts` REJECTS an out-of-range number; the rejection becomes a retryable
`malformed_response`, retried inside a budget of two attempts, and exhausting it returns
`generation_failed` to the user. So `minimum`/`maximum` on `scaleRatio` converted a value the
compile had always CLAMPED into one that can spend the whole budget and deliver nothing.

That is the harness's clamp-don't-reject rule deciding the case, so the bounds came out again the
same day (prompt version `lite-lower-third-v6`). Two things worth separating:

- **The mechanism is proven; the attribution is not.** Nothing recorded which value
  `esports-player` actually emitted, so whether this is what failed it stays n=2 on one fixture.
  Removing the bound is right on doctrine regardless, and a later round can confirm the failure
  goes away.
- **The shown-but-illegal defect the bounds were meant to close is a MISMATCH** - a model told
  one range while the compile applies another - and agreement closes it. Refusing the response is
  a different thing, and on a clamped field it is a strictly worse one.

`sizeScale` carries the identical shape (bounded 0.7-1.4 on the wire, clamped at compile) and was
deliberately left alone: nothing has measured it firing, and 0.7-1.4 is a wide range. Revisit it
with evidence rather than by symmetry.

The lesson generalises past this instrument: **changing a finding's SEVERITY changes what the
instrument counts, and a metric that reads errors will report the change as an improvement.**
Round A had already shown the mirror image - 18/18 machine-usable with zero rule codes while
three of six frames carried the defect. Both times the artifacts agreed with each other and
disagreed with the picture, and both times only a rendered frame settled it.

### A hazard the round did not trigger, stated as a hazard

`designAdjust.ts` derives the supporting line's size as `clamp(namePx / ratio, 14, …)` - a
**14px** floor, while `scripts/type-floor.mjs` holds a lower third to **20px**. `scaleRatio`
carries no `minimum`/`maximum` in the Lite schema at all (it is clamped 1.2-2.6 in code only) -
the shown-but-illegal shape `narrowVariantTool` exists to prevent, one field over. Independently,
`sizeScale` reaches `--scale` through `computeScale`, so a legal 0.7 multiplies every text size:
a 20px title renders at 14px, and a ratio-shrunk title at ~9.8px. Nothing re-measures the
ADJUSTED result - the catalog gates certify a design **as authored**. No generation in this
round did it; the arithmetic says it is reachable, so it needs a gate, not a paragraph.

---

## 2. What the model decides, and what it should

Two axes of the current schema are **dead** - measured across all 18 generations:

- **`zone`**: every generation answered `bottom-left` or omitted the field. The freedom buys
  nothing, and two prompt lines are spent defending it.
- **`animation.presetId`**: `null` on all 18. The model never picks motion; entrance and exit
  come from the design's own defaults regardless.

That is the cheapest possible answer to "how much should the model decide at all": these two
already decide nothing, so removing them costs no expressiveness that anyone has observed.

| decision | today | proposed | why |
|---|---|---|---|
| which chassis | model, from a 6-entry digest | **model, from a digest whose capacity words are measured** | the one judgement a small model makes well - given true facts |
| line roles + copy | model | model | its strongest measured behaviour; role/intent agreement was clean across the round |
| zone | ~~model~~ | **DONE v10: the design's own `defaultZone` (`keepChassisZone`). The field stays on the wire, ignored** | `bottom-left` on 47 of 47 across two rounds; measured side agrees with declared zone 89/89 (ADAPT_FIRST §1.1). Deleting the field costs a round - step 6.5 |
| animation preset | ~~model~~ | **DONE: the design's default. The field stays on the wire, ignored** | never a legal value in 47 generations - null, or the chassis's own motion prose read back |
| palette | model, contrast-clamped | model, unchanged | the clamp already works and brand colours are a real request |
| `sizeScale`, `typography.scaleRatio`, density, tracking | model, clamped in code only | **model, clamped in the SCHEMA, and gated after compile** | see the §1 hazard: the code clamp and the advertised range disagree, and nothing measures the adjusted result |
| everything else | platform | platform | unchanged |

The principle this follows is not new here - it is the one the repo has repeatedly measured its
way to. **A rule a gate can check is worth more than a paragraph of prompt**, and its corollary:
*a deterministic gate cannot catch a defect in a dimension it does not measure*, so either
measure the dimension or forbid the construct. `docs/AI_LITE_BENCHMARK.md` §6c is the price of
ignoring it: three prompt versions, one variable each, pass rate 47% → 33% → 27%, every added
line degrading the axis it targeted *and* the ones it did not.

---

## 3. Routes, with real prices

Measured 2026-08-07 from the live OpenRouter listing plus each candidate's endpoints. Cost per
generation uses this round's own measured shape, 1.3k input / 460 output.

| role | route | $/M in-out | est. $/generation | % of the €0.01 budget | open weights | ZDR endpoint |
|---|---|---|---|---|---|---|
| **primary today** | `google/gemini-2.5-flash-lite` | 0.10 / 0.40 | **$0.000285** *(measured)* | 2.6% | no | google-ai-studio, google-vertex |
| **fallback today** | `mistralai/mistral-small-24b-instruct-2501` | 0.05 / 0.08 | $0.000102 | 0.9% | yes | **deepinfra (proven)** |
| candidate | `google/gemma-3-12b-it` | 0.05 / 0.15 | $0.000134 | 1.2% | yes | **deepinfra (proven)** |
| candidate | `openai/gpt-oss-20b` | 0.03 / 0.13 | $0.000099 | 0.9% | yes | multi-endpoint, unproven |
| candidate | `qwen/qwen3-30b-a3b-instruct-2507` | 0.048 / 0.193 | $0.000151 | 1.4% | yes | streamlake, **unproven** |
| judge (off) | `google/gemini-2.5-flash` | 0.30 / 2.50 | ~$0.0022 | 20% | no | google-* |

Two conclusions, and the first is the important one:

- **Every candidate fits the budget with 30-100x headroom, so route choice is a QUALITY
  decision, not a cost decision.** The 2026-07-29 comparison is the only Lite-task evidence
  that exists (gemma-3-12b-it 23/24, qwen3-30b 24/24, incumbent 22/24) and it measured machine
  usability, which §1 has now shown says nothing about whether a frame is airable. A route
  change should wait for the §5 loop to produce a scorecard that measures the right thing.
- **The judge costs 8x a generation.** At 20% of the budget for a single call it is affordable,
  and it is still not worth switching on - see §4.

Recommendation: **leave the primary alone for now.** The open-weight preference (plan §15.1) is
real but it is a tie-breaker at parity, and parity has not been measured on anything that
matters yet. Switching the primary today would replace a baseline we have just established with
one we have not.

---

## 4. The judge stays off

`docs/AI_LITE_BENCHMARK.md` §6d-§6f is unusually clear about this and the conclusion has not
changed: the judge-vs-human join is **3 of 6, which is chance**; `strapShape` scored 5 on a
graphic with no strap at all; `legibility` scored 5 on a frame with a word sliced by a
clip-path; `briefFit` was marking graphics down for lacking scene elements that cannot fit on a
strap. Four axes have been rewritten since and **no paid round has scored the rewrite**.

The asymmetry decides it. A false revert costs a skin; a **false accept airs**. A cheap judge
that passes bad output is worse than no judge, and the durable fix for the one defect it
demonstrably missed was a deterministic bench detector, not a stricter prompt.

So: the judge earns a place only if it catches something no gate can, at 20+ joined items, on a
round that completes. Until then the spend goes into gates.

---

## 5. The loop

```
frozen brief bank  →  one round (~$0.005)  →  frames read BEFORE any gate output
   →  every rejection gets a MECHANISM and an OWNER
        model     →  remove the decision, or clamp it in the SCHEMA
        platform  →  a deterministic gate, or corrected metadata
        catalog   →  design work
   →  re-run
```

**The invariant: a defect leaves the list only when something makes it unrepeatable - never
when a prompt sentence says not to do it.** §1 is the argument: the round's headline defect was
authored in the catalog's CSS and amplified by a metadata word, and no amount of prompt
teaching could have reached either.

Two supporting rules, both learned the expensive way in this repo:

- **Attribute before fixing.** Five paid Creative-Mode rounds read as "cheap models cannot
  design" and two of them were harness bugs. This round's headline defect looked like model
  taste and was three lines of catalog CSS.
- **Machine-usable is not a quality signal.** 18/18 with zero rule codes, alongside a five-line
  strap. The F5 inversion, again, in the smallest possible instance.

What makes the loop affordable is structural, not a cost trick: **Lite's model writes no code.**
Every failure is either a *decision* (fixable by narrowing the schema - free, permanent, applies
to every future generation) or a *compile/catalog* issue (fixable once, for everyone). Nothing
here is fixable only by paying for a bigger model. The binding constraint is reviewer fatigue,
which is the argument for making the machine reject more before a human ever looks.

---

## 6. Build order

Each step is free unless marked, and each is independently landable.

1. ~~**Correct the capacity metadata.**~~ **DONE 2026-08-07 - and MEASURED NOT TO WORK. Read §1a
   before building on it.** `supportingLineChars` replaces the adjective, the digest states the
   number with its unit, the prompt's capacity clause names it, prompt version
   `lite-lower-third-v4`, and `scripts/lite-line-capacity.mjs --check` gates the claim against
   the render. The metadata is now true. It did not change what the model picks.
2. ~~**Give the supporting line a fitting strategy.**~~ **INVESTIGATED 2026-08-07, and the
   obvious lever is blocked - shrink-to-fit cannot fix this.** Two measurements killed it:
   - **`textFit` shrinks by font-size, and lt25 and lt32 set their supporting line at 20px -
     exactly the category type floor.** Zero headroom on precisely the two designs that need
     it. The remaining four have 9-26%, which buys a handful of characters.
   - **Every design wraps at the same 806px**, which is the SHARED auto-fit cap
     (`computeMaxTextWidth`, min(42% of frame, safe area)) rather than any per-design limit. So
     there is no free width to recover either - and 42% already sits above the catalog's own
     20.8-30.5% width band, so raising it would make straps wider than the catalog believes a
     lower third should be.

   What is left is genuinely the designs' honest capacity, which is what step 1 now tells the
   model. **The residual risk is the OPERATOR typing a value longer than the chassis holds, and
   the answer there is to MEASURE it rather than to silently reflow.** Shipped: the runtime
   bench's `singleLineFields` option raises `bench-line-wrap` when a line carrying IDENTITY
   wraps, and `LITE_SINGLE_LINE_ROLES` decides which lines those are - a `person-role` or
   `location` must hold one line, a `story-headline` may wrap, and that discriminator is a field
   Lite's schema has always required. Pinned three ways in `e2e/lite-line-fit.spec.ts`: it fires
   on the long role, stays quiet when the copy fits, and stays quiet on the SAME long copy
   declared as a headline.

   **WIRED INTO PRODUCTION 2026-08-08**, and not where this step expected. AiStep cannot
   supply `singleLineFields`: the browser builds its injected validator before any decision
   exists, and the fields are derived from the DECISION's declared roles against the ASSEMBLED
   template. So the composition moved to the one place that has both - `claudeProvider`'s
   `liteValidator`, beside the `AssembleOptions` override that exists for the identical reason.
   Until then the wrap check was a finding every ROUND measured and no user ever saw.
3. **Gate the ADJUSTED result.** DONE. `designAdjust` clamps to `typeFloorFor(category)`
   rather than a hard 14px, and the live bench raises `bench-type-floor` on anything that
   still renders under it (`e2e/lite-type-floor.spec.ts` pins both halves). It reaches
   production through the same `liteValidator` composition as step 2 - before that it was
   benchmark-only for the same reason. Deliberately NOT in `runtimeBench`'s defaults - a user
   who chooses graphic size S is not making an error, so this is a generation-quality rule,
   not an export gate.
4. **Close the schema gaps.** DONE: `typography.scaleRatio` carries `minimum`/`maximum` in both
   schemas, and the supporting line can no longer be enlarged past its authored size (§1b).
   **What is left is the part the rounds have not answered** - a role longer than the chassis
   holds still wraps, because the capacity is genuinely spent (§1a: the 806px cap, and no shrink
   headroom at the 20px floor). The remaining levers are the design's own tracked uppercase and
   its tracking, which are catalog work rather than AI work. `designAdjust`'s 14px floor still
   needs to become the category floor.

   **Before the next round, re-read the instrument.** `warningCodes` now records what
   `ruleCodes` does not; a round run before that is not comparable on any warning-severity
   finding.
5. **Retire the two dead axes - ATTEMPTED 2026-08-08, and the deletion half is a measured
   NO-GO.** Read `benchmarks/lite/ROUND-2026-08-08-QUALITY.md` §5.3 before trying again.

   The decisions really are dead: `zone` came back `bottom-left` on 47 generations of 47 across
   two rounds, and `animation.presetId` never once carried a legal value. **Moving them to the
   platform worked** - Lite assembles with `keepChassisZone` now, so placement is the chassis's
   own `defaultZone`, and that closes ADAPT_FIRST_PLAN §6.2's deferred fold with no output
   change. The prompt lost its bottom-zone line.

   **Deleting the schema properties did not work and cost a round.** The Lite spec object is
   `additionalProperties: false`, so a property the model still EMITS becomes a refusal rather
   than a no-op: v9 deleted both and fell 29/30 → 26/30 on three `malformed_response` where v7
   and v8 had none. Restoring `zone` recovered two of the three (v10, 27/30); the residual could
   not be attributed from one roll each, so v11 restored `presetId` too. Both now sit on the
   wire with *"omit this field"* in their DESCRIPTION - which is what took `presetId`'s emission
   rate from 9/29 to 0/29 in the first place - and are ignored by the compile.

   **The rule that generalises: a property under `additionalProperties: false` cannot be deleted
   while the model still emits it. Teach it away, measure the emission rate reach zero across
   more than one round, then delete - or leave it instructed, which costs a few output tokens
   against a refused request and a user's whole generation.** Pinned in
   `api/_lib/aiLite.test.ts` by PRESENCE, so the next tidy-up meets the reason first.
6. **Re-run the round** and compare against `lite-bench-out/round-2026-08-07/` - same briefs,
   same model, same prompt version, so the only variable is the platform. *(~$0.005.)*
7. **Then, and only then, consider the route.** With a scorecard that measures frames rather
   than compilability, run the open-weight candidates from §3. *(~$0.005 per candidate.)*

Deliberately **not** on this list: widening `supportedCategories` beyond lower thirds, the skin
path, the judge, and any prompt rewrite. The first three are gated on the loop producing a
trustworthy scorecard; the fourth is what §6c measured as the least effective lever available.

---

## 7. The honest ceiling, and the anonymous question

**Scope Lite to lower thirds and say so.** It already is (`supportedCategories: ['lower-third']`,
six audited chassis). At €0.01 the evidence supports a lower third that a student can put on air
after typing two fields - and this round says the remaining gap to that is *platform* work, not
model work. Widening the category list before the gaps in §6 are closed would ship a door that
disappoints on everything behind it.

**Anonymous access - an owner decision, with the numbers.** Turning `ANONYMOUS_PLAN['ai.lite']`
on would put OpenRouter spend behind a page with no account. What guards it today:

| guard | value | what it bounds |
|---|---|---|
| per-generation cost cap | $0.007 | one call |
| measured actual | $0.000285 | one call |
| fleet daily spend ceiling | $25/day | ~87,000 generations/day at measured cost |
| per-IP burst limiter | 60/min | pre-body protection, *not* an entitlement |
| per-user quotas | 3 successes, 6 starts/day | **identity-bound - an anonymous caller has no identity to bind to** |

That last row is the whole risk: the daily/monthly quotas are the real spend control and they
key off a user id. Anonymous access removes them and leaves the $25/day fleet ceiling as the
only bound - which is a *budget*, not a limiter, and it is shared with every other Lite user.
Recommendation if the owner wants it: ship it behind a device-scoped quota first (the audience
plane's device-token pattern, `docs/INTERACTIVE_PLAYOUT_PLAN.md`), not on the fleet ceiling
alone. Not flipped here.
