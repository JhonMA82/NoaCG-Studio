# NoaCG Lite brand graphics - custom graphics that beat free templates, or nothing

**Status: ACTIVE - ratified by the owner 2026-08-12 (§9).** This is the forward master plan for
the Lite value pivot; the built-and-measured record it stands on is `docs/AI_LITE_PLAN.md` §7 and
`benchmarks/lite/BRAND-AUDIT-2026-08-09.md`. Doctrine and code contract stay `src/ai/AGENTS.md`;
dead ends stay `docs/AI_ATTEMPTS.md`. Nothing here widens any product surface until its gate says so.

## 0. The thesis, restated as a falsifiable claim

The old goal - template-quality graphics from custom prompts - is answered and insufficient. v13
measured 30/30 machine-usable and the v14 semantic round 6/8 visually usable, and the conclusion is
the owner's: **a template-quality graphic in house colours is a template.** The catalog already
gives those away; generating one with a model adds cost and failure modes and no user value.

The value Lite can add is different and specific:

> **The user's OWN graphic: their exact brand colours, their mark, their words - brief-following,
> broadcast-safe, delivered in seconds, free, with no design skill required.**

Templates cannot carry a user's brand by default. The wizard CAN carry it manually, which is why
this claim must be measured against that baseline, not asserted (§2). If Lite cannot clearly beat
what a user gets from templates alone, and cannot at least match careful manual wizard branding at
a fraction of the effort, **the honest product decision is to retire custom AI generation for now
and ship free templates** - that fallback is part of this plan, not a failure of it.

Two standing constraints frame everything below:

- **Cost ceiling: 100 graphics per EUR 1** - EUR 0.01 per *delivered* graphic, counting both
  attempts and amortized failures. Today's route runs ~$0.00034/generation, 30x inside it. Cost is
  not the constraint; human review is.
- **The doctrine holds: adapt, never invent.** The model picks and parameterizes proven catalog
  designs; the platform owns placement, palette application, the mark, fields, machines, and every
  gate. The model writes no code and places no logo (`src/ai/AGENTS.md`).

## 1. What already exists - do not rebuild

| capability | where | state |
| --- | --- | --- |
| Brand palette on the request | `LiteGenerationRequest.palette` (accent/text/textDim/panel), project brand wins in `specToTemplate` | LIVE |
| Brand mark, measured | `LiteMarkDescriptor` (shape/backing/ink, `probeMark`, pixels never leave the machine) + `LiteCatalogEntry.logoSlot` (fits + surface, audit-gated) | LIVE, v14 |
| Mark legibility repair | server semantic repair: re-pick chassis, else paint a well (`logoPlate`) - never drop, never fail | LIVE |
| Brand geometry audit | `scripts/ai-lite-brand-audit.mjs` - 9 painted-frame rules (slot, paint, aspect, crop, size, clear space, containment, ink contrast, house-amber survival) | LIVE, free |
| Brand brief bank | `scripts/ai-lite-brand-fixtures.mjs` (8 briefs, 5 authored mark shapes) | LIVE |
| Frozen banks + rigs | 30-brief bank, 8 semantic briefs, `ai-lite-eval.mjs` / `bench:lite` / `bench:lite:semantic` / `bench:preflight`, gallery + report | LIVE |
| Category semantics | `CATEGORY_CONTRACTS`, 13 measured chassis, retrieval-narrowed enum | LIVE |
| Contrast repair | `clampLitePalette` - lightness clamp, else drop the bespoke palette | LIVE, **wrong for brand (§3.1)** |

## 2. The value gate - the kill criterion

One blind gallery round decides whether this product direction lives. Per brief, three arms:

1. **Template arm** - the best-matching catalog design, house palette, sample content. What a user
   gets from Browse for free.
2. **DIY arm** - the same design hand-branded through the wizard: brand palette via the Style
   panel, logo in the slot, content typed in. What a motivated non-designer gets in 3-10 minutes,
   including their own taste mistakes - this arm is authored honestly, not sabotaged.
3. **Lite arm** - one Lite generation from the brief + brand input. Seconds of effort.

Blind, shuffled, judged by the owner (students later), Pro-plan gallery discipline: frames and
motion read before any machine verdict. The questions: *would you air it for this show?* and
*which arm is it?*

**Pass rule (predeclared):** the Lite arm clearly beats the template arm on brand fit, AND is
judged at least equal to the DIY arm on overall quality, on a clear majority of briefs, with zero
brand-fidelity defects (wrong hex, dropped mark, illegible ink) among its accepted results.

**Fail consequence (predeclared):** custom AI generation is retired from the product roadmap for
now; free templates + manual wizard branding stand, and "make it yourself with Claude Code" is the
documented advanced path. The banks, audit and ledger stay - they gate any future revival.

First read at 8 briefs x 3 arms; a pass is confirmed at 20+ joined items before any public claim.

## 3. Close the brand-fidelity gaps first - platform work, all free

"Exactly the brand's colours" is currently not guaranteed. The gaps, in priority order:

### 3.1 The palette contract: identity vs furniture

Today `clampLitePalette` may lighten brand text colours, and when contrast is unreachable it
**drops the bespoke palette wholesale** (`palette_dropped_contrast_unreachable`) - the chassis
default carries and the user's brand silently vanishes. Correct for a model-invented palette;
wrong for a requested brand.

New contract:

- **Identity colours (accent, panel): verbatim hex, never altered, never dropped.** They are the
  brand.
- **Furniture colours (text, textDim): legibility-owned.** Prefer the request's values; clamp or
  fall back to neutral white/black when the floor demands it. Body text in a brand colour was
  never broadcast practice.
- **Repair ladder mirrors the mark's:** re-map which slot a colour serves, then neutralize
  furniture, then re-pick a chassis whose surfaces carry the identity colours legibly, then paint
  a well. The whole-palette drop is removed for requested palettes. A legibility floor costs a
  role at worst, never the brand.
- **New positive audit rule: `brand-accent-verbatim`** - the requested accent hex is painted
  somewhere on the frame at tolerance 0. Rule 9 (`house-accent-survives`) stays as the negative
  twin.

### 3.2 Adjustments become visible

`validateLiteDecision` returns `adjustments` and nobody stores them - a clamped or re-mapped brand
colour is invisible in `ai_generations`. Add the column (versioned migration, checked ledger
number - two branches minting one number is a known trap) so brand-fidelity repair rates are
measurable in production, per prompt version.

### 3.3 The scrim weld (owner decision 1, 2026-08-09)

A light brand package on lt32 leaves the name near-black: a hand-authored gradient scrim ignores
the palette. Fix = measured per-chassis metadata from `scripts/palette-freedom.mjs`, declared like
`supportingLineChars` and `logoSlot`, gated against a re-render. **Not** `logoSlot.surface` - that
was tried and reverted (lt32's logo well follows the palette; its scrim does not).

### 3.4 The opposite-tone chassis (owner decision 2, 2026-08-09)

No catalog lower third pairs a dark logo well with a light panel, so a brand owning only a dark
mark cannot use a light package without a bolted-on well. Real catalog work: taxonomy, factory
gates, the five catalog gates, l3-sweep. This is also the first test of §3.3's metadata.

### 3.5 Minimal brand input

Today the palette rides in from the project brand. A first-time customer has a logo and maybe one
hex. Add deterministic derivation: accent (+optional panel) in, full four-slot palette out,
platform-owned, no model. Optionally suggest the accent from the logo's own pixels - measured
locally in the browser exactly like `probeMark`, hex values only ever leave the machine.
*(Owner 2026-08-12: v1 is the existing brand surface only; the pixel suggestion is deferred.)*

### 3.6 Close the catalog SPLIT - measured 2026-08-13, the baseline's headline

The P0 baseline (`benchmarks/lite/BRAND-BASELINE-2026-08-13.md`, 2/5 usable) attributed three
of five brand-brief failures to one cause: **only 6 of 13 chassis carry the v14 brand slot** -
the seven semantic-round additions (`lt30 lt37 lt41 lt49 ls12 ls17 ls29`) are `logo: false`,
and retrieval ignores the mark when narrowing, so mark-carrying requests land on chassis that
cannot hold a mark (`logo_not_supported` refusals, a dropped mark on lt37). The v14 "never
drop the mark" promise is currently false on 7 of 13 chassis - regression by growth.

1. **Retrieval narrows to `logo: true` entries when the request carries a mark.**
   Deterministic, free, first. **DONE 2026-08-13** - `retrieveLiteReferenceSet` filters to
   slot-carrying chassis (by measured `fits` shape when the descriptor names one; mark
   outranks capacity on conflict, degrades rather than empties), mutation-pinned in
   `scripts/ai-lite-semantic.test.mjs`. Paid verification: the baseline's three failing
   briefs re-fired **0/3 → 3/3 machine-usable** (lt05/lt25, zero rule codes, brand palettes
   verbatim including the light paper package that previously died at hold), ~$0.002.
   Until §3.6.2 lands, a marked request honestly serves from the six 2-field slot chassis.
2. **Draw measured slots on the seven** - the §7.4 step-3 pattern from `docs/AI_LITE_PLAN.md`
   (type capability + brand audit + `logoSlot` metadata), batched with the §3.4 opposite-tone
   chassis. Also what lifts the marked-request field ceiling past 2.

This slice goes BEFORE the §4.4 volume matrix - a matrix over the split catalog would multiply
one known failure into every cell.

## 4. The Ling 3.0 Tiny free-window campaign - 2026-08-12 to ~2026-08-14

**OUTCOME 2026-08-12, same day: Ling FAILED qualification (§4.1) on three independent measured
grounds - no `response_format: json_schema`, forced `tool_choice` ignored at production schema
size (text-notation tool calls with invalid JSON, whitespace/prose runaway to the budget on
every probe), and no ZDR route. Five probes on the real prompt, 0 of 5 usable; the full audit
is `docs/MODEL_ROUTE_AUDITS.md` (2026-08-12) and the incumbent stays per §4.5.
`ling-3.0-flash-free` listed zero endpoints - not servable. §4.2-4.4 therefore run on the
INCUMBENT at real price: the volume matrix costs ~$0.07-0.17 instead of $0, still inside the
approved $0.50 cap. The qualification bought a reusable transport control:
`GatewayRoutingPolicy.thinking: 'off'` / `AI_LITE_GATEWAY_THINKING`, the hybrid-inference
Instant-mode switch any future Ling/Qwen candidate needs.**

`inclusionai/ling-3.0-tiny-free` is free on Vercel AI Gateway until ~Aug 14, then renamed
`inclusionai/ling-3.0-tiny` at ~$0.06 in / $0.18 out per million (7.9B MoE, 1.3B active, 256K
context). The window is a volume gift: distribution-scale brand data at $0 model cost. It is NOT a
route decision - promotion happens only on the frozen banks at the real price (§4.5).

### 4.1 Qualification, day one (order matters, each step gates the next)

1. **Catalog entry** in `aiModelCatalog.ts`, audited at the **post-window price** (0.06/0.18) so
   the cost-ceiling math cannot certify a route that breaks on Aug 14. Bench-candidate status,
   like the funnel entries.
2. **Provider slugs**: find which gateway providers serve it; the bench env must widen
   `AI_LITE_GATEWAY_PROVIDERS` accordingly or every call dies `route_not_permitted` before a
   model is reached (the Alibaba trap).
3. **Structured output**: one real call proving `response_format: json_schema` against the actual
   Lite schema. `alibaba/qwen3.7-flash` was 0/6 on exactly this; function calling in marketing
   copy is not the contract.
4. **ZDR**: one real ZDR-requesting call. If `zdr_unavailable`, the bench may run with
   `AI_LITE_REQUIRE_ZDR=0` on synthetic briefs only (`disallowPromptTraining` stays pinned on);
   **production promotion still requires a verified ZDR route**, no exception.
5. **Config hygiene**: eval config in `.env.bench.local`, never `.env.bench` (committed, "NO
   SECRETS"); `bench:preflight` before any round; fresh bearer token; `npm install` in the
   worktree first (the empty-node_modules self-deadlock).

### 4.2 Zero-token control

Replay the frozen fixture banks through the compile with no model call before any Ling round.
Two paid rounds have been mis-read as model failure when the platform was at fault; the control
rerun is mandatory after any harness change (Pro plan §0.1, same rule here).

### 4.3 Frozen-bank replay, Ling vs incumbent

Run the 30-brief v14 bank, the 8 semantic briefs and the 8 brand briefs on Ling; the incumbent's
numbers exist and are re-run only where the harness changed. Read the ledger's
`rejection_reason` per prompt version, never the pass count alone. Gallery-sample frames.

### 4.4 The volume brand matrix - what the free window is actually for

Brand briefs x 5 mark shapes x a palette bank (dark, light, pale-accent, high-chroma, mono,
near-amber) - roughly 200-500 generations, all free. Scored by the deterministic funnel at scale:
the 9 brand audit rules + `brand-accent-verbatim` + runtime bench + field paint. Human review
concentrates on the funnel's failures and a random survivor sample, because reviewer time is the
scarce resource. Deliverables: failure-rate distribution per rule x chassis x palette family, and
the §2 value-gate round's Lite arm.

### 4.5 Route verdict rule (predeclared)

Ling becomes a promotion candidate only if, on the frozen banks: machine-usable is at parity with
the incumbent (30/30 bar), zero schema rejections, the gallery read is not worse, ZDR is verified,
and the audited real price holds the EUR 0.01 ceiling with both attempts. Otherwise the incumbent
stays (it is already 30x inside budget) and the campaign still bought the brand data. Next
candidates if Ling fails, each needing the same qualification: `ling-3.0-flash` (also in a free
window), `openai/gpt-oss-20b` (measured weak: 2/4 as a primary), re-qualified qwen/gemma
neighbours. On Aug 14 the `-free` suffix dies: repoint any config, re-verify with one call.

### 4.6 Campaign budget

| item | est. cost |
| --- | --- |
| Ling generations (all rounds + matrix) | $0.00 during the window |
| Incumbent arms it makes sense to re-run | ~$0.02-0.05 |
| Post-window Ling confirmation (46 briefs, real price) | ~$0.01 |
| Contingency (repairs, re-rolls, mistakes) | remainder |
| **Cap for the whole campaign** | **$0.50** |

Vision judge stays OFF (axes measured broken, agreement = chance). No spend without the owner's
explicit OK on this cap.

## 5. The cost contract

EUR 0.01 buys the full delivered pipeline: up to 2 model attempts, deterministic compile, audit
renders (local, free), failures amortized. Current arithmetic:

| route | per generation | per 100 delivered (2-attempt worst case) |
| --- | --- | --- |
| `google/gemini-2.5-flash-lite` (incumbent) | ~$0.00034 | ~$0.07 |
| `inclusionai/ling-3.0-tiny` (post-window) | ~$0.0002 | ~$0.04 |

Headroom stays 10-25x even doubled - room for a future cheap vision sanity check *if* one ever
earns calibration, never a licence to add stages (doctrine: the smallest harness that wins).

## 6. The horizon: the brand kit

Where the value stops being arguable: **one brand input, one brief - a coherent branded SET**
(lower third + title + corner bug + starting-soon...), every piece carrying the same exact
colours, mark and voice, production-ready. Manual wizard branding scales linearly with graphic
count; Lite's cost is one more generation each. This queues behind category widening
(`docs/AI_LITE_PLAN.md` §3-5) and behind the §2 gate - a kit of graphics that individually lose
to DIY is just a bigger loss.

## 7. Non-goals

- No model-authored palettes for brand requests (the platform applies the brand verbatim), no
  model-placed marks, no model-authored state machines (owner rule, 2026-08-08).
- No skin revival, no vision-judge revival, no prompt-tuning campaign as a quality strategy (the
  least effective measured lever).
- No new retrieval system, no second compile path, no per-user fine-tuning.
- No anonymous Lite (owner rule); brand generation stays behind an account like all Lite.

## 8. Sequence and gates

| phase | work | gate to pass |
| --- | --- | --- |
| **P0 - now, 2 days** | §4.1-4.4: qualify Ling, control run, frozen replays, volume matrix | data captured before the window closes |
| **P1** | §3.1-3.5 brand-fidelity gaps | audit green incl. `brand-accent-verbatim`; adjustments visible in ledger; scrim weld gated; opposite-tone chassis drawn |
| **P2** | §2 value-gate round (8 briefs x 3 arms, blind) | pass rule met - else retire the path per §2 |
| **P3** | route decision at real prices (§4.5) | promotion criteria or incumbent stays |
| **P4** | ride category widening; then the §6 kit story | per-category gallery + control-page parity, per `docs/AI_LITE_PLAN.md` |

P0 runs first only because the window closes; P1 and P2 are the plan's substance. A P2 fail makes
P3/P4 moot - that is the design, not a risk.

## 9. Owner decisions (2026-08-12) - all three RATIFIED

1. **The §2 value gate stands as written**: the DIY wizard arm is the baseline, and a fail
   retires custom AI generation in favour of free templates.
2. **The §4 campaign is approved at a $0.50 total cap**, vision judge off, and benching with
   ZDR off is allowed on synthetic briefs only when Ling has no ZDR route - production
   promotion still requires a verified ZDR route.
3. **Brand input v1 is the existing brand surface** (logo + colours; platform derives missing
   slots deterministically). The local logo-derived palette suggestion is deferred.
