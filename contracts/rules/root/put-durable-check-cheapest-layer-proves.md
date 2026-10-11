---
v: 1
scope: src/**
kind: rule
fires: contract
status: active
since: 2026-10-11
supersedes: root/give-any-new-flow-playwright-spec
record: contracts/records/root/2026-10-11-put-durable-check-cheapest-layer-proves.md
---
Put a durable check at the cheapest layer that proves the behaviour: a Node test under scripts/ importing src for pure logic, a blank-page browser spec for DOM, canvas, fonts or layout, one journey spec per user-visible flow extended in that flow's maintained e2e file rather than a new file per feature or bug, the configured suite only for backend-dependent behaviour, and scheduled validation for exhaustive or qualification walks. A new UI flow still gets its journey in the same commit, mapped in the spec's own covers header, never in a shared list.
