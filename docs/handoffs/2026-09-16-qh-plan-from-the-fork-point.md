# 2026-09-16 - the CI fix this row was given already existed, so the prose around it is what changed

Branch `claude/qh-plan-from-the-fork-point`. The row asked for a change to `ci.yml`'s plan step:
for a push, plan from `git merge-base origin/main HEAD` instead of `github.event.before` when no
finished run exists for `before`. **That change is in `ci.yml` already, it landed on 2026-09-06 in
`b76a70cd`, and it is stronger than what the row specified.** So the code is one comment longer and
everything else here is the repository catching up with it.

## The decision, and why

Building the row as written would have been a regression. The shipped rule applies the merge-base
to EVERY branch push, unconditionally. The specified rule applies it only when no run for `before`
reached a verdict, which can do exactly one thing the shipped rule does not: hand the base back to
`before` in the case it judges safe. `before` is a descendant of the merge-base, so that plans
strictly less - and it pays a `gh run list` on the critical path of every branch push to buy the
narrowing. There is nothing for the condition to win, because the merge-base is already the honest
answer when the earlier run did finish. `ci.yml` now carries that argument where the block is, so
the next reader does not re-derive it. The comment is the only change to the file.

**The run the row cited as proof is the fix working.** Run 34574967445 on
`claude/night-transcript-liveness` is real, it does show `CI gate` success with every shard skipped,
and it did follow a cancelled run by 54 seconds. Its plan step says
`Measuring from the merge-base with main, dbcc88b9` and
`plan: {"mode":"none","specs":[],...,"changed":2}`. The two files in the whole branch diff were
`.agent-workflows/orchestrator/night.md` and a handoff. Skipping every shard was correct.

**Measured rather than argued, because one run is not a class.** Of the 158 branch push runs of
`ci.yml` in the week to 2026-09-16 (76 branches), 12 were green straight after a cancelled run on
the same branch, and 4 of those ran no E2E shard. All 4 measured from the merge-base and planned
`mode: none`; their diffs were documentation, handoffs, `.gitignore`, and scripts the application
never loads (`scripts/playout-lag-bench.mjs`, `scripts/review-request.mjs`, `scripts/dev-worktree.mjs`).
No false green. That turns the 2026-09-15 figure the backlog file carried - 8 shard-free runs out of
28 green-after-cancelled, explicitly an upper bound on false greens - into an answer of zero.

## What changed

`.github/workflows/ci.yml` gains thirteen comment lines and no behaviour. `warn-command.mjs`, the
predicate behind it, `docs/VERIFICATION.md` and `docs/WORKFLOW_ARCHITECTURE.md` all described the
retired mechanism as current; they now describe what ships. The two backlog files are deleted, per
`docs/backlog/README.md` - landed is not a state.

The notice itself was the worst of it. It told every reader that the replacement run "plans from
`<old tip>` only (github.event.before)" and that "nothing that FINISHED covers the earlier delta",
then sent them to `gh workflow run` for a full suite. Both claims had been false for ten days, and
the advice costs nine shards each time it is taken.

## What the check found, and it was right

The code review caught a real overstatement in the replacement text. `ci.yml`'s concurrency group
is `ci-${{ github.ref }}` with no event in the key, and `cancel-in-progress` is on for any non-main
run, so **a push cancels an in-flight `workflow_dispatch` too**. A dispatch has no diff base and
runs the full suite; the push run that replaces it plans from the merge-base, which is genuinely
narrower. My text said "cannot be narrower than the run it replaced" without qualification, and it
told that session not to re-dispatch - which would throw away the override they had just bought.

The runs are now fetched with their `event` and the message says the opposite thing in each case.
The message moved into `scripts/command-match.mjs` and gained a test pinning the two apart, because
that module exists exactly for this (a hook reading stdin at module top level cannot be imported),
and shipping a replacement claim that nothing checks would have repeated the failure this branch is
about. The concurrency defect itself is left where it was already filed,
`docs/backlog/ci-concurrency-group-per-event.md` - fixing it means changing how every branch in the
repository cancels runs, and that is its own row with its own evidence.

Deleting `ci-run-cancellation-hides-skipped-shards.md` was questioned in review, because it asked
for something the merge-base fix does not deliver: a machine-read answer to "did the run covering
this commit execute its shards", for the landing queue. I kept the deletion. After the fix a
shard-free push run is the plan being believed rather than a hole, so run conclusion is a sound
verdict for a branch's own diff and the queue needs nothing more. Its trend numbers are preserved
in `docs/VERIFICATION.md` rather than lost with the file.

## Step 7 - what proving it on this branch actually showed

Three runs, all read by job list rather than by colour.

- Run `35083717103` for `e0dc165e`: cancelled by the second push, which is the scenario.
- Run `35083743402` for `c3cb0379`, the replacement: `CI gate` success, planned from base
  `f1b90e55` - the merge-base this worktree computes locally - and reported `changed=9`, which is
  both commits' files, not just the second push's six. **That is the property under test: the
  replacement covered the delta the cancelled run owed.** `mode: none`, so zero shards ran, and
  correctly, since all nine paths are `.github/`, `docs/` and `scripts/`.
- Run `35084162639`, a dispatch on the same tip: **9 shards ran, `CI gate` success.** The row asked
  for proof that shards actually run, and this branch's own diff cannot produce a plan that runs
  any, so the escalation path was exercised deliberately instead. It also proves the edited
  `ci.yml` drives a full suite to green.

The rewritten notice fired on the real push, with its corrected text, before any of this was read.

## What is left

Nothing on this branch. Two things for whoever picks them up.

`docs/backlog/ci-concurrency-group-per-event.md` is now the only live part of this story, and the
notice's dispatch branch is the interim answer to it.

The routing lesson is in `docs/MISTAKE_TRIGGERS.md` under the 2026-09-05 read: a mistake's entry
records where the answer went, and the answer can move. When a fix lands upstream of a hook, the
hook's header, the contract prose and the backlog file are all wrong at once, and **nothing in this
repository fails when they are**. That is what minted this row on a false premise, and it is a
mechanism-shaped gap rather than a rule - a backlog file describing a fix that has landed, and
contract prose describing a workflow that has changed, are both detectable in principle and
detected by nothing today. Not designed here, deliberately.

Nothing here needs the owner.
