# QG - GOALS.md inside its own cap, and gated

**Branch:** `claude/qg-goals-inside-its-cap` (queued). **Date:** 2026-09-16. **Model:** opus high.

## What landed

`docs/GOALS.md` is **190 lines**, down from 310, and `npm run build` now fails when it goes over the
cap stated in its own opening sentence. Two commits, deliberately one landing: the gate could not
arrive while the file failed it, and a condense with nothing measuring it drifts back - which it did
twice, 212 -> 284 -> 308 -> 310 in a fortnight.

- `scripts/check-goals-budget.mjs` - about sixty lines with the header, reading the number out of
  `**Keep it under 200 lines**` in GOALS.md's opening paragraph. `// gate: build`, discovered by
  `scripts/gates.mjs`, reports `measured(190, 'lines of docs/GOALS.md')`, `check:goals-budget` in
  `package.json`.
- `scripts/check-goals-budget.test.mjs` - six tests pinning the cases that would make it go quiet.
- The cap is now stated in exactly one place. `docs/README.md` (two mentions), `docs/PRODUCT_AND_MAP.md`
  and `docs/NORTH_STAR_2027.md` (two) point at that sentence instead of restating a number, and
  `.agent-workflows/orchestrator/coherence.md` no longer claims nothing measures it.
- `docs/backlog/goals-over-its-own-budget.md` deleted, per the graduate-or-die rule.

## The two things worth knowing

**190, not 199, and why.** `codex/ograf-studio-architecture-research` is in flight and inserts seven
lines directly under `## NEXT - OGraf-first`. That heading, its blank line and the whole "Ratified by
the owner 2026-08-29" paragraph are **byte-identical** to the fork point here - verified by diffing
them - so the insertion still applies, and it lands at 197 against a cap of 200.

**Nothing was deleted, only moved.** I checked this mechanically rather than by assertion: take the
roadmap as it stood, drop every line still in the live file, and look for each survivor in
GOALS_ARCHIVE.md, PROGRAMMES.md and VERIFICATION.md. My first attempt archived thirteen hand-picked
blocks and that check reported **104 substantive lines with no home**, including a live open item
("two ballot notes still unfixed belong in the re-run build"). So the archive now carries the whole
previous file verbatim under "Condensed out of the live file (2026-09-16)", and the check reports
zero. Two blocks additionally went to the doc that owns the subject: the **core question** to
`docs/NORTH_STAR_2027.md` §5 P2, and the **always-on quality bar** to `docs/VERIFICATION.md`, it
being a standing verification rule rather than a goal.

## What the condense actually decided

The roadmap holds the item and the link; the argument for it lives in its plan doc. That is what cut
120 lines, and it is a judgement somebody may want to revisit: the per-competitor reads, the owner
quotes behind the NOW items, the OGraf sequencing argument and the dashed-card device are all
recoverable from the archive if a future reader misses them. The `## THEN` section merged into the
parking lot, because both said "not now" and the programme register owns those four entries anyway.

## Check

- `review: delegated` (7 findings, 7 fixed). Scope-checked: the pass named base `0a5e3990` and only
  files in `review-request.mjs`'s list, which matches `git diff --name-only 0a5e3990..HEAD`.
  The findings were real, including two I would not have found: the cap regex rejected the `~200`
  wording the sentence carried until this branch (a restored tilde would have reddened every build
  with a message pointing away from the cause), and the core question had gone into the register,
  whose own header puts a programme's argument in `NORTH_STAR_2027.md`.
- `simplify: inline` - the skill returned fan-out instructions, so the pass had not run. Done here
  over the four angles. The one finding worth recording is a reuse/altitude question I answered NO
  to and wrote into the gate's header: `check-shared-instructions.mjs` already enforces a line limit
  through `MODULAR_WORKFLOW_LINE_LIMITS`, but that map holds the number in the script, which is the
  arrangement the original defect was about. Also dropped a `(ok ? console.log : console.error)`.
- `verify: inline` - `npm run build` exit **0**, read from the build's own exit code, log at
  `<scratchpad>/qg-goals-budget-build3.log` (uniquely named; a sibling read a neighbour's
  `build.log` as its own evidence today). 25 gates, 1736 tests, 0 failures. Both the gate and its
  tests ran inside that build. No e2e: no product code changed.
- `taste: not applicable` - nothing here can move what a graphic looks like.
- Fail-closed proven by hand, both ways: at 201 lines it exits 1 naming the count and the cap; with
  the sentence reworded it exits 1 saying the budget is no longer stated, rather than defaulting.

## Next

Nothing is owed. If the file creeps back the gate is the alarm, so the next signal to watch is not a
line count but whether anyone raises the cap: that is now a visible edit to the roadmap's own first
paragraph rather than a silent drift, which was the whole point.
