# src/ai/pro/reconstruct - the RETIRED concept-and-reconstruct engine

**RETIRED 2026-08-15. No user reaches this code.** The product's Pro tier runs
`src/ai/pro/language/` - one text call for a design LANGUAGE, composed through the catalog's own
assembler (`docs/NOACG_PRO_PLAN.md` §15, §16). This directory is what that replaced.

## What it was

`brief -> concept IMAGE -> interpretation -> raster reconstruction -> the injected validator`.
Two model calls, $0.0777 a generation, of which $0.0671 was a flat charge for a picture the
compiler then failed to keep.

## Why it is here and not deleted

Three reasons, all of them about evidence rather than sentiment:

- **The checked-in fixture bank is the §16 finding.** `scripts/pro-bench.mjs` replays it free and
  reproduces the defect that argued for Phase A - a graphic printing its own words twice while
  every gate reported `usable`. Deleting the engine deletes the ability to re-check that.
- **Deleting reaches outside this change.** `api/_lib/aiProProfile.ts` funds the image route,
  `api/_lib/admin/models.ts` and two api tests read `PRO_STANDARD_ROUTES`, and four `scripts/`
  entries plus a `package.json` script drive the engine - none of which this change owns, and one
  of which a live worktree is editing.
- **A retirement has to be visible.** It is a directory with a build-time boundary around it
  rather than five files with banner comments, because §16's lesson is precisely that a second
  live engine is how the wrong one keeps shipping.

## The rules that bind while it is here

- **Nothing a user can reach may import it.** `retiredProEngineRestriction` in `eslint.config.js`
  refuses `**/reconstruct/**` from every region of `src/` except this directory, and it was
  mutation-checked from both the UI and `pro/language/`. Do not add an exemption; if you need
  this engine back, that is a decision to make in `docs/NOACG_PRO_PLAN.md` first.
- **Do not improve it.** §16 settled that further spend on making raster reconstruction work is
  not warranted. A bug found here is a finding about the fixture bank, not a ticket.
- **`validateProCompile` is still its one scoring seam.** `pipeline.ts`, `stub.ts` and
  `pro-bench.mjs` all validate through it, for the reason `pro/language/gate.ts` exists on the
  live side: a second call site is how a round scores a different gate than the product ran.

## Deleting it, when that day comes

One deliberate change, in this order: drop the four `scripts/pro-*` entries and their
`package.json` script, drop the reconstruction tests from `e2e/pro.spec.ts`, drop `concept` from
`PRO_STANDARD_ROUTES` and the server's funded route list, drop the interpretation half of
`src/ai/pro/contract.ts` with its two api tests, then this directory and its eslint block.
Archive the fixture bank outside the repo first (`lite-eval-archive` rule) - it is a paid
measurement, and out-directories die with a worktree.
