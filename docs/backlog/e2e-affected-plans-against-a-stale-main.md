# `e2e-affected` plans against the local `main` ref, which the merge queue no longer moves

**Filed:** 2026-09-15. **Source:** measured while verifying `codex/hd-show-profile` (row HD).

## Why

`npm run test:e2e:affected` is how a branch decides which specs to run, and it takes its default
base from the merge-base with the LOCAL `main` ref. Nothing moves that ref under this project's
merge queue, so the plan covers every branch that has landed since it was last updated rather than
this branch.

It fails in the EXPENSIVE direction, not the silent one - it over-reports, so it escalates. That is
why it has not been caught: a full suite passing looks like thorough verification rather than like
a mis-scoped plan. The cost is real on this laptop, where one browser job runs per machine and the
box is RAM-bound: a branch that needed three specs is told to run the whole suite plus the catalog,
which is the difference between a two-minute walk and an hour. A gate expensive enough to skip is a
gate that gets skipped.

This is the same defect `scripts/review-request.mjs` exists to prevent for code review, written up
in `docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md` - ten discarded review passes
between 2026-08-29 and 2026-09-09. Fixing it in one planner and leaving it in the other is how the
second one keeps costing.

## What it would take

Take the base from `origin/main` the way `review-request.mjs` does, and refuse rather than fall
back when neither ref resolves. Check `--integration`'s fork-point path for the same assumption,
since it derives from the same base. Add a case to `scripts/e2e-affected.test.mjs` pinning that the
base comes from `origin/main` and not from the local ref - the existing tests cannot see this,
because they never make the two refs disagree.

Small: one base computation and its test. The value is entirely in the test, because the bug is
invisible on any machine whose local `main` happens to be current.

## Evidence

In `C:\claude\NoaCG-Studio\.claude\worktrees\agent-a974c8ebb53f6e0e1`, branch
`codex/hd-show-profile`, 2026-09-15:

- local `main` = `7e4b50aadf1feed394b0c71850c4e28840413542`
- `origin/main` = `1179e33147edea70cbd75e58129e792a2630496f`
- `node scripts/e2e-affected.mjs --list` printed
  `core/unmapped change detected - running the FULL suite (101 changed files)`, and named
  `scripts/e2e-affected.mjs` and `scripts/e2e-lists.mjs` among the unmapped files. The branch had
  touched neither.
- `node scripts/e2e-affected.mjs origin/main --list` printed the correct `7 changed files`.

The branch had changed exactly 7 files, confirmed by
`git diff --name-only 1179e331..HEAD`.
