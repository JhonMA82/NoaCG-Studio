# The package.json merge driver's registration cannot rot either

## What this row was asked to do

`scripts/package-merge-driver.mjs` was landed hours before `f1b90e55` fixed the same three
registration weaknesses on `scripts/contracts-merge-driver.mjs`, and did not get them: `isInstalled()`
asked whether the config key existed rather than comparing its value, `install()` wrote with a plain
`git config <key> <value>` that refuses a key already carrying more than one value, and the installer
reported whether its own write returned 0 rather than what was actually registered afterwards.

## What I measured, against what the two earlier handoffs claimed

Two handoffs disagreed about the defect before I started. `docs/handoffs/2026-09-16-qj-contracts-driver-cannot-rot.md`
(row QJ) said the package driver registers an absolute path that goes stale - that is wrong, and was
already known to be wrong by the time this row started: line 98 of `package-merge-driver.mjs` already
read `node "scripts/package-merge-driver.mjs" %O %A %B %P`, a relative path, before I touched anything.
Row SD had already re-derived the real defect in a throwaway repository and rewritten
`docs/backlog/contracts-merge-driver-registers-a-path-that-goes-stale.md` to describe it correctly. I
re-ran both probes myself, from scratch, in a disposable git repo before changing a line:

- `git config merge.noacg-package.driver 'node "OLD" ...'` then `git config --get ...` returns exit 0
  even though the registered command is stale - confirms `isInstalled()` (old line 76, `status === 0`)
  cannot see a stale command, only a missing key.
- `git config --add` twice on the same key, then a plain `git config <key> <value>` - exit 5, "cannot
  overwrite multiple values with a single value" - confirms `install()` (old line 107) is refused by a
  doubled key and leaves every stale value standing. `--replace-all` on the same doubled key exits 0
  and collapses it to one value.

Both matched SD's re-derivation and the backlog file exactly. Fixed both, matching the shape
`f1b90e55` already gave `contracts-merge-driver.mjs`.

## What changed

- `scripts/merge-driver-registration.mjs` (new): `registeredCommand(name, cwd)`, `isInstalled(name,
  command, cwd)`, `install(name, command, description, cwd)` - the value-comparing check and the
  `--replace-all` write, in one place.
- `scripts/package-merge-driver.mjs`: `isInstalled`/`install` now delegate to the shared module.
  Corrected the comment in the `DRIVER_COMMAND` block that described the contracts driver's
  absolute-path bug as current - `f1b90e55` fixed that in the sibling file weeks before this comment
  would have been read.
- `scripts/contracts-merge-driver.mjs`: `isInstalled`/`install`/`registeredCommand` now delegate to
  the same shared module (previously had its own copy of the identical logic). Its local `git()`
  helper is gone - nothing else in the file used it.
- `scripts/package-merge-driver.test.mjs`: added the stale-key assertion (`isInstalled(dir) ===
  false` before the repair) and the doubled-key regression test, both copied from
  `contracts-merge-driver.test.mjs`'s equivalent cases - the one gap the backlog file named that
  neither suite had.
- Deleted `docs/backlog/contracts-merge-driver-registers-a-path-that-goes-stale.md`: both defects it
  described on the package-driver side are fixed, per the backlog's own graduate-or-die rule. Left
  the citations to it in the two already-landed handoffs (`2026-09-16-qj-contracts-driver-cannot-rot.md`,
  `2026-09-16-sd-one-page-indexes.md`) as written - those are history, not live pointers.

Both drivers ended up sharing one helper (step 4 of the row's DO list), which the recipe treated as
a stretch goal ("if that can be done without changing either one's behaviour"). It could: both public
APIs (`registeredCommand`/`isInstalled`/`install`, same signatures) are unchanged, confirmed by the
existing test suites passing unmodified plus the two new cases.

## Verification

- `node --test scripts/package-merge-driver.test.mjs scripts/contracts-merge-driver.test.mjs` - 34
  pass, 0 fail (23 + 11, including the two new package-driver cases).
- **A real `git merge` through the registered driver, not a config read-back** (the trap this row's
  recipe named: reading `--get` back is the exact mistake `isInstalled()` made). In a throwaway repo:
  registered a doubled/stale key exactly as the corpus test does, ran `--install` to repair it,
  confirmed `git config --get-all` came back with one value, then created two branches that each
  added a different `scripts.*` key to `package.json` and ran `git merge --no-edit` for real. Git
  invoked the driver via the repaired config, and the merged file kept both keys
  (`"test": "node --test"` and `"lint": "eslint ."`), no conflict.
- `npm run build`, read from its own exit code via a uniquely named log (`sh-build.log`, then
  `sh-build2.log` after merging `origin/main` in and closing the backlog file - both deleted once
  read, neither committed): 1776 pass, 0 fail, 1 skipped, both runs. `check:package-merge` passed on
  both.
- `/check`: `review: delegated` (0 findings; code-review's own read matched what I'd already
  verified - the fix propagates correctly, no dead code, no API breakage). Scope-checked against
  `git diff --name-only 6da34769..HEAD` plus `git status --porcelain` - matched exactly (4 files +
  1 deletion). `simplify: inline` - the skill returned its 4-agent fan-out instructions, so I did the
  four angles (reuse, simplification, efficiency, altitude) myself over the diff; nothing to fix -
  the thin per-driver wrappers match the file's existing style and the module boundary is where the
  recipe put it. `verify: inline`. `taste: not applicable` - no graphic or product code changed.
- Verdict stamp written after commit, at `dbffbb29`: `review delegated`, `simplify inline`, `verify
  inline`, PASS.

## Traps not written down anywhere else

- The two earlier handoffs (QJ's and the backlog file's original filing) both got the defect
  half-wrong before SD corrected it. A planner reading only QJ's handoff would send the next row
  chasing an absolute-path bug that had already been fixed in this exact file's `DRIVER_COMMAND`
  constant. The backlog file's own history section is the accurate account; a handoff citing an
  older backlog revision is not.
- `origin/main` moved (PR 297 landed) between when this row's plan was written and when I finished.
  Merged it in before touching the backlog file, per the row's instruction, and re-ran the full build
  on the merged tree rather than trusting the pre-merge green.

## Pointers

- `scripts/merge-driver-registration.mjs` - the shared fix.
- `scripts/package-merge-driver.mjs:76-107`, `scripts/contracts-merge-driver.mjs:78-104` - both now
  thin wrappers over it.
- `scripts/package-merge-driver.test.mjs:204-247` - the stale-key and doubled-key cases.
- No open work on this item. `docs/backlog/contracts-merge-driver-registers-a-path-that-goes-stale.md`
  is deleted.

## Queue

`npm run build` gate: green. `/check`: complete, stamped PASS. Queuing next.
