# Blind notes - owner, 2026-08-17 (written before reveal, transcribed verbatim)

- X51 is not working. It has a weird line and the alignment is all wrong.
- X50 works okay. It's a bit dark. It's fine.
- X53 is okay even though the circle above the lower third shouldn't be there because there is
  too much space for a lower third. The design is a bit flawed but otherwise it looks okay. The
  logo is too small so this is not good either but okay.
- X52: the profile picture again shouldn't be on the top and the logo has a huge black square
  around it, not good.
- X24 is fine. The logo could be bigger.
- X55: the diagonal stroke is too wide. It almost goes on top of the logo.
- X25 is okay.
- X54 is okay.
- X26 is okay but the contrast is not correct I think but it's okay.
- X57 is not okay. Something's wrong with that graphic. It has a box on top that doesn't work
  and the line doesn't work.
- X27 is not okay. The diagonal line goes on top of the text.
- X37 is not okay. The line goes on top of the text and the logo is too small.
- X56 is not okay. The line goes on top of the text.
- X20 is okay.
- X36 is not okay because the logo is not aligned with the box or the text. It should be in the
  center for it to look good.
- X59 is okay.
- X21 is good.
- X35 is okay.
- X58 has the logo too high up. It's not aligned with the text. It's aligned with the line. It
  doesn't look that good.
- X22 is not okay. The line isn't aligned with the text.
- X34 is not okay. The whole design is messed up with the logo and the text.
- X23 is not okay. The line on top of the text.
- X33 is okay.
- X28 is okay.
- X29 is not okay. The K on top doesn't look good. The logo is too small because it's so wide.
- X39 is not okay. The TL black box at the top doesn't look good. It doesn't fit there.
- X38 is okay.
- X08 is not okay. The line on top of the text.
- X09 is not okay. The sun block at the top is not good and the logo is not centered.
- X60 is okay but there is a bit too much white space.
- X61 is okay.
- X19 is okay.
- X62 (no verdict written)
- X02 is not okay. The line is wrongly placed.
- X18 is not okay. The text and line are on top of each other.
- X63 is okay.
- X03 is okay.
- X48 is okay.
- X49 is not okay. The logos have huge white boxes around them. Doesn't look good.
- X01 is empty, nothing there.
- X15: something is wrong with the contrast but otherwise fine.
- X46 has the logo not aligned. It's not centered and doesn't look so good.
- X06 is empty again. Not okay.
- X14: the box on the top does not look good. The logo is too small, too much space around the
  text.
- X47 is okay.
- X07 is not okay. Line and text are on top of each other.
- X17 is not okay because the logo with a white block background does not look good. Otherwise
  it's fine.
- X04 is not okay. There is too much space around it. The logo is too small, too much space
  around the text. The banner is too big.
- X16 is okay.
- X45 is okay.
- X05 is okay.
- X11 is not optimal. The glow doesn't work and the logo has the box around it. Not good.
- X42 is okay.
- X10 is okay.
- X43 is not okay. The line is on top of the text.
- X13 is not okay. Line on top of the text.
- X40 is okay.
- X12 is not okay. Line on top of the text.
- X41 is not okay. The blocks are huge, the banner is big, and the text is small compared to
  the banner. Wrong proportions and the white background behind the logo looks bad.

Not rated: X30, X31, X32, X44, X64. X62 listed with no verdict.

Overall (owner): "The design is a bit flawed but otherwise it looks okay" (written against X53).

---

# After the reveal - the join (written after the notes above were complete)

Per-round airable rate (owner's blind verdicts over rated items):

| round | pass | fail | unrated |
|---|---|---|---|
| Phase A accepted set (round-2026-08-16, platform-composed) | 14 (one marginal fail) | 1 | 3 |
| minimax-m2.7 (free-form coder) | 3 | 8 (2 empty) | 1 |
| grok-4.3 (free-form coder) | 2 | 7 | 1 |
| gemini-3.7-flash (free-form coder) | 5 | 7 | 0 |
| claude-opus-5 (free-form coder) | 3 | 8 | 1 |

The four coder arms together: 13 pass / 30 fail (~30% airable). The platform-composed control:
93% on the same page, same briefs, same brands, read blind and interleaved.

Defect classes the read named, joined to the machine half:

1. **"Line on top of the text"** (~13 fails, every checkpoint) - `text-over-rule` had already
   fired on almost exactly these cells (grok 6/6, gemini 6/6): the instrument bank predicted
   the read's dominant class before anyone looked.
2. **Mark plates** ("huge black/white square/box around the logo") - the exact class Phase A's
   knock-never-plate rule closed on the platform side; the free-form coder reinvents it.
3. **Junk furniture above the strap** (circle, profile picture, monogram K, TL box, sun block) -
   a decorative device the owner rejects on a lower third every time it appears.
4. **Logo too small / misaligned** - repeated across arms.
5. **Two runtime-dead graphics** (minimax) - the two "empty" items are exactly the two cells
   whose contract carried blocking runtime errors. Machine and human agree.

Device cells: 5 of 46 rated coder cells carried a device; 1 passed (opus high-contrast),
the others failed - the opus long-name device (the monogram K) is one of the rejected
furniture items. A device did not buy a pass.
