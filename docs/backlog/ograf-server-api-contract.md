---
v: 2
source: derived
kind: finding
raised: 2026-09-13
state: parked
note: Detailed contract handoff for the existing Server API ladder rung; foreign-package isolation/playout precedes implementation.
found: The facade needs exact identity and acknowledgement semantics without replacing NoaCG command recovery.
serves: P6
size: large
needs-owner: none
---

# Define the OGraf Server API facade and outward controller seam

**Filed:** 2026-09-13. **Source:** [full-stack plan](../OGRAF_FULL_STACK_PLAN.md), sections 4-5.

## Why

OGraf supplies interoperable catalog, renderer, target and graphic-instance operations. NoaCG's
durable log supplies ordering/recovery that the standard leaves to vendors. Combining these
through a facade avoids a second playout system and allows future external renderers.

## What it would take

Pin EBU OpenAPI/types and map every method/envelope/error to existing NoaCG command paths.
Define graphic identity versus immutable package revision, renderer identity, schema-validated
opaque target identifiers and loaded-instance IDs. Define request-to-execution correlation,
timeouts/uncertain results, retention of active package assets and authentication at the facade.
Map existing persisted columns before proposing changes; version/migrate any breaking format.

The first artifact is pure contract/mapping fixtures. The HTTP server belongs on the server side;
`/output` is a browser executor. Ingress uses the existing command authority. The later outward
adapter uses the same semantics but cannot assume a foreign server shares NoaCG recovery.
Do not adopt SuperFlyTV's Koa/MobX application or its private upload endpoints as the standard.

## Acceptance and handoff

Prerequisites: isolated foreign hosting and generic contract coverage. Verify all standard routes
against pinned OpenAPI and a pinned ograf-server instance. Exercise concurrent controllers, stale
instance IDs, target replacement, delayed load, graphic errors, disconnect after applying +1,
reboot/replay and deletion while on air. Return actual lifecycle outcomes, never log-insert 200s
as graphic completion. A timed-out non-idempotent action must not be blindly retried. Discovery
distinguishes stale/unreachable/empty. No invented standard state stream or auth protocol.

## Evidence

[Normative and reference source links](../OGRAF_FULL_STACK_PLAN.md#sources),
[ratified existing ladder](../GOALS.md#next---ograf-first-the-standards-based-platform).
