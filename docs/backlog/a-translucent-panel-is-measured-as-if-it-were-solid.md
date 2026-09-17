# A translucent panel is measured as if it were solid

**Filed:** 2026-09-17. **Source:** measurement during row TJ (`claude/tj-legibility-sees-pseudo-element`), raised by the code-review leg of `/check`

## Why
`resolveBacking` in `src/validation/readabilityCheck.ts` accepts any backing whose alpha clears
0.5 and then hands the raw RGB to `contrastRatio` as though nothing showed through it. Almost
nothing in this catalog has a solid panel. All fourteen curated palettes in
`src/templates/contract.ts` give `--panel-bg` an alpha below 1: nine sit between 0.86 and 0.96,
the two cinematic ones (`noir`, `ember`) sit at **0.55**, and the three glass ones at 0.10 fall
below the threshold and resolve as no backing at all.

So the ratio the validator reports is the one the graphic would have over black, not the one a
viewer gets over footage. On the `noir` palette a white team name on a 55% black scrim is
reported at about **21:1**; composited over a bright shot it is about **4.8:1**. Nothing is
currently WRONG about any verdict that falls out of it - 4.8:1 still clears the 3:1 large-text
floor - but the number is not the viewer's number, and `withPanelAlpha` in
`src/ai/designAdjust.ts` makes panel alpha a design parameter, so a model can move it from 0.96
to 0.50 and change the reported contrast not at all.

## What it would take
The measurement itself is four lines: composite the backing over the worst case before
comparing, where the worst case is footage the colour of the ink - the underlay that costs the
most contrast, and the only one derivable from what is on the page.

```ts
const surface = backing.a >= 1 ? backing : {
  r: backing.r * backing.a + ink.r * (1 - backing.a),  // and g, b
};
contrast = contrastRatio(blended, surface);
```

**The work is not the four lines, it is the severity question they open**, which is why this is a
shelf item and not a cleanup. `text-low-contrast` is `severity: 'block'`. Composited, **14
shipped designs cross the floor** and start failing a blocking rule - a jump from 5 blocked
designs to 19. Every one of them is dim supporting text on a near-solid panel, landing between
2.76:1 and 4.46:1 against floors of 3 and 4.5, so they are marginal rather than broken. The
owner's ratified severity policy (2026-08-19) is that the catalog stays shipped and simply
warns, and `docs/DESIGN_RULES_PLAN.md` §5 R4 carries it. Whoever takes this decides, with the
list below in front of them, whether those 14 should block the AI iterate loop, warn, or be
re-designed - and that is the whole item.

A smaller variant exists and should be weighed against it: keep measuring a near-solid panel as
solid and treat only a genuinely transmissive one (say under 0.9) as UNKNOWABLE-but-protective,
the way a gradient scrim is already treated. It has no blast radius on the blocking rule, and it
buys less.

## Evidence
Measured 2026-09-17 by rendering all 502 catalog designs at 1920x1080 through
`composeDocument` + `measureReadability`, settled, at each design's own default palette -
`text-low-contrast` count before and after adding the compositing above, everything else equal.

Newly blocked, with the worst reading in each: `ls10` 4.46, `cr04` 4.46, `pi03` 3.77, `ss06`
4.04, `sb05` 4.04, `fr07` 2.89, `fr14` 2.76, `es02` 3.86, `mr02` 3.53, `rs02` 2.97, `st02` 2.97,
`tt02` 2.97, `br02` 3.38, `nm01` 2.97. No design lost a finding, and the
`text-unprotected-over-video` count was unchanged at 456.

**This is not the pseudo-element change, and row TJ deliberately left it alone.** The same sweep
confirms it: reading `::before` / `::after` backings moved none of those 14 - identical warning
counts and identical resolved-backing counts before and after - because every one of them takes
its backing from an ordinary ancestor element. The over-claim predates pseudo-elements being
read at all, and lives on the element path.
