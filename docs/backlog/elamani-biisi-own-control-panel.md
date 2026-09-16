---
v: 2
source: owner
kind: ask
raised: 2026-09-15
state: advanced
branch: claude/control-panel-spec
note: the plan and the profile design landed 2026-09-15 (docs/CONTROL_PANEL_ANY_GRAPHIC.md); all ten rows of its §5 landed by 2026-09-16 (pull requests 270-281). HJ walked the proof case with the profile in use and timed it, but ON THE IN-APP PAGE: publishing needs a checkout carrying backend configuration and a linked worktree has none, so the hosted control page - the surface the show is run from - has still never shown a profile. AC-9 and AC-6 are open on that one gap, and AC-7 fails beside it because migration 0060 has applied nowhere. This receipt closes when the hosted walk has run.
asked: "It's going to be the 20th of October when we are going to do an Elämäni biisi TV show ... five people going to cast their votes ... show how many votes a person got for a song and then there needs to be a total scoreboard ... I'm thinking I am just going to prompt it in Claude Code and import it into our playout dashboard in a few minutes"
serves: P2
size: large
touches: cli/skill/noacg-graphic/, src/model/shows.ts, src/control/, src/components/home/ProductionPage.tsx, src/components/HostedControlPage.tsx, src/components/home/ProductionDataPanel.tsx, src/validation/runtimeBench.ts
covered-by: production-controls.spec.ts, hosted-control.spec.ts, control-panel-types.spec.ts
needs-owner: none
---
# Elämäni biisi, 2026-10-20 - a graphic that brings its own control panel

**Filed:** 2026-09-15. **Source:** the weekly alignment (ALIGN-2026-09-14-3) and the same day's
four rulings on the control-panel plan (ALIGN-2026-09-15-1 to -4, `docs/OWNER_RULINGS.md`).

The owner's words: five people vote on who performs each song; one graphic shows each person's
votes for the current song, another keeps a running total of correct guesses; he prompts it in
Claude Code, saves it with the CLI, and runs it from the playout dashboard within minutes, in
front of the producer and director. The dates he gave: the lecture on 2026-09-25, a student
production a few days after it on the existing scoreboards and quiz boards, and Elämäni biisi on
Yle on 2026-10-20.

## What serves it

`docs/CONTROL_PANEL_ANY_GRAPHIC.md` is the plan and `docs/work-specs/control-panel-any-graphic/`
its acceptance ledger. The ten rows of the plan's §5 build it: the skill teaches the control
contract, the bench cap, the profile's model, ARRANGE, COMBINE, the bound-field stepper, bind all
by title, and two timed walks of the proof case. This receipt closes when the second walk has
run and its owner-queue item names the minute.

## What stays open beside it

Whether the boards air through Yle's own playout on the night or are shown on the NoaCG player is
his (the questionnaire's open question of 2026-09-15). The rows assume the player; if they air for
real, the same rows reach Yle's playout through `/output`, and proving that output moves ahead.
