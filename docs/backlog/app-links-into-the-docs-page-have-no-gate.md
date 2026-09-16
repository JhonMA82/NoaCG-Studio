# A `/docs#anchor` link inside the app is checked by nothing

**Filed:** 2026-09-16. **Source:** the Data-tab row's check (`claude/ta-data-tab-explains-itself`).

## Why

The Data tab's drawer links to `/docs#data-example`, an anchor another row is writing the same
night, and the data-key block has linked to `/docs#data-api` since August. `e2e/docs.spec.ts`
checks the docs page's own nav against `section[id]`; nothing reads the `href`s in
`src/components` and asks whether the page has that id. A renamed or slipped anchor leaves a link
that opens the top of the docs page forever, silently, and the spec that pins the drawer's href
guarantees the string rather than the destination.

## What it would take

A small script under `scripts/check-*.mjs` in the build gate: grep `src/` for `/docs#<id>` and
`docs#<id>`, collect every `id="..."` in `docs.html`, and fail on a link with no target. Two files
and a unit test; the same shape as `check-docs-index.mjs`.

## Evidence

`src/components/home/ProductionDataPanel.tsx` carries both links. `grep -n 'docs#' src -r` lists
the rest.
