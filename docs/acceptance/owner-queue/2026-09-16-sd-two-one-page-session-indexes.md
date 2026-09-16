---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# Two one-page indexes for the 25th, one for the room and one for you

Beat G2 of `docs/DEMO_2026-09-25.md` asked for two printed pages: the students' road in order with
a link into each guide and the take-home brief, and your running order with who drives each beat
and the timing. Both exist now, as printable sections of the docs page.

They are sections of `/docs` rather than two PDFs or a page of their own on purpose. They link
into the guides above them by anchor, so there is one copy of every instruction and none of it can
drift; they print from a browser with no build step; and a new public URL is a scope edge that
would have come back to you for permission rather than for taste.

## The route, under a minute

Two addresses, and the print dialog:

1. `https://noacg.studio/docs#session-student` - the student sheet. Press Ctrl+P. **Only that
   sheet is in the preview**, not the twenty pages of guides around it.
2. `https://noacg.studio/docs#session-owner` - the running order. Ctrl+P again.

The selection is the address: `:target` in `src/docs/docs.css` drops every other section while a
sheet is the one the URL names. Opening plain `/docs` and printing still gives the whole page.

## What to look at

**On the student sheet.** Eleven numbered steps, road 1 then road 2 then on air, each with the
guide behind it. Then the take-home brief. The question is whether a student who missed a step
could follow it cold on paper, and whether eleven steps is the right grain rather than six or
twenty.

**On your sheet.** The five beats with the clock from section 0 of the script, who drives each,
and nine things to say out loud, which are the known rough edges plus the two measured numbers.
The question is whether that is the order you want to run, and whether anything on the say-out-loud
list is wrong to say in front of a room.

**In print.** Each is meant to be one sheet. The type is set at 9pt for that, and the student one
is close to full. If either spills onto a second page in your printer's paper size, the fix is to
cut content rather than to add a page (section 0, call 5).

## The one call I made that is yours to overrule

Row 17 asked where a group sends its finished quiz template and scoreboard. The sheet says: export
both as SVG, email them to `contact.noacg@gmail.com` with the group's name in the subject, and
send the Illustrator files too if they want notes on the drawing. It also promises what happens
next, which is that every file that arrives gets imported, run in a production, and answered with
what each layer became and which names to change.

I picked that address because the docs footer already carries it, so the answer needed no new
intake surface, no account for the students and nothing from you before the day. If you would
rather the files came to a personal address, to a shared drive, or through the course's own
hand-in channel, that is one sentence in `docs.html` and the answer is the one thing on these two
sheets that nothing in the product decides.

The last line of the brief offers to add a group's board to the practice library with their names
on it, asking first. That is an offer, not a promise, and it is there because it makes the
homework worth doing.

## What is pinned, and what is not

`e2e/docs.spec.ts` holds every anchor the student sheet links into, the five times on the running
order, and the print isolation in both directions. What no gate can hold is whether either sheet
is any good, which is why this is here.
