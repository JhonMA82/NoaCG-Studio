# QJ - the contracts merge driver cannot rot

**Branch:** `claude/qj-contracts-driver-cannot-rot`, queued 2026-09-16. Three commits.
**Pool:** opus high, inline. Nothing delegated to Codex - see "Why not Codex".

## What landed

`merge.noacg-contracts.driver` is now registered as `node "scripts/contracts-merge-driver.mjs" %O
%A %B %P`. Relative, so it is correct in every worktree of the clone at once and cannot outlive the
one that wrote it. `install()` writes unconditionally instead of only when the config key is
missing, and `isInstalled()` compares the COMMAND rather than asking whether the key exists, so a
clone carrying an older version's absolute path repairs itself on the next compile.

The live clone was repaired too, not just the code that writes it:
`C:\claude\NoaCG-Studio\.git\config` now carries the relative command, one value.

## Step 2 - what a dead driver actually does, measured

The row said not to repeat the "silent data loss" phrasing without measuring it. Measured, and the
phrasing needed correcting: **the merge is not silent. The FILE is.**

Scratch repository, git 2.55.0.windows.5, the exact dead command this clone carried. Node prints a
`MODULE_NOT_FOUND` stack, git prints `CONFLICT (content)`, exits 1 and marks the file `UU`. So far
that is a loud failure. Then:

- the working-tree file is **ours, verbatim - no conflict markers, no trace of their side**;
- this holds both when the two sides touched different lines, which plain git merges cleanly with
  exit 0 and both edits, and when they touched the same line;
- stage that file and commit the merge, and the merge commit records ours alone. `git merge
  their-branch` then answers **"Already up to date"**, exit 0. Their change is never offered again,
  and `git log -S` finds it only on the branch that made it.

So the loss is real and permanent, but it needs one human step - a person opening a file git called
conflicted, seeing clean text, and staging it. That is why weeks of dead driver left no wreckage
anyone noticed: `check:contracts` fails the build on a stale rendering, so nothing bad could LAND,
and the conflicts themselves were being resolved by hand into whichever side the person kept.

Re-run after the fix, in a local clone of the real repository with the real driver and the real
rule store. Two branches, each editing a different root rule; the two render on adjacent lines of
`.claude/rules/everywhere.md` and `AGENTS.md`, so those files cannot be merged as text:

| registration | `git merge` exit | the generated file afterwards |
| --- | --- | --- |
| none | 1, `UU` | conflict markers, both edits |
| the dead absolute command | 1, `UU` | ours verbatim, no markers, their edit gone |
| the relative command | **0, clean** | regenerated - no markers, no conflict |

## The thing that run exposed, and it is not fixed

Trial 3 merged clean and left the generated tree **stale**: it carried our edit and not theirs,
while the merged store carried both. `contracts:compile --check` exited 1 naming both files, and
one compile settled it.

The driver's header already predicted this, as something that "can" happen because git merges files
in its own order. I filed it as a path-ordering effect, and the code review probed that and
disproved it. Merge-ort - git's default since 2.34 - settles every path in memory and writes the
working tree **once, at the end**, so a merge driver always reads the pre-merge tree. Probed twice
with a stub driver reading a second file mid-merge, once with that file sorting before the driver's
own file and once after: base content both times. **The driver never sees a merged store, and no
arrangement of paths would change that.**

Two consequences are now written into the driver header and
`docs/backlog/contracts-merge-driver-regenerates-before-the-store-is-merged.md`:

- a merge that touched the store always lands a stale generated tree, caught by CI rather than by
  the merge;
- "pre-merge" means the working TREE, so an uncommitted edit under `contracts/rules/` is compiled
  into what git stages. A local `--check` compiles from that same dirty store and agrees with
  itself, so only a clean checkout catches it.

The backlog file names three candidate fixes and rules one out on the probe: a `post-merge` hook is
the only one of the three that can work, reading the merged store from the index cannot (nothing is
at stage 0 yet either), and making the staleness loud at merge time is small and worth doing
regardless. Half a session. **Not urgent** - the build is what makes the result true and it does.

## Tests

`scripts/contracts-merge-driver.test.mjs`, 11 tests, all through real git rather than assertions
about strings:

- the registered path is relative AND names a file that exists under the repo root, so renaming the
  script fails here instead of in somebody's merge weeks later;
- installing over the stale absolute command rewrites it, and `isInstalled()` calls that stale
  registration not-installed even though the key is present;
- a key that has collected two values is replaced rather than refused;
- git runs the relative command from the worktree top, and still does when the merge was started
  from a subdirectory;
- a second worktree of the same clone, which registered nothing itself, runs its OWN copy;
- a command git cannot run leaves ours unmarked - the step-2 shape, pinned so the reason for the
  relative form stays visible;
- the compiler registers on an ordinary run and not when the driver is the one running it, both
  arms in one test so a broken flag cannot pass as "nothing was written".

The registration tests use a committed stub at the same relative path, deliberately: the subject is
whether GIT finds and runs the command, and the real compiler is exercised by the two older tests.

## Verification

- `npm run build` - **exit 0**, read as its own exit code, log written to a uniquely named file
  (`qj-build-a7e4bd12-final.log`) because wave rows share one scratchpad and a sibling read a
  neighbour's `build.log` as its own evidence today. 118 test files, 1737 tests, 0 failures.
  `[compile-contracts] OK - 499 rule(s), 263 generated file(s) current`. The build stamp says
  `claude/qj-contracts-driver-cannot-rot`, so it gated this branch.
- `node --test scripts/contracts-merge-driver.test.mjs` - 11 pass.
- The scratch-repo merges above, re-run after the fix.

**check: ran.** `review: delegated` (6 findings, 6 acted on; scope matched exactly - the review
reported base `0a5e3990` and the same four files `review-request.mjs` handed it, and this branch's
`git diff --name-only 0a5e3990..HEAD` is those four files with nothing uncommitted). The review
earned its place: it disproved the path-ordering claim with its own git probe, and found the
`--replace-all` hole, the mid-merge config write and a test that had started mutating the
developer's real config through the compiler. `simplify: inline` - the skill returned fan-out
instructions, which per `.agent-workflows/check.md` means the delegated pass did not run.
`verify: inline`. `taste: not applicable` - nothing here can move what a graphic looks like.
`e2e: not applicable` - no product code changed, only `scripts/` and `docs/`.

## Reported, not fixed

`scripts/package-merge-driver.mjs` (row QE, pull request 290, queued and not yet landed) carries a
near-identical `DRIVER_COMMAND` / `install()` / `isInstalled()` trio. Once it lands, the two want
one shared `registerMergeDriver(name, command, description)` helper, and the three repairs this
branch made to the contracts installer - `--replace-all`, reporting what is registered rather than
whether our write won, and not writing config mid-merge - apply to it unchanged. I did not touch
it: the row forbade editing QE's three files, and editing a queued branch's files from another
branch is how the generated-file merge trap starts.

QE also filed `docs/backlog/contracts-merge-driver-registers-a-path-that-goes-stale.md`, which this
branch closes. That file exists only on QE's branch, so it cannot be deleted from here - whoever
lands next should remove it once both are on `main`.

## Why not Codex

The row's core was steps 2 to 4, which are a measurement, a one-line decision that followed from
it, and tests that pin the measurement. The patch is six lines; everything else was finding out
what git actually does, and twice the answer contradicted what had been written down - once for the
dead-driver outcome, once for the ordering. Writing acceptance conditions for that would have meant
already knowing the answers.

## Next

Nothing on this branch. The `post-merge` staleness gap above is the obvious follow-on and is half a
session, with the mechanism already measured and one of the three candidates already ruled out.
