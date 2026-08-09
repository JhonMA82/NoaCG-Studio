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
| Cost | **$0.00032 per generation** - about 3% of the ~€0.01 ceiling. **Not a constraint** |
| Reliability | 27 of 30 briefs machine-usable on the last measured round |
| Scope today | lower thirds only, six audited chassis |
| The open problem | **quality**. Machine-valid is not good, and nothing has yet judged good |

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
frozen brief bank  →  one round (~$0.005)  →  FRAMES READ BEFORE any gate output
   →  every rejection gets a MECHANISM and an OWNER
        model     →  remove the decision, or clamp it in the SCHEMA
        platform  →  a deterministic gate, or corrected metadata
        catalog   →  design work
   →  re-run
```

**The invariant: a defect leaves the list only when something makes it unrepeatable - never when a
prompt sentence says not to do it.** Two supporting rules, both learned expensively:

- **Attribute before fixing.** Rounds have twice read as "the model cannot design" and been platform
  bugs. A headline defect once looked like model taste and was three lines of catalog CSS.
- **Machine-usable is not a quality signal.** 18/18 with zero rule codes, alongside a five-line
  strap.

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
   control page before the next starts. *(~$0.005 per round.)*
5. **Widen to the static categories**, batched where their shapes match.
6. **Then, and only then, consider the route.** With a scorecard that measures frames rather than
   compilability, run the open-weight candidates. *(~$0.005 per candidate.)*

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
