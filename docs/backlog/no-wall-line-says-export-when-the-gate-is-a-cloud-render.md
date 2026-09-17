---
v: 2
source: derived
kind: finding
raised: 2026-09-16
state: unstarted
found: "the no-wall line under an export gate says 'Making and exporting graphics never needs an account', which is false for a cloud render behind that same gate"
---
# The no-wall line under an export gate overstates what needs no account

**Filed:** 2026-09-16, during the 2026-09-16 handoff drain (row TE), carried over from
`docs/handoffs/2026-09-16-si-what-an-account-is-for.md`.

## Why

The line under a sign-in prompt reads "Sign in to export ProRes 4444." followed by "Making and
exporting graphics never needs one." The second sentence is true of the six local export targets
and false of a cloud render - the very thing the prompt is gating. A visitor reads a blanket
reassurance directly under the one case where it does not hold.

## What it would take

A gate reason that says "render" rather than "export" for the cloud-render case, so the no-wall
line stays true for every gate it appears under. Touches `src/components/auth/accountCopy.ts` and
`src/components/RenderFormatPicker.tsx`.

## Evidence

`docs/handoffs/2026-09-16-si-what-an-account-is-for.md`, "Deferred, with the mechanism named" -
"the honest fix is a gate reason that says 'render' rather than 'export'. Not this row's copy."
