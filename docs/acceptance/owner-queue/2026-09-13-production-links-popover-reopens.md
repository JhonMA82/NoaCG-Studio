---
kind: behavior
date: 2026-09-13
---
# Production links popover reopens reliably

What changed: closing the production links popover with Escape no longer races the next Links toggle, and the unpublish control remains available after reopening.

Route: open the app, choose any published graphic, open its Production page, click Links, press Escape, then click Links again.

What to look at: the links popover is visible after the second click and contains the Unpublish control.
