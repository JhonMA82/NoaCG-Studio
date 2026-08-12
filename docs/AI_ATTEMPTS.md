# AI attempts - what was tried, what it measured, what would make it worth retrying

The graveyard. One entry per approach this repo paid to learn about and then stopped using, so a
session cannot mistake an abandoned approach for current strategy, and cannot re-propose one from
scratch when the only thing that changed is a model.

**Read the RETRY WHEN line, not the verdict.** "qwen3.7-flash failed" is history; "retry when a
sub-$0.20/Mtok route serves real JSON Schema" is a standing instruction that fires itself. An
entry whose answer will not change says `never` and why.

Live contract: `src/ai/AGENTS.md`. Deadline plan: `docs/AI_LITE_PLAN.md`.

---

### Models designing a broadcast graphic unaided
**2026-08-12 · NoaCG Pro Phase 0 · `moonshotai/kimi-k3` · 20 of 24 captured, $4.58 · OWNER READ
IT AS A PASS, WITH LOGOS AS THE NAMED GAP.** The 2026-07-31 verdict below is superseded for
STRONG OPEN-WEIGHT checkpoints; it stands for the cheap ones it measured.

12 briefs x 2 arms (three hand-vetted complete exemplars retrieved through `shortlistFor` from
the measured Lite chassis / no exemplars at all), one initial call each, the shipped coder
prompt around `neutralSkeleton`, the shared two-round repair loop, `productionSpxValidator`, and
a blind gallery mixing in the control, three catalog designs and two adapt-first compiles.
Owner's verbatim read is in the archived `notes.md`: *"the graphics are fine if we can create
this quality"*, with two named defects and one named gap.

**The transfer question answered, and it went the right way.** §0.3 says an exemplar arm that
passes beside a COLLAPSING no-exemplar arm is transfer rather than taste. The opposite happened:
the no-exemplar arm completed 12 of 12, and on the one pair the owner singled out - `news-public`
- the exemplar and no-exemplar results were judged indistinguishable ("B7 and B8 look the same
but they are fine, just quite simple/boring"). Three complete catalog designs in the prompt bought
essentially nothing over none. That is evidence of the model's own eye, and it also means the
exemplar block is not yet earning its ~34,500 tokens per call.

**Zero repair rounds fired across the whole round** - every result cleared the deterministic gate
on its first emit. Three carry an unreadable ANIMATION region (playable and exportable, read-only
timeline), which the product path also demotes on a fresh build.

**THE ONE DEFECT EVERY MACHINE GATE PASSED IS THE LOGO.** `portrait-logo` on the no-exemplar arm
rendered a broken-image icon with its alt text *"Channel mark"* visible in the finished frame -
the model referenced a mark nothing bundled - and static validation, the runtime bench and the
field-contract check all reported it fine. The owner named the same thing independently as the
work to do next: *"find a good structure and plan for how to implement the logos so they fit the
design And that they animate in a meaningful and smooth way."* The answer already has a precedent
to copy rather than invent: on the Lite side **the design declares the slot and the compiler fills
it - the model never places the mark** - and the declaration is gated against a rendered
measurement (`LiteCatalogEntry.logoSlot`, `scripts/ai-lite-brand-audit.mjs --check`,
`docs/AI_LITE_PLAN.md` §7). A generated design has no catalog slot to declare, so Phase 1 owes
the equivalent contract for authored graphics, plus the motion half nothing measures yet.
Second named defect, local: one strap's panel is not aligned to its own left accent line.

**Honest limits of this round.** The exemplar arm holds 8 of 12 briefs - `sports-live`,
`corporate`, `portrait-logo` and `long-name` were lost to repeated gateway `unavailable` errors -
so §0.3's counts cannot be read at full denominator; the verdict above is the owner's judgement on
what rendered. Only ONE checkpoint ran: `alibaba/qwen3-coder` was chosen as the second and never
executed. And the round cost more than it should have - four separate harness faults, each
recorded in the commits, burned roughly $5 of the ~$16 total on findings rather than results.
**SECOND CHECKPOINT, same day: `alibaba/qwen3-coder` ran the identical protocol and finished it.**
**24 of 24 captured, 24 of 24 contract-clean, $0.263** - against kimi-k3's 21 of 24 at $5.032, so
about **19x cheaper and more complete**. It carries no reasoning tokens, which is the whole
difference: nothing truncated, nothing timed out, and the round needed no resume. One repair round
fired across 24 generations (kimi-k3: zero). Four results carry a read-only timeline (kimi-k3:
three). The two checkpoints are therefore NOT separated by whether they can do the job - both
produce contract-clean broadcast lower thirds - and the visual comparison between them is a human
read that has not been done yet.
**kimi-k3's exemplar arm finished at 9 of 12.** `sports-live.exemplar` and `long-name.exemplar`
never completed across four attempts (gateway `unavailable`), and `corporate.exemplar` truncated at
BOTH the 17,000 and the 25,000 token ceiling - twice, exemplar arm only, so it is a repeatable
property of that brief on that checkpoint rather than a blip. qwen3-coder ran all three without
incident.
**CHECKPOINT DECISION (owner, 2026-08-12): `alibaba/qwen3-coder`.** Better on the owner's read of
the two galleries and ~19x cheaper, so it is the checkpoint later phases build on.

**THE ROUND SAVED NO CODE, AND THAT IS THIS ENTRY'S MOST EXPENSIVE MISTAKE.** Forty-five paid
generations were reduced to PNG frames: the ledger kept verdicts, costs and pictures, and none of
the emitted HTML/CSS/JS. The standing instruction two entries below - *"a paid round must pass
`--save-fixtures`"*, written after the 2026-08-08 Pro round lost its twelve interpretations the
same way - was in this file the whole time and was not followed. The immediate cost: the alignment
defect the owner named cannot be diagnosed from its own CSS, and nothing can be re-rendered,
re-measured or turned into a fixture without paying for the round again. `pro-spike.mjs` now writes
`code/<brief>.<arm>/{index.html,template.css,template.js}` per generation. **The rule generalises
past fixtures: the model's OUTPUT is the irreplaceable artifact of a paid round, and a frame is a
derivative of it.**

**RETRY WHEN** - not a retry; this is a GO into Phase 1 on the owner's read. What is still owed:
an ablation settling whether the exemplar block survives at all - it costs ~34,500 tokens per call
and, on the pair the owner examined, changed almost nothing - and the round that actually matters,
below.

### What Phase 0 did NOT test: brand
**2026-08-12 · the owner's framing, and the real question.** Every brief in the bank is generic:
two text lines, no brand palette, no brand typeface, and no actual mark - `includeLogo` is a
boolean that asks for an empty slot, and the one brief that set it rendered a broken image. The
prompt passes no colours, no logo file and no brand system, so the round measured *"can a strong
open checkpoint design a broadcast lower third"* and never asked *"can it design THIS customer's
lower third."* The owner's verdict on the output was that it looks like something the free template
gallery could carry - which is the correct reading of what was tested, and the reason the result
does not yet justify a paid tier: **a generic graphic is not worth a paid generation when the
catalog already ships 59 of them.**
**THE NEXT ROUND IS BRAND-CONDITIONED**, and it is cheap on the chosen checkpoint (~$0.26 for 24
generations): the same 12 briefs, each carrying a real mark (shape, backing and ink measured by
`assets/assetInfo.ts` `probeMark`, the content-free contract Lite already uses), a brand palette
and a brand typeface. Two things get measured that this round could not: whether the output is
BRAND-FAITHFUL (the mark placed legibly and unaltered, the palette actually driving the design
rather than decorating it), and whether outputs are DIFFERENT FROM EACH OTHER when the brand
changes and the brief does not - the sameness tripwire the adapt-first route already lives under.
**RETRY WHEN** - not a retry, this is the scheduled next experiment. It is also the honest test of
the whole Pro premise: adapt-first already delivers catalog-grade generic graphics for a fraction
of a cent, so Pro earns its cost only on originality conditioned by a customer's own brand.

### Cheap models designing a broadcast graphic unaided
**2026-07-31 → 08-02, five paid rounds · SUPERSEDED by adapt-first.** Cheap open routes composing a
lower third from a blank stylesheet: blind pairwise **0 of 5** and **0 of 6** decisive pairs against
the frozen control, with **9-11 of every 12-16 pairs airable on neither side**. The repeating fault
was proportion and spacing - relationships between panel, text and type size, which no clamp
produces. Four rounds of correctness fixes yielded correct, plain graphics; correctness was never
what was missing. Stated honestly because it changes the reading: two platform bugs (the gateway
rejecting string-encoded structured output; `position: absolute` on `.creative-box` collapsing the
root to 0x0) invalidated everything before 2026-08-02, and with both fixed a FRONTIER arm
(`claude-sonnet-5`, 8 briefs, **$0.7272**, ~40x the staged arm) produced 4 of 8 the owner would use -
unblinded, single-arm, not comparable to the pairwise numbers.
**RETRY WHEN** a route at ~$0.01/generation beats the frozen control on a blind pairwise of **20+
joined items**. Frontier models already clear quality and fail price - that is Extreme, not this.

### `zai/glm-5.2` as a Phase 0 authoring checkpoint
**2026-08-12 · 0 of 2 arms, nothing emitted at all · DISQUALIFIED for this task.** Chosen as one
of the two pinned checkpoints on lineage diversity and a capability probe it passed in 34 s. The
probe was the problem: it used a short brief and a small budget. Given the ROUND's real prompt -
the shipped coder system prompt plus a ~34,500-token exemplar block - glm-5.2 spent **the entire
17,000-token budget on reasoning tokens and returned `finish_reason: length` with no answer**, on
the exemplar arm AND the bare no-exemplar arm, ~265 s each. At an 8,000 budget it did the same
thing sooner. This is not latency and no timeout fixes it: a larger budget buys more thinking. On
the same prompt `moonshotai/kimi-k3` spent 7,179 reasoning tokens and answered, and two
coder-tuned checkpoints (`alibaba/qwen3-coder`, `moonshotai/kimi-k2.7-code`) spent ZERO and
answered in 34 s and 9.5 s.
**RETRY WHEN** its thinking can be bounded independently of the answer budget (a reasoning-effort
control, or a non-thinking sibling). **Standing instruction, and the reason this entry exists:** a
capability probe must ask the SAME SIZE question as the round - same system prompt, same
retrieval volume, same output budget - or it certifies a checkpoint the round cannot use.
`scripts/spike-checkpoint-probe.mjs` was rewritten to do exactly that.

### Reaching an open-weight checkpoint through the generic proxy's `json_schema`
**2026-08-11 · 0 of 2 checkpoints, then 2 of 2 · BLOCKED on the transport, not the models.** The
Phase 0 capability probe refused both pinned checkpoints (`moonshotai/kimi-k3`, `zai/glm-5.2`) with
`malformed_response`. They are not incapable: `POST /api/ai/generate` is the only path a browser
harness has, `surfaceRoutePolicy` never sets `structuredOutputMode`, so every generic gateway call
goes out as `response_format: json_schema` with **`strict: false`** - a hint these endpoints do not
honour. Asked the same question both ways against the gateway directly: under json_schema glm-5.2
returned `{emit_template: {…}}` and kimi-k3 invented a whole SPX-definition-shaped object
(`playserver`, `DataFields`, `dataformat`); under a **forced function tool** both returned exactly
`name,type,summary,html,css,js`. The repo already believed this - `providerAllowlistFor` filters
gateway endpoints on `tools` support and `src/ai/AGENTS.md` says forced-function tool use "is the
capability the structured call actually rides on" - but the transport asks for the other thing.
**RETRY WHEN** never as stated: json_schema is not the capability. The fix is a mode the generic
proxy can express, and it is a shared-contract change (`AiGatewaySurface`, `surfaceRoutePolicy`,
or the vercel adapter's default) that has to be verified against the paths already using it -
Lite and import-analysis pin their own mode and are unaffected. **Standing instruction:** a probe
that reports REFUSED must say which of the two it measured, because "the endpoint cannot serve
structured output" and "we asked for the wrong kind" look identical from the caller.
`NOACG_DEBUG_STRUCTURED=1` prints the rejected paths server-side and is what separated them here.

### `alibaba/qwen3.7-flash` as a Lite route
**2026-08-08 · 0 of 6 · DISQUALIFIED.** Cheapest text route on the gateway (0.03/0.13), 991k context,
and it cannot serve Lite at all: the endpoint downgrades `response_format: json_schema` to
`json_object`, then refuses ("'messages' must contain the word 'json'"). Price and context are not
capability.
**RETRY WHEN** a sub-$0.20/Mtok route serves real JSON Schema end to end, proven by a probe against
the actual Lite schema - never by a listing. It is a property of the endpoint, so re-check on any
endpoint change.

### `openai/gpt-oss-20b` as Lite's second attempt
**2026-08-07 → 08-08 · 2 of 4 on the contract vs the primary's 27 of 30 · RETIRED.** Chosen on price
and catalog approval alone, never measured against the contract it existed to satisfy. Lite runs
`retryLimit: 0`, so a retryable `malformed_response` did not re-roll the primary - it handed
straight here, turning a stochastic miss into a user-visible failure. The second attempt now goes
to the primary again: two rolls of a 27-in-30 model beat one roll each of that and a coin flip.
**RETRY WHEN** a candidate scores ≥90% as a PRIMARY on the 30-brief bank. A fallback is never
promoted on price, and a route nobody has run as a primary is not a fallback.

### Lite's cost ceiling computed from the audited catalog price
**Broke Lite twice, same route (`qwen/qwen3-coder-next`) · KEPT, pinned by a test.**
`liteGatewayPolicy` derives `maxInputPerMillion` from the audited catalog snapshot, so when the real
price moves above the cap every generation dies on `cost_ceiling` **before a model is called** and
the deployment looks healthy. Once on OpenRouter (audited 0.11/M in, cheapest live endpoint 0.12),
again on the move to Vercel AI Gateway (same model 0.50/1.20, not 0.11/0.80).
**RETRY WHEN** never - failing closed is correct and the failure mode is staleness. Gate: the
defaults test in `api/_lib/aiLite.test.ts`; re-audit the price in the same commit as any route or
transport change.

### A NUMERIC enum in Google's structured output
**Through prompt v6 · a 400 on every Lite call · DISQUALIFIED, gated by a schema walk.**
`spec.animation.speed: { type: 'number', enum: [0.75, 1, 1.5] }` is legal JSON Schema and the server
validator accepts it, but Google's `response_schema` accepts `enum` **only on a string** - Gemini
rejected the whole request with a 400 *before generating anything*, so one property took down every
Lite call the moment the managed transport routed that model to Google. Invisible to every gate,
because the failure exists at one provider. v7 replaced it with bounds plus the legal values in the
property description.
**RETRY WHEN** never for Google. `aiLite.test.ts` walks both shipped schemas for a non-string enum;
a new backend earns one only by being proven to express it.

### Deleting a dead property from a closed Lite schema
**2026-08-08, prompt v9 · 29/30 → 26/30 · REVERTED (v10, v11).** `zone` and `animation.presetId`
decide nothing (`bottom-left` on 47 of 47; `presetId` never once legal), so both were deleted. The
spec object is `additionalProperties: false`, so a property the model still EMITS becomes a refusal
rather than a no-op: three `malformed_response` where v7 and v8 had none. Restoring `zone` recovered
two; the residual was unattributable from one roll each, so `presetId` came back too. Both sit on
the wire with *"omit this field"* in their description, ignored by the compile. Moving a decision to
the platform and removing the field from the wire are two changes with two risks.
**RETRY WHEN** the emission rate reads zero across **more than one round**. Teach it away in the
description first (that took `presetId` from 9/29 to 0/29), then delete. Pinned by PRESENCE.

### Adding prompt lines to raise the Lite skin's `briefFit`
**Four paid rounds, one variable each · 47% → 33% → 27% pass, v5 taking legibility with it ·
ABANDONED.** Every added line was defensible alone and drawn from the judge's own words; the block
went from ~6 simultaneous requirements to 11 and every axis degraded, including untargeted ones. Two
rules survive: **prefer replacing to adding** (v3, the one clear win, deleted as much as it wrote -
a prompt at this length is a fixed budget, not an append-only log) and **watch the axis you are not
targeting**. `AI_LITE_BENCHMARK.md` §6c records the caveat: `briefFit` was partly unwinnable (it
scored brief nouns including scene elements a strap cannot hold), so 2.60 measures the axis as much
as the model.
**RETRY WHEN** a round completes on the rewritten axis - and then try worked EXAMPLES (a high-scoring
skin shown, not described), not more sentences.

### A prohibition as a way to enforce strap geometry
**Prompt v2 · skin emission rate halved · REPLACED by inspection language (v3).** Shipped as "STRAP
SHAPE IS NON-NEGOTIABLE" and "a wrapped name is a failed skin": given a documented way to fail and a
documented way out (`omit skin`), the model took the way out. The same geometry restated as the shape
being painted, with omission named as the likelier mistake, restored the rate. The judge side is the
mirror image - an axis phrased as a taxonomy of wrong shapes scored **5** on a frame with no strap,
because nothing on the list matched.
**RETRY WHEN** never. The rule is live in `src/ai/AGENTS.md`: state what to look at and what earns a
pass, never a list of named failures. When a teaching change moves a rate, suspect the FRAMING first.

### The Lite skin vision judge as a production gate
**Rounds d-j · judge-vs-human agreement 3 of 6 · EXPERIMENT, flagged OFF; only the eval rig calls it.**
3 of 6 is chance. `strapShape` scored 5 on a graphic with no strap; `legibility` scored 5 on a frame
with a word sliced off by a `clip-path`. Four axes have been rewritten since and **no paid round has
scored the rewrite**. The asymmetry decides it: a false revert costs a skin, a false accept **airs** -
and the durable fix for the one defect it demonstrably missed was a deterministic detector plus a
construct ban, not a stricter prompt.
**RETRY WHEN** a completed round yields **20+ joined items** and the judge catches something no
deterministic gate can. Until then the spend goes into gates.

### Correcting Lite's capacity metadata to stop wrapped identity lines
**2026-08-07, prompt v4 · mean capacity of the CHOSEN chassis 48.6 → 49.3 chars · true and inert.**
`textCapacity: 'medium' | 'high'` was hand-authored and ranked the designs almost backwards (both
"medium" entries measure widest; the loudest "high" holds the fewest of all six), so it became the
measured `supportingLineChars`. Telling the model the truth changed the metadata and not the
behaviour: +0.7 chars is inside round A's own variance, and the failing brief still picked the
39-character chassis in two runs of three. The actual cause was `applyDesignAdjustments` **rewriting
the very property the number measures** - `scaleRatio: 1.2` cuts lt25 from 47 characters to 19.
**RETRY WHEN** never as stated. Transferable: before teaching a model a fact, check whether the
pipeline downstream overwrites it. The measurement survives as `scripts/lite-line-capacity.mjs --check`.

### Shrink-to-fit for Lite's supporting line
**2026-08-07 · BLOCKED by two measurements, not by taste.** `textFit` shrinks by font-size, and lt25
and lt32 set their supporting line at exactly the 20px category type floor - **zero headroom on
precisely the two designs that need it** (the other four have 9-26%, worth a handful of characters).
And every design wraps at the same **806px**, the SHARED auto-fit cap `min(42% of frame, safe area)`
rather than a per-design limit - and 42% already sits above the catalog's own 20.8-30.5% width band.
What is left is the designs' honest capacity.
**RETRY WHEN** the catalog's tracked-uppercase supporting lines are redrawn (catalog work - tracked
uppercase costs about a third of the characters a reader expects), or the supporting-line type floor
is deliberately lowered. Meanwhile the residue is measured, not silently reflowed: `bench-line-wrap`.

### Pro's interpret → compile reconstruction
**2026-07-31 → 08-08 · visibly broken on 5 of 12 while the gates reported 11 of 12 passing ·
RETIRED as product direction 2026-08-10 (`docs/NOACG_PRO_PLAN.md` §13 - the plan replaced this
direction with the open specialist).** The image model designs well - 11 of 12 credible concepts.
The rectangle-rebuilding compiler cannot keep what they design. Lite delivered a usable graphic on
12 of 12 of the same briefs, at 1/250th the cost.
**Re-diagnosed 2026-08-09** (`benchmarks/pro/round-2026-08-08/DIAGNOSIS.md`, free):
**the approach was never fairly tested.** The compiler renders every design at **0.72x** the size it
was drawn (the 1376x768 concept's pixels used as design pixels in a 1920x1080 frame), places live
text at **0.59x** the baked text it replaces (`boxH * 0.72` compounding with the same error), paints
rebuilt panels in colours the pixels do not contain (mean rgb distance 131 over 17 regions, within
20 on zero), and discards the designed position for a nine-way zone bucket. A fifth brief broke in
the concept PROMPT, which renders its two values inside its own bullet scaffolding. Only
`sports-live` is the named rectangle limit - and there the model SAW the angled panels and warned
about them, because `ProPanelGeometry` has no polygon to put them in. So "a better image model makes
this worse" is unsupported: those defects hit the six usable briefs equally and merely failed to
break them.
**And the gate was not blind.** `ProCompileReport.warnings` separates broken from usable on 11 of 12;
`pro-bench.mjs` records them and computes `pass` without reading them. `artDropped` fired on 3 of 12
and all three are usable.
**RETRY WHEN** the four measured defects are fixed and a re-run measures the approach as designed -
`node scripts/pro-geometry-audit.mjs` is the free gate for the first four. Independently: a polygon
in the panel contract, **or** an image-edit clean-plate capability. Neither is needed for the half
that measured well: feed the CONCEPT back as a `layout` reference into the grounded adapt path.
**Standing instruction from this one:** a paid round must pass `--save-fixtures`. The 2026-08-08
interpretations were not kept, so the twelve model outputs behind the twelve frames are gone and the
per-brief attribution had to be reconstructed from pictures and code.

### Creative Mode as a parallel creation architecture
**2026-07 → 08-02, four ablation arms · RETIRED 2026-08-09, superseded by Pro (owner decision).**
The staged CREATE pipeline (concepts → creative spec → scaffold compile → style → critique) was
built to make cheap open models compose off-catalog graphics. Adapt-first won the strategy question
before it landed, and Pro now owns "the model proposes the appearance, the platform owns the
engineering". It is not a second architecture to carry: **stop reading `docs/CREATIVE_MODE_PLAN.md`
as live strategy, and mine it.** What survives, and where it should go, is that plan's RETIRED
banner. `scripts/creative-route-bench.mjs` and `e2e/creative-routing.spec.ts` are NOT part of this -
they cover the LIVE Phase-A routing stage and stay.
**RETRY WHEN** never as a parallel path. The individual mechanisms retry on their own merits inside
Pro: the inspection-question critic, the scaffold/style split, the knowledge cards, and the
one-vision-call-to-text reference bridge.

### Teaching the free-form coder its structure spine by example
**Through 2026-07-17 · every result converted the moment a `-box` class was injected · FIXED by
naming the contract.** The coder followed the authoring grammar perfectly and `parseTimeline` read
every region, but `importAnimData` bails on `detectPrefix` first, and `detectPrefix` keys entirely
off `class="{prefix}-box"` - which the prompt never named. The example merely SHOWED it, and models
generalize the idea, not the literal class. Worse, the bench's repair message told the model to
"give the root a single class and prefix every child class", which does not satisfy the check - so
the custom route's repair rounds were **unwinnable by construction**.
**RETRY WHEN** never. Standing instruction: if an editability finding looks model-shaped, suspect the
teaching message before the model, and state a machine-checked precondition as a requirement rather
than showing it in an example.
