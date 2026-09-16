---
v: 2
source: derived
kind: finding
raised: 2026-09-16
state: unstarted
found: "The morning CI verdict said migration 0060 refuses to apply and post-land had failed on every push since 01:42Z. Both had been false for over three hours. A row was planned on it anyway, and a session spent 205k tokens verifying a bug that was already fixed."
serves: NOW
size: small
touches: .agent-workflows/orchestrator/grounding.md, scripts/
needs-owner: none
---

# The morning verdict is a claim, and re-checking the run it names cannot disprove it

**Filed:** 2026-09-16. **Source:** measurement, during the wave row that wired the Supabase
advisor gate into `post-land.yml`.

## Why

`grounding.md` already knows the verdict is not evidence. It says so: "the verdict is a claim like
any handoff, so re-check the run it names (`gh run view <id> --json jobs`)."

That instruction cannot catch the failure it is written against, and on 2026-09-16 it did not.
A verdict that says "post-land is failing" names a run that failed. That run is still failed, and
always will be. Re-checking it returns `failure` and **confirms the stale claim** — because the
thing that made the claim false was a different, later run the verdict never mentions. The
prescribed re-derive re-reads the evidence the claim was built from, rather than asking the world
what is true now.

The second half of the same verdict was not about a run at all. "Migration 0060 refuses to apply"
is a claim about the database, and no amount of `gh run view` answers it. `node
scripts/migration-drift.mjs` answers it in about five seconds, and nothing pointed anyone at it.

The cost was not the wrong sentence. It was a row planned at 07:50Z on a claim that had expired at
04:27Z, and a session that spent 205k tokens proving a bug fixed before it launched. This is the
repository's own recurring shape — a shelved file is a claim about the past, and `grounding.md`
says exactly that two paragraphs later about backlog items — arriving through the one input that
was exempted from it because it is generated fresh each morning. Freshly generated is not the same
as currently true.

## What it would take

**Not built by the row that filed this**, deliberately: that row owned the advisor gate, and a
change to how waves are grounded is not a thing to slip into a branch about a workflow step.

The shape worth weighing is that **each brief item carries the one command that re-derives its
CLAIM**, not the one that re-reads its evidence — written by whatever produces the verdict, since
that is the only place that knows which fact it just asserted. For the two items above:

- "post-land is failing" → `gh run list --workflow post-land.yml --limit 5`, which shows the
  current streak rather than one historical run.
- "0060 refuses to apply" → `node scripts/migration-drift.mjs`.

Then `grounding.md`'s instruction becomes "run the command the item carries" instead of "re-check
the run it names", and an item that carries no command is one the planner knows it cannot trust.

Worth deciding alongside it: whether a verdict should carry an expiry at all, or whether the
command makes one unnecessary. A command that re-derives in five seconds is strictly better than a
timestamp a reader has to judge.

## Evidence

Re-derived in the filing session rather than carried over from the verdict:

- `node scripts/migration-drift.mjs` — 60 local migrations; production holds all 60, staging holds
  all 60. So 0060 had applied, and the claim that it refuses to was false.
- `gh run list --workflow post-land.yml` — the last two failures are `35050545400` (03:06:36Z) and
  `35054152242` (04:03:50Z). Every run since is green: `35055657854` (04:27:16Z, the push that
  applied 0060), `35062272134`, `35064365621`, `35065091235` (06:44:20Z, at `16ed46e9`),
  `35072409502`, `35074384566`. Six consecutive successes, five of them before the verdict was
  written.
- `.agent-workflows/orchestrator/grounding.md`, the bullet on the morning CI verdict, carries the
  `gh run view <id> --json jobs` instruction this item argues is the wrong question.

The verdict file itself is `docs/handoffs/ci-morning-report.local.md`. It is gitignored and exists
only in the primary checkout, so it is named here as history and not as something to go and read —
the facts above stand without it.
