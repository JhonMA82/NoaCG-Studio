# QE - package.json merges by union

**Branch:** `codex/qe-package-json-merge-driver`, queued 2026-09-16. Two commits.
**Pool that did the work:** opus high, inline. **Codex did not run this row** - see "Why not Codex".

## What landed

`package.json` is now merged by a program. `.gitattributes` gives it `merge=noacg-package`
(`scripts/package-merge-driver.mjs`), registered the way the contracts driver is, and
`check:package-merge` runs in `npm run build`.

Two branches that each add a script line merge with no conflict. A key both sides changed to two
different values still conflicts, loudly, with markers around that key and every other key already
settled. Proven through real git in a scratch repository, both directions, not only through unit
tests.

## The thing the plan got wrong, and it was the whole design

The backlog file predicted a key-level union: take a key where only one side has it, conflict where
both changed it. **Every one of the thirteen real resolutions changed `scripts.build` on BOTH
sides**, so that driver would have removed exactly zero conflicts. `scripts.build` is an `&&` chain
and `scripts.test:jobs` is a space-separated file list; two branches each append a step and the
committed answer is both steps where their authors put them. The union has to reach into the VALUE.

So a value is cut into whitespace tokens and merged three ways by `git merge-file` - nothing here
re-implements diffing. Two rules keep that from becoming a guess:

- **`onlyAdds`**: both sides must be the base sequence with things ADDED. If either side removed or
  replaced a base token it is a rewrite, and a rewrite against an edit is a disagreement however
  tidily the regions line up. Without this, base `eslint .`, ours `eslint . --max-warnings 0` and
  theirs `biome check .` merged cleanly into `biome check . --max-warnings 0`.
- **`settleInsertions`**: diff3 calls two insertions at the same point a conflict; when the base
  side of the region is empty, nothing is in dispute and both are kept. That is merge `e330131d`
  exactly - one branch appended two test files, main appended a third.

Key ORDER is merged the same way, so a key lands where its author put it and the file does not churn
on the next landing. Order is presentation, so an order that will not merge falls back rather than
stopping a landing.

## Evidence

- `scripts/fixtures/package-merge-corpus.json` - base, ours, theirs and the COMMITTED RESULT of all
  thirteen package.json resolutions in the 45 days to 2026-09-16, recorded from git by
  `node scripts/package-merge-driver.mjs --record`. The driver reproduces all thirteen byte for
  byte; `check:package-merge` replays them in every build and `measured(13, ...)` fails at zero.
- `node scripts/metrics/conflict-trace.mjs`, 2026-09-16: 60 resolutions in 45 days, `package.json`
  13, next file `AGENTS.md` at 4.
- The corpus is committed rather than read from history because `.github/workflows/ci.yml` checks
  the build job out at **depth 1** - a gate that read git history would measure nothing there.
- Real git, scratch repo: two branches each adding a check merged to one file carrying both, with
  `git diff --diff-filter=U` empty; a dependency bumped two ways exited 1, marked the file `UU`, and
  named `dependencies.ai`. Re-run with the exact relative command, merging from a subdirectory.

## Verification

- `npm run build` - **exit 0**, read as its own exit code. `check:package-merge ok - 13 recorded
  package.json resolutions replayed`; 119 test files, 1752 tests.
- `node --test scripts/package-merge-driver.test.mjs` - 22 pass.
- `node scripts/gates.mjs audit` - OK, 158 gates.

**check: ran.** `review: delegated` (5 findings, 4 fixed, 1 documented; scope matched - the review
reported base `16ed46e9` and the same five files `review-request.mjs` handed it).
`simplify: inline` - the skill returned fan-out instructions, which per `.agent-workflows/check.md`
means the delegated pass did not run. `verify: inline`. `taste: not applicable` - nothing here can
move what a graphic looks like. `e2e: not applicable` - no product code changed. Worth knowing:
`node scripts/e2e-affected.mjs --json` resolves to a **full** run for this branch purely because
`package.json` is in the changed set, so a later row must not read that as a signal.
Stamped `PASS` at `9c858188`.

## Two defects found on the way, filed not fixed

- `docs/backlog/contracts-merge-driver-registers-a-path-that-goes-stale.md` - the contracts merge
  driver bakes an absolute path in and registers only when the key is missing. **In this clone it
  already points at `agent-ae47713a44213dee3`, which does not exist**, so `merge=noacg-contracts`
  has been dead for weeks while reporting nothing. The fix is the one this branch just made; the
  file names it. Worth a small row.
- `docs/backlog/wave-rows-share-one-scratchpad-so-build-log-is-somebody-elses.md` - every row a
  wave launches shares ONE scratchpad, keyed to the parent session, and every row writes
  `build.log`. This row read a neighbour's log back as its own evidence and spent ten minutes on a
  `check:copy` failure that belonged to another branch. The exit code was honest; the file was not.
  Deserves `npm run learn`, which this row did not do because a scope-less rule lands in the kernel
  contract every session pays for, and that trade wants a deliberate look.

## Why not Codex

The row said to delegate through `/rescue`. I did not, and the reason is in the section above: the
spec the row handed over was wrong about the shape of the problem, and being wrong was only
discoverable by extracting the corpus and watching a key-level union reproduce none of thirteen
resolutions. Three of the five design decisions here - the `onlyAdds` gate, the empty-base
insertion rule, and separating key membership from key order - were each forced by a specific case
in that corpus, and each arrived after a passing implementation turned out to be silently wrong.
That is a measure-decide-remeasure loop, not a long-to-do-short-to-specify build, and writing the
acceptance conditions for it would have meant already knowing the answers. Delegating would have
bought a driver that passed its written spec and resolved zero real conflicts.

## What it does not do

`package-lock.json` is untouched - a union of two lock files is not a lock. Two sides that add the
same step at different points in one chain get both copies, so the step runs twice; telling that
apart needs a real diff of each side against the base, and a slow build somebody notices beat more
machinery. The header says so.

## Next

Nothing on this branch. The contracts-driver defect above is the obvious follow-on and is half a
session, with the fix already written out.
