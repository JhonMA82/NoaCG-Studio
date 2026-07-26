# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- `AGENTS.md` is the authoritative shared project contract. Keep Claude-only behavior in this
  file unless a cross-tool rule needs to name both adapters.
- Shared command behavior lives in `.agent-workflows/`. Files under `.claude/commands/` are thin
  Claude adapters; the matching Codex adapters live under `.agents/skills/`.
- Nested per-area contracts use the same pattern: `AGENTS.md` is authoritative and the sibling
  `CLAUDE.md` imports it.
