# start - warm a fresh session before the next prompt arrives

Shared canonical procedure for the `start` workflow - invoked as `/start` in Claude Code,
`$start` in Codex.

The user starts local sessions from their computer, then continues them later from their phone,
where they cannot start a new local session themselves. `start` runs the moment a fresh session
opens, before any real prompt exists, so the session is already grounded by the time one arrives.

## What it does

Read only. Nothing else happens, and nothing is reported except the single word `Ready.`

1. Read the root `AGENTS.md` and every nested `AGENTS.md` in this repository - the per-area
   contracts the root file's architecture map marks with `*`. Skip the same directories the repo
   already treats as noise (`node_modules`, `.git`, `dist`, build output, vendored skills) -
   `SKIP_DIR_NAMES` in `scripts/check-shared-instructions.mjs` is the reference list.
2. Read this project's memory files in full, not just the `MEMORY.md` index one-liners - at
   minimum every file linked under "Current / open", "Standing rules", and "Traps that cost me
   time". Skip "Shipped" entries: they're closed history the next prompt is unlikely to need, and
   staying one grep away from them costs nothing.

## Rules

- Read, don't write, and don't investigate beyond the two reads above: no `git status`, no
  reading source code, no browsing, no task list, no clarifying question.
- Say nothing about what was read. The only output is `Ready.` - no file list, no summary, no
  menu of next steps.
- This is not a substitute for the next workflow. `start` only warms context; it never proposes
  or plans work. If the user wants options for what to do, that is a separate, explicit `/next`.
