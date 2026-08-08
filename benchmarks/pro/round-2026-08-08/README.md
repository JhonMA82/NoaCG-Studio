# NoaCG Pro feasibility round - 2026-08-08

Read **[ROUND.md](ROUND.md)** first (can an image model design a usable broadcast graphic, and how
does it compare to Lite), then **[MACHINE.md](MACHINE.md)** (can a generated graphic carry custom
fields and a working state machine).

## What is here

| Path | What it is |
|---|---|
| `pro/<id>.concept.jpg` | The image model's concept frame, as generated. JPEG q90 - photographic content, and 12 PNGs cost 11 MB. |
| `pro/<id>.png` | The compiled hold frame: the same design after interpretation + deterministic reconstruction, with the operator's real values driven in. **Compare these two side by side - that pair is the round.** |
| `pro/results.json` | The deterministic verdicts: validation, field carrying, editability score, per-region compile report, warnings, per-concept cost. |
| `lite/<id>.png` | NoaCG Lite's hold frame for the SAME brief, same page, same validator, same values. |
| `lite/results.json` | Chassis chosen, validity, field values. |
| `machine/taught.*` | The generated clock+scoreboard's actual emitted code. Read `taught.template.js` around line 160 for the operator-event surface the model invented, and line 1056 for the platform declaration that silently overrides it. |
| `machine/control-taught*.png` | Its generated control page at `#/control/<id>` - empty, with an entry, and after ▶ Play. |
| `machine/report.json` | Both arms: fields, machine presence, derived groups, control buttons. |
| `machine/pro-control-readout.news-public.json` | What a NoaCG *Pro* graphic offers an operator (2 fields, no machine, 0 buttons) - produced free from a checked-in fixture. |

## Reproducing

The deterministic halves are free and replay from the checked-in fixtures; only the concept and
interpretation calls spend money, and every runner refuses to spend without an explicit ceiling.

```bash
node scripts/pro-bench.mjs                       # FREE: fixtures through the real compiler + validator
node scripts/pro-control-readout.mjs             # FREE: what a Pro graphic gives an operator
node scripts/pro-machine-drive.mjs taught        # FREE: save the generated graphic, open its control page
```

Paid re-runs (announce the cost first - a full bank is ~$0.92):

```bash
node scripts/pro-bench.mjs --generate --image-route=vercel:google/gemini-3.1-flash-image --interpret-route=vercel:google/gemini-2.5-flash --max-cost=1.5
```

```bash
node scripts/lite-on-pro-bank.mjs
```

```bash
node scripts/pro-machine-probe.mjs
```

`scripts/pro-interpret-probe.mjs <fixture-id> <repeats>` replays a fixture concept through the
interpretation call alone (~$0.01 a try) - the cheap way to diagnose that stage without buying an
image for every attempt.
