# AC-4 - the profile is a versioned, deletable part of the show, pinned at publish

**Verdict: pass.** Reviewed at `dfac5b9cf230532565f57d6988517bb25cdbf94d` on 2026-09-16.

## The format, observed in use rather than in a test

The walk of AC-9 composed a combined control on the production page and then read the stored show
back through the app's own model (`import('/src/model/shows.ts')`, `loadShows()`). What the product
had written:

```json
{ "v": 1,
  "arrange": {},
  "combine": [ { "id": "combined-1", "name": "Reveal, then the +1s", "steps": [
    { "kind": "event", "graphic": "Votes board",  "control": "reveal" },
    { "kind": "event", "graphic": "Totals board", "control": "plus1", "after": 3, "ask": { "default": true } },
    { "kind": "event", "graphic": "Totals board", "control": "plus2", "ask": { "default": true } },
    …plus3, plus4, plus5 the same ] } ] }
```

That is v1 exactly as `src/model/profile.ts` defines it, including HD's decision that `ask` is
`{ default: boolean }` rather than a bare boolean. The profile survived a full page reload
(`profileSurvivedReload: true`) and the combined button re-rendered from it.

**Deleting it is one action.** Pressing "Delete profile" in the Controls panel left `show.profile`
`null`, the combined button gone and its five tick boxes gone, in one press with no confirmation
step to get lost in.

## The version gate

`readShowProfile` (`src/model/profile.ts:211`) is the single migrate-on-read door. A value with no
numeric `v` is `none` - garbage rather than a future format, so a stray `{}` is not un-authorable
forever. Any `v` that is not 1 is `{ status: 'read-only' }`. Every rendering surface reaches the
profile through `readPublishedProfile`, which answers null for both cases: `controlModel.ts:378`
for ARRANGE on all three deployments, `hostedControl.ts:530` for the hosted page's whole record,
`ProductionPage.tsx:1706` in-app. COMBINE is read off those same gated values
(`HostedControlPage.tsx:549` reads `resolved?.profile`, which is already the gate's output), so the
mistake HE found - two surfaces reading `show.profile.arrange` raw - is not available to a fourth
caller.

## Pinned at publish, on the real project

Read directly off the project the studio deploys against (`kprolrchuldgfrzspthy`), 2026-09-16:

- `list_migrations` ends at **0059**, so 0058 (`control_profile`) and 0059
  (`control_show_by_slug_profile`) are both applied.
- `pg_get_function_result` for `public.control_show_by_slug` contains `profile`, so the hosted
  read really does carry the column. HD's handoff expected that widening to wait for a later row
  and HE's corrected it; the live database agrees with HE.

`publishControlShow` (`hostedControl.ts:348`) writes `show.profile ?? {}` so a production without
one reads as "no profile" rather than null, and retries the upsert without the column when
PostgREST refuses it (`:363`), which is what keeps an instance that is behind on migrations
publishing at all.

Through the queue, `e2e/hosted-control.spec.ts` (job `j-1138`): **12 passed**, exit 0.

## Limitations

- **The WRITE of the column on a real publish was not observed.** `publishControlShow` returns
  before its upsert when there is no Supabase, and no checkout this session could reach carries
  backend configuration, so step 8 of the live-verify checklist in `docs/CONTROL_LAYER.md` is still
  open. What is proven here is that the column exists on the live project and the read path is
  gated; what is not proven is a round trip through it.
- `bindings` is still named unconditionally in the same upsert, so the PGRST204 trap HD described
  is one unmigrated instance away for that column. Outside this criterion, recorded again because
  three rows have now left it.
