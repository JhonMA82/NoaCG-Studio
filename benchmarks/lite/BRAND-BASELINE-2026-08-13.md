# Brand baseline round - 2026-08-13, incumbent, pre-P1

The `docs/AI_LITE_BRAND_PLAN.md` §4.3/§8 P0 baseline: the brand bank on the production route
(`google/gemini-2.5-flash-lite`, prompt `lite-lower-third-v14`) BEFORE any P1 fidelity work, so
the palette-contract and catalog changes have a measured "before". Run on a local bench server
(this worktree, port 5280), eval rig `scripts/ai-lite-eval.mjs`, brand bank, 5 servable briefs
(3 left out as not-yet-servable categories). Spend: ~$0.005 including two attribution re-fires
and one debug re-fire - inside the ratified $0.50 campaign cap. Ling was already rejected at
qualification (`docs/MODEL_ROUTE_AUDITS.md` 2026-08-12), so this baseline is the incumbent.

## Result: 2 of 5 usable, and every failure is attributed

| brief | mark | outcome | mechanism |
| --- | --- | --- | --- |
| `brand-news-wordmark` | wordmark, dark ink | machine-usable (2 attempts, 1 repair) | lt11; **requested palette survived verbatim** (`#3b7dd8` accent intact) |
| `brand-creator-shield` | portrait, dark ink | machine-usable | clean |
| `brand-knockout-only` | wordmark, light ink | invalid: `lite-hold-generic-default-panel` | resolved **lt37 - a chassis with NO brand slot**; the mark has nowhere to land and the hold frame was refused as generic treatment |
| `brand-sports-badge` | square badge | failed: `logo_not_supported` (2 attempts, 1 repair) | model set `useLogoSlot` on a **slotless chassis**; the repair instruction ("choose a chassis whose catalog entry says logo:yes") did not save it |
| `brand-university-banner` | rail 13.3:1 | failed: `slot_role_mismatch:secondary` + `:tertiary` + `fallback_variant_incompatible` (debug re-fire; the first run died `malformed_response` on 1 attempt) | three-line role-to-slot mapping against the chosen chassis's named content slots; repair re-emitted another violation |

Frames and clips: `lite-eval-out/` labels `incumbent-brand-baseline`, `incumbent-brand-attrib`,
`incumbent-brand-debug` (gitignored - archived via `npm run eval:archive` per the standing
rule). Ledger rows: `ai_generations` 2026-08-13 04:23-04:27 UTC, `lite-lower-third-v14`.

## The headline finding: the catalog SPLIT undoes the v14 brand promise

**Only 6 of 13 Lite chassis carry the v14 brand slot** (`lt11 lt02 lt05 lt15 lt25 lt32`); the
seven added by the semantic-category round (`lt30 lt37 lt41 lt49 ls12 ls17 ls29`) declare
`logo: false` and no `logoSlot`. Retrieval does not read the mark when narrowing, so a
mark-carrying request is routinely put in front of chassis that cannot hold a mark. Three of
the five briefs trace to this one cause: a refusal (`logo_not_supported`), a dropped mark
(knockout-only on lt37), and the style-match pressure that makes both repeat. "Lite carries a
user's logo and never drops it" (the v14 claim) is currently FALSE on 7 of 13 chassis - a
regression by growth, not by change: the new chassis simply never went through the brand
step 3 work (`docs/AI_LITE_PLAN.md` §7.4).

Mechanism fixes, both now `docs/AI_LITE_BRAND_PLAN.md` §3.6:

1. **Retrieval narrows to `logo: true` entries when the request carries a mark** -
   deterministic, free, ships first; the same shape as every other measured-metadata rule.
2. **Draw measured slots on the seven** - the real fix, catalog work, the §7.4 step-3 pattern
   (type capability + audit + `logoSlot` metadata), and the opposite-tone chassis (§3.4) joins
   that batch.

## Secondary findings

- **`slot_role_mismatch` on a three-line brand brief** (university-banner) - the role-to-slot
  teaching/metadata class, kin to the v14-semantic round's history-ordering defect. Needs its
  own attribution round after the split closes; do not tune the prompt for it (§4 of
  `docs/AI_LITE_PLAN.md`: least effective lever).
- **The rig's cost line misses failed generations.** The attribution run printed
  `Cost reported: $0.0000` while the ledger booked $0.0017 - `ai-lite-eval.mjs` sums cost only
  from successful rows. Known trap shape (a paid call must be counted even when what follows
  throws). Small rig fix.
- **Palette fidelity looks good when a graphic lands**: both usable results carried the
  requested brand palette verbatim. The §3.1 contract work protects the DROP path
  (`palette_dropped_contrast_unreachable`), which this small bank did not happen to hit.

## Follow-up, same day: §3.6.1 verified

The retrieval mark-filter (plan §3.6.1) re-fired exactly these three failing briefs:
**0/3 → 3/3 machine-usable** (`markfilter-verify` label in the archive; ledger rows 05:21-05:23
UTC, all `usable`, no rejections). sports-badge → lt05 and university-banner → lt25 on one
attempt with zero rule codes; knockout-only → lt25 after one repair, its light paper palette
carried verbatim. The catalog split remains (slots on the seven is §3.6.2); it just can no
longer reach a marked request.

## What this changes

The §8 P1 order gains a concrete first slice: close the catalog split (§3.6.1 retrieval filter
now, §3.6.2 slots on the seven next) BEFORE the §4.4 volume matrix - a matrix over a catalog
where 7 of 13 chassis cannot hold a mark would only multiply this known failure into every
cell.
