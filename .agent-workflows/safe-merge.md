# safe-merge - safely merge a branch or worktree into main

Shared canonical procedure for the `safe-merge` workflow - invoked as `/safe-merge` in Claude
Code, `$safe-merge` in Codex. Cross-references to other workflows below use their plain names
(e.g. "the cleanup-worktrees workflow"); translate as `/cleanup-worktrees` in Claude Code,
`$cleanup-worktrees` in Codex.

Safely merge a branch or worktree into `main`. Do NOT just print git commands for the user
to run - execute each phase yourself, report what you find, and stop whenever reality
disagrees with the happy path.

Branch to merge: the argument given at invocation, if any (if empty, detect it in Phase 1 and
confirm with the user before merging).

This workflow carries standing permission to update and push `main`, so it runs **only on an
explicit user invocation**. There are exactly two of those:

- the user typed the command themselves (`/safe-merge` in Claude Code, `$safe-merge` in Codex);
- **the user SELECTED this workflow from a pick the next workflow offered** for a named branch.
  A pick is a decision the user made about a specific branch, not an inference - so it is a real
  invocation and must be honoured by running this procedure, not answered with "type the command
  yourself". It authorizes exactly the branch named in that option, for that turn only.

Everything else is still forbidden: never infer invocation from a general request to inspect,
review, or discuss a merge, from work merely looking finished, or from a pick that was about
something else.

Note for Claude Code: the `/safe-merge` adapter sets `disable-model-invocation: true` on
purpose, so the model can never invoke this workflow as a tool of its own accord. That flag stays.
Acting on a user's pick means reading `.agent-workflows/safe-merge.md` and following it directly -
the user has invoked it, and the adapter is only a pointer to this file anyway.

## Repo layout (this project)

- `main` is normally checked out at the repo root (`C:\claude\NoaCG-Studio`) - but never
  ASSUME it is; determine where (and whether) `main` is checked out from `git worktree list`
  every run.
- Feature worktrees commonly live under `.claude/worktrees/<name>` on `claude/*` or `codex/*`
  branches, but paths and prefixes are never safety signals.
- The verification gate is `npm run build` (typecheck + lint + build) **and**
  `npm run test:e2e:affected` - both, every time. `build` alone is not enough: it does not
  run a single e2e spec, and on 2026-07-30 four template packs landed in a row that each
  passed it while leaving `main` red for two hours on `catalog-baseline.spec.ts`. The
  affected run maps the branch's own diff to the specs that cover it (and raises the catalog
  calibration gate when the catalog moved), so it costs minutes on a normal branch rather
  than the whole suite - which is what made "just run build" tempting in the first place.
- Standing permission exists to push verified work to `origin/main`.

## Hard safety rules (never break these, even if asked mid-flow)

- Never `push --force`, never `reset --hard`, never delete a branch that isn't fully merged.
- The source must resolve to one exact local branch (`refs/heads/<branch>`), must not be `main`,
  and must be checked out in one known worktree. Never accept a remote ref, revision expression,
  tag, detached commit, or argument beginning with `-` as the source branch.
- Update `main` only with `git pull --ff-only`; the final merge into `main` is
  `git merge --ff-only` (see Phase 4). Git itself must refuse any unexpected non-fast-forward.
- **Local `main` vs `origin/main` before the requested merge (`MAIN_SYNC` rule):**
  - **Diverged** (each has commits the other lacks): hard STOP. Show both sides
    (`git log --oneline origin/main..main` and `main..origin/main`) and let the user decide.
  - **Ahead only** (local `main` has commits origin lacks, but is not behind): STOP and
    require explicit confirmation. Show `git log --oneline origin/main..main` and explain that
    the final push would also publish these pre-existing local-only commits, not just the branch.
- Never assume the repo root is on `main` merely because it is the usual main checkout
  location. If `main` is checked out nowhere, follow the Phase 1 "main not checked out"
  procedure - never switch, reset, stash, discard, or overwrite anything on a hunch.
- Never stash or discard uncommitted changes without explicitly asking first.
- Never merge with a dirty source or target worktree. If either is dirty, stop and let the user
  decide how to preserve that work outside this workflow.
- If a merge hits conflicts you are not confident resolving, `git merge --abort` and
  report the conflicting files rather than guessing.
- Never delete a branch, and never remove a worktree you did not create in this run. Cleanup
  is out of scope for this workflow - the cleanup-worktrees workflow owns it and runs from the
  primary `main` checkout, where removal actually works. The single exception is the TEMPORARY
  worktree this flow may create for a branch that has none (Phase 1, "If the source branch has
  no worktree"): the run that created it removes it in Phase 5, and it may never remove any
  other. It is identified by the `safe-merge-` name prefix AND by having been created in this
  run - a pre-existing folder with that prefix belongs to someone else and is left alone.
- Never touch other worktrees' work. Merge only the ONE requested branch; its merge brings
  in only that branch's commits and must never overwrite or discard work living on other
  worktrees' branches. Do not `git checkout`/`switch`/`restore` files across worktrees, and
  never run a destructive command (`reset`, `clean`, `checkout -- .`) in any checkout.

## Phase 1 - Assess - no working-tree or branch-history changes

This phase only reads state and fetches remote metadata (`git fetch` touches no working tree
or branch history, so it is safe here). Report findings before any later state change.

Run and summarize:

1. `git worktree list --porcelain` - what worktrees exist, what branch is each on, and **where is
   `main` checked out** (or nowhere)? This determines every later main-updating step's
   checkout; if no worktree has it, see "If `main` is not checked out anywhere" below.
2. If `main` is checked out, run `git status --porcelain` in that exact worktree. Stop if it is
   dirty. Do not substitute the repository root unless the worktree list says the root holds
   `main`.
3. `git fetch origin --prune`.
4. `git rev-list --left-right --count main...origin/main` - ahead, behind, or diverged?
   Apply the `MAIN_SYNC` rule (Hard safety rules).
5. Identify the source branch: use the invocation argument if given; otherwise list candidate
   branches (`git branch --no-merged main` plus the worktree list) and ask the user which one to
   merge if it isn't obvious. Validate the chosen name with `git check-ref-format --branch
   <branch>`, reject `main` and any leading `-`, then require `git show-ref --verify
   refs/heads/<branch>` to succeed. Locate the one worktree whose porcelain branch line is
   exactly `refs/heads/<branch>`. **More than one resolves: stop.** **None resolves: the branch
   has no worktree** - that is a normal state here, not an error (a closed session leaves its
   branch behind and the client parks the freed worktree on a detached HEAD, which is the very
   case `worktree-activity.mjs` exists to surface). Follow "If the source branch has no
   worktree" below rather than stopping.
6. If the branch HAS a worktree, run `git status --porcelain` in that exact one. Stop if it is
   dirty. A branch with no worktree has no working tree at all, so there is nothing uncommitted
   to check and nothing to preserve - it clears this step by construction.
7. Preview the merge: `git log --oneline main..<branch>` (what comes in) and
   `git log --oneline <branch>..main` (what the branch is missing), plus
   `git merge-base main <branch>` followed by
   `git merge-tree <base> main <branch>`. Inspect its output for conflicts. On Windows
   PowerShell, also intersect `git diff --name-only <base> <branch>` with
   `git diff --name-only <base> main` and report overlapping paths conservatively. **Never use
   `git merge --no-commit` as a preview**; it changes the index and working tree.
8. **Merge ORDER - what landing this branch costs the other worktrees.** Several branches are
   normally in flight, and this workflow merges `main` into the branch before fast-forwarding,
   so whatever lands first is absorbed by everyone else afterwards. Run:

       node scripts/merge-order.mjs --branch <branch>

   It is read-only (a `git merge-tree` three-way merge in the object store - no working tree, no
   ref) and prints the ranked landing order plus a verdict for this branch. Report its one-line
   verdict every run, whatever it says:

   - **`clear`** - landing this now costs nothing in flight. Say so in one line and continue.
   - **`caution`** - there is a cost but no cheaper branch is waiting, or the cost is small.
     Report the number and continue; someone has to go first.
   - **`hold`** - a cheaper branch is ready AND this one is expensive: it renames or deletes
     paths another branch edits, collides on a sequence number (two migrations minting `0024`
     merge CLEANLY and are still wrong), is stacked on a branch that must land first, or leaves
     five or more conflicted files for others. STOP and get an explicit go-ahead, naming the
     branch it recommends landing first.

   This never overrides the user: a `hold` that the user waves through proceeds normally. It is
   advice with a stop attached, not a gate - and it is advisory only about ORDER. It never
   substitutes for any Hard safety rule or for Phase 3 verification.

### If the source branch has no worktree

Verification is the whole point of this workflow, and it needs a working tree: `main` has to be
merged INTO the branch (Phase 2) and the result built and tested (Phase 3) before anything
reaches `main`. A worktree-less branch has nowhere for that to happen - so this flow creates a
TEMPORARY worktree for it, uses it, and removes it again in Phase 5.

Never borrow another worktree for this. A parked worktree already has dependencies installed and
is tempting, but checking a branch out inside someone else's checkout is exactly what the Hard
safety rules forbid; a fresh one costs an `npm install` and risks nothing.

Report the plan in Phase 1 and create it as the first action of Phase 2:

    git worktree add .claude/worktrees/safe-merge-<branch-slug> <branch>

where `<branch-slug>` is the branch name with `/` replaced by `-`. Then, inside it:

    npm install

A new worktree shares the object store but NOT `node_modules`, so the install is required before
either gate will run. It is the real cost of this path - state it up front rather than letting it
surprise anyone, and expect a couple of minutes even for a one-file docs branch.

From there the flow is unchanged: that temporary worktree IS "the source worktree" for Phase 2
step 5, all of Phase 3, and every cleanliness re-check in Phase 4.

**Stop instead of creating one** if the target path already exists (it is someone else's, whatever
its name), if `git worktree add` fails for any reason, or if the branch turns out to be checked
out somewhere after all. Never use `--force`.

### If `main` is not checked out anywhere

If no worktree has `main` checked out, do NOT assume the root is on `main`. The root
(`C:\claude\NoaCG-Studio`, `<root>` below) is our canonical `main` worktree, but the client
parks it on a detached HEAD when it spins up a linked worktree, so it can drift off `main`.

The single, authoritative definition of "is it safe to reattach `<root>` to `main`?" lives
in `scripts/reattach-main.mjs` - the SAME gate the SessionStart hook uses, so this workflow
and the hook can never disagree. Assess read-only, and trust its verdict:

    node scripts/reattach-main.mjs --check <root>

It prints `SAFE to reattach to main` (clean checkout, HEAD detached with no commits
unreachable from any branch/remote, no git op in progress, `main` free) or
`will NOT reattach - <reason>`.

**Decision:**
- SAFE: plan to **reattach** `<root>` to `main`; it is a state change, so only REPORT the
  plan here and perform it as the first action of Phase 2.
- NOT SAFE (any reason): STOP and report the exact reason it printed. Never switch, reset,
  stash, discard, or overwrite anything.

Then present a short plan: **the source branch and the target (`main`), stated explicitly**
("merge `<branch>` -> `main`"), how many commits, predicted conflict files (if any), any
reattach that Phase 2 will perform, and what verification will run.

**Auto-proceed on a clean preflight (standing permission).** The user has granted standing
permission for this workflow to run end to end - including the final `git push origin main` -
without a confirmation prompt. When the Phase 1 assessment is clean, state the plan (source
branch -> `main`, commit count, "no risks flagged") and continue straight into Phase 2
without waiting. Only STOP and require an explicit go-ahead when the assessment surfaces a
real risk, meaning any of:

- local `main` is diverged from or ahead-only of `origin/main` (the Hard safety rules cases);
- the source worktree has uncommitted changes;
- the merge is predicted to conflict;
- `main` is checked out nowhere and `reattach-main.mjs --check` does not report SAFE;
- the source branch is ambiguous or was not clearly identified;
- `merge-order.mjs` returned a `hold` verdict (step 8).

In any of those cases, report the specific risk and wait. Absent them, do not pause - the
later phases still enforce every Hard safety rule and abort on their own if reality
disagrees (dirty verification, main moved, non-fast-forward), so a clean run needs no
gate here.

## Phase 2 - Prepare (reattach main if needed, update main, then integrate it INTO the branch)

Order matters: bring the latest main into the WORKTREE branch first, so all conflict
resolution and testing happen on the branch. Main only ever receives an already-tested
branch - it is never where conflicts get resolved.

1. If Phase 1 found `main` checked out nowhere and the gate reported SAFE, reattach now:
   `node scripts/reattach-main.mjs <root>` (it re-verifies safety, then switches).
   If Phase 1 found the SOURCE branch has no worktree, create the temporary one now
   (`git worktree add .claude/worktrees/safe-merge-<branch-slug> <branch>`, then `npm install`
   inside it). Everything below means that worktree wherever it says "source worktree".
2. Recheck the actual `main` and source worktrees with `git status --porcelain`. Stop if either
   became dirty after assessment. A freshly created worktree reports clean because
   `node_modules/` is gitignored; if it reports anything else, stop - something is wrong.
3. In the actual `main` worktree, update main from the remote:
   `git pull --ff-only origin main`.
4. Record `INTEGRATED_MAIN_SHA = git rev-parse main` - the exact main integrated into the
   branch, re-checked in Phase 4.
5. In the SOURCE branch's worktree, integrate that main into the branch: `git merge main`.

## Phase 3 - Resolve & verify (on the branch, main untouched)

1. Resolve any conflicts from the `git merge main`, carefully. Resolve only what is
   mechanically obvious; for anything semantic, stop and show the user the conflicting hunks.
   If it is not confidently resolvable, `git merge --abort` and report. This happens on the
   BRANCH, so main stays untouched. When conflicts are resolved, complete the merge commit before
   continuing; never verify a half-finished merge.
2. Pin the commit under test: `VERIFIED_SHA = git rev-parse <branch>` and state it. The exact
   commit that passes verification must be the exact commit that becomes `main`.
3. Verify on the integrated branch, in the worktree, BOTH of:
   - `npm run build` - typecheck, lint, bundle.
   - `npm run test:e2e:affected` - the specs covering this branch's diff, plus the catalog
     calibration gate when the catalog moved. Run it even when the change looks harmless:
     "it's only templates" is exactly the branch that went red, and the script decides what
     "affected" means, not the person merging. It escalates to the full suite by itself on a
     shared-core or unmapped change, so a wide change is not a reason to skip it - it is the
     reason it takes longer. It reports and skips cleanly when a diff touches nothing the
     suite covers, so a docs-only branch costs seconds.

   Anything red means fix-or-abort - do not proceed to main. (Any fix creates a new commit;
   re-record `VERIFIED_SHA` and re-run BOTH.) Playwright starts its own offline-pinned dev
   server; a server already running on this checkout's port makes the guard hook refuse, so
   stop that one first rather than letting the specs reuse it.

   If the branch has an open PR whose CI is green on exactly `VERIFIED_SHA`, that CI run is
   stronger evidence than the local pair (it runs the same gates plus the full sharded suite
   on a clean checkout) - say so and let it stand in for the affected run. It does NOT
   substitute for anything if the commit moved afterwards.
4. Confirm the source worktree is clean with `git status --porcelain`. The checked filesystem
   must exactly match the commit being promoted; generated or uncommitted changes make the
   verification invalid.
5. Confirm the branch still points at the verified commit: `git rev-parse <branch>` must
   equal `VERIFIED_SHA`. If it moved, re-verify.

## Phase 4 - Re-check main, fast-forward merge, and push

Do this immediately before merging - main may have moved on the remote while you verified.

1. `git fetch origin`, then confirm ALL of:
   - the actual `main` worktree and source worktree are still clean;
   - `git rev-parse <branch>` still equals `VERIFIED_SHA`;
   - local `main` still matches `origin/main`: `git rev-parse main` == `git rev-parse origin/main`;
   - `main` has not moved since it was integrated into the branch:
     `git rev-parse origin/main` == `INTEGRATED_MAIN_SHA`;
   - the final merge is still a fast-forward: `git merge-base --is-ancestor main <branch>`
     succeeds.
2. **If `main` moved** (any check fails): STOP - do not merge. Return to Phase 2, integrate
   the new latest `main` into the source branch (`git pull --ff-only origin main`, then
   `git merge main` in the worktree), rerun the Phase 3 verification (new `VERIFIED_SHA`),
   and only then repeat this Phase 4 re-check.
3. Fast-forward merge from the actual main worktree:
   `git merge --ff-only <branch>`. Git refuses this if it is not a fast-forward; if it fails,
   STOP and report (main moved, or the branch does not contain main). Because the branch already
   includes main, a healthy run fast-forwards cleanly, bringing in only this branch's commits.
4. Confirm the exact verified commit is now `main`: `git rev-parse main` must equal
   `VERIFIED_SHA`. Do not push otherwise.
5. Push: `git push origin main` (standing permission). If Phase 1 flagged pre-existing
   local-only commits ahead of `origin/main`, you must already have the user's explicit
   confirmation that publishing them is intended.

## Phase 5 - Finish

1. Confirm the branch is contained: `git branch --merged main` includes `<branch>`.
2. If THIS run created a temporary worktree in Phase 2, remove it now - it exists only to have
   made verification possible, and leaving it behind turns a merge into litter that the next
   session mistakes for live work:

       git worktree remove .claude/worktrees/safe-merge-<branch-slug>
       node scripts/dev-port.mjs --prune

   The prune releases the dev-port ticket if the e2e run reserved one for that path - it only
   ever clears tickets whose worktree is gone, so it is safe to run unconditionally, and on a
   docs-only branch (where the affected run skips without starting a server) it simply finds
   nothing of ours to release. Never use
   `--force`: if the removal refuses, say so and leave it for the cleanup-worktrees workflow
   rather than overriding a refusal you did not diagnose. Remove ONLY the worktree this run
   created, and never the branch.
3. Do NOT remove any other worktree or delete the branch, and do not offer to. Just note that
   the cleanup-worktrees workflow (run from the primary `main` checkout) sweeps merged
   branches and their worktrees when the user wants them gone.
4. Final report: merged commits, verified SHA now on `main`, build result, push result, and
   whether a temporary worktree was created and removed.
