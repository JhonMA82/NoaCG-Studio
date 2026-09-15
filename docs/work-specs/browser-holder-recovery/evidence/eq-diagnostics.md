# EQ browser holder diagnostics

## Scope, context and authority

2026-09-15. Worktree `C:/Users/ahonemi/.codex/worktrees/pilot-eq/NoaCG-Studio`, branch
`claude/eq-browser-holder-diagnostics`. The existing assigned worktree was clean and stayed on
its assigned branch. Read root AGENTS.md, the parent spec, EP readiness receipt, work-spec README,
the standing browser-blocking backlog ask and orchestrator/specs.md. No nested scripts AGENTS.md
exists. Read the changed root contract after integrating origin/main: NOW serves dated events;
other clear, sensible work is no longer categorically parked. This assigned pilot remains authorized.

Integrated current origin/main by fast-forward (331e8414, then fff13a0a after the resumed dispatch).
Re-ran `npm run contracts:compile` after each integration; no generated drift remained. No primary
checkout read/build or branch rename. Own `npm ci --no-audit --no-fund` completed successfully.

The earlier Claude implementation attempt c9926f85-b47d-4cea-a414-19ddcf6be1c0 ended with configured
CLI permission denials for Edit/npm/test, without code or commit. The coordinator verified its PID
15200 gone and the tree clean before native transfer. Native fallback is the same assigned worktree,
not a permission change or retry through Claude. No native safety refusal occurred. Usage pauses
were resumed in the same native task; pending exec sessions were recovered, not duplicated.

## Reproduction and change

Before implementation, a controlled live-holder descriptor (PID 42, age 126 min, CPU 1.7 s) passed
to existing `describeRuns` printed only `C:/fixture (pid 42, controlled idle holder, 126 min in)`.
The module exposed no CPU/idle classifier. This establishes absent diagnostic behavior, not a
reproduction of the historical 126-minute incident.

The original HEAD `orphanProcesses` function was separately executed with injected OS providers:
a live `node scripts/l3-sweep.mjs` PID 42 and shell PID 43 yielded
`workers: [], shells: [{pid:43,mb:10}], servers: [], codexTrees: []`. This confirms the predecessor's
static suspicion as a controlled executable reproduction. The existing live-run exclusion now
includes sweeps; it does not use CPU classification. No real browser or unrelated process was killed.

`diagnoseHolders` is pure and informational. Defaults: minimum age 10 min, sample window 5-120 s,
maximum aggregate family CPU delta 0.05 s. Each retained PID must match its exact creation time in
both full OS tables. CPU includes descendants. Missing CPU/start/name, inaccessible full snapshots,
changed trees, recycled identities, impossible parent links, invalid deltas or stale/short windows
remain unknown. Young, browser-present and CPU-active families stay non-suspects. Only a different,
identity-confirmed holder returned by existing `blockingRuns` can explain a wait; sweeps and self
entries cannot excuse themselves. These thresholds are advisory heuristics, not proof of a hang.

Windows CIM supplies creation and kernel+user CPU counters. Full process-query timeout is 10 s.
Unsupported POSIX full-table sampling remains unknown, rather than deriving unstable identities
from elapsed whole seconds. No persistent sampler, lock, job state or kill policy was added.

`e2e-runs --diagnose [--json]` returns informational exit 0; normal active-run exit behavior and
`--wait` remain unchanged. Existing jobs status adds `holderDiagnostics`; the runner prints the
same evidence every 30 s from rolling samples. No diagnostics enter schedule(), outsideRuns(),
reapDead(), reclaimCandidates() or process termination. A query can add bounded observation time,
but no diagnostic status changes a scheduling input or ownership decision.

## Real bounded sampling and command evidence

`eq-cpu-probe.json` retains complete fixture families from real Windows CIM samples. Two non-browser
Node children were given 14-second lifetimes and exited themselves with code 0. Their descriptors
were injected only into the classifier, never activeRuns or the shared queue. Each had one observed
conhost descendant, retained in the receipt. The final probe window was 5823 ms: PID 14608 family
CPU delta 0; PID 12652 family delta 5.8125 s. Production defaults answered young for both. With only
minAgeMs=0 accelerated, answers were suspected-idle and cpu-active. A first successful probe was
repeated after conservative family validation changes so the final receipt covers final behavior
and retains descendants as well as root rows. No historical-incident claim follows.

`node scripts/e2e-runs.mjs --diagnose --json` and `node scripts/jobs.mjs --json` both exited 0
on the quiet machine. `eq-cli-status.json` has an empty diagnostics list; `eq-jobs-status.json`
has an empty holderDiagnostics list and unchanged queue arrays. These prove command wiring for
no holders; controlled formatter/classifier tests prove the nonempty evidence, not a fabricated
real stalled holder. Existing shared runner was not killed or restarted to adopt this code.

## Verification and boundary

Focused adversarial tests cover young, active parent/descendant, browser, other-holder wait,
self-wait, unknown/recycled/incomplete/changed samples, and genuine orphan preservation. They
invoke the production reclaimCandidates adapter with the real orphan classifier and show no
suspect or owned shell enters the candidate list. planReclaim keeps suspects; schedule gives
identical decisions with/without advisory evidence; reapDead keeps a live PID.

Review/simplify/build final results are recorded below after completion. The initial focused run
passed 138/139 tests with one platform skip. No browser-driving code or UI changed in this slice;
the assigned gate is build plus focused process/queue/reclaim checks and the real non-browser CPU
probe. A read-only integration plan identifies inherited main UI/configured/catalog changes;
those are not an additional UI change in this slice or a configured-authentication claim.

AC-3 and AC-4 have implementation and controlled/real sampling evidence pending independent
acceptance. AC-5 remains OPEN: coordinator observes landing, ET owns bookkeeping and ES owns
independent integrated review. Neither acceptance ledger nor work-spec.mjs was edited. The backlog
ask is advanced, not closed. EP's readiness evidence remains separate and the historical incident
remains unreproduced.

## Check scope and modes

`node scripts/review-request.mjs` resolved this branch against
`fff13a0a3dbdb538a2fd45d3acf0d3c2612a8bd1`, listing exactly 11 files: the five scripts/tests,
the dated owner-queue item, backlog ask, this receipt and three eq JSON receipts. Compared with
`git diff --name-only` and `git status --short`; scope matched. Read the changed code and receipts
in this worktree. Tool inventory offered no dedicated callable code-review or simplify pass,
so both documented inline paths were used, without claiming a delegated review.

- review: inline. Checked identity reuse, descendant completeness, CPU deltas, false wait excuses,
  informational exit codes, unchanged schedule/reclaim wiring and acceptance scope. Corrected
  unknown browser observations printing zero and made partial CIM stderr fail to unknown.
- simplify: inline. Reused descendantsOf and blockingRuns; one node snapshot now feeds orphan
  classification and worker collection. No scheduler abstraction or persistent state added.
- taste: not applicable. No graphics, UI or browser layout changes.
- relay: `node scripts/relay.mjs read --branch claude/eq-browser-holder-diagnostics` reported none.
- owner receipts: branch owns no receipt; standing parent ask is retained as advanced.
- merge advisory: `git merge-tree --write-tree origin/main claude/eq-browser-holder-diagnostics`
  completed without conflict; merge-order reported clear. No main checkout was occupied.

Initial build attempts stopped at owner-queue metadata validation before test execution: first
missing kind/date, then the route paragraph needed the parser's explicit route heading. Both
were fixed, and `node scripts/check-owner-queue.mjs` passed (95 items). The subsequent full build
is the final verification, rather than treating those failed attempts as green.

Final verify: inline, passed. `npm run build > build.log 2>&1` completed with its own
`BUILD_EXIT=0`, recovered from exec session 93324. It ran 116 script test files / 1648 tests:
1647 passed, 0 failed, 1 platform skip. TypeScript (app/API), ESLint with zero warnings,
dependency checks, Vite, 502 prerendered pages, client secret scan and after-build line-ending
check all passed. The build stamp names this worktree's branch at fff13a0a3d (implementation
was still uncommitted when built). Existing bundle-size advisory was non-fatal. No code changed
after that build. The final build includes all focused process/queue/reclaim regressions and
the unknown-browser-display case added during review; no already-green gate was repeated.
