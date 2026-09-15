---
kind: agent
date: 2026-09-15
---
# Two agent-made graphics, one production, and the minute timed

The Elämäni biisi proof case (`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §3) walked end to end as a
stranger would: both graphics authored through the CLI against the shipped skill from an empty
folder outside the repository, packed, imported, and driven on the in-app production page. The
numbers below are wall clock on this laptop on 2026-09-15, and the walk found one defect serious
enough to fix on the spot.

## Route, under a minute

From this feature worktree:

```sh
npm run dev:worktree
```

Open the app, go **Home → Productions** (the sidebar entry, not the dashboard), and drop
`e2e/fixtures/agent-made/elamani-biisi.noacgpack.json` on **Import a pack file…**. That installs
the production whole: two graphics, two cues, layers 7 and 8.

Then: select **Totals board**, ⟳ Take. Select **Votes board**, type a song and four performers,
click a pick for each panelist and the correct letter, ⟳ Take, » Next. Back on **Totals board**,
press ⚡ +1 under two panelists.

## What to look at

- **The ⚡ block is the graphic's own, not ours.** "Reveal performer" sits under the heading
  **Song**, greyed off air with "The graphic is not on air — Take the cue first", and its hover
  reads *carrying this cue's Correct* - the author's word for `f15`, never the field id. Nothing
  in the studio knows what any of that means; it is read out of the template's `machine.controls`.
- **The totals board's eleven buttons render in five "Panelist N" sections plus a red New game**,
  and the ± LIVE NUMBERS block gives all five Points fields their own −/+ beside them.
- **» Next reveals through the machine.** The correct performer lights amber, the two panelists
  who guessed right get a green chip and the three who did not go dim. The same look arrives from
  data alone: `noacg screenshot … --data f16=revealed` paints it with no event sent, which is the
  reported-field contract a foreign host depends on.
- **The cue editor bands the numbered pairs** - "Panelist 3" holding Name 3 and Points 3, or
  Panelist 3 and Pick 3 - with the song, the lettered performers and Correct in the shared band.
  That is §3d.1's prediction, confirmed on a graphic no one here designed the fields of.
- **+1 keeps the cue and air in step.** Two presses, two figures moved on screen, and the cue's
  own Points boxes read the new numbers without an ✎ Update.

## The numbers

Seven CLI verbs, wall clock, against a local deployment (`node cli/dist/index.js`, so the numbers
describe this branch rather than the npm install):

| Verb | Wall clock |
|---|---|
| `doctor` | 2.1 s |
| `types` | 1.7 s |
| `scaffold` (votes board, 16 fields) | 1.8 s |
| `scaffold` (totals board, 10 fields) | 1.9 s |
| `validate --screenshots` | 11.2 s (each; 14.2 s on the first run, which had errors to report) |
| `inspect` | 1.8 s |
| `screenshot --state onair --data …` | 4.0 s |
| `pack` (both graphics, one file) | 1.9 s |
| `save` | 0.3 s, **refused** - no key on this machine, so the walk took the Import door |

**The operator's minute: 56 seconds**, at 1440×900, driven action by action: 10.4 s to type the
song, four performers, five picks and the correct letter; ⟳ Take at 23.6 s; » Next at 35.9 s;
the totals cue selected at 48.5 s; both ⚡ +1 presses by 56.2 s. **Read that as an upper bound on
the product, not as a producer's minute**: every one of those actions went through an agent's
browser tooling, which costs several seconds a click that a person at a keyboard does not pay.
What the product itself added was imperceptible - every press showed on air and in the cue before
the next screenshot.

The whole walk, from the empty folder to two graphics on air, took about 50 minutes, and almost
all of it was designing and building the two graphics. Nothing in the door needed a retry.

## The defect it found, and fixed

**On the production page the ■ Out button was painted on top of » Next, so pressing Next took the
graphic off air.** The verb column had no minimum width while the monitors' width follows the
viewport HEIGHT, so on a tall window the monitors ate the column: it measured 27px at 1440×900
and 0px at 1600×1000, and the five buttons then overlapped in pairs. It is fixed here
(`src/styles/playout-dashboard.css`, one track definition) and pinned by a spec that measures the
boxes, because the suite's own viewport is 1280×720 and has never been able to see it.

**1440×900 is a very common laptop screen**, so this is worth knowing happened: the layout was
ratified at 1366×768, 1920×1080 and 2560×1440, all of which are fine, and the sizes between them
were not looked at. The fix costs the monitors 25px of width at 1920×1080 and nothing at the
other ratified sizes.

## What this does not answer

The hosted control page and the exported controller were not driven - a linked worktree has no
backend, so nothing can be published from here. The production control profile does not exist
yet, so the "one press: Reveal, then the +1s" of §3c is still the operator's two-plus-N presses.
And the bench pressed eight of the totals board's eleven buttons and **said nothing about the
three it skipped**, which is AC-3's whole point: `validate` reported 0 errors and 0 warnings on a
graphic it had only two thirds walked.
