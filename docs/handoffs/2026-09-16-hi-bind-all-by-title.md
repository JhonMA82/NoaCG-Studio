# Bind all by title

AC-8. Two buttons on the Data tab's bindings table - one per graphic, one for the whole
production - each apply every unambiguous title-to-leaf suggestion the table already computed, in
one write. An ambiguous title stays unbound and now says which leaves it matched, whether or not
either button was ever pressed.

**Landed:** `d1fea578` (the two buttons, the ambiguous-row note, the spec, the owner-queue item),
`5b17930d` (a scope-key collision fix and a batched write, from review). Check stamp:
`claude-hi-bind-all-by-title.json`, PASS at `5b17930d`. Owner-queue item:
`docs/acceptance/owner-queue/2026-09-16-bind-all-by-title.md`.

check: `review: delegated` (scope confirmed: base `e4d0f32d`, 5 files, identical to
`review-request.mjs`; 3 findings, 2 fixed, 1 refuted - see below), `simplify: inline` (the skill
returned fan-out instructions rather than a result; the four angles found nothing worth changing
beyond what review already touched), `verify: inline` (`npm run build` exit 0;
`e2e/production-data.spec.ts` 21/21 through the queue at `--cost 0.5`, jobs `j-1132` and `j-1134`
on the final commit). `test:e2e:affected` was **not run locally**: `j-1133` could not admit at 1.4
GB free against its 4.0 GB floor, and it plans against the stale local `main` rather than
`origin/main` so a small change escalates to the whole suite
(`docs/backlog/e2e-affected-plans-against-a-stale-main.md`, filed by HD). Cancelled rather than
waited on; CI runs the affected suite and the catalog gate on the pull request, which is strictly
more than this laptop can do anyway. `taste: not applicable` - two small text buttons and a
one-line note, nothing here can move what a graphic looks like.

## What the review found, and what happened to each finding

1. **A graphic renamed to "production" collided with the reserved scope key** the note used to
   tell which button fired last, producing a duplicate `data-testid` and a duplicated note.
   Fixed: the scope is now a tagged union (`{ kind: 'production' }` vs `{ kind: 'graphic', name }`)
   compared by `scopesMatch`, never by string equality against a graphic's own name.
2. **The bulk button wrote once per field via `setFieldBinding`**, each call its own full
   load/parse/mutate/stringify/save of the whole shows store. Fixed: added `setFieldBindings` in
   `src/model/shows.ts`, sharing the single-field write rule (`applyFieldBinding`) but committing
   every entry in one `patchShow` call.
3. **A claimed CSS spacing regression under the "Bindings" heading** (moving the h3's own margin
   onto a new flex wrapper). A background verifier this session did not launch checked it against
   the actual collapsing-margins math and refuted it - the gap is identical before and after
   because the following element's own top margin already exceeds the old bottom margin in both
   the empty and non-empty cases. Left as reviewed-and-declined; nothing changed here.

The relay carrying that verifier's report (`node scripts/relay.mjs read --branch
claude/hi-bind-all-by-title`) is read.

## Decisions worth knowing about

- **The per-row ambiguous note is unconditional**, not something the bulk button reveals. AC-8
  says a row must say why it stayed unbound; making that depend on a button press first would
  leave every untouched row silent about a title that will never resolve on its own.
- **A field with zero matching leaves carries no note at all.** Only two-or-more matches counts as
  ambiguous; zero is just "nothing to suggest," and the row already says `not bound` in its
  placeholder.
- **Already-bound fields are never touched or re-suggested** by either button, so a press is safe
  to repeat - the second press on an unchanged tree reports "Nothing unambiguous to bind."

## What is left

- **Nothing outstanding for AC-8 itself.** Both buttons, the ambiguous note, the spec (two
  matching graphics, one ambiguous field), and the owner-queue route are all in this branch.
- **AC-9 and AC-10** (`docs/work-specs/control-panel-any-graphic/spec.md`) are untouched and
  outside this row's scope.
