---
v: 2
source: owner
kind: ask
raised: 2026-09-14
state: unstarted
asked: "The untouched large/deep instruction corpus and broader context-rot problem should remain an explicit follow-up after this pilot; don't let the new spec system merely add another layer on top of stale context."
serves: orchestrator-spec-convergence
size: standard
needs-owner: none
---
# Audit actual loaded context after the acceptance pilot

**Filed:** 2026-09-14. **Source:** owner clarification to the Orchestrator architecture review.

## Why

The acceptance ledger preserves obligations across sessions but does not cure stale instructions,
deep automatically loaded contracts or redundant retrieval. A smaller orchestrator core alone
would hide those costs. The first pilot should reveal which context a worker actually needed.

## What it would take

After the pilot, compare actual coordinator/worker loaded paths and bytes on Codex and Claude
Code, check the deepest instruction chains, remove stale/duplicated guidance at its authoritative
source, and route rare material through progressive disclosure. Preserve the generated-contract
pipeline and instruction ratchets. Do not blanket-rewrite or retroactively specify programmes.
Use bounded cleanup rows with contract/build verification; seek owner steering only for an actual
product/intent ambiguity, not because the corpus is large.

## Evidence

`docs/ORCHESTRATOR_SPEC_REVIEW.md` records a 199-line core and approximately 72 KB deepest
instruction chains. Re-measure with `node scripts/check-shared-instructions.mjs` and pilot
receipts rather than treating those historic numbers as current. The pilot outcome belongs in
the existing wave report and feature evidence, not a second context dashboard.
