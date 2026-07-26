---
name: handoff
description: End-of-session handoff for NoaCG Studio - what should be done next, and whether this chat is safe to archive
---

Read `.agent-workflows/handoff.md` (relative to the repo root) now and follow it in full - that
file is the canonical procedure, shared with the Claude Code command of the same name. Nothing
here overrides it. Any text the user typed after `$handoff` in the invoking message is the
"optional focus from the user" the workflow refers to; if there was none, there is no focus.
