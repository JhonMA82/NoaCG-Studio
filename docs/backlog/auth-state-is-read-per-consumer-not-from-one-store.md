---
v: 2
source: derived
kind: finding
raised: 2026-09-16
state: unstarted
found: "each useAuthState consumer starts its own session read at 'loading', so a signed-in surface can flash the signed-out copy for a tick, or past a 6s bound on a black-holed auth host"
---
# Auth-gated copy is read per consumer instead of from one store

**Filed:** 2026-09-16, during the 2026-09-16 handoff drain (row TE), carried over from
`docs/handoffs/2026-09-16-si-what-an-account-is-for.md`.

## Why

`AuthStatus`, `SettingsDialog` and `RenderFormatPicker` each call `useAuthState` and each starts
its own read at `'loading'`. The save dialog paints the plain, signed-out-shaped sentence for a
tick before the real clause arrives, and on a network that black-holes the auth host, a signed-in
user whose token needs a refresh can read the signed-out clause after the 6 s bound - the wrong
copy, shown with no indication it is provisional.

## What it would take

One auth store, on the shape of the existing `authUi` store, that every consumer reads instead of
starting its own session read. A single source of truth for "loading vs signed in vs signed out"
removes the per-consumer race entirely.

## Evidence

`docs/handoffs/2026-09-16-si-what-an-account-is-for.md`, "Deferred, with the mechanism named" -
named as "its own change", separate from that row's copy work.
