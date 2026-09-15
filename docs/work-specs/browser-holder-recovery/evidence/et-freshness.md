# Acceptance bookkeeping freshness - ET

Date: 2026-09-15. Scope: browser-holder-recovery AC-5 supporting checker repair.
Branch: `codex/et-acceptance-bookkeeping-freshness`; fork: `fff13a0a3dbdb538a2fd45d3acf0d3c2612a8bd1`.

## Reproduction before implementation

`node --test --test-name-pattern="two acceptance ledgers" scripts/work-spec.test.mjs`
failed with exit 1: expected `evidence-complete`, observed `open` (tool chunk 6643cb).
The isolated Git fixture committed two specs and implementation, then wrote two version 2
reviews of the same revision with hash-valid receipts. The old checker exempted only the
current ledger and its evidence directory, so the sibling review made it stale.

## Implementation and observed verification

Recognition is content-based and conservative: version 2 ledgers with known fields,
valid current spec/evidence hashes, ancestor review revisions and receipt paths confined to
their own evidence directory. An existing ledger may change only its review; a new ledger
requires a spec already present at the reviewed revision. Only newly added referenced text
receipts are exempted. No directory is broadly ignored. Existing evidence edits require
re-review even if the receipt hash is updated. Honest partial fail/unverified reviews retain
passed criteria; they do not become complete.

`node --test scripts/work-spec.test.mjs`: 24 tests passed, exit 0, 31.36s,
exec session 56619. Coverage includes two mutually compatible reviews, committed review-only
updates, partial review preservation, changed code/spec/authority, arbitrary JSON and code
under evidence, malformed/unknown records, unknown nested fields, invalid revisions/hashes,
and modified existing evidence for both the target and sibling ledger.

Inline review fixed overly strict handling of honest partial reviews; inline simplification
reused inspectWork validation and removed the former broad directory exemption. Scope matched
review-request at fork above: scripts/work-spec.mjs, scripts/work-spec.test.mjs,
docs/work-specs/README.md, plus this evidence and the dedicated route/handoff documents.
No dedicated review/simplify capability was available. Taste: not applicable; no graphic/UI changes.

Initial `npm run build` session 69667 exited 1 because this fresh worktree had no installed
dependencies (including TypeScript). Locked dependency installation succeeded (session 56378). Build 62643 then caught the new
owner-queue metadata/route syntax; corrected. Build 80043 ran 1,655 tests with no failures,
then failed on an unused envelope variable; replaced with a copy/delete operation.
Final build session 4768 exited 0: all build gates, typechecks, ESLint, dependency checks,
bundle and after-build checks passed; 1,654 tests passed and one was skipped.
The exact exit is persisted in node_modules/et-build-final.exit (0).
Explicit fork-based e2e plan reported nothing the offline suite covers; no browser run needed.

## Limits and continuation

This proves the checker repair, not the real parent AC-5 continuation or complete parent
acceptance. Neither live work.json was edited. ES owns integrated review consolidation.
Unknown/additive fields remain valid general ledger data where inspectWork permits them, but
are deliberately not exempted as bookkeeping. This is accidental-drift detection, not an
attestation system, and receipt content still requires reviewer judgment.

Landing is held until EQ actually lands, followed by fresh integration verification and
this branch's own queue-merge declaration. No scheduler, provider or execution state changed.
