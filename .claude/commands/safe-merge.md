---
description: Safely merge a branch or worktree into main - live preflight checks, verified build, then push
argument-hint: [branch-name (optional - will be detected if omitted)]
disable-model-invocation: true
---

Argument: $ARGUMENTS

Read `.agent-workflows/safe-merge.md` now and follow it in full - that file is the canonical
procedure, shared with the Codex skill of the same name. Nothing here overrides it. The
argument above (if any) is the branch name the workflow refers to; if empty, detect it as the
workflow's Phase 1 describes.
