# The legibility check cannot see a slab painted on a pseudo-element

**Filed:** 2026-09-16. **Source:** measurement in the agent-door audit (`docs/AGENT_DOOR_AUDIT.md`)

## Why
`noacg scaffold --type scoreboard --design sb01` produces a graphic whose team names sit on an
opaque near-black slab, and `noacg validate` then warns twice that they do not:

```
WARN legibility-protection: "HOME" sits straight over the picture with no panel, shadow or
outline behind it - it will be hard to read over busy footage.
```

The screenshot taken by the same command in the same run shows white text on a solid dark slab.
The warning is wrong, and it is wrong on a chassis we ship, so every stranger who scaffolds the
catalog's first scoreboard is told to fix something that is not broken. That costs trust in the
gate at exactly the moment a new user is deciding whether the gate knows what it is talking
about - and the readiness row "Reads where it will be watched" reads WARN instead of PASS on a
package that deserves PASS.

The mechanism is exact. `resolveBacking` (`src/validation/readabilityCheck.ts:136-148`) walks real
DOM ancestors and asks each for `getComputedStyle(node)`:

```js
const cs = win.getComputedStyle(node);
if (cs.backgroundImage && cs.backgroundImage !== 'none') { ... }
const bg = parseColor(cs.backgroundColor);
if (bg && bg.a >= 0.5) return { color: bg, gradient: false };
```

The scoreboard paints its slab on `.scoreboard-box::before` (`background: var(--panel-bg)`,
`transform: skewX(-8deg)`), because the lean has to live on a layer no preset tweens. A
pseudo-element is not in the ancestor chain and `getComputedStyle` is never asked for it, so every
ancestor reads transparent, `contrast` comes back `null`, and the `text-unprotected-over-video`
branch fires (`readabilityCheck.ts:338-346`).

This is not a disagreement with the canonical legibility rules.
`contracts/rules/model/holds-canonical-air-legibility-rules-owner.md` scopes `src/model/designRules.ts`, which owns the
size, weight and contrast NUMBERS. This item is about which surface those numbers get measured
against, one module away.

## What it would take
The smallest fix: in `resolveBacking`, when an element's own `backgroundColor` is transparent, also
read `win.getComputedStyle(node, '::before')` and `'::after'` and accept an opaque background from a
pseudo-element that actually paints (`content` not `none`, non-zero box). Keep the existing
early-outs - a `url()` image still makes the backing unknowable, a gradient still counts as a
scrim - so only the transparent-ancestor path changes and no currently-correct finding moves.

Worth pinning with a fixture in the same pass: the sb01 chassis is the natural one, since it is
shipped and it is what exposed this. A cheap assertion is that
`validate --design sb01` reports zero `legibility-protection` findings.

A larger, and probably better, follow-up: the check could screenshot-sample the pixels behind the
text rather than reasoning about the cascade at all. That is a redesign, not this item.

## Evidence
Run on 2026-09-16 with `noacg` 0.3.3 (published build, global install):
`noacg scaffold --type scoreboard --design sb01 --name "Audit scoreboard" --out <dir>` then
`noacg validate <dir> --screenshots <shots>` - exit 0, "0 error(s), 2 warning(s)", both
`legibility-protection`, against `shots/onair.png` which shows the slab plainly.
Source read at `src/validation/readabilityCheck.ts:136-148` and `:338-346`. The chassis CSS is
`src/templates/scoreboards/sb01.ts:77` (`.scoreboard-box::before`); it reaches the scaffolded package
as `css/template.css`, which is where the run above showed it, but the file to FIX is the template
source in `src/`.
