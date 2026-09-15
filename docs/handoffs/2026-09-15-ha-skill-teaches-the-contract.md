# The skill teaches authored machines - what the next rows need to know

AC-1 of `docs/work-specs/control-panel-any-graphic/spec.md` is met. CLI 0.3.2 is minted, not
released. Landed: `4acdf351` plus the check commit on `claude/ha-skill-teaches-the-contract`.

## What is left, and why

Nothing of AC-1. Two things were deliberately NOT taken, both because they change shared
behaviour and belong in a row with its own verification rather than riding a documentation
change:

- **The SPX `steps` re-sync.** Filed as `docs/backlog/cli-validate-never-resyncs-spx-steps.md`
  with the reproduction and the reasoning. The one-line framing is wrong: the CLI does not own the
  regenerate, it calls `bridge.normalize(...)`, so the fix lands in shared normalization the
  studio's import path also runs, and it would silently rewrite a number the author wrote in their
  own source file.
- **The `bench-field-unpainted` exemption.** A reported field is input-only by design, so it
  always raises this warning. `src/validation/fieldPaint.ts` exempts numeric holders only, and its
  comment explains at length why that exemption was kept narrow, so widening it is a judgement
  call, not a tidy-up. The skill documents the warning as expected instead.

## Evidence and traps that exist in no repo file

- **The worked machine in §5c is measured, not sketched.** Authored from `noacg scaffold`, then
  with the bench ON: 0 errors, one warning, every readiness line PASS; `noacg inspect` prints
  `reveal / Reveal winner / Award / f4`. The exact `update()` in the doc, null guard included, is
  the code that was run.
- **A reported field ALWAYS warns.** `TEXT_FTYPES` in `src/validation/fieldPaint.ts` includes
  `hidden`, and `declaredNumericInput` exempts only `ftype: 'number'`. **AC-2's proof case will
  hit this**: the votes board's `Shown` field is exactly this shape, so expect one
  `bench-field-unpainted` per reported field and do not treat it as a defect.
- **The bench is weaker than gate 3's name.** Beyond the eight-event cap AC-3 already owns, two
  things AC-3 should take in with it: `allOperatorEvents` dedups by event NAME, so two arrows
  sharing a name are one dispatch; and the events fire in sequence with no snap-back between them,
  starting from where the default-path walk ended, so an arrow out of an already-left state is
  dropped by the structural guard and never measured. A cap fix alone does not make "walks every
  operator arrow" true.
- **The bench can also be skipped by the safety screen**, not just by `--no-bench`
  (`src/bridge/bridgeApi.ts`), and it reports a `bench-skipped` NOTE either way. A NOTE is not a
  pass, and the skill now says so.
- **Gate 1 is not "zero errors".** An unreachable state and a `machine.controls` entry naming an
  event no arrow fires are WARNINGS. The second is the likeliest hand-authoring mistake there is:
  misspell the event, get no error, and the button is silently never rendered.
- **The worked example is deliberately NOT the proof case.** An award reveal, not the votes
  board. Shipping §3a verbatim would have let AC-2 copy-paste the thing it is supposed to prove an
  agent can author, and would have made AC-9's timings meaningless.
- **A fresh worktree has no `node_modules`.** Neither root nor `cli/`, so `npm --prefix cli run
  build` fails with what looks like a broken MCP import until `npm ci` and `npm --prefix cli ci`
  have both run. It cost a confused minute here.

## Anything that needs the owner

Nothing. `docs/acceptance/owner-queue/2026-09-15-skill-teaches-authored-machines.md` is a review
route, not a gate on other work. Publishing 0.3.2 to npm stays his, and is unrelated to landing
this.

## Pointers

- Commits: `4acdf351` (the skill, the test, 0.3.2) plus the check commit on the same branch.
- Check stamp: `npm run stamp` on this branch - review `delegated`, simplify `inline`, verify
  `inline`, taste `not applicable`.
- Spec: `docs/work-specs/control-panel-any-graphic/spec.md` AC-1. Plan: §2a, §2c, §3a.
- The gates' authority: `docs/CONTROL_PANEL_ROAD.md` §9.
