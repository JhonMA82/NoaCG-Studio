# `--mono` is only defined on the docs page, so every app-side `var(--mono, ...)` uses its fallback

**Filed:** 2026-09-16. **Source:** the Data-tab row's check (`claude/ta-data-tab-explains-itself`).

## Why

`src/docs/docs.css` defines `--mono`; `src/brandTokens.css` and `src/styles/base.css` do not. Every
app stylesheet that writes `font-family: var(--mono, ...)` therefore renders its inline fallback,
and the fallbacks have drifted: `playout-dashboard.css` writes `var(--mono, monospace)` and
`feedback.css` writes `var(--mono, ui-monospace, monospace)`. Two surfaces meant to share one
monospace face can show two, and a future definition of the token would change every one of them
at once without anybody having chosen that.

## What it would take

Define the token once beside the other `:root` tokens in `src/brandTokens.css`, then replace each
fallback with the bare `var(--mono)`. A grep over `src/styles` for `--mono` lists the sites. The
choice of face is the brand manual's, not this item's.

## Evidence

`grep -rn -- '--mono:' src` on 2026-09-16: two definitions, in `src/docs/docs.css` and inside the
generated controller page in `src/control/productionControllerHtml.ts`, neither of which the
app's own stylesheets can see; and eleven uses across `feedback.css` and `playout-dashboard.css`
with two different fallback lists.
