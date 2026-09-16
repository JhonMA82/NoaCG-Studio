---
v: 2
source: derived
kind: finding
raised: 2026-09-16
state: unstarted
found: "The 2026-09-16 answer to ALIGN-2026-09-15-6 says the 20 October playout is SPX. The door that keeps the control profile - the output embed - has never been run against a real SPX server, and the door that has been proven - the SPX starter export - deliberately carries neither combined controls nor shared data."
serves: NOW
size: small
touches: src/export/outputEmbed.ts, src/export/targets/spxStarter.ts
needs-owner: none
---
# Which door into SPX the 20 October demonstration uses, and what it costs

**Filed:** 2026-09-16. **Source:** the owner's answer to ALIGN-2026-09-15-6, recorded in
`docs/OWNER_RULINGS.md`, derived into `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5a item 2.

## Why

The owner said of 20 October: *"We will be running that on SPX."* That is one sentence about a
room, and it lands on a seam this repository already knows about. NoaCG has two ways into SPX and
they hand the operator different products:

- **The output embed** (`src/export/outputEmbed.ts`) is one SPX-legal file whose body is the
  production's own output URL. SPX's Play and Stop move the frame; every cue, the combined control
  and the shared production data stay with the NoaCG operator. This is what the day wants, because
  the follow-along score updating live IS the demonstration. It has never been run against a real
  SPX server - `docs/acceptance/owner-queue/2026-08-25-spx-output-embed-on-a-real-spx-server.md`
  has been open since 2026-08-25.
- **The SPX starter export** (`src/export/targets/spxStarter.ts`) is the strictest export gate we
  have and it is proven, but by `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6f it carries fields and the
  default path only: no combined controls, no data tree. Falling back to it on the day silently
  removes the "one press: Reveal, then the +1s" the whole profile was built for.

Nobody has compared the two on the proof case, so the choice would be made in the room, by whoever
is standing there, in front of the people the day is meant to impress.

## What it would take

Two halves, and only the second needs hardware.

1. **Offline, a session's work.** Take the two proof-case graphics
   (`e2e/fixtures/agent-made/elamani-biisi.noacgpack.json`), export the production both ways, and
   write down exactly what an SPX operator sees from each: which fields, which buttons, what
   happens to the combined control, what happens to a `+1` on a bound field. The answer is derivable
   from the code, but it has never been derived, and §6f is a sentence rather than a walked result.
2. **On hardware, the owner's SPX machine.** The embed check that is already in the owner queue.
   Extract, add to a rundown, Play, confirm the frame is the live output and that a cue taken from
   the NoaCG control page appears in it. That item stands; this file exists so the question it
   answers is attached to the date.

## Evidence

- `docs/OWNER_RULINGS.md` ALIGN-2026-09-15-6, 2026-09-16 - the day is a demonstration, the playout
  is SPX, the point is how easily the graphic is made.
- `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5a item 2 (the day's list) and §6f (what a downloaded
  package deliberately does not carry).
- `src/export/outputEmbed.ts`, whose own header says SPX is the case it exists for and that it
  holds the output capability only - a template able to operate the show would have to carry the
  control slug onto a playout machine.
- `docs/ACCEPTANCE_SPX_CASPARCG.md` - the only SPX walk we have, on the lower-third fixture, by
  hand.
