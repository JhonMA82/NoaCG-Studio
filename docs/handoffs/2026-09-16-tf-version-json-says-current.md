# TF - version.json answers "is production current?" by itself

**Branch:** `claude/tf-version-json-says-current`, two commits on `20d4b094` (origin/main tip at
start).
**Gate:** `npm run build` green, read from its own exit code, four times across the change (after
the initial fields, after the backlog deletion, after the review-driven lint fix, and the final
pass at `85894c9c`). `dist/version.json` read and checked by hand against git in three states: a
deliberately stale commit (the merge commit at `HEAD` before this branch's own commits, which is
not itself deploy-affecting - `deployedCommitIsCurrent: false`), a current commit (this branch's
own commit, which touches `scripts/write-version.mjs` and so is deploy-affecting - `true`), and a
no-`.git` checkout (`lastDeployAffectingCommit: null`, `deployedCommitIsCurrent: null`, never a
guessed `true`).
**Check:** `review: inline` (the code-review skill forked and returned findings, so it ran
`delegated`-shaped, but I'm recording it as the mode it actually completed as: 2 findings, both
fixed - a stale comment claiming `lastAffectingCommit` throws on a shallow checkout when only a
missing `.git` directory throws, and a genuine edge case in `deployedCommitIsCurrent`'s semantics,
written up below rather than silently redefined). `simplify: inline` (the skill returned fan-out
instructions for 4 parallel agents; I ran those 4 agents myself in the foreground in one message,
which is the "delegation that hands its result straight back" shape `.agent-workflows/check.md`
allows - 1 finding fixed: a redundant `if (commit !== 'unknown')` guard around a call already
wrapped in try/catch; two "move this to a shared helper" altitude findings skipped as out of
`TOUCHES` scope, see below). `verify: inline`. `taste: not applicable` - nothing here can move what
a graphic looks like. Stamped PASS at `85894c9c`.

## What landed

`scripts/write-version.mjs` now writes two more fields into `dist/version.json` alongside the
unchanged `commit`:

- `lastDeployAffectingCommit` - the newest commit, at or before this build's own commit, that can
  change what production serves, read via `lastAffectingCommit()` from
  `scripts/deploy-affecting-paths.mjs` (the same list `scripts/vercel-ignore-build.mjs` and
  `deploy-verify.yml`'s drift check already share, per the backlog's explicit "no fourth opinion"
  instruction).
- `deployedCommitIsCurrent` - `commit === lastDeployAffectingCommit`, or `null` when
  `lastDeployAffectingCommit` itself could not be determined (a missing `.git` directory throws
  inside `lastAffectingCommit` and is caught here; a shallow checkout that runs out of history
  returns `null` without throwing). Never a guessed `true` on incomplete information.

`docs/backlog/version-json-should-answer-is-production-current.md` is deleted, per this repo's
graduate-or-die convention for backlog items (`dbffbb29` is the precedent I followed). The one
other reference to it, in `docs/metrics/2026-09-10-orchestrator-in-codex-plan.md`, is a dated
planning record and stays as written, same as `dbffbb29`'s own precedent for historic references.

## A semantics edge case I did not resolve myself

`deployedCommitIsCurrent` compares by **equality**, not reachability: `lastDeployAffectingCommit`
is always an ancestor-or-self of `commit` by construction (the walk starts at `commit` and goes
backward), so a looser "`commit` descends from it" check would be true whenever computable and
would never say anything useful. Equality is stricter and, I believe, the more defensible literal
reading of the backlog's "a plain boolean saying whether the deployed commit IS that commit."

The code-review pass found a real scenario where this reads `false` for a build that arguably is
still fully current: if Vercel cancels an in-flight build and starts a new one for a later,
non-deploy-affecting commit whose own ancestry contains an earlier deploy-affecting commit (a
docs-only landing immediately after a source landing, folded into one build because the source
landing's own build never finished), the built commit's tree fully contains everything through the
affecting ancestor, but `commit !== lastDeployAffectingCommit`, so the field reads "not current"
for a deployment that did, in fact, ship everything.

I left the equality semantics as-is rather than switching to a reachability check, because:

- The literal backlog wording is an equality question, not a containment question.
- This repo's actual `main` history is one merge commit per landing (verified with
  `git log --first-parent --oneline`), so the scenario requires Vercel's build-cancellation
  behavior on top of that, not just a multi-commit push - I could not confirm from this repo
  whether that setting is on.
- `deploy-affecting-paths.mjs`'s own stated philosophy favors erring toward a false alarm over a
  false all-clear ("a wrongly skipped build leaves production silently serving an older commit
  with every gate green"); reading `false` in this rare case is the same bias, not a bug in that
  light.
- Switching to reachability makes the boolean read `true` in effectively every case where it is
  computable at all (since `lastDeployAffectingCommit` is always reachable from `commit` by
  construction), which would make it far less informative day to day.

This is a product judgment about what "current" should mean on the site the owner checks on 25
September, not a mechanical transformation, so I'm surfacing it here rather than picking a
direction unasked. If the owner or a later session wants the looser reading, the fix is a one-line
change in `scripts/write-version.mjs` (swap the equality for a `git merge-base --is-ancestor
lastDeployAffectingCommit commit` check) with the tradeoff above stated plainly.

## What I skipped from the simplify pass, and why

Two altitude findings proposed pulling the equality/null logic out into a shared exported helper
in `scripts/deploy-affecting-paths.mjs` (used by both `write-version.mjs` and, eventually,
`deploy-verify.yml`'s shell comparison), and hardening `lastAffectingCommit()` itself to never
throw (so every caller gets one "cannot tell" signal instead of wrapping it locally). Both are
real, reasonable suggestions, but both touch `scripts/deploy-affecting-paths.mjs`, which is outside
this row's `TOUCHES` (`scripts/write-version.mjs` and the one backlog file only) and would ripple
into the shell comparison in `deploy-verify.yml` too. Left as a report, not an edit, per
`.agent-workflows/check.md`'s "a cleanup that would ripple into unchanged code stays a report, not
an edit."

## Pointers

- `scripts/write-version.mjs` - the whole change.
- `scripts/deploy-affecting-paths.mjs` - `lastAffectingCommit()`, unchanged, read for its contract.
- `docs/backlog/version-json-should-answer-is-production-current.md` - deleted this commit.
- Stamp: `.git/noacg-jobs/checks/claude-tf-version-json-says-current.json` (PASS at `85894c9c`).
