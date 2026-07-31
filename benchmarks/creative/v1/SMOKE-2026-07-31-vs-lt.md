# Creative Mode pilot - versus + lower-third smoke, 2026-07-31 (round 2)

Second smoke of `bench:creative:pilot`, first on the SPLIT-ROUTE rig: all 13 versus and 8
lower-third briefs x 4 arms. Companion to `SMOKE-2026-07-31.md` (the bracket round and its
blockers); raw artifacts in the worktree's `creative-pilot-out/{vs,lt}/`, catalog
references + copy-line calibration in `creative-pilot-out/catalog-refs-ltvs/`.

- Candidate route (arms C/D + intent): `openrouter:qwen/qwen3-30b-a3b-instruct-2507`
- Coder route (arms A/B): `openrouter:qwen/qwen3-coder-next`
- Critique route (arm D): `openrouter:google/gemini-2.5-flash`
- Recorded spend: **$0.45** (approved envelope $1.28; recorded is a floor - failed calls
  bill tokens the client never sees)

## Scorecard (engineering half - reported, never ranked on)

| category | arm | attempted | completed | valid | gap-free | style landed | critique found / landed |
|---|---|---|---|---|---|---|---|
| lower-third | A | 8 | 8 | **8** | 3 | - | - |
| lower-third | B | 8 | 8 | 6 | 4 | - | - |
| lower-third | C | 8 | 8 | 2 | **8** | 6 | - |
| lower-third | D | 8 | 8 | 3 | **8** | 6 | 8 / 1 |
| versus | A | 13 | 10 | 8 | 1 | - | - |
| versus | B | 13 | 12 | 4 | 3 | - | - |
| versus | C | 13 | 12 | 6 | **12** | 10 | - |
| versus | D | 13 | 12 | 5 | **12** | 6 | 12 / 0 |

## What changed since the bracket round

1. **The split-route rig fixed blocker 1.** Coder arms went from 0/8 (A) and 3/8 (B)
   completed on the planning model to 18/21 (A) and 20/21 (B) on the coder route. The
   residual `malformed_response` rate on coder-next is real but stochastic (~10-15% of
   coder-class calls, retried by the gateway and still occasionally lost) - a full pass
   should expect and report it, not be surprised by it.
2. **The states clamp fixed blocker 3, verified live.** Staged-arm structural
   satisfaction went from ~20% gap-free (bracket round) to **20/20 completed C/D briefs
   gap-free on versus and 16/16 on lower-third** - criterion 2's >=90% bar clears on both
   categories (small n, one model).
3. **The pairwise review (criterion 4) is now RUNNABLE on these categories.** The frozen
   control on the coder route produces genuinely reviewable material: every lower-third
   arm-A result is a real strap (restrained, panel bottom-left), and vs-debate's arm A is
   a composed two-sided card (medallions, party chips, schedule strip). This is the first
   smoke output worth a human's time - the bracket round had none.
4. **The frame-flood defect recurs and is now the staged arms' main quality blocker.**
   The style stage repeatedly paints a full-frame opaque backdrop ("valid" terracotta
   full-frames with near-illegible small text; the sameness pass marks these [skinned] at
   large distances while empty-ish frames sit at ~0.1 from the quietest catalog look).
   The owner question from round 1 item 5 - is an opaque full-frame backdrop ever
   legitimate for a CREATE result - now gates the staged arms' reviewability, not just one
   bracket frame.
5. **Critique (blocker 4) unchanged:** findings on 20/20 D runs, repair landed 1/20. The
   acceptance rule still makes landing near-impossible on invalid bases.
6. **A new dominant failure signature for staged arms:** `bench-entrance` + `bench-replay`
   pairs on most invalid C/D rows. DIAGNOSED AND FIXED after this report: the style stage
   re-implements the lifecycle as CSS state classes (`.visible`, `.reset`) nothing ever
   toggles, sets `visibility: hidden` on the box (nothing writes inline visibility, so the
   entrance can never reveal it) and `opacity: 0` on never-animated inner elements (cells,
   spans - GSAP animates only the box and regions). The repair loop made it worse: the
   model answered the bench findings with more of the same classes. Fixed the clamp way in
   `applyCreativeStyle` (`stripHidingDeclarations`: visibility/display poison stripped from
   scaffold selectors, opacity-0 stripped where the rule's subject is never animated, a
   patch's own classes untouched) plus a lifecycle-ownership paragraph in the style prompt;
   pinned end-to-end in e2e/creative-pilot.spec.ts (a poisoned patch passes the full
   production bench with no entrance/replay findings).

## Costs and latency (criterion 7, this round)

Arm A p50 ~$0.007 / 34-305 s; B ~$0.005 / 15-245 s; C ~$0.001 / 22-193 s; D ~$0.003 /
36-224 s (plus critique). Cost per completed staged attempt stays around a tenth of a
cent at candidate prices - the §12 story holds; the coder arms cost roughly 5-10x the
staged arms per attempt at coder-next prices.

## What a full pass still waits on

- The **owner ruling on opaque full-frame backdrops** (round 1 item 5) - it decides a
  cheap gate rule vs a measured bench dimension, and it now dominates staged-arm quality.
- The **critique acceptance rule** (round 1 item 4 / blocker 4).
- The **entrance/replay diagnostic** (item 6 above) - free, one session-sized
  investigation.
- The bracket category additionally waits on the **scaffold/layout-IR ruling** (round 1
  blocker 2); versus and lower-third do not.

With those, the full candidate passes (4 models x 27 scored briefs x 4 arms) have a
realistic shot at producing the §11 sheet's pairwise-reviewable dataset; without the
backdrop ruling, half the staged results remain visually disqualified regardless of what
the gates say.

## Reproduction

```
node scripts/creative-pilot-bench.mjs --route=openrouter:qwen/qwen3-30b-a3b-instruct-2507 \
  --coder-route=openrouter:qwen/qwen3-coder-next \
  --critique-route=openrouter:google/gemini-2.5-flash \
  --category=versus --label=smoke-vs --max-cost=0.85
# and --category=lower-third --label=smoke-lt --max-cost=0.55
node scripts/creative-catalog-refs.mjs --categories=lower-third,versus --out=<out>/catalog-refs-ltvs
npm run bench:sameness -- <out>/catalog-refs-ltvs
npm run bench:sameness -- <out>/vs --house=<out>/catalog-refs-ltvs
```
