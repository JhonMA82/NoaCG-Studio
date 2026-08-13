-- What the platform REPAIRED, recorded beside what it rejected.
--
-- `validation_rule_codes` records why a decision was refused; nothing recorded what was
-- silently fixed. The semantic validator has always returned `adjustments` - a brand palette
-- applied over the model's version, a furniture colour clamped to the contrast floor, a
-- mark's chassis re-picked or its well painted - and the endpoint dropped them on the floor.
--
-- Lite's product claim is "exactly the brand's colours". A repair nobody counts is how that
-- claim goes wrong without showing up anywhere: the ledger reported a clean generation for a
-- graphic whose requested palette had been altered. This column makes brand-fidelity repair
-- rates measurable per prompt version (docs/AI_LITE_BRAND_PLAN.md §3.2).
--
-- Content-free by construction, like every other column here: enumerated codes only, never
-- prompts, colours, assets, DesignSpecs, code or provider bodies.

alter table public.ai_generations
  add column if not exists adjustments text[] not null default '{}';
