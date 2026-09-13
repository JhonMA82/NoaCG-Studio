# ograf-form as a GDD oracle - cross-check our derived controls against the reference

**Filed:** 2026-08-29. **Source:** the OGraf ecosystem research round (`docs/OGRAF_ECOSYSTEM.md`
§1b).

## Why

`ograf-form` (MIT, package 1.1.0 at the 2026-09-13 refresh, no declared runtime dependencies,
<https://github.com/SuperFlyTV/ograf-form>) is the reference GDD-to-controls mapping - what the
reference controller itself embeds. We deliberately do NOT embed it (two form systems in one
product); its value is as an **oracle**: render the same GDD schema through it and through
`src/control/ografContract.ts`, compare what each offers the operator, and catch our GDD
misreadings mechanically. This keeps the GOALS-ladder GDD alignment work (emit standard
`gddType`, read it first on import) honest against the implementation operators will actually
meet elsewhere, instead of against our own reading of the spec - the same non-circularity rule
the interop suite applies to renderers.

## What it would take

A small test harness (node + jsdom or the bench browser) that mounts
`<superflytv-ograf-form>` with each fixture schema from the GDD coverage table, snapshots the
control kinds it renders, and diffs against `ografContract`'s descriptor kinds; expected
divergences (e.g. its array-of-objects table vs our `notes` listing) recorded as known rows, so
the test goes red only on NEW disagreement. Rides the GDD-alignment branch or lands just after
it.

## Refreshed acceptance contract (2026-09-13)

Use the revision pinned in [OGRAF_STUDIO_RESEARCH.md](../OGRAF_STUDIO_RESEARCH.md), which now
includes dedicated select-multiple. Cover standard GDD colour/multiline, image/file fallback,
percentage/duration, select labels, hidden/order, defaults, numbers/booleans, nested objects,
arrays/object tables and custom-action payload schemas. Include a Studio structured-collection
manifest as a foreign schema. Compare typed emitted values and validation, not just control names.

Pure source probes confirm that current `ografContract.ts` still maps standard GDD colour and
multiline to text and reports arrays as unsupported. Dynamic `stepCount: -1` already works;
do not refile it as missing. The initial oracle keeps these differences explicit; a later
coverage phase extends the existing descriptors/renderers instead of embedding another form.
Select the test-only MIT component at a locked version and retain its notice. Browser interaction
tests use the machine queue and a mapped spec. No implementation was started by this update.

## Evidence

`docs/OGRAF_ECOSYSTEM.md` §1b (coverage, gaps, the table asymmetry);
`docs/OGRAF_FIRST_REVIEW.md` §5 item 1 (the `v_noacg.kind` misreading that motivates an
external check).
