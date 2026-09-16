# The contracts merge driver regenerates before the merged store exists, so the merge lands stale

**Filed:** 2026-09-16. **Source:** the end-to-end run that verified the driver's registration
(branch `claude/qj-contracts-driver-cannot-rot`), which is the first time the driver has actually
been watched running under git rather than called directly.

## Why

`scripts/contracts-merge-driver.mjs` resolves a conflicted generated contract by running
`scripts/compile-contracts.mjs` and copying the result over git's file. Its header already says
what it does not promise:

> Git merges files in its own order, so the store may not be merged yet when this runs.

That was written as a caveat. It is not a caveat, it is the normal case, and the ordering is
deterministic against us. Git walks paths in byte order, and for every file this driver owns the
store sorts LAST:

```
.claude/rules/*.md      0x2E  '.'
AGENTS.md               0x41  'A'
contracts/index.md      0x63  'c'   <- and contracts/rules/**, the store itself
```

So whenever both sides touched the rule store, every generated file is regenerated from a store
that still holds only OUR side. The driver then reports success and the merge commits clean.

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
Three candidates, in the order I would try them:

1. **A `post-merge` hook that compiles.** Cheapest, and it runs after every path is settled. It
   does not fire on a merge that stopped at a conflict elsewhere, and hooks are per clone, so it
   needs the same registration care this driver just needed.
2. **Have the driver read the merged store from the index rather than the working tree.** During a
   merge the store's merged content is available at stage 0 for every path git has already settled
   - but by the ordering above it has settled none of them yet, so this means merging the store
   itself in memory. That is re-implementing the merge.
3. **Make the staleness loud at merge time instead of at build time.** The driver knows it ran
   during a merge and knows the store is in the tree; it could leave a note git prints, so the
   person merging is told to compile rather than finding out from CI.

## Evidence

- The table above. The script that produced it is not committed - it is twenty lines that clone the
  repo, edit two rule files, compile, and merge three times - but every number in the table came
  from one run of it and the header of `scripts/contracts-merge-driver.mjs` predicts the result.
- `scripts/contracts-merge-driver.mjs`, the `WHAT IT DOES NOT PROMISE` paragraph, which states the
  ordering risk and treats the build as the thing that makes the result true. It is right about
  that. It is only wrong about how often the risk fires.
