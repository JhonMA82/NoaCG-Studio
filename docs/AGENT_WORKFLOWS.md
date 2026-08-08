# Shared agent instructions and workflows

This repository supports Claude Code and Codex from one set of project rules and workflow
procedures. The build fails when their adapters drift.

## Canonical sources

- `AGENTS.md` is the authoritative project-instruction file. Nested `AGENTS.md` files add
  binding rules for their directory trees.
- Each sibling `CLAUDE.md` is a thin `@AGENTS.md` import. It may add genuinely Claude-specific
  rules, but it must not copy the shared contract.
- `.agent-workflows/<name>.md` contains the complete, tool-neutral procedure for a reusable
  workflow.

## Tool adapters

- Claude Code exposes a workflow through `.claude/commands/<name>.md` or
  `.claude/skills/<name>/SKILL.md`.
- Codex exposes the same workflow through `.agents/skills/<name>/SKILL.md`.
- An adapter contains only metadata, invocation policy, argument translation, and a pointer to
  the canonical workflow. Behavioral changes belong in `.agent-workflows/<name>.md`, so they
  reach both tools in the same commit.
- Shared workflows must use repository state and repository documentation as evidence. Do not
  make tool-private memory or a user-specific home-directory path part of the shared contract.
- Destructive workflows must be explicit-only in both tools. Claude uses
  `disable-model-invocation: true`; Codex uses
  `agents/openai.yaml` with `policy.allow_implicit_invocation: false`.

Codex project skills use `.agents/skills`, not the legacy `.codex/skills` location. The
repository's `.codex/config.toml` is still used for trusted project configuration.

## Short aliases

A workflow may have a short invocation alias - `/n` and `$n` for `next`, `/o` and `$o` for
`orchestrator`. An alias is nothing but
a second pair of adapters (`.claude/commands/<alias>.md` and `.agents/skills/<alias>/SKILL.md`)
pointing at the target's canonical workflow, so a shortcut can never grow its own copy of the
procedure. `WORKFLOW_ALIASES` in `scripts/check-shared-instructions.mjs` is the registry; the
check fails if either adapter is missing, thick, or points somewhere else. A destructive
(explicit-only) workflow must never be aliased - a one-keystroke command must not be able to
land anything.

## Tool-specific exceptions

`/rescue` is intentionally Claude-only. It delegates a long-running task from Claude Code to
the Codex companion plugin, so invoking it from Codex would have no coherent meaning. Every
other repository-owned Claude command or skill must have a canonical workflow and Codex
adapter.

## Instruction size

Codex limits the bytes it loads from the root-to-current-directory `AGENTS.md` chain.
`.codex/config.toml` raises that limit for this trusted repository because its nested contracts
are intentionally detailed. `scripts/check-shared-instructions.mjs` calculates every chain and
fails if one exceeds the configured limit.

## Adding or changing a workflow

1. Add or edit `.agent-workflows/<name>.md`.
2. Add or update the thin Claude adapter.
3. Add or update the thin Codex adapter and valid `name` / `description` frontmatter.
4. For a destructive workflow, configure explicit-only invocation in both adapters.
5. Add any repository-owned skill name to the `.gitignore` exceptions.
6. For a short alias, register it in `WORKFLOW_ALIASES` and add both thin adapters - never a
   second copy of the procedure.
7. Run `npm run check:shared-instructions`, the relevant focused tests, and `npm run build`.

Never put a second copy of the procedure in a tool adapter.
