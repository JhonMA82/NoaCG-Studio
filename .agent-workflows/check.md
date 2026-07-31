# check - review, simplify, then verify the current branch

Shared canonical procedure for the `check` workflow - invoked as `/check` in Claude Code,
`$check` in Codex.

One command that runs the pre-merge quality chain over the work on the current feature branch:
a bug-hunting code review, a behavior-preserving simplification pass, and the repo's
verification gate. The order and the single verification run at the end are deliberate:
review comes before simplify so the pass doesn't polish code a bug fix is about to rewrite,
and the build/e2e gate runs once over the final state instead of after every phase.

An optional argument narrows the focus (a path, an area, a concern); with no argument the
scope is the whole branch diff.

This workflow edits the working tree of the current feature branch and nothing else. It never
merges, pushes, or touches `main` in any way - if invoked while sitting on `main`, branch
first before changing anything, exactly as the repo's Git rules require.

## 1. Scope - compute once, reuse in every phase

- The scope is what this branch changed: `git diff $(git merge-base main HEAD)` plus any
  uncommitted changes (`git status --porcelain=v1`). Compute it once; all three phases work
  from this same changed set. Do not review or simplify code the branch did not touch.
- If the diff is empty and the working tree is clean, report "nothing to check" and stop.
- Before editing, read the nested `AGENTS.md` contracts covering the touched areas - review
  findings are judged against them, and a "simplification" that violates one is a bug.

## 2. Review - bugs first

Goal: find and fix real defects in the changed code before polishing it.

- If the tool provides a dedicated code-review capability, run it scoped to this branch's
  diff (Claude Code: the code-review skill; Codex: its review mode). Otherwise review the
  diff directly for correctness, edge cases, race conditions, and violations of the binding
  contracts in the relevant `AGENTS.md` and docs.
- Verify every finding against the actual surrounding code before acting on it - a plausible
  finding is not a confirmed one, and fixing a non-bug introduces churn at best.
- Fix confirmed defects now, in the changed code. A real pre-existing bug outside the diff is
  reported, not silently fixed - it belongs in its own change.

## 3. Simplify - a behavior-preserving quality pass

Goal: leave the changed code simpler than the review left it, without changing what it does.

- If the tool provides a dedicated simplification skill (Claude Code: the simplify skill),
  run it scoped to the same diff. Otherwise pass over the changed code for: reuse of existing
  helpers instead of new near-duplicates, dead or unreachable code, needless indirection or
  abstraction, and comment/naming/idiom drift from the surrounding house style.
- Behavior-preserving only. A cleanup that would ripple into unchanged code stays a report,
  not an edit.
- If neither review nor simplify changed anything, say so - verification below still runs,
  because the branch itself has unverified changes.

## 4. Verify - once, at the end

- `npm run build` (typecheck + lint + build) - the CI gate. The tree stays lint-clean; fix
  findings properly rather than adding eslint-disable comments.
- If product code changed, `npm run test:e2e:affected` - it maps the changed files to their
  covering specs and raises the catalog tripwire itself when relevant.
- If the behavior is observable in the browser, observe it per the root `AGENTS.md` - never
  mark the check done on a green build alone.
- On a failure: fix, re-run the failing gate, and finish with a full green pass. If a fix
  would exceed this workflow's scope, stop and report the failure honestly instead.

## 5. Commit and report

- If the check produced changes and verification is green, commit them to the **feature
  branch** with a message that explains the actual change and reads as human-written - no
  chat/session language, no agent or AI mentions, never a `Co-Authored-By` trailer.
- Report per phase: what review found and fixed, what simplify changed (or that nothing
  needed it), which verification gates ran and their results, and anything deferred as
  out of scope. Then **stop** - landing on `main` is the user's call, via safe-merge.
