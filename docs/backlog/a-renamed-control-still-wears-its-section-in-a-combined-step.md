---
v: 1
source: review
raised: 2026-09-16
state: open
serves: P2
size: small
touches: src/control/hostedCombine.ts, src/components/home/ProductionPage.tsx
covered-by: none
needs-owner: none
asked: >-
  a control the production renamed in ARRANGE reads "Panelist 2 Point to Panelist 2" in a
  combined control's tick list and hover, on both dashboards
---
# A renamed control still wears its section in a combined control's words

**Filed:** 2026-09-16. **Source:** writing the configured hosted-profile walk
(`e2e/configured/hosted-control-profile.spec.ts`), which pins `plus2` PINNED but not renamed -
because the renamed spelling is wrong, and pinning a wrong spelling makes it permanent.

## Why

A production renames a control so an operator reads this production's word for it. The place that
matters most is a combined control's tick list on the hosted page: a phone, a person who was
handed the link, five boxes to tick under pressure. That is exactly where the rename comes out
doubled - "Panelist 2 Point to Panelist 2" - so the one gesture that exists to make a button
legible currently makes it less legible than leaving it alone.

It is also cheap and closed: two identical copies of one pure function, no format change, no
migration, no surface redesign.

## What it would take

`StepNames.control` decides how a step is spelled in the tick list, in the "Sends N steps: …"
hover and in the drop sentence the activity feed writes. It prefixes the section when several of
that graphic's controls share a label, so the proof case's five "+1" steps read "Panelist 1 +1"
through "Panelist 5 +1" rather than "+1" five times. The prefix is decided on the DECLARED label
and then applied to the DISPLAYED one:

    const label = renamed || button?.label || control;
    const shared = buttons.filter((b) => b.label === button?.label).length > 1;
    return shared && button?.section ? `${button.section} ${label}` : label;

Compute `shared` over the labels the operator will actually read:

    const labelOf = (b) => own(arrangement ?? {}, b.event)?.name || b.label;
    const shared = buttons.filter((b) => labelOf(b) === label).length > 1;

That also fixes the opposite case nobody has met yet: two controls a production renamed to the
same word keep their sections, where today they would both lose them.

Both surfaces carry the rule and carry it identically, which is the design working rather than a
duplication to clean up - the two dashboards must agree and `docs/CONTROL_PANEL_PARITY.md` says
why - so the change lands in both or in neither.

The gate is a unit case beside the existing combined-control tests rather than an e2e one: this is
a pure function of a profile and a machine, and both copies take the same two arguments. Pin all
three shapes - a shared declared label keeps its section, a renamed one does not, two identical
renames get theirs back.

## Evidence

`src/control/hostedCombine.ts:171-184` and `src/components/home/ProductionPage.tsx:1866-1876`, the
same five lines twice. The comment immediately above the in-app copy already names the neighbouring
case it was written for - prefixing unconditionally produced "Podiums Spotlight podium", so a
label that is already unique keeps its own words. A renamed label is unique by intent and should
have fallen under that same sentence.

Read on the proof-case fixture: the totals board declares five controls labelled "+1", so `shared`
is true for `plus2` whatever ARRANGE calls it, and `button.section` is "Panelist 2".
