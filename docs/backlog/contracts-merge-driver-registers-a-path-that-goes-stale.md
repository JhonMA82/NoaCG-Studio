# The package.json merge driver's registration is half-repaired, and a doubled key defeats it

**Filed:** 2026-09-16, as the contracts driver's stale absolute path. **Re-pointed 2026-09-16** at
`scripts/package-merge-driver.mjs`, which is where what is left of it lives. **The filename is
historic** and kept on purpose: `docs/handoffs/2026-09-16-qj-contracts-driver-cannot-rot.md` cites
it, and an address that moves is worse than one that reads a little stale.

## The contracts half is fixed

`f1b90e55` (pull request 292) closed the original item. `scripts/contracts-merge-driver.mjs` now:

- registers a RELATIVE command, `node "scripts/contracts-merge-driver.mjs" %O %A %B %P`, because
  git runs a merge driver from the top of the working tree being merged, so one command serves
  every worktree of the clone and cannot go stale when the worktree that wrote it is deleted;
- calls `install()` unconditionally, with `--replace-all`, so an entry left by an older version is
  corrected instead of standing forever;
- compares the registered VALUE rather than asking whether the key exists (`registeredCommand()`
  feeding `isInstalled()`), because a clone carrying an older absolute path has the key and no
  working driver, and reading only presence is how that survived for weeks;
- returns what is registered afterwards rather than whether its own write won the race, since every
  worktree shares one `.git/config` and several sessions compile at once;
- no longer writes config mid-merge.

`scripts/contracts-merge-driver.test.mjs` pins it, 11 tests.

## What is still open, on the sibling driver

`scripts/package-merge-driver.mjs` does NOT carry the original defect: its `DRIVER_COMMAND` (line
98) is already relative, and `check()` calls `install()` unconditionally on every build. Three of
the five repairs above did not travel to it, and one of them has teeth.

**1. A doubled key defeats the repair, silently.** `install()` writes with a plain
`git config <key> <value>`. Re-derived in a throwaway repository on 2026-09-16, git 2.55.0:

```
$ git config --add merge.probe.driver 'node "OLD-ABSOLUTE" %O %A %B %P'
$ git config --add merge.probe.driver 'node "OLDER-ABSOLUTE" %O %A %B %P'
$ git config merge.probe.driver 'node "scripts/x.mjs" %O %A %B %P'
warning: merge.probe.driver has multiple values
error: cannot overwrite multiple values with a single value
       Use a regexp, --add or --replace-all to change merge.probe.driver.
$ git config --get merge.probe.driver
node "OLDER-ABSOLUTE" %O %A %B %P
```

Exit 5, and the stale command survives the repair that was meant to remove it. `--replace-all`
collapses the key to one value and exits 0. A doubled key is what two tools writing the same
config leave behind, and `--get` answers with the last value, so nothing else would notice. All the
build prints is `note: could not register merge.noacg-package.driver in this clone.`

**2. `isInstalled()` reads presence, not the value** (line 75). It answers "installed" for a clone
carrying an older version's command. The unconditional `install()` covers the common case, so this
is the hole under defect 1 rather than one on its own, but the test that would have caught either
is the one asserting the registered VALUE.

**3. `install()` returns whether OUR write succeeded**, not what is registered afterwards (line
107). Several worktrees of this clone build at once and share one `.git/config`, so a lost race for
`config.lock` reports a failed registration for a driver that is in fact registered.

Why it matters more here than for contracts: what git does with a driver whose command fails is
report `CONFLICT (content)`, mark the file `UU`, and leave OUR version in the working tree **with
no conflict markers in it**. For contracts the regeneration is the real gate and `check:contracts`
fails the build on a stale rendering. For `package.json` there is no such second gate, so a person
opens a file git called conflicted, sees clean JSON, stages it, and the other side's dependency or
script is gone.

## What it would take

An hour. Lift the three repairs across, and while both files are open, do what
`2026-09-16-qj-contracts-driver-cannot-rot.md` reported and did not fix: pull the registration into
one shared `registerMergeDriver(name, command, description)` used by both drivers, so there is one
story for "this file is merged by a program" rather than two that drift. Copy the value-comparing
test from `scripts/contracts-merge-driver.test.mjs`, and add the doubled-key case, which is the one
neither suite has.

QJ did not do it because that row forbade editing QE's files while QE's branch was queued. Both are
on `main` now, so that reason is spent.

## Evidence

- The throwaway-repository probe above, re-run 2026-09-16 on git 2.55.0.windows.5.
- `scripts/package-merge-driver.mjs:75` (`isInstalled` reads presence), `:98` (`DRIVER_COMMAND`,
  already relative), `:105` (`install` without `--replace-all`, returning its own write's status),
  `:552` (registration from the build gate).
- `scripts/contracts-merge-driver.mjs:72`, `:85`, `:104` for the fixed shape, and `f1b90e55` for
  the landing.
- The original measurement that filed this item: `git config --get merge.noacg-contracts.driver`
  in `C:\claude\NoaCG-Studio` on 2026-09-16 named
  `.claude/worktrees/agent-ae47713a44213dee3`, a directory that no longer existed.
