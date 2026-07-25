# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- `AGENTS.md` above is the shared, tool-agnostic contract (also read by Codex and any other
  agent). Nothing Claude-specific belongs in it - put that here instead.
- `/safe-merge`, referenced in `AGENTS.md`'s Git section as the one standing exception to "never
  land on main unasked," is a Claude Code skill (`.claude/commands/safe-merge.md`).
- Nested per-area contracts (directories marked * in `AGENTS.md`'s architecture map) are still
  plain `CLAUDE.md` files - they have not been split into `AGENTS.md` + `CLAUDE.md` pairs yet.
