# Usable canvas at short window heights (#981)

## Why and goal

Independent check #967 reproduced a 94px canvas at actual 125% browser zoom in a 1366x768 outer window. Correct the existing shell's space allocation so ordinary artwork and transform handles are usable, while canvas tools, Properties and timeline actions remain reachable.

## Scope and decisions

Start from fetched main `8ae5bbae5bbdedd39b67c95efa76bb24bea87c92` in `codex/editor-canvas-125-981`. Reproduce current main before design. Inspect and execute the pinned Studio workspace comparison. Set the minimum canvas and short-height panel trade-off before implementation, asking the owner if changing the existing 240px timeline / approximately 280px inspector contract. Preserve explicit canvas zoom/pan and existing source/session handlers. No product design has been selected yet.

## Non-goals

No save/leave/cloud status, loops, default switch, receiving-host/MCP work, broader property conventions, panel framework or editor rewrite. Engineering verification and owner acceptance remain distinct. Do not land disposable probe workflows or upstream reference code.

## Observable acceptance

- Fresh native 1366x768 outer window at real 125% browser zoom records actual zoom at both ends, CSS bounds and native screenshot, then repeats import/create/edit/text/animate/history/cancel/save/reopen/output.
- A measured canvas target and short-height panel behavior are agreed and recorded before product changes. Ordinary movement/resize/rotation handles are visibly usable.
- Document identity, Composition, tools, properties and timeline remain reachable without overlap or document-wide horizontal overflow. User-selected canvas zoom/pan survives shell changes.
- Inspect desktop 1920x1080, laptop 1366x768, native 125% and phone; preserve unchanged layer/property, #950/#960 transform and CLI regressions plus input/selection/key ownership, one gesture history and exact cancellation.
- Trace and execute comparable pinned Studio interactions and document deliberate differences. Use the shared scheduler for local checks, full builds/suites in CI, /check and /queue-merge, with a concrete owner review route and subsequent fresh independent checker.
