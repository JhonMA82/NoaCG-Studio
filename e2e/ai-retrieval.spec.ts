import { test, expect } from '@playwright/test';
import { toApp } from './_bench';

// RETRIEVAL - the adapt-first pivot's shortlist (src/ai/retrieval.ts, docs/ADAPT_FIRST_PLAN.md
// §3 Stage R) - plus the placement rule that goes with it (AssembleOptions.keepChassisZone).
//
// Driven at MODULE level rather than through the UI on purpose: retrieval sits inside the
// harness's design stage, which needs a model, and the e2e suite is offline by design. The
// module is pure and deterministic, so the fast-path technique (root AGENTS.md, "Logic checks
// without UI") measures exactly the thing that ships. Free - no tokens.

/** One well-formed StructuralIntent, written inline so a spec failure names the input. */
const intent = (families: string[], labels: string[], tone: string[] = []) =>
  JSON.stringify({
    version: 1,
    kind: 'family',
    families,
    confidence: 'high',
    summary: '',
    parts: [],
    fields: labels.map((label, i) => ({ key: `f${i}`, role: 'line', label })),
    tone,
    originalityRequested: false,
  });

test.describe('shortlist retrieval', () => {
  test('a brief retrieves the designs drawn for it, not the whole catalog', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor } = await import('/src/ai/retrieval.ts');
      const { catalogDigest } = await import('/src/ai/designSpec.ts');
      const worship = shortlistFor(
        'worship service lower third with a scripture reference and the reader name',
        ${intent(['strap'], ['Reader', 'Scripture reference'], ['calm'])},
      );
      const esports = shortlistFor(
        'esports player card lower third with squad number and team',
        ${intent(['strap'], ['Player', 'Team', 'Squad number'], ['energetic'])},
      );
      return {
        worship: worship.variants.map((v) => v.id),
        worshipAnchor: worship.anchor,
        esports: esports.variants.map((v) => v.id),
        fullDigest: catalogDigest().length,
        worshipDigest: catalogDigest(worship.variants).length,
      };
    })()`);
    const r = res as {
      worship: string[]; worshipAnchor: string; esports: string[];
      fullDigest: number; worshipDigest: number;
    };

    // The designs drawn for this production lead. ls15 is "Scripture Reading", ls14 "Pulpit".
    expect(r.worship.slice(0, 2)).toEqual(['ls15', 'ls14']);
    expect(r.worshipAnchor).toBe('category:lower-third');
    // …and the sports straps that used to fill the tail are gone. This is the assertion that
    // fails if the relevance cut is removed: without it a worship brief was shown Squad Number,
    // Player Stats and Club Crest, which is a recommendation spent on an irrelevant design.
    for (const sporty of ['ls08', 'ls09', 'ls10', 'ls11']) expect(r.worship).not.toContain(sporty);

    // The same mechanism answers the opposite brief with exactly those designs.
    expect(r.esports.slice(0, 2)).toEqual(['ls08', 'lt41']);

    // The point of the exercise: the design stage stops reading the whole catalog.
    expect(r.fullDigest).toBeGreaterThan(60_000);
    expect(r.worshipDigest).toBeLessThan(r.fullDigest / 10);
  });

  test('every shortlisted design carries the structure the brief asked for', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor } = await import('/src/ai/retrieval.ts');
      const { variantSatisfiesAnchor } = await import('/src/templates/structuralAnchor.ts');
      const list = shortlistFor(
        'a league standings table for the weekend fixtures',
        ${intent(['table'], ['Rows'])},
      );
      return {
        anchor: list.anchor,
        all: list.variants.every((v) => variantSatisfiesAnchor(v.id, list.anchor)),
        count: list.variants.length,
      };
    })()`);
    const r = res as { anchor: string; all: boolean; count: number };
    expect(r.anchor).toBe('category:results-board');
    expect(r.count).toBeGreaterThan(0);
    expect(r.all).toBe(true);
  });

  test('nothing to retrieve within degrades to the full catalog, never to an empty list', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor, FULL_CATALOG } = await import('/src/ai/retrieval.ts');
      const novel = shortlistFor('a graphic nobody has made before', {
        version: 1, kind: 'novel', novelDescription: 'x', confidence: 'low',
        summary: '', parts: [], fields: [], originalityRequested: false,
      });
      const noIntent = shortlistFor('anything at all', null);
      const deadAnchor = shortlistFor('anything at all', null, 'category:not-a-category');
      const pinned = shortlistFor('anything at all', null, 'category:lower-third');
      return {
        novel: novel.full, noIntent: noIntent.full, deadAnchor: deadAnchor.full,
        pinnedFull: pinned.full, pinnedCount: pinned.variants.length,
        fullIsEmpty: FULL_CATALOG.variants.length === 0 && FULL_CATALOG.full,
      };
    })()`);
    const r = res as Record<string, boolean | number>;
    expect(r.novel).toBe(true);
    expect(r.noIntent).toBe(true);
    // An anchor that resolves to nothing must NOT be treated as satisfied by everything -
    // variantSatisfiesAnchor answers true for a dead anchor by design, which is right for the
    // satisfaction check and would hand retrieval a meaningless shortlist.
    expect(r.deadAnchor).toBe(true);
    // A category the user pinned still retrieves, even though the intent call never ran.
    expect(r.pinnedFull).toBe(false);
    expect(r.pinnedCount).toBeGreaterThan(0);
    expect(r.fullIsEmpty).toBe(true);
  });

  test('the shortlist digest lists exactly the shortlisted designs', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor } = await import('/src/ai/retrieval.ts');
      const { catalogDigest } = await import('/src/ai/designSpec.ts');
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const list = shortlistFor(
        'esports player card lower third with squad number and team',
        ${intent(['strap'], ['Player', 'Team', 'Squad number'])},
      );
      const digest = catalogDigest(list.variants);
      const ids = list.variants.map((v) => v.id);
      const others = (CATALOG['lower-third'] || []).map((v) => v.id).filter((id) => !ids.includes(id));
      return {
        allShown: ids.every((id) => digest.includes('- ' + id + ' "')),
        noneExtra: others.every((id) => !digest.includes('- ' + id + ' "')),
        // The palette / font / zone / easing footer must survive the narrowing: the spec
        // schema still references those enums.
        hasFooter: digest.includes('Palettes:') && digest.includes('Fonts:') && digest.includes('Easings:'),
      };
    })()`);
    const r = res as Record<string, boolean>;
    expect(r.allShown).toBe(true);
    expect(r.noneExtra).toBe(true);
    expect(r.hasFooter).toBe(true);
  });
});

test.describe('the chassis keeps the zone it was drawn for', () => {
  test('keepChassisZone ignores a spec zone; without it the spec still wins', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { specToTemplate } = await import('/src/ai/designSpec.ts');
      const { variantById } = await import('/src/templates/catalog.ts');
      const spec = {
        fit: 'catalog', reason: 'test', name: 'Zone Test', summary: 'test',
        category: 'lower-third', variantId: 'lt01', zone: 'top-right',
        lines: [{ title: 'Name', sample: 'Ada Lovelace' }],
      };
      const kept = specToTemplate(spec, undefined, { keepChassisZone: true });
      const moved = specToTemplate(spec);
      return {
        drawnFor: variantById('lt01').defaultZone,
        kept: kept.diversity.zone,
        moved: moved.diversity.zone,
      };
    })()`);
    const r = res as { drawnFor: string; kept: string; moved: string };
    // Measured over 89 lower thirds: the rendered side agrees with the declared zone on 89 of
    // 89 (docs/ADAPT_FIRST_PLAN.md §1.1), so the harness assembles at the design's own zone.
    expect(r.kept).toBe(r.drawnFor);
    // Lite deliberately does not opt in yet (§6.2) - if this stops being true, that decision
    // was changed without the re-baseline it needs.
    expect(r.moved).toBe('top-right');
  });

  test('the size clamp matches what the schema tells the model', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { specToTemplate } = await import('/src/ai/designSpec.ts');
      const base = {
        fit: 'catalog', reason: 'test', name: 'Scale Test', summary: 'test',
        category: 'lower-third', variantId: 'lt01',
        lines: [{ title: 'Name', sample: 'Ada Lovelace' }],
      };
      const read = (tpl) => {
        const m = tpl.css.match(/--scale:\\s*([\\d.]+)/);
        return m ? parseFloat(m[1]) : null;
      };
      return {
        huge: read(specToTemplate({ ...base, sizeScale: 3 }).template),
        max: read(specToTemplate({ ...base, sizeScale: 1.2 }).template),
        tiny: read(specToTemplate({ ...base, sizeScale: 0.1 }).template),
        min: read(specToTemplate({ ...base, sizeScale: 0.85 }).template),
      };
    })()`);
    const r = res as Record<string, number | null>;
    // Read something real first: two nulls compare equal, and the whole assertion below would
    // pass on a template that never declared --scale at all.
    expect(r.max).toBeGreaterThan(0);
    expect(r.min).toBeGreaterThan(0);
    expect(r.max).not.toBe(r.min);
    expect(r.huge).toBe(r.max);
    expect(r.tiny).toBe(r.min);
  });
});
