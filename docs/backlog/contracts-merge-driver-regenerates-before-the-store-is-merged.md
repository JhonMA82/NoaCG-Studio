# The contracts merge driver regenerates before the merged store exists, so the merge lands stale

**Filed:** 2026-09-16. **Source:** the end-to-end run that verified the driver's registration
(branch `claude/qj-contracts-driver-cannot-rot`), which is the first time the driver has actually
been watched running under git rather than called directly.

## Why

`scripts/contracts-merge-driver.mjs` resolves a conflicted generated contract by running
`scripts/compile-contracts.mjs` and copying the result over git's file. Its header already says
what it does not promise:

> Git merges files in its own order, so the store may not be merged yet when this runs.

That was written as a caveat. It is not a caveat and it is not about ordering: the driver NEVER
sees a merged store, and no arrangement of paths would change that.

Merge-ort, git's default strategy since 2.34, settles every path in memory and writes the working
tree once, after the last content merge. The driver runs during that computation, so what it reads
off disk is the pre-merge working tree, whatever the path sorts as.

Probed 2026-09-16 on git 2.55.0.windows.5, twice, with a stub driver that read a second file's
bytes while it ran. The second file needed no resolution at all - one side changed it, the other
did not - so git could take it outright:

| the second file | sorts | what the driver read | what it held after the merge |
| --- | --- | --- | --- |
| `aaa-store.md` | before the driver's file | `base-store` | `THEIR-store` |
| `zzz-store.md` | after the driver's file | `base-store` | `THEIR-store` |

Sorting first bought nothing. (A first pass at this filed it as a path-ordering effect, on the
strength of the byte order `.claude/…` < `AGENTS.md` < `contracts/…`. The order is real and the
conclusion was right; the mechanism was wrong, and the table above is what settled it.)

So whenever both sides touched the rule store, every generated file is regenerated from a store
that still holds only OUR side. The driver then reports success and the merge commits clean.

A second consequence of "pre-merge working tree" is worth naming: it is the WORKING TREE, so an
uncommitted edit under `contracts/rules/` is compiled into what git stages. That content is on
neither side of the merge. `contracts:compile --check` catches it only on a clean checkout, which
means CI and not the laptop that made it, because a local check compiles from the same dirty store
and agrees with itself.

## Measured

A local clone of the repository, 2026-09-16. Two branches, each editing the body of a different
root rule; the two render on adjacent lines of `.claude/rules/everywhere.md` and `AGENTS.md`, so
those files cannot be merged as text.

| registration | `git merge` exit | generated file afterwards |
| --- | --- | --- |
| none | 1, `UU` | conflict markers, both edits present |
| the stale absolute path this clone carried until today | 1, `UU` | ours verbatim, no markers, their edit gone |
| the relative command | **0, clean** | **ours only - their edit is not in it** |

The merged STORE carried both edits. The generated tree did not, and
`node scripts/compile-contracts.mjs --check` exited 1 naming `.claude/rules/everywhere.md` and
`AGENTS.md`. One `node scripts/compile-contracts.mjs` then produced both edits.

## Why it is a shelf item and not an emergency

`check:contracts` runs in `npm run build`, which is the CI gate, so a stale generated contract
cannot land. The driver's real job is removing a conflict nobody can resolve by hand, and it does
that. The cost is a merge that looks finished and is not: a person who merges, sees green, and
pushes gets their branch rejected by CI with a message about staleness that has nothing obvious to
do with the merge they just did.

## What it would take

Half a session, and the shape is not obvious - which is why this is a note rather than a patch.
The probe above rules one candidate out before anybody spends time on it:

1. **A `post-merge` hook that compiles.** The only one of these that can work, because it runs
   after git has written the tree. It does not fire on a merge that stopped at a conflict
   elsewhere, and hooks are per clone, so it needs the same registration care this driver just
   needed - `core.hooksPath` pointing at a committed directory is the version that cannot rot.
2. ~~**Have the driver read the merged store from the index.**~~ Ruled out. Nothing is at stage 0
   yet: merge-ort has not written the index either when the driver runs. Getting the merged store
   this way means merging it in memory first, which is re-implementing the merge.
3. **Make the staleness loud at merge time instead of at build time.** Worth doing whatever else
   happens, and it is small. The driver knows it is running during a merge and knows whether the
   store is among the paths in play; it could say on stderr that the generated tree will need a
   compile, so the person merging is told by the merge rather than by CI twenty minutes later.

## Evidence

- Both tables above. The scripts that produced them are not committed - one clones the repo, edits
  two rule files, compiles, and merges three times; the other is a stub driver in a scratch repo
  that reads a second file mid-merge - but every value came from one run each, on git
  2.55.0.windows.5.
- `scripts/contracts-merge-driver.mjs`, the `WHAT IT DOES NOT PROMISE` paragraph, which now carries
  the same mechanism and the same two consequences. It always treated the build as the thing that
  makes the result true, and it is right about that.
