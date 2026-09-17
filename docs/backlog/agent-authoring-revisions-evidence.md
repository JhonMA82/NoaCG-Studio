---
v: 2
source: derived
kind: finding
raised: 2026-09-13
state: parked
note: Optional future co-authoring contract; preserve the independent CLI and current contract-only skill.
found: Studio provides revision checks and temporal evidence that can improve NoaCG without adopting its scene model.
serves: P7
size: standard
needs-owner: none
---

# Tie authoring changes and visual evidence to an exact source revision

**Filed:** 2026-09-13. **Source:** [Studio research](../OGRAF_STUDIO_RESEARCH.md), section 7.

## Why

An agent can validate one version and save another, or overwrite a person's intervening edit.
Compact inspection, source revisions and multi-frame evidence make collaborative editing safer
without requiring every coding agent to manipulate a proprietary scene through a live window.

## What it would take

Audit current sourceHash, package rebuild/save and bridge protocol semantics first. Define a
revision over canonical source and asset identity, expectedRevision/sourceHash preconditions,
atomic deterministic transform batches, conflict results and one undo transaction. Reuse the
existing transforms and CLI command library through `src/bridge/`; do not introduce a second
MCP server or a second validator. Initial evidence-only CLI improvements need no live editor API.

Specify inspection of stable fields/actions/elements, supported-edit limits, capture strips at
lifecycle/loop/update boundaries and output receipts containing source plus artifact hashes.
Distinguish browser availability, render readiness and validation success. Preserve recoverable
draft saving; enforce deployable-output checks at export/library admission as applicable.

## Acceptance and handoff

Two concurrent edits from the same revision cannot both commit silently. A stale apply returns
current revision and enough information to re-read, without partial writes. Validation and saved
artifact hashes must match despite a concurrent edit during capture. Undo restores source/assets.
Terminal and MCP produce the same outcome. Unknown code remains editable as code and is not
silently normalized away. Measure optional tool payload/context cost before expanding the current
single-tool MCP surface. Add no creative style instructions to the contract-only skill.

## Evidence

[Current CLI contract](../AGENT_CLI.md), [MCP implementation](../../cli/src/mcp.ts),
[revision and certification comparison](../OGRAF_STUDIO_RESEARCH.md#7-studios-agent-architecture-and-noacgs-contract).
