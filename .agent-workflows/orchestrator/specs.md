# Substantial work - intent, bounded tasks, convergence

Load for a major feature, direction change, repeated partial delivery, or a SPEC row. Routine
fixes use GOAL/WHY/GATE as before. Do not backfill old projects merely to populate this format.

## Authority and the specification checkpoint

Owner intent/rulings -> `docs/GOALS.md`, `docs/NORTH_STAR_2027.md`, `docs/PROGRAMMES.md` ->
active spec -> plan -> task -> implementation -> verification. The last two describe reality,
not permission to redefine the goal. Use those existing sources as the constitution; link the
relevant sections instead of copying product principles. A handoff or discovery is evidence.

A new major outcome starts with a compact `docs/work-specs/<slug>/spec.md`: problem/why, desired
behaviour, authority links, preserved behaviour, non-goals and observable `### AC-1: ...` headings.
Label owner requirements, derived decisions/assumptions and rationale separately. Technical design
belongs in the existing project plan (or `plan.md` beside the spec), not the outcome definition.
The orchestrator assigns the document work to a row; its no-product-edit boundary is unchanged.

Show the proposed outcome to the owner before expensive implementation when new direction needs
alignment. Record the actual message/ruling as `authority.source`, with `status: agreed` only
when it authorizes this outcome. An existing explicit instruction or ratified picture suffices;
do not ask again. Draft work may research/specify, but is not an implementation candidate. The
implementation prompt has no owner-wait step: independent authorized rows keep running. Propose
a better solution openly; changing the goal needs owner steering, not a rewritten acceptance test.

## Bound the assignment, preserve the parent

Before dispatch, assess uncertain decisions, touched subsystems, dependency depth, and time for
real verification using existing `wave-horizon` estimates. `large`, a phase with several distinct
outcomes, or a verification step that cannot fit means split. Prefer a smaller task under one
spec first. Split into child specs only when one milestone remains too large to reason about.

Keep stable parent acceptance IDs. Each child names its parent path and IDs; the parent's task
names the child path in its goal/plan and still needs parent-level evidence. A child completing
does not satisfy an integrated parent scenario automatically. Every criterion stays assigned,
including cross-child integration and preservation scenarios. Never delete an unmet criterion
to make coverage pass. Explain the split; it changes delivery units, not product scope.

Use `docs/work-specs/README.md` for the small versioned `work.json` format. Tasks name one outcome,
size, acceptance IDs, dependencies and a safe stopping point. Planner owns decomposition changes;
parallel workers write distinct evidence files and their handoffs, then a consolidation row
updates the shared record after landing. Allocate that file in TOUCHES, never have siblings race.

`SPEC docs/work-specs/<slug>/work.json T1` binds one prompt to one task. `wave-plan-check` validates
it; immediately before initial launch, refill or resumed dispatch also run:

    node scripts/work-spec.mjs dispatch docs/work-specs/<slug>/work.json T1

This is eligibility, not a claim/launcher. Existing collision checks, launch ledger, host ownership,
guarded resume, window and serialized landing still apply. Never follow a refused check with a
provider call. Large tasks, unmet dependencies and draft specs are not dispatchable. Old plans
without SPEC remain supported; classify new substantial work deliberately, not by keyword guessing.

## Context and worker return

Start with the assigned task, parent intent and relevant acceptance headings, plan section,
applicable area contracts, and current code. Retrieve siblings, logs and incident history only
for a concrete uncertainty. Preserve the current common-path budget; this module is conditional.
Write findings outside chat, then return the concise receipt prescribed in `prompts.md`.

At a coherent milestone, or when context pressure threatens verification, checkpoint code and
evidence, unresolved IDs, decisions and next action. Continue in a fresh native context when the
host supports it, after confirming the old worker relinquished ownership. Do not fake context
resets with a second live worker, reset a deadline, or report completion to escape a full context.
The new context reads artifacts and checks current code; it need not inherit the investigation.

## Converge before closing the parent

Read the spec against the actual current implementation and run the acceptance scenarios. Use
the existing check/review route with fresh context where available; never grade only the diff or
task checkboxes. Inspect preserved behaviour and integrated scenarios as well as new behaviour.
Store a concise review under the spec's `evidence/`, with command/run references, observations,
limitations and every AC marked pass, fail or unverified. Hash the evidence files in `work.json`.

An actionable gap continues a matching task or adds a new stable task with the missing AC IDs.
No automatic change to the spec or plan. Repeat implementation and review within the authorized
window; carry open work to the next wave when it ends. A missing human/hardware observation stays
unverified, while independent work and proven slices may still land.

    node scripts/work-spec.mjs converge docs/work-specs/<slug>/work.json

The read-only checker refuses lost IDs, pending work, missing/altered evidence, old spec hashes
and a changed reviewed tree. `evidence-complete` means the record is consistent, NOT that a hash
or an agent's prose proves behaviour. The reviewer must judge the actual evidence; a zero process
exit, file existence or regex match is not functional verification. Keep implemented,
machine-verified, scenario-proven, owner-accepted and production-proven distinct as PROGRAMMES
already requires. Queueing declares the bounded branch finished, never silently the whole parent.
