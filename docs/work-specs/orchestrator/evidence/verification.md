# Verification receipt - 2026-09-14

Historical v1 implementation receipt. The owner's later clarification replaced its task-state
semantics with an acceptance-only v2 ledger; use the latest review in `work.json` for current proof.

Scope: `codex/orchestrator-spec-convergence`, base
`ee3e7db42fc54ce61273e2f451b0326819d4c607` against origin/main. Source of scope:
`node scripts/review-request.mjs`. Reviewed the shared workflow changes, new spec module,
architecture review, docs index, feature artifacts, `work-spec.mjs`, its tests and the
`wave-plan-check.mjs` integration. No product rendering or provider transport code changed.

Review: inline. No dedicated review tool was available in this runtime's tool inventory; used
the check workflow's inline path. Simplify: inline. Taste: not applicable; graphics cannot move.

Review corrections:

1. Planning must permit a future-dependent task and already-running rows. Tight dependency/state
   readiness belongs at dispatch; the plan still validates identity, size and authority. The
   same record was exercised through Opus and Codex pool rows, including legacy prompts.
2. Evidence/spec text hashes normalize CRLF/LF so a checkout's line endings do not invalidate
   the same receipt on the other host. Binary evidence is referenced from text receipts.
3. Empty receipts were reproduced as accepted by the first validator (`problems: [], gaps: []`
   with a correctly hashed empty file). They now create explicit gaps; regression included.
4. The default status response is capped at ten entries per list with counts. Full detail is
   explicit retrieval, keeping a large parent's unfinished task list out of every tick.

## Executed checks

- `npm run build`: exit 0. Includes typechecks, ESLint with zero-warning tolerance, architecture
  checks, Vite/prerender, secret scan and repository gates. The Node script-test stage discovered
  115 files and ran 1,636 tests: 1,635 passed, one skipped, zero failures. The separate AI gateway
  stage ran 22 test files. Vite emitted its existing chunk-size advisory; this is not a lint error.
- `node --test scripts/work-spec.test.mjs scripts/wave-plan-check.test.mjs`: 38 passed, zero
  failures. The final empty-receipt change was also run through all 10 work-spec tests, passing.
- `node --test scripts/wave-plan-check.test.mjs scripts/wave-plan-store.test.mjs
  scripts/candidates.test.mjs scripts/wave-horizon.test.mjs scripts/wave-tick.test.mjs
  scripts/wave-launch.test.mjs scripts/resume-dispatch.test.mjs scripts/queue-pr.test.mjs
  scripts/landings.test.mjs`: 118 passed, zero failures/skips. These cover the retained wave,
  deadline, claim/recovery and landing mechanisms with local fixtures.
- `node scripts/check-shared-instructions.mjs`: both runtime adapters valid, 199/200 core lines,
  628/640 common-path lines versus 629 before this patch. Same instruction-chain byte limits.

## Acceptance observations

| Criterion | Verdict and evidence |
|---|---|
| AC-1 | Pass for this increment: architecture review maps the existing mechanisms and failures; the 118 focused orchestration regressions pass. No scheduler/claim/landing implementation was replaced. |
| AC-2 | Pass: real record tests reject lost criteria, cycles, bad dependencies, draft/large dispatch and unevidenced prerequisites. A future dependency remains legal in a plan; an independent eligible task is ready. |
| AC-3 | Pass: all task checkboxes without a review remain open. Failed/unverified/missing claims and empty/changed receipts remain gaps. Temporary Git repository tests reject changed implementation, untracked code and invalid review revisions; bookkeeping-only commits retain validity. |
| AC-4 | Pass for the stated mechanism: common-path context does not grow; conditional routing, task pointers, concise returns and checkpoint instructions are wired into the shared flow. No claim of measured real-world quality gains. |
| AC-5 | Pass for the shared workflow: both pool labels use identical checks; legacy no-SPEC prompts pass; wrappers remain canonical. No provider SDK, scheduler, plugin or dependency was installed. |

This receipt records a semantic review of the bounded workflow increment, not an independent
human acceptance or an overnight runtime trial. No live paid model run, whole-night execution,
browser product change or production hardware scenario was needed or claimed. Task-size judgment,
reviewer honesty and correct execution of the pre-dispatch command remain workflow obligations.

The parent review revision is recorded in `work.json` after committing the reviewed implementation.
The convergence command checks that later changes are only that record or this evidence directory.
