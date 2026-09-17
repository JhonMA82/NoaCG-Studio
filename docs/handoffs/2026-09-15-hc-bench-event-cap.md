# The bench walks arrows now - what that cost, and what it found

AC-3 holds. The bench presses one arrow per (from-state, event) pair, snapped to that arrow's own
from-state first, up to 24 arrows, and names what it left as `bench-events-skipped`. A reported
field no longer raises `bench-field-unpainted`. Measured on the proof case's totals board: **8 of
22 arrows pressed before, 22 of 22 after**, and the whole bench run went **2.6 s -> 4.5 s** inside
a 15 s cap.

## What is left, and why

- **Nothing of AC-3.** The three weaknesses HA named are closed and each has its own test.
- **The catalog calibration tripwire did not run on this laptop, and CI is where it runs.** It is
  the gate the bench's own contract demands after a bench change ("a bench change that fails the
  catalog is a bench bug, not a catalog bug"), it is a four-worker suite priced at a full suite,
  and the box never cleared the queue's 4.0 GB floor tonight - two queued attempts, cancelled
  rather than waited on. `ci.yml` runs `npm run test:e2e:catalog` whenever the plan raises the
  catalog flag, and `node scripts/catalog-affected.mjs` on this branch plans the FULL catalog
  (`runtimeBench.ts` and `animMachine.ts` are shared machinery), so the pull request carries it.
  **If that job goes red, it is this branch's bug, not the catalog's.**
  What DID measure the risk locally: a one-off run benching every machine-bearing family
  (quiz, poll, audience, reveal, scoreboard, results-board, matchup) - **108 variants, 0
  failing**, slowest `qz01` at 2.7 s with 12 arrows, against a 120 s per-slice timeout. The
  spec was scratch and is not in the branch; re-create it from this paragraph if the CI job
  disagrees.
- **The ceiling is a number, not a doctrine.** 24 fits today's largest real machine (22) with air.
  If a graphic ever needs more, `MAX_BENCH_ARROWS` is one constant and the comment above it
  carries the arithmetic to redo.

## Evidence and traps that exist in no repo file

- **A finding's phase words are the only honest record of what the bench pressed, and they are
  written BEFORE the dispatch.** So a test that asserts "a finding names the X event" proves the
  phase ran, not that X fired - a guarded-out event leaves the label standing over the pose that
  was already on screen. Every test here is built around that: the totals board is broken so every
  frame collides and the phase set IS the press set, and the votes board's added arrow reveals an
  element that is invisible in every other state, so a finding naming `.vb-alarm` can only come
  from a press that really entered the state.
- **The shipped votes board cannot show the left-state defect, and that is not a fixture problem.**
  Its one arrow (`reveal`, out of `votes`) is also the arrow `next()` follows, so the walk paints
  `revealed` on its way through and the dropped dispatch costs nothing observable. The defect needs
  a second arrow out of a state the walk leaves, which is why the test splices one in.
- **`AnimStep.ease` is required and its absence fails SILENTLY through the serializer.**
  `serializeStep` writes `"ease": ${JSON.stringify(step.ease)}`, and for `undefined` that is the
  literal text `undefined` - the NOACG_ANIM block stops being JSON, `parseAnimData` answers null
  for the WHOLE data, and a graphic with a hand-written state timeline quietly has no machine at
  all. It cost a test round here. Anything that builds an `AnimStep` in code should set `ease`.
- **`serializeGroup` SORTS a group's transitions**, so the order arrows are appended in is not the
  order they come back in. A test that pins "the 25th arrow" by construction is wrong; read it off
  the machine.
- **Stripping `class="noacg-data-source"` to test the exemption also UNHIDES the holder** on any
  graphic whose stylesheet hides it by that class - which the votes board's does
  (`.noacg-data-source { display: none; }`). The first cut of that test passed vacuously: the
  value was then genuinely painted, so the check correctly said nothing. Put the hiding back by
  hand, the way the game-timer test beside it already does.
- **Two boxes only collide if they share a containing block, and the entrance leaves an inline
  transform on the root.** A `position: fixed` element inside the root is then positioned against
  the root, not the viewport, so a fixed element added outside the root will never overlap one
  inside it. The test parks its element off-canvas instead, which needs no such agreement.
- **`node scripts/jobs.mjs add` takes the command FIRST and `--cost` after it.** The flag-before-
  command form prints usage and adds nothing, silently enough to look like a queue that refused.
  A single-spec run declared at `--cost 0.5` admits at a 2 GB floor instead of 4 GB, which is the
  difference between running and waiting an hour on this laptop. Four runs of one spec waited out
  the full-suite floor here before the cost was declared.
- **`scripts/e2e-affected.mjs` reports this branch as 77 changed files**, because its base is the
  local `main` that the merge queue no longer moves - the same stale-base trap
  `docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md` records for the review path,
  in a second script. It only ever over-includes (it fell back to the full suite), so it is safe
  in the direction that matters, but a reader comparing its file count against
  `review-request.mjs`'s eleven will think one of them is broken.

## Anything that needs the owner

Nothing blocking. `docs/acceptance/owner-queue/2026-09-15-bench-walks-every-arrow.md` is the route
and the numbers.

One thing is his to notice rather than answer: this closes the question HA left open in
`2026-09-15-skill-teaches-authored-machines.md`. A reported field's `bench-field-unpainted` warning
is EXEMPTED rather than taught as expected, because the shape raising it is the shape the skill
tells every agent to write, and a warning on the house's own pattern trains agents to ignore the
rule. The exemption is narrow: `ftype: 'hidden'` AND `class="noacg-data-source"`, both halves, with
the mutation test to prove either half brings the finding back.

## What the check changed

Seven review findings, six acted on. The three that mattered: a press was still made blind when a
template had no machine globals at all (the readback is now strict, so an arrow the bench cannot
stand in front of is always named), arrows past the ceiling could crowd genuinely unreachable ones
out of the capped message (the unreachable ones sort first), and a throwing `update()` produced one
`bench-runtime` error per arrow (`call` now reports the throw and the re-drive stops). Two new
guards came with them: the catalog's largest machine is measured against the arrow ceiling the way
it already was against the state cap, and taking `noacgMachineState` away is pinned as its own
mutation. `allOperatorEvents` is now the arrow list folded by name, which is what it always was.

The seventh is filed rather than fixed:
`docs/backlog/the-bench-reports-one-layout-defect-once-per-press.md`. One defect in a shared pose
is now reported once per press - 24 copies at worst where it used to be 8 - and the fix is a
finding-collapse policy for the whole bench, which ripples past this branch.

## Pointers

- Commits: see `git log claude/hc-bench-event-cap` - the arrow walk and its tests, then the check
  commit.
- Check stamp: `npm run stamp` on this branch - review `delegated` (7 findings, 6 fixed),
  simplify `inline`, verify `inline`, taste `not applicable`.
- Spec: `docs/work-specs/control-panel-any-graphic/spec.md` AC-3 (met). Plan:
  `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §2c gate 3, §3d finding 1.
- The walk itself: `src/validation/runtimeBench.ts` (the branch-states block) and
  `allOperatorArrows` in `src/blocks/animMachine.ts`. The exemption:
  `src/validation/fieldPaint.ts` `declaredInputOnly`.
- Tests: `e2e/lite-field-paint.spec.ts`, the last two describe blocks (eight tests, 16 in the file).
  Verified through the queue at `--cost 0.5`: 16 passed. `npm run build` green. The full e2e
  suite and the catalog tripwire are CI's, per the paragraph above.
- The skill's own text: `cli/skill/noacg-graphic/references/contract.md` §5a gate 3 and
  `references/validator.md`; the generated copies follow from `npm --prefix cli run build`.
