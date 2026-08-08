# start - warm a fresh session before the next prompt arrives

Shared canonical procedure for the `start` workflow - invoked as `/start` in Claude Code,
`$start` in Codex.

The user starts local sessions from their computer, then continues them later from their phone,
where they cannot start a new local session themselves. `start` runs the moment a fresh session
opens, before any real prompt exists, so the session knows the project's ground rules by the
time one arrives.

## What it does

Read the ROOT `AGENTS.md`, and nothing else. Then say `Ready.` and stop.

That file already loads automatically through `CLAUDE.md`, so in practice this is a no-op read
that costs nothing - which is the point. The whole value of `start` is a warm session with an
EMPTY context budget spent, because the real prompt is what deserves that budget.

## Rules

- **Read nothing else.** Not the nested per-area `AGENTS.md` files, not the memory directory,
  not `docs/`, not source, not `git status`, no worktree activity, no task list, no browsing.
  Every one of those is one grep away when a prompt actually needs it, and reading them up
  front spends the context window on material that is usually irrelevant to what the user is
  about to ask.
- **Load context lazily, when the prompt arrives.** A nested area contract is read when work
  touches that area; a memory file is read when the task turns out to relate to it. That is a
  decision the prompt makes, not this workflow.
- Say nothing about what was read. The only output is `Ready.` - no file list, no summary, no
  menu of next steps, no clarifying question.
- This is not a substitute for the next workflow. `start` only warms; it never proposes or
  plans work. If the user wants options, that is a separate, explicit `/next`.
