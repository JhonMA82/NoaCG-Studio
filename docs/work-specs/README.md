# Specifications for substantial work

Use this only for new substantial work or a feature repeatedly crossing session boundaries.
The procedure is [the shared spec module](../../.agent-workflows/orchestrator/specs.md).
Small fixes keep the existing prompt and handoff. Existing project plans remain where they are.

Each directory contains a compact `spec.md`, `work.json`, and `evidence/` text receipts. A plan
is optional here if the project already has one. Root authority stays in GOALS, NORTH_STAR_2027,
PROGRAMMES and owner rulings. An owner message can be preserved as a separate intent artifact;
it is retrieved for ambiguity, not copied into every prompt.

The spec describes the problem, desired behaviour, authority, preserved behaviour and non-goals.
Acceptance has stable headings `### AC-1: <observable outcome>` followed by the scenario. Those
headings are the only acceptance inventory, not a second list in the JSON. Do not reuse IDs.
Keep owner requirements separate from derived choices and evidence. Child specs name their
parent and inherited IDs; the parent retains tasks for its entire acceptance inventory.

An initial record looks like this (substitute the digest and actual authorization):

```json
{
  "version": 1,
  "specSha256": "<digest of spec.md>",
  "authority": {
    "status": "agreed",
    "source": "<owner message/ruling reference that authorized this outcome>"
  },
  "tasks": [
    {
      "id": "T1",
      "goal": "A saved document reopens with its original text",
      "size": "small",
      "covers": ["AC-1"],
      "dependsOn": [],
      "state": "planned",
      "stop": "Save/reopen scenario passes; remaining criteria stay open"
    }
  ]
}
```

`size` uses the existing small/standard/large vocabulary. Large is retained for decomposition,
but cannot dispatch. `state` is planned/active/verified. Verified tasks require `evidence`, an
array of `{ "path": "<repo-relative text receipt>", "sha256": "<digest>" }`. Receipts contain
commands/run links, observed results and limitations; logs/screenshots can be linked from them.
Accepted receipt extensions are `.md`, `.json`, `.txt`, `.log`. Hashes normalize CRLF to LF.

To hash a text receipt or spec on either host, use the exported `digest` function:

```sh
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {digest} from './scripts/work-spec.mjs'; console.log(digest(readFileSync(process.argv[1])))" docs/work-specs/example/spec.md
```

Update `specSha256` only after reconciling a changed spec with its authority and task coverage.
The digest detects change, not owner approval. Never manufacture a ruling to satisfy the shape.
Unknown versions are read-only refusals; additive optional fields do not bump version 1. Any
future breaking format change must ship its on-read migration before producers write it.

After implementation, the reviewer compares actual behaviour to each criterion. Complete records
add `review` with `revision` (full Git commit), `specSha256`, `evidence` (review receipt references),
and `criteria`, exactly one entry per AC:

```json
{
  "id": "AC-1",
  "status": "pass",
  "evidence": [{ "path": "docs/work-specs/example/evidence/save.md", "sha256": "<digest>" }]
}
```

Use fail/unverified when appropriate and reopen/add a task. Commit implementation before recording
the review revision. Only `work.json` and this spec's `evidence/` may change afterwards without
invalidating freshness. This intentionally includes unrelated tracked changes and untracked code:
after integration, review the current tree again. A bookkeeping-only commit does not need a new
review. Keep arbitrary code out of `evidence/`. The checker is not an adversarial attestation system.

Commands, from the feature worktree, write no files and run no evidence commands:

```sh
node scripts/work-spec.mjs status docs/work-specs/example/work.json
node scripts/work-spec.mjs dispatch docs/work-specs/example/work.json T1
node scripts/work-spec.mjs converge docs/work-specs/example/work.json
```

`status` succeeds for valid open records, reporting gaps and ready task IDs. `dispatch` also
requires one planned, bounded task with evidenced verified prerequisites and agreed intent.
It is not a durable claim: apply existing host ownership, launch and resume guards next.
`converge` succeeds only for `evidence-complete`. That is record integrity, not proof of semantic
correctness, reviewer independence, or owner acceptance. A human or reviewing agent still checks
the actual scenarios. For example, a report that says "button exists" cannot prove "save survives
reload" even when its hash matches. The read-only checker never executes a command found in text.
Output shows counts and at most ten entries per list; add `--details` only to investigate further.

Wave prompts may add `SPEC <record path> <task ID>`. Plan checking validates the reference, scope
size and authority; it permits future dependencies and already-running rows so rechecks remain
usable. Run the stricter dispatch command immediately before an eligible launch. Parallel rows
write distinct evidence/handoff files; reserve record updates for one consolidation row. Existing
wave state stores launch IDs, deadlines and ownership outside disposable worktrees as before.
