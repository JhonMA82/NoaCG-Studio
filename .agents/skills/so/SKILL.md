---
name: so
description: Independent second opinion on another session's plan, implementation, benchmark, or decision - read-only, run from a fresh session
---

Read `.agent-workflows/so.md` (relative to the repo root) now and follow it in full - that
file is the canonical procedure, shared with the Claude Code command `/so`. Nothing here
overrides it. Any text the user typed after `$so` in the invoking message is the "optional
focus from the user" the workflow refers to: the subject to review. If there was none,
discover the subject as the workflow describes.
