# Ranked interventions

Ranked by expected improvement to landing time and recurring cost, then by coverage risk and
confidence. Savings are per week against the four-week measurement (`evidence/cost-and-growth.md`)
and are stated once: where two rows would save the same minutes, the later row counts only what
remains after the earlier one. "Execution" is table-minutes of the full run; "runner" is runner
minutes per week; "latency" is the expected effect on queue entry to landed. Confidence: H measured
or replayed, M estimated from measurements, L unmeasured.

| # | Intervention | Affected | Protection retained | Execution | Runner / week | Latency | Confidence | Effort | Risk |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Batched, pinned, never-cancelled full validation; skip when nothing relevant landed; stale alarm; per-landing bisect | `ci.yml` plan and after-gate, `scripts/red-main-issue.mjs`, `scripts/revert-landing.mjs`, new `validated.json` | Full suite still runs on every relevant change, within 60 min p90 (replayed 28) | 0 | -6,700 to -8,800 (32-42% of the 21,000 main-push minutes of week 10-05) | p90 down by the share of queue wait main's 11 slots cause at the 20-job ceiling (measured after) | H for cost and detection (replay), M for latency | M | M: attribution over a range (p90 2 landings) handled by bisect |
| 2 | Configured suite at the validation cadence, not per push; fixed-cost split measured | `configured-suite.yml` trigger | Same suite, attributable to the same range | 0 | -1,700 to -2,200 (of 5,200 in week 10-05) | frees 1-2 of 20 slots in busy hours | M | S | L |
| 3 | Shared-change set replaces the expired focus; CORE escalators narrowed with covers lines; untraced specs flagged | `scripts/e2e-lists.mjs`, `scripts/e2e-affected.mjs`, spec headers | Escalations still run every journey a shared change can break; misses measured against full validation for two weeks | 0 | -1,000 to -1,700 (27% of landings x 2 runs x 20-30 min) | gate plans for shared changes 68 -> ~40 table-min | M | M | M: a selection miss (mitigated by full validation and the miss count) |
| 4 | Capacity check on pull requests and merge groups; exceptions; protection check; placement rule and instruction updates | `scripts/e2e-durations.mjs`, `ci.yml` e2e-report, new `scripts/check-e2e-protection.mjs`, contracts rules, `docs/VERIFICATION.md`, work-spec README | None removed; this is what stops growth without a ledger | 0 now; holds usage <= 95% | prevents the +26/week curve (capacity model) | prevents cap hits | H that it measures, M that it changes behaviour | M | L |
| 5 | Catalog gate on main only when a landing in the range flagged it | `scripts/e2e-affected.mjs --all`, `ci.yml` | Catalog changes still gated pre-merge and at validation | 0 | -250 after row 1 (4.5 min x ~55 runs) | none | H | S | L |
| 6 | Task and qualification walks to the scheduled validation with focused counterparts pre-merge (candidates 1-3, 13, 14) | 7 spec files | Named behaviours kept by focused specs and one journey each; walks run at every validation with the landing list | -14 (full run) and -10.8 off 11-19% of gate plans | -900 (60 validations x 14 min + gate share) | removes 360-s tails from the cap | M | M | M: replacement credibility per spec, validated by fault injection |
| 7 | Consolidate editor-groups/arrangement, move geometry to Node, drop the empty probe (candidate 4) | 2 spec files, `scripts/editor-arrangement.test.mjs` | Journeys per button kept; geometry mutation-tested in Node | -2 to -3 | -150 | none | M | S | L |
| 8 | No-UI specs to Node or the blank-page tier (candidates 10-12, 19) | up to 19 files | Same assertions and mutation twins | -5 to -8 over time | -400 | AI changes' plans shrink | M (E6 measures) | M | L |
| 9 | Fixture profiling: playout-folders, import-svg family, bridge-connect, production-controls, playout-cues (candidates 5-9, 17, 18) | 8 files | All behaviours kept | -6 to -12 (unmeasured) | -500 | high-share specs shrink gate plans | L until profiled | M | L |
| 10 | Trace off in the gate (E2) | `playwright.config.ts` | Traces stay on validation and retry | up to -25% of gate execution (unmeasured) | up to -2,500 | gate wall -15% if measured | L | S | M: first-failure diagnostics on pull requests |
| 11 | Subset shard target 6 min for gate runs (E3) | `scripts/e2e-affected.mjs` | none affected | 0 | 0 (same minutes, fewer slots) | fewer queue waits on busy days versus +1-2 min execution | L | S | L |
| 12 | Quarantine expiry (14 days -> issue) and the dashboard-hosted-walk root cause | `scripts/e2e-quarantine.mjs`, `quarantine.yml` | none affected | 0 | -300 (configured/quarantine/post-land cycles of 50 mechanical landings; their ci.yml cost already falls under row 1) | fewer bounced merge groups | M | S | L |
| 13 | Retry refuses when a shard was cancelled after a green report (#1025) | `scripts/e2e-retry.mjs` | none affected | 0 | avoids red-main cycles | avoids a false red main | H | S | L |
| 14 | Per-test timeout ceiling 120 s in the gate set; 360-s tests move with row 6 | 70 files over time | none affected | 0 | 0 | cap tails removed | M | M | L |
| 15 | Old-editor mapping pass (candidate 15): retire obsolete, rewrite the rest at the cheapest layer | 40 files | Owner ruling kept; obsolete list shown once | -7.6 waste, +restored minutes (budgeted) | -450 | none | M | L | M: owner reads the obsolete list |
| 16 | Workers per shard (E1) | `playwright.config.ts` | none affected | 0 | fewer slots per run if efficient | fewer queue waits | L | S | M: contention failures |

Overlaps separated: rows 1 and 2 share the cadence; row 5 counts only runs that remain after row 1;
rows 6-9 reduce the full run that row 1 runs less often, so their runner saving uses ~60
validations a week; row 12 counts only the per-push side workflows because row 1 already skips
mechanical landings' full runs.

## What this adds up to

Rows 1-5 are structural and together cut recurring cost by roughly a fifth to a quarter (10,000 to
13,000 of the 57,600 runner-minutes of week 10-05, measured parts only) without removing a test, and
they attack the p90 directly through contention at the twenty-job ceiling. Rows 6-9 and 15 are the portfolio work: 25-35 table-minutes of
the full run, bringing usage from 94% to about 75% once the profiled items deliver, and shrinking
the gate plans of the most-selected files. Rows 10, 11 and 16 are experiments: potentially the
largest single execution lever (trace) and the cheapest latency lever (slots), but unmeasured.
Row 4 is what keeps the result: without it the curve in `evidence/capacity-model.md` resumes.
