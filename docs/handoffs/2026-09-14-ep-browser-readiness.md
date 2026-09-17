# Continue the browser-holder recovery parent

After this readiness slice lands, the coordinator should capture real work-spec and wave-tick output, then dispatch EQ for AC-3/AC-4. This keeps verification recoverable and makes a live, sustained-idle holder visible without inventing termination authority. AC-5 requires that continuation plus a separate integrated review, including the actual Claude route and any denials. The parent record is `docs/work-specs/browser-holder-recovery/work.json`; do not promote it from this worker's green result.

Evidence: `docs/work-specs/browser-holder-recovery/evidence/ep-readiness.md`, with portable job logs/timings beside it. Owner route: `docs/acceptance/owner-queue/2026-09-14-browser-readiness.md`. Implementation commit: `696e32e6` on `codex/ep-browser-readiness`. The recovered full build exited 0; review/simplify/verify modes were inline and scope-checked against a24bfce0. Queued root-stall j-1068 failed at the real 10-second guard cap; following j-1069 passed. AI headers/body stalls j-1073/j-1074 failed boundedly; following j-1075 passed. Both assigned ports were free and no fixture runner remained. No code changed after verification.

```text
Continue SPEC docs/work-specs/browser-holder-recovery/work.json. EP owns the completed AC-1/AC-2 readiness slice: branch codex/ep-browser-readiness, implementation HEAD 696e32e6, clean before this handoff-only commit, full npm run build exit 0 and accepted queued scenario IDs in evidence/ep-readiness.md. This handoff was written 2026-09-15 after recovering a usage pause, retaining the assigned 2026-09-14 filename. The same native identity/worktree resumed twice without duplicate ownership.

Not landed at handoff; the owning worker queues after committing this file. Coordinator owns landing wait, then actual parent-open work-spec/wave-tick capture and EQ dispatch. AC-3, AC-4 and AC-5 remain unresolved; both acceptance ledgers are unchanged. AC-1/AC-2 still need the independent parent's acceptance review. No authenticated or production coverage and no reproduction of the historical 126-minute incident are claimed.

Touched 13 implementation/evidence files: three Playwright configs; e2e/_offline-guard.ts, offline.spec.ts, public-service.spec.ts; scripts/e2e-readiness-fixture.mjs, e2e-readiness.config.mjs, e2e-readiness.test.mjs; three evidence files and one owner-queue item. This slice blocks EQ only until landing. Follow root/e2e AGENTS.md and the parent spec; preserve existing queue, process ownership and all normal 60-second webServer caps. Run diagnostic fixtures at default full queue cost; the discarded half-cost batch overlapped and is not acceptance evidence.
```

NOT SAFE TO ARCHIVE YET - commit is not contained in main or origin/main; let the owning worker's queue declaration finish, then the coordinator observes landing and continues the open parent.
