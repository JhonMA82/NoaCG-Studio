# The review itself - who ran it, against what, and what it did not do

**Reviewed revision:** `66b000808a1547695a6cc07ae5fc2ed1315713df`, the tip of this review's own branch, whose base is
`9463e9e57b710dba1cbc3a5d4dc27d4b1b39ad8b` - `main` carrying every pull request of the chain, 270
to 283. **Spec:** `spec.md` at `c8b1ea4b966db1efcee1dd636a238d9cb05bd8bfba347d25455deb30a7443620`,
the amended text (AC-5 narrowed to controls on 2026-09-15). **Date:** 2026-09-16.

**This is the second review of the same ten rows**, and it exists to close one gap the first one
found: no profile had ever been seen on the hosted control page, on any machine. That gap wore
three numbers - AC-6 unverified, AC-7 failed, AC-9 failed - and the first review said so rather
than rounding it up. Both readings are in the history; the receipts under `evidence/` now describe
the second.

**Independence.** Neither review wrote the ten rows. This one is not independent of the walk it
added: `e2e/configured/hosted-control-profile.spec.ts` is implementation, committed before this
record rather than after it, and the criteria it closes are closed BY it. What makes that
tolerable rather than circular is where the evidence comes from - a CI run against a real Supabase
stack, reading a durable log with the server's own timestamps, on a rig this session cannot reach
into.

**What settled the other half without anybody writing code.** Migration 0060 applied to production
and staging on the post-land push after pull request 283 (run `35055657854`). AC-7 failed the first
review because the door it needs existed nowhere; watching it apply is what the first review said
to do next, and it is done.

## What was run, in one list

| What | Where | Result |
|---|---|---|
| `npm run build` | this worktree, three times | exit 0 each |
| `e2e/hosted-control.spec.ts` | queue `j-1147` | 12 passed, 58.4 s |
| `configured-suite`, the whole 43-test suite | CI, `35059312926` on this branch | 43 passed, 0 failed, 0 flaky, 0 skipped |
| `post-land.yml` after pull request 283 | CI, `35055657854` | green; 0060 applied on both projects, 8 function grants each |
| `ci.yml` on this branch's push | CI, `35057295179` | green |

## The verdict

**Ten pass.**

- AC-1 to AC-5, AC-8 and AC-10 stand as first reviewed. AC-5's receipt is amended: its one stated
  limitation - that the hosted page's rendering was inference - is no longer true.
- **AC-6 passes.** The combined control renders, greys with its reason, offers its ticks in the
  operator's words, counts its wait down, sends one command row per step in order with the wait
  honoured on the server's clock, and stands its tail down on a second press - all on the hosted
  page, read off the wire.
- **AC-7 passes.** 0060 has applied; a ± press on a bound field on the hosted page moves the tree
  and nothing else, and every graphic bound to a value follows it with its own row.
- **AC-9 passes across two walks**: the first for the authoring, the composition and the in-app
  minute, timed by hand; this one for the publish and the hosted minute, timed in CI.

## What this review is not

- **It is not a person looking at the page.** Every hosted claim here is structural - text,
  attributes, counts, rows, timestamps - and none of it judges how the surface LOOKS on a phone.
  Two owner-queue items carry the routes for that, and it is the one thing left before 2026-10-20
  that no gate can do.
- It did not walk two operators on one production, or a control whose steps expand past the batch
  cap. Both are live-verify step 10 and both remain unwitnessed.
- It did not re-run the catalog calibration tripwire, which is CI's.
- It did not re-derive AC-1 to AC-4, AC-8 or AC-10; those readings are the first review's and the
  tree they read is this tree's base.
- `evidence-complete` is record integrity. Every receipt says what it observed and what it could
  not, in its own verdict rather than in a footnote.
