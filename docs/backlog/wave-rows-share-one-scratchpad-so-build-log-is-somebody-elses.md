# Wave rows share one scratchpad, so `build.log` is somebody else's build

**Filed:** 2026-09-16. **Source:** hit during row QE (`codex/qe-package-json-merge-driver`).

## Why

A wave row's scratchpad path is keyed to the PARENT session, not to the row:

    .../Temp/claude/C--claude-NoaCG-Studio--claude-worktrees-new-session-747c83/<id>/scratchpad

Every row the orchestrator launches from one session lands in the same directory. The tool prompt
calls it "session-specific, isolated from the project", and for the parent session it is. For a row
it is shared, and the sharing is invisible - nothing in the path says so.

That collides immediately, because the contract tells every row to write its build somewhere and
read the exit code back:

    npm run build > log 2>&1; echo $?

so every row picks the same obvious name. During row QE the directory held `build.log`,
`build1.log`, `build2.log` and `build3.log` within twenty minutes, from at least three rows, plus
another row's `wave-plan.md`, `MapSvgFieldsStep.before-behaviour.tsx` and two scratch git repos.

**The failure is silent and it points the wrong way.** QE ran `npm run build`, read `EXIT=0`,
then read `build.log` back to confirm its new gate had run - and the file had been replaced by a
different row's build of a different branch. It showed the gate missing and an unrelated
`check:copy FAILED`, on a run that was in fact green. Ten minutes went into investigating a failure
that belonged to another branch, and the same read could just as easily have gone the other way: a
row whose gate really did fail, reading a neighbour's green log and reporting a pass. The exit code
was the honest half, and the exit code is the half that carries no detail.

This is the same family as `root/read-build-own-exit-code-never` (a pipeline's status is not the
build's). The rule there is about reading the wrong STATUS; this is about reading the wrong FILE.

## What it would take

Small. Two candidate fixes, either or both:

1. **Name the artefact after the branch**, not after the step: `<branch>-build.log`. One line in the
   verification contract and in `.agent-workflows/check.md`, which is where a row learns the
   command. This is what QE did after being burned, and it is free.
2. **Give a row its own scratchpad**, keyed to the row's own session or worktree rather than the
   parent's. That removes the class instead of naming around it, and it also stops one row's scratch
   git repositories and half-written fixtures from confusing another.

Worth recording through `npm run learn` rather than as prose, so it reaches a row before it writes
the log rather than after. It was NOT recorded that way from row QE because a rule with no file
scope lands in the kernel contract, which every session pays for on every turn, and that trade is
worth a deliberate look rather than a drive-by from a merge-driver branch.

## Evidence

- The directory listing during row QE: `build.log`, `build1.log`, `build2.log`, `build3.log`,
  `e2erepo/`, `stalerepo/`, `wave-plan.md`, `cut-fonts.mjs`, `MapSvgFieldsStep.before-behaviour.tsx`
  - none of the last five written by QE.
- `build2.log` showed `[gates] 1 check(s) failed: check:copy`, while `npm run check:copy` in QE's
  own worktree passed with 782 files scanned and 530 baseline rows.
- The same file showed no `check:package-merge` line, while the gate was registered, discovered by
  `gates.mjs` and green in QE's own run.
