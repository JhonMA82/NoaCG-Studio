---
name: safe-merge
description: Safely merge a branch or worktree into main - live preflight checks, verified build, then push
---

Read `.agent-workflows/safe-merge.md` (relative to the repo root) now and follow it in full -
that file is the canonical procedure, shared with the Claude Code command of the same name.
Nothing here overrides it. Any branch name the user typed after `$safe-merge` in the invoking
message is the branch the workflow refers to; if none was given, detect it as the workflow's
Phase 1 describes.
