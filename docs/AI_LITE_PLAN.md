# NoaCG Lite - the plan to the student release

**Status: LIVE plan, 2026-08-08. The deadline is students live 2026-08-21.** This file is the
forward plan only - what must be true by that date, in what order, and how it is judged. Nothing
historical lives here: the OpenRouter-era rounds and route tables are `docs/AI_LITE_BENCHMARK.md`
Appendix C (parked), the dead ends and their retry conditions are `docs/AI_ATTEMPTS.md`, and the
doctrine and code contract are `src/ai/AGENTS.md` and `docs/ADAPT_FIRST_PLAN.md`.

## 1. Where Lite stands

| | |
|---|---|
| Production | ON since 2026-08-07, signed-in, quota'd. Anonymous access remains OFF (§6) |
| Transport | Vercel AI Gateway. Second attempt goes to the PRIMARY, not a weaker fallback |
| Cost | **$0.00034 per generation** - about 3% of the ~€0.01 ceiling. **Not a constraint** |
| Reliability | **30 of 30** briefs machine-usable, zero rejections, on `lite-lower-third-v13` (2026-08-09, `benchmarks/lite/ROUND-2026-08-09-V13.md`) |
| Scope today | lower thirds only, six audited chassis |
| The open problem | **quality**. Machine-valid is not good, and nothing has yet judged good - **the v13 bank's frames are unread** |

**Cost should stop being discussed.** There is 30-100x headroom, every candidate route fits, and
route choice is a QUALITY decision. The scarce resource is human review.

## 2. The four owner decisions (2026-08-08)

These are binding and exist in no other file.

1. **Scope: all catalog categories, BEST EFFORT.** Not a curated subset. Lite's allowlist widens to
   the whole browse catalog and each category is taken as far as it goes; a category that cannot be
   made good in time ships as good as it got, or is switched off, but it is not quietly dropped from
   the plan. *(Count the union rather than quoting a number: `TemplateCategory` in
   `src/model/wizard.ts` carries 22 browse categories once `imported-design` is excluded, while the
   root AGENTS.md map says 21.)*
2. **Success test: the owner judges a GALLERY of real generations, per round.** Machine-valid is not
   the bar and never was. A bench and a judge have each already passed a graphic carrying a real
   clipping bug, so a round is not read until its frames are.
3. **Control-panel parity is REQUIRED for the deadline.** A Lite quiz must drive through the same
   backend, machine and control page as a catalog quiz. **Verify end to end - build one, save it,
   open `#/control/<id>`, drive it - never assume.** The mechanism that should make this free is in
   `src/ai/AGENTS.md`: Lite compiles through the same `variant.create()` the wizard runs, so parity
   ought to follow by construction. "Ought to" is not a verification.
   **Verified 2026-08-09** on a lower third and on one graphic of every interactive type
   (`docs/CONTROL_PANEL_PARITY.md`): the mechanism does hold - `create()` is the wrapper that calls
   `attachMachine`, so the machine, its controls and its labels arrive whatever asked for the
   template. The obstacle to a Lite quiz turned out not to be the machine at all: `specToTemplate`
   slices lines to `variant.maxLines`, which is 1 on a compiled quiz against five declared line
   fields, so a Lite decision declaring any lines yields a board with four blank answers (§7 there).
4. **This consolidation happens before further Lite work.** Done: `src/ai/AGENTS.md` reordered and
   status-labelled, `docs/AI_ATTEMPTS.md` written, six docs parked.

## 3. The honest read on scope, and the recommended sequence

**All categories, plus mandatory control-panel parity, plus per-round gallery judging, is a large
two weeks.** Stated as a flag, not as a refusal - the scope is the owner's call and the work below
is planned for it in full. What makes it large is not the category count: it is that decisions 2 and
3 both bind *per category*. Every widening step needs frames read by a human and a control page
driven by hand, and that is the reviewer-fatigue constraint the loop in §4 is built around, not a
model constraint.

**Recommendation: sequence the INTERACTIVE categories first** - `quiz`, `poll`, `game-timer`,
`scoreboard` / `esports-score`, `starting-soon`. Two reasons, and the second is the one that
matters:

- They are the categories with real state machines and real operator events, so they are where
  decision 3 can actually fail. A lower third has one step and two fields; parity there proves
  almost nothing about parity for a quiz.
- **Failure in these categories is invisible until air.** A strap that is slightly wrong is visibly
  slightly wrong on the Finish step. A quiz whose reveal event never reaches the control page looks
  perfect in preview and fails in front of an audience. Test the ones that can embarrass a student
  live, first.

Static categories (`info-card`, `corner-bug`, `ticker`, `infographic`, `end-credits`, `frame`,
`alert`, `public-info`, `stream-notification`, `versus`, `matchup`, `results-board`, `reveal`,
`transition`, `audience`) follow, and are expected to be cheaper per category because they mostly
inherit the lower third's already-measured shape.

## 4. The loop

```
frozen brief bank  →  one round (~$0.010)  →  FRAMES READ BEFORE any gate output
   →  every rejection gets a MECHANISM and an OWNER
        model     →  remove the decision, or clamp it in the SCHEMA
        platform  →  a deterministic gate, or corrected metadata
        catalog   →  design work
   →  re-run
```

**The invariant: a defect leaves the list only when something makes it unrepeatable - never when a
prompt sentence says not to do it.** Three supporting rules, all learned expensively:

- **Attribute before fixing.** Rounds have twice read as "the model cannot design" and been platform
  bugs. A headline defect once looked like model taste and was three lines of catalog CSS.
- **Machine-usable is not a quality signal.** 18/18 with zero rule codes, alongside a five-line
  strap.
- **A pass COUNT is not a diagnosis - read the ledger's `rejection_reason`.** 29/30 was the score in
  four different rounds that failed for three different reasons, and the v13 fix was invisible in
  the count until the column named it. `ai_generations` grouped by `prompt_version` and
  `rejection_reason` separates a schema refusal from a semantic one; the runner's own tally cannot.

What makes the loop affordable is structural: **Lite's model writes no code.** Every failure is
either a *decision* (fixable by narrowing the schema - free, permanent, applies to every future
generation) or a *compile/catalog* issue (fixable once, for everyone). Nothing here is fixable only
by paying for a bigger model.

## 5. Build order

Each step is free unless marked. Steps 1-3 are the parity and instrumentation work that must be true
before widening; 4-6 are the widening itself.

1. **Verify control-panel parity end to end on a lower third. DONE 2026-08-09** - and widened to one
   graphic of every interactive type the catalog ships, driven field by field and event by event on
   `#/control/<id>`. **`docs/CONTROL_PANEL_PARITY.md` is the result**: parity holds structurally
   (every type's machine survives `variant.create()`, produces its declared buttons and greys them
   by the structural guard), and what was weak was the operator surface. Four defects fixed, four
   gaps left recorded there. Pinned by `e2e/control-panel-types.spec.ts`.
2. **Widen the field-paint drive past one state. DONE 2026-08-09.** `validation/fieldPaint.ts` read
   ONE state, which was safe only because Lite ships single-step lower thirds; measured against a
   catalog quiz it falsely reported the audience-percentage field unreachable. It now snaps through
   the machine's states and unions what each shows, stopping as soon as every field has been seen.
   **No longer a blocker on step 4.**
3. **Decide what a multi-state Lite decision even contains.** Today's schema describes a chassis,
   lines, palette and typography. A quiz needs steps and events. `docs/GOALS.md` records the shape
   this should take - a structured MACHINE stage spliced in deterministically, the way `designSpec`
   already works - and notes that **no generation path in the repo currently asks any model for a
   machine.** This is the single largest unknown in the plan and it is not a Lite-only problem.
4. **Widen to the interactive categories, one at a time**, each with a gallery round and a driven
   control page before the next starts. *(~$0.010 per round.)*
5. **Widen to the static categories**, batched where their shapes match.
6. **Then, and only then, consider the route.** With a scorecard that measures frames rather than
   compilability, run the open-weight candidates. *(~$0.010 per candidate.)*

Deliberately **not** on this list: the skin path, the vision judge, and any prompt rewrite. The
first two are server-flagged off and gated on the loop producing a trustworthy scorecard
(`docs/AI_ATTEMPTS.md`); the third is the least effective lever measured so far.

## 6. Open, and the owner's to decide

- **Anonymous access.** `ANONYMOUS_PLAN['ai.lite'] = false` puts spend behind an account. The
  per-user quotas (3 successes, 6 starts/day) are the real spend control and they key off a user id;
  an anonymous caller has no identity to bind to, leaving the $25/day fleet ceiling - a *budget*,
  not a limiter, shared with every other Lite user. **Recommendation if wanted: ship it behind a
  device-scoped quota first** (the audience plane's device-token pattern,
  `docs/INTERACTIVE_PLAYOUT_PLAN.md`), never on the fleet ceiling alone.
- **What "best effort" means at the deadline for a category that is not good.** Ship it, or switch it
  off? Decision 1 says best effort; it does not say which of those two a bad category gets.

## 7. Brand integration - a user's logo and colours in a Lite graphic

**Status: DESIGNED and FREELY MEASURED 2026-08-09, unstarted in code, no round paid for.** This
is the product promise the plan has never tested. v13 proved Lite can REPRODUCE a template;
nobody has ever asked it to ADD something, and "a channel's own graphic" is the whole difference
between this and a catalog browser.

### 7.1 What "coherent" means, as a claim a render can refute

Nine measurements, all taken off the painted frame, none inferable from the CSS. Thresholds and
their reasoning are `RULES` in `scripts/ai-lite-brand-audit.mjs`; the two that are borrowed
verbatim from `NoaCG-Brand-Kit/BRAND-MANUAL.md` are the lockup width and the clear-space idea.

1. **The slot exists** - a `filelist` field bound to an `<img id="fN">` that paints. (`no-slot-*`)
2. **The mark is painted at all** once a file is in it. (`not-painted`)
3. **Not distorted** - painted aspect within 2% of the source's. (`aspect-distorted`)
4. **Not cropped** - no `object-fit: cover`, no clip. (`cropped`)
5. **Big enough**: a crest-shaped mark >= 32px painted height, a lockup (>3:1) >= 96px painted
   width, at 1920x1080. The manual's own floors are 16px and 96px; the mark's is doubled because
   16px at 1080p is 1.5% of frame height. **Which dimension decides is the MARK's aspect** - a
   wide lockup dies on width long before it dies on height, and measuring only height is how a
   6px hairline reads as a pass. (`below-min-size`)
6. **Clear space** >= 0.25 x the mark's own painted height to the nearest painting neighbour,
   and never an overlap. (`clear-space`, `collision`)
7. **Placed, not floating** - inside the design's own `-box` and inside title-safe.
   (`outside-box`, `outside-safe-area`)
8. **Legible against the surface the slot actually paints.** Two different floors, because they
   are two different physical questions: a TRANSPARENT mark composites its ink onto the surface
   and can vanish (3:1, WCAG's non-text floor); a mark carrying its OWN field cannot vanish and
   can only fail to separate (1.5:1). (`ink-contrast`, `field-separation`)
9. **The accent came from the brand and the house amber did not survive it** - no painted colour
   within tolerance of `#f6a623` under a brand palette carrying none. (`house-accent-survives`)

Deliberately NOT claimed as measurable: whether the mark is in the *right* slot for the brief.
That is taste, it goes to the gallery, and pretending to grade it is how a bench passes a graphic
with a real clipping bug (§4).

### 7.2 The mechanism: the DESIGN declares the slot, the compiler fills it

**Decided. The model does not place the logo.** Its only logo decision stays the one it already
has - `useLogoSlot`, plus which chassis - and everything about where, how big, how clear and on
what surface is the design's own drawn geometry, measured and gated.

The evidence is three findings, in order of weight:

- **Lite cannot place a mark at all today.** All six audited chassis are `logo: 'none'`;
  `--lite` reports 30 of 30 `no-slot-field`. There is no model decision to improve, because no
  model choice reaches a slot that does not exist. The first work is catalog work.
- **The Pro re-diagnosis says the failure mode is arithmetic, not taste**
  (`benchmarks/pro/round-2026-08-08/DIAGNOSIS.md`, `src/ai/AGENTS.md`): the concept stage saw the
  design correctly, and the compiler rendered it at 0.72x, placed live text at 0.59x and
  re-bucketed the position into one of nine zones. A model asked to place a mark in coordinates
  would be handing its answer to the same class of arithmetic. A model asked to pick a design
  that already contains a drawn slot hands over nothing.
- **The slots that exist get it wrong in ways a model could not have fixed.** 14 of 65 pairs
  absorbed the mark; 0 of 13 chassis were clean on all five shapes; and **0 of 13 could carry a
  wordmark or a horizontal lockup at legible size**, which is what most real brands are. That is
  a drawing problem with a measurable target, not a prompting problem.

The cost of the decision, stated plainly: **placement stops being creative.** A brand graphic
will be a catalog design with the brand's mark in the slot its designer drew, not a composition
arranged around the mark. That is the same trade adapt-first already made and won
(`docs/ADAPT_FIRST_PLAN.md`), and the escape hatch is the same one: the way to place a mark
differently is to DRAW a design that places it differently, and let retrieval put it in front of
the model.

### 7.3 The free proof, and what it found

`node scripts/ai-lite-brand-audit.mjs` (+ `--lite`, `--all`, `--ids`, `--marks`, `--palette`,
`--check`, `--json`). Renders the real template through the real assembler with a real mark,
settles, and reads the frame back - the `lite-line-capacity.mjs` method turned onto geometry.
Spends nothing. The mark bank is authored SVG committed in `scripts/ai-lite-brand-fixtures.mjs`,
never an uploaded file, so the audit measures mark SHAPES rather than whatever somebody had.

Full round: **`benchmarks/lite/BRAND-AUDIT-2026-08-09.md`**. The three results that change the
build order:

- **No catalog lower third can carry a wordmark or a wide lockup.** 0 of 13, twice. The slots are
  near-squares of 52-140px; a 10:1 rail contains down to a 6-14px hairline.
- **The shared logo slot violates the platform's own as-is screen.**
  `templates/shared/logoSlot.ts` - inherited by every future `logo: 'optional'` design - puts a
  `border-radius` on the mark, and `lt08` adds `object-fit: cover`. `src/ai/assetIntegrity.ts`
  rejects exactly those on a picture the user marked "use it as it is". Two live contracts that
  have never met, because no path has yet sent a protected upload into a catalog slot.
- **The palette that fights a mark is chosen by the surface the SLOT paints**, not by the
  package's lightness. Nearly every logo well is painted in the accent, so a knockout mark on a
  "light package" was still landing on something dark and the contrast column came back clean.
  It took a pale-ACCENT brand to make the check fail. The audit's first run was wrong in the
  direction that flatters.

### 7.4 Build order, and none of it needs a model

Free unless marked. Each step ends with the audit re-run, so the next one starts from a number.

1. **Fix the two as-is violations** - the shared slot's radius and `lt08`'s crop. This is a
   contradiction between two shipped contracts, not brand work, and it lands whatever else does.
2. **Draw the lockup case.** A logo slot that can hold a 4:1 wordmark and a 10:1 rail is a
   different shape from a crest well: a horizontal band above or beside the text, sized on
   WIDTH. Until one exists, "bring your logo" is false for most brands. Target: at least three
   Lite-eligible chassis clean on all five mark shapes, verified by `--check`.
3. **Give the six Lite chassis slots** (or replace the ones that cannot take a mark coherently),
   and add the measured logo metadata to `LITE_CATALOG` - what mark SHAPES a chassis can hold,
   generated from the audit exactly as `supportingLineChars` is generated from
   `lite-line-capacity.mjs`. **An adjective is what a chassis may say only where nothing can
   measure it** (`src/ai/AGENTS.md`), and this is measurable.
4. **Only then, one paid round** over the eight briefs in `scripts/ai-lite-brand-fixtures.mjs`
   (five lower thirds servable today, three in categories §3 widens to). The schema change is
   expected to be nil-to-tiny: `useLogoSlot` already exists on the wire and the request already
   carries `hasLogo`. **No prompt version is minted until step 3's metadata exists** - a version
   bump whose only content is a sentence asking for better logo placement is precisely the lever
   §4 records as the least effective measured so far.

*(~$0.010 for a round of 8, at v13's $0.00034 per generation. Cost is not the constraint here and
was not the reason to stop; the reason to stop is that a paid round before step 3 would be
measuring six chassis that cannot hold a logo.)*
