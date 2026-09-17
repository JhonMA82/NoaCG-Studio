# Durable orchestration without API adoption

Reviewed 2026-09-13 from `1858fb05`. This is a mechanism change, not a completed unattended wave.

## Architectural comparison

| Official Agents API lesson | NoaCG evidence and decision |
| --- | --- |
| [Overview](https://developers.openai.com/api/docs/guides/agents-api/overview): durable sessions and managed context compaction | Keep the shared wave-plan store and existing launch/job ledgers. Add a read-only recovery projection rather than another state database. Runtime model compaction remains the subscription harness's responsibility. |
| [Architecture](https://developers.openai.com/api/docs/guides/agents-api/architecture): distinguish agent, environment and application control | Preserve one coordinator, isolated worker worktrees and host adapters. Workers choose implementation within declared ownership; the coordinator chooses outcomes and prevents collisions. |
| [Sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions): saved work survives turns | Record host, returned worker ID, worktree and result pointer as optional v1 launch fields. Legacy receipts remain readable with explicit unknown identities. |
| [Events and items](https://developers.openai.com/api/docs/guides/agents-api/sessions/events): live streams are not replayable history | Progress is an append-only record in the existing launch ledger, scoped to launch attempt and SHA. Recovery reads durable facts; ticks emit state changes. A ready claim is not verified completion. |
| [Webhooks](https://developers.openai.com/api/docs/guides/agents-api/sessions/webhooks): react to lifecycle changes, then inspect current state | Reuse the local tick/watch and native wait/heartbeat routes. No webhook service. Tick events are recorded before advancing an atomically replaced snapshot; crash replay is at least once, so consumers reconcile before acting. |
| [Environment lifecycle](https://developers.openai.com/api/docs/guides/agents-api/environments/lifecycle): one environment owner and explicit mapping | Keep worktree isolation, ambiguous-launch refusal and `resume-dispatch` claims. A missing PID is not a free slot or retry authorization. No hosted environments. |
| [Multi-agent](https://developers.openai.com/api/docs/guides/agents-api/multi-agent): delegate independent outcomes | Remove mandatory numbered implementation recipes and temporary-branch renaming assumptions. Keep TOUCHES/MINTS, coherent core, verification and owner-only queueing. |
| [Observability](https://developers.openai.com/api/docs/guides/agents-api/observability) and [tracing](https://developers.openai.com/api/docs/guides/agents-api/tracing): distinguish lifecycle, results and usage | Reuse launch-to-queue/landing durations, attempt counts, pools, gate jobs and event history. Recovery adds plan/prompt byte measurements and evidence pointers. No trace backend or invented subscription token counts. |

The analogy fits, but NoaCG already has a thin control layer in several places. Replacing its
working GitHub merge queue, horizon calculation or guarded resume controller would add risk.
The API overview explicitly uses API billing; no API calls, keys, packages or infrastructure
were introduced. The public tracing beta is a dashboard capability, not an external exporter
we should reproduce. Context compaction is not a substitute for durable ownership and outcomes.

## Reproductions and changes

- Before editing, `linesFor({ok:true,tick:1,events:[],warnings:['git fetch failed']})` returned
  `[]`. Watch warnings now report transitions and recovery, including a successful tick whose
  observation is degraded.
- The original tick saved its cursor before appending events. Inspection exposed the interrupted
  write boundary; injected append and replacement failures now prove the cursor cannot advance
  past an unwritten event. A crash after append may repeat the signal. No exactly-once claim.
- There was no command joining the plan, owner identities, jobs and current refs. The new
  `wave-recover --plan <stored-plan> --json` reads them without transcripts or worker files.
  Unknown ownership remains unknown. A cleaned-up branch uses its last landing pin plus Git
  containment and a landing receipt; a stale pin cannot verify a changed branch.
- `wave-launch progress` checks the latest recorded worker ID and assigned worktree, captures
  HEAD, and appends running/ready/verifying/failed with next action and optional blocker. It
  neither queues nor verifies. Progress records do not inflate launch or retry metrics.
  Ticks ignore reports from replaced attempts or old SHAs, and timestamp-only repeats are quiet.

## Simplification and limits

The common planning path drops from 629 to 623 lines against the unchanged 640-line ceiling;
the 199-line core and instruction headroom limits stay unchanged. Mandatory DO recipes and
the assumption that every worker must rename a temporary branch are removed. The host adapter
owns the state-report commands once. Handoffs remain deltas and evidence pointers; none were
deleted without tracing their remaining work.

Recovery output omits full prompts and heartbeat history. Point-of-use reads replace rereading
the wave narrative. Existing build checks still measure instruction headroom; this change does
not claim to measure the live model context or compact the subscription harness itself.
The event tail is bounded diagnostic history, not a replay cursor or a completion counter.
The watcher retains its existing polling interval; workers supply explicit state instead of
requiring transcript inference. An ended Codex turn still needs its recorded app heartbeat.

The 2026-09-11 cross-harness evidence and `resume-dispatch` remain authoritative for host and
resume limitations. This change does not acquire coordinator ownership or start another wave.
Ready, gate completion, landing and healthy main remain separate facts. Live harness liveness
and main CI must be reconciled before refill; unknown identity never permits adoption.

## Proof

Focused tests exercise a fresh child process reading only durable files, legacy unknown
identity, replacement attempts, old SHA reports, gate/landing separation, real temporary Git
refs after branch cleanup, write interruptions and quiet warning/report transitions.
Run `node --test scripts/wave-{recover,launch,tick,watch}.test.mjs` using explicit filenames
on shells without brace expansion, then `npm run build`.

The read-only command also recovered the real 2026-09-10 stored night plan: four landed rows,
an expired deadline and legacy unknown worker identities from a 66,855-byte plan. It did not
open their transcripts, adopt branches, arm a heartbeat or mutate the live tick state.

Next real wave: use compact outcome assignments on both coordinator hosts, record returned
identities, interrupt the master, resume from recovery output without its transcript, reconcile
owners, refill only independent work, and finish through the unchanged queue with green main CI.
Measure notification-to-action delay, retries, launch/landing latency and the context actually
loaded. A local fixture is not evidence that an overnight subscription shift has succeeded.
