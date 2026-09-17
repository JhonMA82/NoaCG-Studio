---
kind: walk-p
date: 2026-09-16
because: direction
---
# Away is 3 GB and at-the-desk is 4 GB - is that what "use it all" meant?

Your 2026-09-16 answer - "Not on the computer, ok to use it all" - is now the mechanism. The job
queue has two free-RAM floors instead of one guessed 4 GB, and which one applies is declared rather
than guessed. **The one thing that needs you is the pair of numbers**, because "use it all" could
have meant lower than 3 GB.

## The route, one minute, from anywhere

`npm run jobs -- presence` prints what the queue believes and the floor that follows from it.
`npm run jobs -- presence away` drops the floor to 3.0 GB on the runner's very next pass, with no
restart; `presence present` puts it back, also at once. It reverts on its own after twelve hours
either way, so nothing you set here can be left running against you.

**What to look at, and the sentence I need back.** 3072 MB away, 4096 MB while somebody may be at
the keyboard. If away should go lower - 2.5 GB, or "genuinely all of it, let it swap" - say so and
it is a one-line change.

## Why those two numbers

4096 was never measured; it said so in its own comment for a week. Measured on this laptop on
2026-09-16 with six sessions live: one browser walk peaks at about 1.4 GB, so a suite-equivalent
costs about 3 GB - which is the away floor exactly, nothing kept back. The extra gigabyte in the
4096 is your working room rather than the job's, which is why it is dropped when you are not there.
A session costs about 550 MB here, and background desktop apps that are no part of agent work hold
3.1 GB between them.

A job held by the stricter floor now prints the gigabyte being kept and the command that releases
it, which is your "during a day wave it's always good to ask if you can go over 4 GB" printed where
the wait happens instead of left to somebody to remember.

`docs/JOB_RUNNER_PLAN.md`, "What a job actually costs in RAM", has the table and how to redo it.
Still owed: a real Playwright suite and a catalog battery were not watched at peak - their cost is
derived from the walk, not measured. `docs/backlog/ram-floor-by-presence-not-by-guess.md` says what
would close that.
