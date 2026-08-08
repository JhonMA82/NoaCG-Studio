---
name: orchestrator
description: Orchestrate the day's work - turn finished sessions' handoffs and build feedback into ordered, pasteable prompts
---

Read `.agent-workflows/orchestrator.md` (relative to the repo root) now and follow it in full -
that file is the canonical procedure, shared with the Claude Code command of the same name.
Nothing here overrides it. Any text the user typed after `$orchestrator` in the invoking message
is the pasted input the workflow refers to: handoff blocks from finished sessions, owner feedback
from testing the newest build, or both. If there was none, plan from repository state alone and
say so.
