---
name: n
description: Alias for next - plan what to do next in this session (options to choose from, or an honest "nothing left")
---

Short alias for `$next`. Read `.agent-workflows/next.md` (relative to the repo root) now and
follow it in full - that file is the canonical procedure, shared with the Claude Code command
`/next`. Nothing here overrides it. Any text the user typed after `$n` in the invoking message
is the "optional focus from the user" the workflow refers to; if there was none, there is no
focus.
