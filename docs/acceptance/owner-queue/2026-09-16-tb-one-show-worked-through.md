---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# "How are those supposed to be used?" - the answer is one show, with pictures

Your read tonight was that production data, the bindings and the tables are confusing. They were:
the page described three mechanisms and never once showed them doing anything, and TABLES were not
documented anywhere on `/docs` at all. There is now one small imaginary show that uses all three,
photographed from the running product at every step, and a second half that answers how a room
sends anything in when you have no Twitch and no YouTube channel.

## The route, one minute, from anywhere

Open `/docs` and click **One show, worked through** in the left nav, under "Run the show". Or go
straight to `noacg.studio/docs#data-example`. The audience half is the second part of the same
section, at `#audience-no-chat`.

## What to look at

**The show is Hall Cup, a school sports night**: two scoreboards, a ticker and a name strap, one
data tree, one table called Interviews, and a hall with phones. Read it as a student
would, top to bottom, and judge two things.

**First, whether the distinction now lands.** The section it turns on is "Which of the two you
want": production data is one value that is true right now and moves every bound graphic at once,
a table is a bank of rows an operator picks from. If that table reads right, the confusion is
fixed; if it does not, that is the paragraph to argue with.

**Second, the seven screenshots.** They are the reason this took a night rather than an hour. Every
one is a photograph of the real product with this exact show loaded, taken by
`node scripts/docs-shots.mjs` rather than by hand, so they cannot quietly go stale. The one to
look at hardest is the bindings picture. Nine fields bound and reading their values back, four
left alone on purpose, and both scoreboards landing on the same four paths from one press, which
is the whole claim shown rather than asserted.

Everything on the page was driven in the studio before it was written. The single exception is the
published `noacg.studio/join/<name>` link, which needs an account and the hosted backend, and the
page says so in its own words rather than implying it was tested.

## Two things I found and did not write around

The Audience tab's first panel is Chat sources, wanting a Twitch channel. The join link that
nearly everybody will actually use is on a different tab, behind Links, and does not exist until
you publish. The docs now tell you to publish first, which is the right instruction in the wrong
place: `docs/backlog/the-audience-tab-never-says-how-the-room-gets-in.md`.

And the join page's heading is stuck. It says "Send us your question" over a comment box and over
a ballot, in both providers, with no operator control anywhere to change it:
`docs/backlog/the-join-page-prompt-never-follows-the-mode.md`. I kept that frame out of the docs
rather than photographing it.

## One repair on the way past

The bindings rows on the Data tab were laid out by a five-column grid that a bound row only ever
filled four of, so the unbind ✕ landed in a 0.9fr track and drew as a 336px slab instead of a 28px
button, and every row sized its own columns from its own content so the path boxes sat a few
pixels apart all the way down the list. Both are fixed in `src/styles/feedback.css`. It is visible
in the bindings screenshot, which is how it was found.
