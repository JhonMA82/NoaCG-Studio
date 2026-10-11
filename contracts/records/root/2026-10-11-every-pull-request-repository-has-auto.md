# root/every-pull-request-repository-has-auto

Rule: `root/every-pull-request-repository-has-auto`. Recorded 2026-10-11 on `claude/e2e-budget-p1c` at 52299a46b.

The suite budget work (docs/work-specs/e2e-suite-budget/spec.md, decision 4) asks for tests to be moved, merged and retired through reviewed maintenance entries, and scripts/check-e2e-protection.mjs now refuses coverage removal without one. The rule had to say that an automatic repair is not the thing that writes such an entry, or the check would turn a red gate into a prompt for the fixer to write the entry itself.

Why a rule rather than a fix, a mechanism or a check: The protection check makes removal visible, but only a rule can say who may write the entry that unlocks it; a fixer has no other signal that this door is not its to open.
