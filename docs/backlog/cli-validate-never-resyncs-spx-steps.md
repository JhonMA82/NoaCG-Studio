# `noacg validate` never re-syncs the SPX `steps` count, so a hand-authored machine ships a wrong one

**Filed:** 2026-09-15. **Source:** measurement while writing `cli/skill/noacg-graphic/references/contract.md` §5 (CLI 0.3.2, branch `claude/ha-skill-teaches-the-contract`)

## Why

The invariant `blocks/rule-default-path-length-minus-numerically` says `spxSteps(data)` is THE
`settings.steps` rule and that **every re-sync site calls it, so the rule lives once**. The CLI's
validate/regenerate path is a re-sync site and does not call it. That was harmless while machines
only ever arrived from a type through an in-app surface. It stops being harmless now: CLI 0.3.2
teaches agents to author a machine by hand (`contract.md` §5), so packages whose default path grew
a waypoint on disk are about to become the normal case.

The cost is not a wrong number in a file. `stepCount` in the OGraf manifest is generated from
`steps`, so an under-reported count tells a playout server and any third-party OGraf renderer that
there is no Continue to press - and a state only `next()` reaches never plays there. The graphic
looks perfect in NoaCG and is broken on the stranger's renderer, which is the exact failure the
default-path contract exists to prevent. Nothing reports it: the gate is green.

## Why it was filed rather than fixed on the branch that found it

Because it is not the one-line CLI change it looks like. The CLI does not own the regenerate: it
calls `bridge.normalize(...)` and then writes back whatever comes out (`regenerateInPlace` in
`cli/src/commands/validate.ts`), so the fix lands in shared normalization that the studio's own
import path runs too. Deriving the value there means silently rewriting a number the author wrote
in their own source file, which is a behaviour change worth its own verification rather than a
rider on a documentation change.

## What it would take

Small, but its own row. Decide between deriving and reporting:

- **Derive** - recompute `settings.steps` from `spxSteps(data)` during the CLI's regenerate, which
  is what `blocks/layerTimeline.ts`, `blocks/stepAssign.ts`, `blocks/templateInsert.ts`,
  `templates/shared/standard.ts` (line ~126 carries the precedent and its reasoning) and
  `templates/types/graphicType.ts` all already do. Closest to the invariant's own words.
- **Report** - a validator finding naming the expected number, leaving the file the author's.

Deriving looks right, with one thing to check first: the definition is the author's source file,
so silently rewriting a hand-written value needs to be as visible as the other regenerations
already are. Either way, cover it in `cli/test/unit.test.mjs`, and if it is derived, drop the
hand-keeping sentence from `contract.md` §5d and rebuild the generated copies with
`npm --prefix cli run build` (never hand-edit `cli/plugin/skills/`).

## Evidence

Measured on 0.3.2, `--no-bench`, with a scaffolded typeless package:

1. `noacg scaffold --fields "A:text,B:text"` writes `"steps": "1"` - correct for the two-step
   scaffold.
2. Author a machine into `var NOACG_ANIM` with `defaultPath: ["a","b","out"]` and three matching
   `steps`, leaving `"steps": "1"`.
3. `noacg validate` reports **0 errors, 0 warnings**.
4. `noacg inspect` prints `Steps: 1`, and the regenerated `graphic.ograf.json` carries
   `"stepCount": 1`. The truth is `spxSteps` = `defaultPath.length - 1` = **2**.
5. Setting `"steps": "2"` by hand makes both correct, with validate still clean - so the value is
   simply never derived on this path, rather than derived wrongly.

`contract.md` §5d currently tells the author to keep the number right by hand, which is a rule
where a mechanism belongs.
