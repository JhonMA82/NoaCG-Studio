// Shared registration logic for the merge drivers under scripts/*-merge-driver.mjs.
//
// Both drivers register themselves in `.git/config` under `merge.<name>.driver`, and both had the
// same two ways to go quietly wrong before f1b90e55 (2026-09-16) fixed the contracts driver:
//
//   - Checking that the KEY EXISTS instead of that its VALUE is the command we would write. A
//     clone carrying an older, moved, or renamed command still answers `isInstalled() === true`,
//     so nothing ever repairs it and nothing ever reports it.
//   - Writing with a plain `git config <key> <value>`, which REFUSES a key that already carries
//     more than one value - exit 5, "cannot overwrite multiple values with a single value" - and
//     leaves every stale value standing. A doubled key is exactly the shape two tools writing the
//     same config produce, and `--get` answers with the last of them, so nothing else notices.
//
// This module holds the fix once so a third merge driver does not have to rediscover either one.

import { spawnSync } from 'node:child_process';

const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });

/** What git would actually run for `name` in `cwd`'s clone, or null when nothing is set. */
export function registeredCommand(name, cwd) {
  const got = git(['config', '--get', `merge.${name}.driver`], cwd);
  return got.status === 0 ? got.stdout.trim() : null;
}

/**
 * Is this clone registered with exactly the `command` we would write? Presence of the key is not
 * enough: a clone carrying an older command, or one pointing at a worktree that has since been
 * deleted, has the key and no working driver.
 */
export function isInstalled(name, command, cwd) {
  return registeredCommand(name, cwd) === command;
}

/**
 * Register the driver, or correct it. Unconditional and cheap - two `git config` writes - and it
 * must be unconditional: a clone where the entry is WRONG is worse than one where it is missing,
 * and only a write can tell those apart.
 *
 * `--replace-all` because a plain `git config <key> <value>` refuses a key that already carries
 * more than one value, and a repair that can be refused by the exact damage it exists to repair
 * is not a repair.
 *
 * Returns what is REGISTERED afterwards, not whether this call's own write is the one that put it
 * there - every worktree of a clone shares one `.git/config`, and more than one session can be
 * installing at once, so a lost race for `config.lock` is a failed write, not a failed
 * registration.
 */
export function install(name, command, description, cwd) {
  git(['config', '--replace-all', `merge.${name}.name`, description], cwd);
  git(['config', '--replace-all', `merge.${name}.driver`, command], cwd);
  return isInstalled(name, command, cwd);
}
