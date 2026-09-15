# The profile format exists, and nothing renders it yet

AC-4 holds. `Show.profile` v1 parses, serializes canonically and validates; an unknown version
reads as read-only; migration 0058 adds `control_shows.profile` and `publishControlShow` pins it.

**Landed:** `d9f61373` (the format, the record field, the migration, the publish pin, the docs
paragraph), `f2a523f5` (five defects the check found, each with a test). Check stamp:
`codex-hd-show-profile.json`, PASS at `f2a523f5`.

**Which route did the work: opus, not codex.** The delegation was launched as the row directed
(`task-mu2yb4ts-ypshvs`, `--write --effort high`, inherited model) and died on the ChatGPT usage
limit before touching anything - clean tree, no commits, no files. The declared fallback applied.
The spec written for that delegation is gone with the scratchpad; this file and the code comments
are what survive of it.

## What is left, and why

- **Nothing can WRITE a profile from the product.** `setShowProfile` and `deleteShowProfile` are
  the model's two doors and nothing calls them outside the tests. That is HE's row, and it is the
  first thing to build, not a gap in this one.
- **`control_show_by_slug` does not return the new column**, so `ResolvedControlShow.profile` reads
  null on every hosted page today. This was a deliberate call, and it is the one decision here
  worth arguing with. A `RETURNS TABLE` function cannot gain a column with `create or replace`; it
  needs a drop-and-create, which `npm run db:push` refuses without `--allow`, which would put an
  owner action on every landing. 0058 is therefore purely additive and applies unattended
  (verified: `classifyMigration` reports 2 statements, no findings). **The row that first renders a
  profile on the hosted page mints that widening and carries its `--allow`.** Take 0057's lesson
  with it: `create or replace` takes whatever text you hand it, so copy the CURRENT body from
  `0031_live_cue_on_row.sql`, not an older one.
- **No owner action, and no owner-queue file.** Nothing here is observable in the product -
  nothing draws. `check:owner-queue` is clean.
- **The live-verify checklist gained step 8** (`docs/CONTROL_LAYER.md`) for the half no offline
  spec can see: `publishControlShow` returns before its upsert when there is no Supabase, so only a
  real backend can show the column being written.

## Decisions I made, so they can be reverted rather than rediscovered

- **`ask` is `{ default: boolean }`, not a bare `ask?: boolean`.** The bare form encodes three
  states in one optional boolean, and `ask: false` reads as "no ask" to anyone editing the JSON.
  This is a persisted format people will read by hand.
- **`after` has no ceiling.** A two-hour wait is a wall clock in disguise, but any cap I picked
  would be invented. The authoring UI is the right place for a limit, and that is HE's call.
- **The unit test is `scripts/control-profile.test.mjs`, not `src/model/profile.test.ts`** as the
  row named. The build gate globs `scripts/**/*.test.mjs`, so a `.test.ts` under `src/model` would
  neither run nor be discovered - and `node --test` could not import it anyway, because the
  extensionless relative imports in that tree are unresolvable to Node's ESM loader. This is why
  `profile.ts` imports NOTHING at runtime: the test transpiles that one file with a single
  `ts.transpileModule` call, the `csv.ts` pattern. Keep it dependency-free or it loses its tests.
- **`setShowProfile` exists, beyond the row's DO list.** "An unknown version degrades to read-only"
  is only a guarantee if ONE write path enforces it; left to whichever surface authors profiles it
  would have been a comment.
- **A patch step's field ids are checked only when the caller passes `pool.fields`**, exactly as
  cue ids are. A caller that does not know the fields must not be told every patch is broken.

## Evidence and traps that exist in no repo file

- **Naming a new column in the publish upsert breaks EVERY publish on an instance without the
  migration.** PostgREST rejects the whole upsert with `PGRST204` when one column is not in its
  schema cache, so the panel, the payload and the bindings go down with it - for the window between
  a deploy and `db:push`, and indefinitely on a self-hosted instance that is behind.
  `publishControlShow` now retries without the column. **`bindings` set this same trap in 0048 and
  it is still there**: that column is named unconditionally, so the same failure is one unmigrated
  instance away. I did not fix it because it is outside this diff.
- **Every key in this format is somebody's typed name, so a bare `map[name]` lookup is a bug.**
  Measured on the transpiled module: a graphic called `constructor` made `validateShowProfile`
  throw `declared.includes is not a function` instead of reporting findings, and a patch step
  naming `toString` validated clean - a button that greens and then sends nothing on air. Both
  directions matter: `own()` guards reads, `put()` guards writes, because `out['__proto__'] = x` on
  an object literal sets the prototype and the entry silently vanishes.
- **Read and serialize both dropping things is how they came to disagree.** Serialize kept a
  duplicate control id that read then removed, so serializing and reading back gave a different
  profile. Canonical is now defined as ordered normalization and CALLS the reader, so the rules
  about what a valid profile contains exist once. If a later change adds a drop rule, it goes in
  `readShowProfile` and serialize inherits it.
- **`hostedControl.ts` is not a leaf module, and a Playwright node-side test cannot import it.**
  The first cut of the read-back test did, and failed on `SyntaxError: src/assets/OFL.txt: Missing
  semicolon` - the transform follows the import graph into a text asset. That is why
  `readPublishedProfile` lives in `model/profile.ts`. The `outputRecovery` test beside it works
  only because that module imports nothing but a type.
- **`node scripts/jobs.mjs add` takes the command FIRST and `--cost` after it.** HC's handoff said
  so yesterday and the row prompt I was given said the opposite; the usage line in `jobs.mjs` is
  the authority, and HC is right.
- **`e2e-affected` plans against the stale local `main`.** It reported 101 changed files for this
  7-file branch and escalated to the full suite plus the catalog; `origin/main` as an explicit base
  reported the correct 7. Filed as
  `docs/backlog/e2e-affected-plans-against-a-stale-main.md` with both shas. It fails in the
  EXPENSIVE direction, which is why nothing has caught it.

## Verification

`npm run build` green, reading its own exit code (1673 tests, 0 fail; the 25 profile tests run
inside it). `node --test scripts/control-profile.test.mjs` 25/25. `node scripts/gates.mjs audit`
OK. Migration classified as applying unattended. Queued spec runs: `j-1105`
(`hosted-control.spec.ts`, 9 passed) and `j-1106` (`hosted-control`, `productions`,
`production-controls`, 52 passed) - both exit 0.

**The full-suite escalation goes to CI**, per `root/let-pre-merge-gate-laptop-does`; the three
specs run locally are the ones that cover the changed record and publish path.

check: `review: delegated 7/7`, `simplify: inline` (the skill returned fan-out instructions, not a
result), `verify: inline`, `taste: not applicable` - nothing here can move what a graphic looks
like, because nothing draws.
