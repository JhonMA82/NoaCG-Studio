# Owner's blind read - 2026-08-19, all 28 items (transcribed; join below)

Verdict shorthand: AIR = would air now · OK* = okay / could work as-is with a named nit ·
TWEAKS = works with small changes, not airable as delivered · FAIL = rejected.

## Stat panel

- **X-24** - AIR. "Looks good. I think this is fine."
- **X-25** - AIR. Looks good.
- **X-23** - AIR. Looks good.
- **X-12** - OK*. Looks good BUT "the percent number is way too small and it's very basic -
  just a text with a yellow accent line." (This is the catalog stat anchor ig01 - the SAME
  too-small note it took in the 2026-08-18 read.)

## Ticker

- **X-26** - OK*. "This one works. Very basic, the text is too big I think, but it's fine.
  I could use this."
- **X-27** - OK*. "Yeah I can use this. It's okay."
- **X-28** - OK*. "The gradient/glow may be a bit weird but it's okay. No problem, I can
  use it."
- **X-14** - FAIL. "Red background, black text - I don't think that works. Also the ticker
  overflows to the right and not on the left, so it looks like it's not properly laid out."
  (This is the catalog ticker anchor tk01 - the IDENTICAL verdict, word for word in
  substance, it took in the 2026-08-18 read.)

## Scoreboard

- **X-20** - AIR. "I think this is fine. I would use it."
- **X-21** - AIR. "Yes I would use it." Stress test "okay - not perfect because it gets the
  dots but it's fine."
- **X-22** - OK*. "Fine, but the names being different lengths makes the background banner
  different lengths on both sides - it looks like it's not in balance. The text and numbers
  should be centered and both teams should get equal space on the banner."
- **X-10** - TWEAKS. "The first one is okay but on the stress test the left text gets cut
  off. A bit weird that one number has a yellow background and the other doesn't - a bit
  difficult to read." (This is the catalog scoreboard anchor sb01.)

## Quiz board

- **X-08** - AIR. "Our standard template look. It works." (The catalog quiz anchor qz01.)
- **X-19** - AIR. "This is fine. X-19 works."
- **X-18** - OK*. "Also works, fine. I would not have the first graphic use so much real
  estate for one line of text, but I would use it."
- **X-17** - OK*. "That one is also fine."

## Lower third

- **X-09** - OK*. "Yeah this is okay."
- **X-07** - OK*. "Yep this is okay."
- **X-04** - OK*. "This is okay." (The catalog lower-third anchor lt27.)
- **X-11** - OK*. "It's okay."

## Countdown

- **X-02** - AIR. "Looks like our template graphics. It works, it's fine." (The catalog
  countdown anchor gt05.)
- **X-03** - AIR. "It works, it's good."
- **X-01** - AIR. "Works, that's good."
- **X-05** - AIR. "Works, it's good."

## Podium score

- **X-15** - AIR. "Good. It has many states, interesting, but it worked out. That's good."
- **X-06** - OK*. "It's fine." (The catalog podium anchor sb21.)
- **X-16** - OK*. "Fine. It has the states/steps so it's okay."
- **X-13** - AIR. "It's okay. I think that looks good."

Overall: "For the most part all of these pass. My hopes haven't been that high lately so I'm
just very happy that it can do even this. I'm happy."

# The join (verdicts x the machine's own verdicts)

Airable = AIR + OK*. Per round:

| round | AIR | OK* | TWEAKS | FAIL | airable |
|---|---|---|---|---|---|
| gemini-3.7-flash iterate under the rules | 11 | 10 | 0 | 0 | **21 of 21** |
| catalog anchors | 2 (X-02, X-08) | 4 (X-04, X-06, X-12, X-26-class) | 1 (X-10) | 1 (X-14) | 5 of 7 |

The fail-closed gate against the read:

- **Delivered-clean 19 cells: the owner would air ALL 19.** The §22 target - delivered-clean
  ≈ airable - is met with ZERO deliver-signal escapes (§22 leaked 12 of 24; §21.2 leaked
  4 of 19).
- **Dirty-stopped 2 cells (X-01 cd-launch, X-03 cd-results): the owner AIRED BOTH.** Both
  stopped on the countdown's CALIBRATED spacing thresholds (padding-tight at 0.11-0.23 vs a
  0.24 floor, lines-adrift at 1.55-1.92 vs a 1.4 ceiling) - two false stops. The stop signal
  is now the over-strict side; the countdown thresholds are the named numbers to relax.
- **The catalog took the same two notes a third time**: tk01's red-on-black + one-sided
  overflow (FAIL, verbatim repeat of the 2026-08-18 X-21 verdict) and ig01's percent number
  "way too small" (the min-size rule request, now a rule the catalog itself does not meet).
  sb01 adds a stress truncation + uneven number-backing note. These are CATALOG fixes owed,
  not lane defects.
- **X-19 (qz-primetime) airable on the page and NOT DRIVABLE through the shipped control
  page** (its runtime throws "Cannot convert undefined or null to object" there) - the one
  cell where the visual verdict and the operational proof disagree; the round's only
  outstanding cell-level defect.
