# AC-3 - the bench presses every declared operator event, or says which it did not

**Verdict: pass.** Reviewed at `dfac5b9cf230532565f57d6988517bb25cdbf94d` on 2026-09-16.

## What was read

`src/validation/runtimeBench.ts` no longer walks a capped list of event NAMES. It walks ARROWS -
one per (from-state, event) pair, from `allOperatorArrows` in `src/blocks/animMachine.ts:291` -
snapping to each arrow's own from-state before pressing it, up to `MAX_BENCH_ARROWS = 24`
(line 143). What it does not reach is not silent: `runtimeBench.ts:1098-1155` seeds an `unpressed`
list with everything past the ceiling, adds every arrow it could not stand in front of, and reports
the lot as a `bench-events-skipped` finding whose message names the ceiling
("past the bench's ceiling of 24 arrows"). The old `allOperatorEvents` survives at
`animMachine.ts:305` as the arrow list folded by name, which is what it always was.

That closes all three weaknesses HA's handoff named: the cap, the dedup by name, and the arrow out
of a state the default-path walk had already left.

## What was run

- Through the queue, `e2e/lite-field-paint.spec.ts` (job `j-1142`): **16 passed**, exit 0, 1.6 m.
  Those are HC's eight added cases plus the file's existing eight.
- The live proof, off the shipped CLI against the deployed bridge `main@dfac5b9cf2`:
  `npx -y @noacg/cli@0.3.2 validate ./totals-board` reported **0 errors, 0 warnings** in 7.534 s on
  a graphic whose `inspect` prints **eleven** controls and whose machine carries 22 arrows. Before
  HC's row that same graphic reported 0 errors and 0 warnings having pressed eight of eleven, which
  is the exact failure the criterion exists to stop. A clean report now means a walked graphic.

## What was observed

The absence of a `bench-events-skipped` finding on a 22-arrow machine is the positive result here:
22 is under the ceiling of 24, so every arrow was pressed and there was nothing to report. The
finding's own wording was read in the source rather than provoked, because provoking it needs a
machine with more than 24 arrows and none exists in the catalog.

## Limitations

- **The catalog calibration tripwire did not run on this laptop**, exactly as HC recorded. It is
  CI's gate (`npm run test:e2e:catalog`, planned by `scripts/catalog-affected.mjs`) and the box did
  not have the RAM for a four-worker suite tonight. If that job goes red on this chain, read it as
  the bench's bug rather than the catalog's - HC's own contract says so.
- **24 is a number, not a doctrine.** It fits today's largest real machine (22) with two arrows of
  air. The first graphic that declares more will produce the skip finding rather than a silent
  cap, which is what the criterion asks for, but nobody has seen that finding fire in the product.
