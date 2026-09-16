# The join page says "Send us your question" over a ballot

**Filed:** 2026-09-16. **Source:** the /docs worked-example session, which drove the audience
workflow end to end to photograph it and could not publish a picture of the vote as viewers see it.

## What happens
Open a production's Audience tab, switch the mode to **Comments**, or open a poll. Every phone
holding the join link keeps the heading **Send us your question**, in the largest type on the
page, above a comment box or a ballot.

The heading is `state.prompt`. It is seeded to that string in both providers and nothing ever
writes it again: `src/audience/localAudience.ts:98` for rehearsal, and
`supabase/migrations/0035_audience_participation.sql:59` for a real production. `setState` accepts
a `prompt` patch (`src/audience/audienceTypes.ts:161`), and no surface in the app sends one, so
there is no way for an operator to correct it either.

`joinSurface.ts` already has the right answer and never gets to use it: `defaultPrompt(mode)`
returns "Cast your vote", "Pick your answer" or "Send us a message", and it runs only when the
prompt is EMPTY (`mountJoinSurface`'s `state.prompt || defaultPrompt(state.mode)`).

## Why it matters now
This is the surface a room of strangers reads on their own phones with no one to ask. A ballot
under a heading asking for a question is the kind of thing that makes half a hall type an answer
into a box that is not there.

## What it would take
Two candidate shapes, and the second is probably right:

1. **Stop seeding it.** An empty prompt makes `defaultPrompt(mode)` the heading, so it follows
   the mode for free. One line in `localAudience.ts` and a migration for the DB default, plus a
   decision about existing rows that carry the seeded string.
2. **Give the operator the box.** A prompt field on the Audience bar, defaulting to the mode's
   own wording, so a host can write "Ask our guest anything" in their own words. The column
   already trims to 160 characters (migration 0035, line 551), so the storage half is done.

Either way `e2e/production-audience.spec.ts` should pin that opening a poll changes what the
preview's heading says, because nothing pins it today.

## Evidence
Driven on 2026-09-16 against the dev build: `audience-mode` switched, a round opened, and the
in-studio "What viewers see" preview (the same renderer the phones run) still read **Send us your
question** above the three options. The screenshot exists in that session's scratch and was
deliberately kept out of `/docs`.
