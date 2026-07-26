# cleanup-worktrees - bulk-clean stale worktrees safely

Shared canonical procedure for the `cleanup-worktrees` workflow - invoked as
`/cleanup-worktrees` in Claude Code, `$cleanup-worktrees` in Codex. Cross-references to other
workflows below use their plain names (e.g. "the safe-merge workflow"); translate as
`/safe-merge` in Claude Code, `$safe-merge` in Codex.

Clean up the leftovers from finished coding sessions: stale git worktrees, managed
`claude/*` / `codex/*` branches that are already fully merged and backed up, stale worktree
metadata, and empty leftover worktree folders. Do NOT print git commands for the user to run -
drive the script yourself, read its output, and report conclusions.

This workflow can delete branches and worktrees, so it runs **only when the user explicitly
invokes it by name**. Never infer invocation from a request to inspect or discuss repository
hygiene.

The executable safety gates live in `scripts/cleanup-worktrees.mjs` (dry-run by default,
`--apply` to act). It uses ancestry containment for deletion decisions and shares the
empty-folder inspection/removal helpers with the SessionStart hook. Your job is to run it,
sanity-check its assessment, and apply only when the assessment is clean.

## Why this runs from the primary checkout only

A worktree cannot delete the folder it is running inside. This workflow must be run from a
fresh session in the **primary `main` checkout** (`C:\claude\NoaCG-Studio`). The script
enforces this and refuses to act from a linked worktree - if it reports that, stop and tell
the user to rerun from the primary checkout. Never work around it.

## What counts as safe (the script decides; these are the rules it applies)

- The ONLY trustworthy "safely merged" test is commit containment. Automatic deletion requires
  the ref to be contained in both local `main` and `origin/main`; branch names, `gone` upstream
  markers, tree similarity, and memory are never trusted.
- A worktree is removed only if its working tree is clean AND (its branch is safely contained,
  OR it is detached at a safely contained commit). Dirty, local-only, or unique-work worktrees
  are skipped and reported.
- Branches: only safely contained `claude/*` and `codex/*` branches are deleted (via
  `git branch -d`, never `-D`; git refuses an unmerged branch as a final backstop). `main` and
  the current branch are never touched. Other merged branches are reported, not deleted.
- A branch merged via "squash and merge" never passes the ancestry test (its commits aren't
  reachable from main), so it's caught separately: if its tree is already identical to main's,
  it's reported as a possible squash merge for manual review - never deleted automatically, since
  tree equality is a weaker signal than true ancestry.
- Empty leftover folders are swept; non-empty unregistered folders are reported for manual
  review, never auto-deleted. Locked/busy folders are reported to rerun later.

## Steps

1. **Run the dry run:** `node scripts/cleanup-worktrees.mjs`. The script refreshes
   `origin` before every assessment and again immediately before applying, and refuses cleanup
   if either fetch fails.
2. **Read and relay the plan.** Summarize what will be removed/deleted, what is skipped and why,
   every empty/non-empty/unreadable leftover folder, and any manual cleanup remaining. If the
   script refused (not the primary checkout on `main`, missing refs, unreadable state), stop and
   report that - do not force anything.
3. **Auto-apply on a clean assessment (standing permission).** If the plan shows only safe
   removals and skips with benign reasons, apply it without waiting:
   - `node scripts/cleanup-worktrees.mjs --apply`
   STOP and ask the user first only when the assessment surfaces a real risk:
   - local `main` is ahead of or diverged from `origin/main`;
   - a worktree is skipped for **uncommitted changes** or **unique detached work** that the user
     may want to keep;
   - a ref is contained only in local `main`, not `origin/main`;
   - a **non-empty leftover folder** was found (it may be live work);
   - an unreadable leftover folder was found;
   - anything the script could not classify.
   In those cases, report the specific item and let the user decide. If the user explicitly
   approves cleaning the independently safe items while leaving every risk untouched, run:
   - `node scripts/cleanup-worktrees.mjs --apply --acknowledge-risks`
4. **Report the outcome** from the `--apply` output: what was deleted, what was skipped and why,
   and whether any manual cleanup remains. Do not claim success for items the script marked
   `[FAILED]` or left in "Manual cleanup remaining".

Hard rules (never break, even if asked mid-flow): never `git branch -D`, never
`git worktree remove --force`, never delete `main` or the current branch, never delete a
non-empty folder, never run from a linked worktree.
