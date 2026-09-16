# TJ - the legibility check can see a slab it did not paint itself

Branch `claude/tj-legibility-sees-pseudo-element`. Worktree `agent-a139197abd46ffbe8`.

## What landed

TC's defect reproduced exactly before a line was changed: `noacg validate` warned twice that the
HOME and AWAY names on the Match Strip scoreboard sit over the picture with no panel, while the
chassis paints an opaque near-black slab on `.scoreboard-box::before`. `resolveBacking` walked
only real DOM ancestors, so every one of them read transparent.

It was never one design. Over the whole catalog at 1920x1080: **158 of 502 designs carried that
warning and 22 were wrong about it** - the scoreboard, three quiz boards, the poll, the whole
audience family, five info cards, two lower thirds, two infographics, a frame and a game timer.

`resolveBacking` now reads each ancestor's `::before` and `::after` too, and counts one as a
backing only when it generates a painted box, is absolutely positioned inside a positioned host,
sits on a NEGATIVE layer, has nothing but translations between its host and the root, and its
painted quad - corner rounding inset, its own 2D transform applied - covers the whole text rect.
The function header argues each condition; the negative-layer one is the load-bearing one,
because an out-of-flow pseudo on layer 0 paints OVER the words and accepting it would score a
hidden line as perfectly legible.

A second defect, found while walking the acceptance route and fixed here:
`checkTemplateLegibility` waited on an uncapped double `requestAnimationFrame`, which a hidden or
backgrounded page throttles to never. The export panel silently rendered an empty warnings list -
indistinguishable from a graphic with nothing wrong. Both waits are capped now, and
`markLegibility.ts` got the same cap, since its header says it is the recipe this one follows.

## Evidence, and how to re-derive it

Everything below is a measurement, not a reading of the code.

- **Walked in the running app**, not only measured. Match Strip through Browse -> Finish ->
  Export shows no warnings; **Frost Score** (sb04, a scoreboard with no slab) through the
  identical route shows both amber `legibility-protection` rows. That control is what proves the
  check did not simply go quiet, and it is step 3 of the owner-queue item.
- **The test goes red without the fix.** All of `scripts/legibility-backing.test.mjs` fails
  against the unfixed check, with TC's exact warning text. Re-derive by putting
  `git show origin/main:src/validation/readabilityCheck.ts` back and running the file.
- **Catalog sweep, before and after**, 502 designs settled and measured: 529
  `text-unprotected-over-video` findings -> 456, 22 designs cleared, **0 newly warned, 0 new
  blocking contrast failures, 0 lost**. 138 designs across 17 categories still carry the warning,
  so the gate is a long way from blind.
- **Both product poses measured separately**, because they are different documents: the export
  panel composes and leaves the graphic alone, the runtime bench behind `noacg validate` settles
  it first. On the panel's document those 22 designs drop from 75 warnings to 3.

## What is left, and why

**One item is filed rather than fixed:
`docs/backlog/a-translucent-panel-is-measured-as-if-it-were-solid.md`.** The code-review leg
found that `resolveBacking` hands a translucent backing's raw RGB to `contrastRatio` as if
nothing showed through it - and every one of the fourteen curated palettes has a translucent
`--panel-bg` (0.86-0.96 for most, 0.55 for the two cinematic ones). On `noir`, white caps on a
55% scrim are reported at about 21:1 and read at about 4.8:1 over a bright shot.

I implemented the fix, measured it, and **took it back out.** Two reasons, both measured:

1. **It is not this row's bug.** The same sweep shows the pseudo-element change moved none of the
   affected designs - identical warning counts and identical resolved-backing counts - because
   every one of them takes its backing from an ordinary ancestor element. The over-claim lives on
   the element path and predates pseudo-elements being read at all.
2. **It turns 14 shipped designs red on a BLOCKING rule**, from 5 blocked to 19, all of them dim
   supporting text landing between 2.76:1 and 4.46:1. The owner ratified in 2026-08-19 that the
   catalog stays shipped and simply warns. Deciding those 14 should start failing the AI iterate
   loop is a severity ruling, and a false-positive fix is no place to smuggle one in.

The backlog file carries the four-line patch, the 14 ids with their worst readings, and the
smaller variant worth weighing against it.

## Traps worth carrying forward, in no repo file

- **A screenshot is not available while the Claude window is hidden**, and `javascript_tool` will
  time out on anything awaiting `requestAnimationFrame` there. That is what exposed the second
  defect, and it will bite the next session that tries to witness a UI change from a wave row.
  Reading the DOM (`document.querySelectorAll('.issue.warn')`) works regardless and is what I
  used before the screenshots would draw.
- **`withBundledPage` in `scripts/catalog-emit.mjs` is the cheap browser harness** - rolldown
  bundles any `src/**.ts` entry onto a blank Chromium page, no dev server, about two seconds. It
  is how this row measured 502 designs twice without touching a port. `use-case-search.test.mjs`
  is the pattern.
- **To bundle an OLD copy of a module for a before/after comparison, it must sit in its own
  directory**, or its relative imports will not resolve. `src/validation/readabilityCheckOld.probe.ts`
  was the throwaway; delete it before building, because `tsc` and `eslint` will happily pass it.
- **Frost Score (sb04) is the control** for anything touching this rule: `frost` palette,
  `--panel-bg` at 0.10 alpha, below the 0.5 threshold, so it resolves no backing and warns
  honestly. Match Strip and Frost Score together are a one-minute both-directions check.

## Nothing here needs the owner

`docs/acceptance/owner-queue/2026-09-16-tj-legibility-sees-pseudo-element.md` is filed as `agent`
with the route and the control. The one open judgement is the backlog item above, and it is a
question for whoever schedules it, with the numbers already in the file.
