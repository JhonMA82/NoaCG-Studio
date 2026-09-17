# Restore the standing delegation effort after the trial

The brand-creator build reproduced a failure in `scripts/codex-rescue.test.mjs` on
2026-09-17: the medium-effort trial expired on 2026-09-16. The existing owner ruling
permits an evidence-backed extension or a return to high.

Ran `npm run harness:usage -- --since 2026-09-09T00:00:00Z`. The ledger reports 32
tasks, with 13 excluded from worker-quality comparisons because of our invocation or
specification. Astra has five rows across refactoring and documentation, four attributed
to those caller errors and none accepted as delivered. This is insufficient evidence
for extending the trial, and does not establish a model-quality ranking.

Restore `DEFAULT_EFFORT` to high and pin that standing default in the existing test.
Explicit effort overrides and model selection remain as before. This resolves the dated
build failure without moving the expiry or weakening the guard.
