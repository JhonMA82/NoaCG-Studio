---
v: 2
source: derived
kind: finding
raised: 2026-09-16
state: unstarted
found: "noacg doctor reports only the version of the copy running it, and does not separately name what resolveCli() would actually resolve to"
---
# `noacg doctor` does not separately report what `resolveCli()` would resolve to

**Filed:** 2026-09-16, during the 2026-09-16 handoff drain (row TE), carried over from
`docs/handoffs/2026-09-16-se-publish-and-retire-stale-cli.md`, which closed the sibling defect
(the MCP launcher now warns when a stale global install wins over `npx`) and explicitly left this
half open rather than deciding it.

## Why

The launcher-warning fix (`cli/plugin-mcp/mcp-server.mjs`) tells a session when a stale global
`@noacg/cli` is about to be used instead of `npx`'s current one. `noacg doctor` still only prints
the version of whichever copy is running it, so a person running `doctor` directly - not through
the MCP server - gets no equivalent warning: the tool doesn't say what `resolveCli()` would
actually pick.

## What it would take

The row that closed the sibling defect called this "the backlog file's second, harder-to-decide
proposal" and declined to guess at the product shape - whether `doctor` should print both
versions, warn, or something else is a real decision, not a mechanical follow-on.

## Evidence

`docs/handoffs/2026-09-16-se-publish-and-retire-stale-cli.md`, "Not done, and separable on
purpose": "Teaching it to do both was the backlog file's second, harder-to-decide proposal; this
row implemented the first ... and left the second open rather than guessing at a product
decision."
