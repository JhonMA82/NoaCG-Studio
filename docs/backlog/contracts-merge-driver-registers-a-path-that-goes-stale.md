# The contracts merge driver registers a worktree path, and in this clone it already points at nothing

**Filed:** 2026-09-16. **Source:** code review of the `package.json` merge driver, which had the
same defect and fixed it.

## Why

`scripts/contracts-merge-driver.mjs` bakes an ABSOLUTE path into the command it registers:

```js
const command = `node "${path.join(ROOT, 'scripts', 'contracts-merge-driver.mjs')}" %O %A %B %P`;
```

and `scripts/compile-contracts.mjs:227` calls it only when `!isInstalled()`, where `isInstalled()`
asks whether the config key EXISTS and never whether its path still resolves. Worktrees share one
`.git/config`, and this repository makes and deletes a worktree per session, so the first checkout
ever to register owns the entry until somebody notices.

Nobody noticed. Measured in `C:\claude\NoaCG-Studio` on 2026-09-16:

```
$ git config --get merge.noacg-contracts.driver
node "C:\claude\NoaCG-Studio\.claude\worktrees\agent-ae47713a44213dee3\scripts\contracts-merge-driver.mjs" %O %A %B %P
$ ls C:/claude/NoaCG-Studio/.claude/worktrees/agent-ae47713a44213dee3
No such file or directory
```

So `merge=noacg-contracts` has been dead in this clone for as long as that worktree has been gone.
Every conflicted `.claude/rules/*.md`, `contracts/index.md` and root `AGENTS.md` has been falling
back to whatever git does when a driver's command fails, which is to report `CONFLICT (content)`,
mark the file `UU`, and leave OUR version in the working tree **with no conflict markers in it**.
A person opens a file git called conflicted, sees clean text, and stages it.

The contracts driver survives that better than most, because `check:contracts` fails the build on a
stale rendering - the regeneration is the real gate and the driver only removes the stop. That is
why this is a shelf item and not an emergency. It is still a mechanism that has not run in weeks
while reporting nothing.

## What it would take

Half a session. The fix is already landed on the sibling driver, `scripts/package-merge-driver.mjs`
(commit "Merge package.json as JSON instead of as text"), and is three changes:

1. **Register a RELATIVE command**, `node "scripts/contracts-merge-driver.mjs" %O %A %B %P`. Git
   runs a merge driver from the top of the working tree being merged - measured on 2026-09-16,
   including a `git merge` started from a subdirectory - so one relative command serves every
   worktree of the clone and cannot go stale. See the `DRIVER_COMMAND` export in the package driver
   and the comment above it, which carries the measurement.
2. **Call `install()` unconditionally** rather than only when the key is missing, so an entry left
   by an older version is corrected instead of standing forever.
3. **Test both**: that the registered path is relative, and that installing over a stale absolute
   command rewrites it. `scripts/package-merge-driver.test.mjs` has that test to copy.

## Evidence

- The `git config --get` above, against a worktree directory that does not exist.
- `scripts/contracts-merge-driver.mjs:44` (the absolute path) and `:35` (`isInstalled` reads
  presence only); `scripts/compile-contracts.mjs:227` (registers only when missing).
- The silent-loss shape was reproduced while building the package driver: a merge whose driver
  command cannot run leaves ours verbatim, marked conflicted, with no markers.
