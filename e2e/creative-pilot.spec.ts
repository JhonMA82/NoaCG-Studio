// Creative Mode phase C (docs/CREATIVE_MODE_PLAN.md §3.2, §8, §10): the pilot's FREE half -
// the deterministic compile, the style gate, the concept-diversity measure, the knowledge-card
// selection, and the anti-anchoring rule. No tokens: every model-bound stage is exercised
// through its normalizer, never through a call.
//
// The house pattern applies throughout: every positive assertion has its mutation twin, so a
// gate that stops gating fails here rather than passing vacuously.

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const open = async (page: Page) => {
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
};

/** A repeating-structure brief: the case the scaffold hypothesis is least obviously good at
 *  (plan §3.3's known risk), so it is the one the free coverage compiles. */
const BRACKET_INTENT = {
  kind: 'type',
  typeId: 'bracket',
  confidence: 'high',
  summary: 'An eight-team knockout bracket.',
  parts: [
    { id: 'header', role: 'title' },
    { id: 'rounds', role: 'tie', repeating: true, itemParts: ['round', 'home', 'away', 'score'] },
    { id: 'champion', role: 'winner' },
  ],
  fields: [
    { key: 'title', role: 'line', label: 'Tournament', sample: 'Summer Cup' },
    { key: 'ties', role: 'list', label: 'Ties', sample: '' },
    { key: 'champion', role: 'line', label: 'Champion', sample: 'TBD' },
  ],
  states: [{ id: 'crowned', trigger: 'operator' }],
  originalityRequested: true,
};

const BRACKET_SPEC = {
  conceptId: 'c1',
  name: 'Summer Cup Bracket',
  summary: 'An eight-team knockout tree with the champion revealed last.',
  layout: { family: 'bracket', arrangement: 'stack', fullFrame: true, zone: 'mid-center', sizeScale: 1 },
  regions: [
    { id: 'header', role: 'title', emphasis: 'secondary', fieldKeys: ['title'] },
    { id: 'rounds', role: 'tie', emphasis: 'primary', repeating: true, itemParts: ['round', 'home', 'away', 'score'] },
    { id: 'champion', role: 'winner', emphasis: 'primary', fieldKeys: ['champion'] },
  ],
  palette: { accent: '#f6a623', text: '#ffffff', textDim: '#b7bcc4', panel: 'rgba(10,12,16,0.86)' },
  fontId: 'inter',
  motion: { entranceOrder: ['header', 'rounds'], character: 'rise', seconds: 0.9 },
  states: [{ id: 'crowned', trigger: 'operator', revealRegions: ['champion'] }],
  designNote: 'The tree must read as a tree before any name is read.',
};

/** A minimal but genuinely VALID emit for the coder arms: the house contracts (a -box
 *  element, the definition block, the runtime entry points, a readable data block) and
 *  nothing else. The arms' grounding and the real validator run against this, so it has to
 *  pass on its own merits - a fixture the validator waves through would prove nothing. */
const SLATE = {
  name: 'Test Slate',
  type: 'info-card',
  summary: 'A minimal test slate.',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Test Slate</title>
  <script src="js/gsap.min.js"></script>
  <link rel="stylesheet" href="css/template.css" />
  <script src="js/template.js"></script>
  <script>window.SPXGCTemplateDefinition = {
    "description": "Test Slate",
    "playserver": "OVERLAY", "playchannel": "1", "playlayer": "7",
    "webplayout": "7", "out": "manual", "dataformat": "json",
    "DataFields": [ { "field": "f0", "ftype": "textfield", "title": "Name", "value": "Hello AI" } ]
  };</script>
</head>
<body>
  <div class="slate">
    <div class="slate-box"><span id="f0">Hello AI</span></div>
  </div>
</body>
</html>`,
  css: `:root { --accent: #e8c547; --text-color: #ffffff; --text-dim: rgba(255,255,255,0.7); --panel-bg: rgba(12,14,18,0.92); --font-heading: sans-serif; --scale: 1; }
.slate { position: absolute; left: 80px; bottom: 80px; opacity: 0; }
.slate-box { color: var(--text-color); background: var(--panel-bg); padding: calc(20px * var(--scale)); width: fit-content; max-width: calc(900px * var(--scale)); overflow-wrap: break-word; }`,
  js: `function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) { var el = document.getElementById(key); if (el) el.textContent = fields[key]; }
}
/* == ANIMATION (generated — the timeline edits the data block below) == */
var NOACG_ANIM = {
  "version": 1,
  "root": ".slate",
  "speed": 1,
  "steps": [
    { "name": "In", "duration": 0.5, "ease": "power2.out", "layers": { ".slate": { "opacity": [ { "time": 0, "value": 0 }, { "time": 0.5, "value": 1 } ] } } },
    { "name": "Out", "duration": 0.3, "ease": "power2.in", "layers": { ".slate": { "opacity": [ { "time": 0.3, "value": 0 } ] } } }
  ]
};
function buildInTimeline() { var tl = gsap.timeline(); tl.to('.slate', { opacity: 1, duration: 0.5, ease: 'power2.out' }); return tl; }
function buildOutTimeline() { var tl = gsap.timeline(); tl.to('.slate', { opacity: 0, duration: 0.3, ease: 'power2.in' }); return tl; }
/* == END ANIMATION == */
function play() { gsap.killTweensOf('*'); buildInTimeline(); }
function stop() { gsap.killTweensOf('*'); buildOutTimeline(); }
function next() {}`,
};

test.describe('creative pilot (phase C)', () => {
  test('the scaffold compiles a valid template, and its animation targets really exist', async ({ page }) => {
    await open(page);
    const report = await page.evaluate(async ({ intent, spec }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { normalizeCreativeSpec } = await import('/src/ai/creative/contracts.ts');
      const { compileScaffoldOnly } = await import('/src/ai/creative/pipeline.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const i = normalizeIntent(intent);
      const { scaffold, validation } = compileScaffoldOnly(normalizeCreativeSpec(spec, i), i);
      const anim = parseAnimData(scaffold.template.js);
      const targets = [...new Set((anim?.steps ?? []).flatMap((s) => Object.keys(s.layers)))];
      return {
        errors: validation.errors.map((e) => `${e.rule}: ${e.message}`),
        warnings: validation.warnings.map((w) => w.rule),
        fieldCount: scaffold.template.fields.length,
        textareas: scaffold.template.fields.filter((f) => f.ftype === 'textarea').length,
        steps: anim?.steps.map((s) => s.name) ?? [],
        declaredSteps: scaffold.template.settings.steps,
        // Every animated selector must resolve in the markup, or the timeline addresses air.
        unresolved: targets.filter((sel) => !scaffold.template.html.includes(sel.replace('.', 'class="')) && !scaffold.template.html.includes(sel.slice(1))),
        regionIds: scaffold.regions.map((r) => r.id),
      };
    }, { intent: BRACKET_INTENT, spec: BRACKET_SPEC });

    expect(report.errors).toEqual([]);
    expect(report.unresolved).toEqual([]);
    // The repeating region rides ONE textarea - the house list convention, not eight fields.
    expect(report.textareas).toBe(1);
    expect(report.fieldCount).toBe(3);
    // The declared state is a real middle step, and SPX's steps count is derived from it.
    expect(report.steps).toEqual(['In', 'crowned', 'Out']);
    expect(report.declaredSteps).toBe('2');
    expect(report.regionIds).toEqual(['header', 'rounds', 'champion']);
  });

  test('a state without resolvable revealRegions still compiles to a real step', async ({ page }) => {
    await open(page);
    // The first smoke run's dominant defect: the spec schema does not force revealRegions,
    // cheap models declare states without them, and the compile silently dropped every such
    // state - 12/15 completed staged results lost their operator states and the structural
    // check flagged each one (benchmarks/creative/v1/SMOKE-2026-07-31.md, blocker 3). A
    // declared state now clamps to a degraded-but-present emphasis step. The twin above
    // (revealRegions present) pins that real reveals still compile as reveals.
    const report = await page.evaluate(async ({ intent, spec }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { normalizeCreativeSpec } = await import('/src/ai/creative/contracts.ts');
      const { compileScaffoldOnly } = await import('/src/ai/creative/pipeline.ts');
      const { structuralIntentStaticFindings } = await import('/src/validation/structuralIntentCheck.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const i = normalizeIntent(intent);
      const bare = {
        ...(spec as Record<string, unknown>),
        states: [
          { id: 'crowned', trigger: 'operator' }, // no revealRegions at all
          { id: 'lock-in', trigger: 'operator', revealRegions: ['no-such-region'] }, // unresolvable
        ],
      };
      const { scaffold, validation } = compileScaffoldOnly(normalizeCreativeSpec(bare, i), i);
      const anim = parseAnimData(scaffold.template.js);
      return {
        errors: validation.errors.map((e) => e.rule),
        steps: anim?.steps.map((s) => s.name) ?? [],
        stateFindings: structuralIntentStaticFindings(scaffold.template, i)
          .filter((f) => f.message.includes('state')).length,
      };
    }, { intent: BRACKET_INTENT, spec: BRACKET_SPEC });

    expect(report.errors).toEqual([]);
    // Both states survive as middle steps, so the operator can fire them with Continue.
    expect(report.steps).toEqual(['In', 'crowned', 'lock-in', 'Out']);
    // And the brief-satisfaction check agrees the declared states exist.
    expect(report.stateFindings).toBe(0);
  });

  test('a second repeating region demotes to plain - one rows container, one DOM id', async ({ page }) => {
    await open(page);
    // Repeating data rides ONE textarea (the house list convention), and the scaffold's
    // rows container has a fixed id. The bracket smoke compiled a spec with TWO repeating
    // regions into duplicate `creative-rows` ids - the list runtime fed the first and the
    // second stayed empty forever (SMOKE-2026-07-31.md item 6). Normalization now keeps
    // the FIRST repeating region and demotes the rest.
    const report = await page.evaluate(async ({ intent, spec }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { normalizeCreativeSpec } = await import('/src/ai/creative/contracts.ts');
      const { compileScaffoldOnly } = await import('/src/ai/creative/pipeline.ts');
      const i = normalizeIntent(intent);
      const doubled = {
        ...(spec as Record<string, unknown>),
        regions: [
          { id: 'header', role: 'title', emphasis: 'secondary', fieldKeys: ['title'] },
          { id: 'rounds', role: 'tie', emphasis: 'primary', repeating: true, itemParts: ['round', 'home', 'away'] },
          { id: 'ties', role: 'match', emphasis: 'primary', repeating: true, itemParts: ['home', 'away'] },
        ],
      };
      const normalized = normalizeCreativeSpec(doubled, i);
      const { scaffold, validation } = compileScaffoldOnly(normalized, i);
      const single = normalizeCreativeSpec(spec, i); // the mutation twin: one repeating region
      return {
        errors: validation.errors.map((e) => e.rule),
        repeatingIds: normalized.regions.filter((g) => g.repeating).map((g) => g.id),
        rowsContainers: (scaffold.template.html.match(/id="creative-rows"/g) ?? []).length,
        demotedStillPresent: normalized.regions.some((g) => g.id === 'ties'),
        twinRepeating: single.regions.filter((g) => g.repeating).map((g) => g.id),
      };
    }, { intent: BRACKET_INTENT, spec: BRACKET_SPEC });

    expect(report.errors).toEqual([]);
    expect(report.repeatingIds).toEqual(['rounds']); // first wins, second demoted
    expect(report.rowsContainers).toBe(1); // exactly one rows container, one DOM id
    expect(report.demotedStillPresent).toBe(true); // demoted, never dropped
    expect(report.twinRepeating).toEqual(['rounds']); // the twin: a single flag survives
  });

  test('a patch cannot hide scaffold structure beyond the animation\'s reach', async ({ page }) => {
    await open(page);
    test.setTimeout(60_000);
    // The versus/lower-third smoke's dominant staged failure: models re-implement the
    // lifecycle as CSS state classes and set `visibility: hidden` / `display: none` on
    // scaffold elements - nothing writes those inline, so the compiled entrance (inline
    // opacity/transform) can never reveal them and the bench reports bench-entrance +
    // bench-replay (SMOKE-2026-07-31-vs-lt.md item 6). The gate now strips the two poison
    // declarations from scaffold selectors; stylesheet opacity stays (the entrance
    // overrides it inline), and a patch's own un-prefixed classes keep their hides.
    const report = await page.evaluate(async ({ intent, spec }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { normalizeCreativeSpec } = await import('/src/ai/creative/contracts.ts');
      const { compileScaffoldOnly } = await import('/src/ai/creative/pipeline.ts');
      const { applyCreativeStyle } = await import('/src/ai/creative/style.ts');
      const { productionSpxValidator } = await import('/src/ai/litePipeline.ts');
      const i = normalizeIntent(intent);
      const { scaffold } = compileScaffoldOnly(normalizeCreativeSpec(spec, i), i);
      const poisoned = applyCreativeStyle(scaffold, {
        summary: 'poison',
        css: [
          '.creative-box { visibility: hidden; display: none; opacity: 0; background: var(--panel-bg); }',
          '.creative-r-rounds .creative-cell-1 { opacity: 0; color: var(--text-color); }',
          '.my-flourish { display: none; opacity: 0; }',
          '@media (min-width: 1920px) { .creative-region { visibility: hidden; padding: calc(8px * var(--scale)); } }',
        ].join('\n'),
      });
      if (!poisoned) return { applied: false };
      const marker = poisoned.css.indexOf('AI-authored');
      const patchCss = poisoned.css.slice(marker);
      // The full production gate over the poisoned-styled template: with the hides
      // stripped, the entrance must reveal it and the replay must bring it back.
      const verdict = await productionSpxValidator()(poisoned);
      return {
        applied: true,
        boxHidden: /creative-box[^}]*visibility\s*:\s*hidden/.test(patchCss) || /creative-box[^}]*display\s*:\s*none/.test(patchCss),
        boxOpacityKept: /creative-box[^}]*opacity\s*:\s*0/.test(patchCss),
        cellOpacityStripped: !/creative-cell-1[^}]*opacity\s*:\s*0/.test(patchCss),
        cellColorKept: /creative-cell-1[^}]*color/.test(patchCss),
        mediaHidden: /creative-region[^}]*visibility\s*:\s*hidden/.test(patchCss),
        mediaPaddingKept: /creative-region[^}]*padding/.test(patchCss),
        ownClassKept: /my-flourish[^}]*display\s*:\s*none[^}]*opacity\s*:\s*0/.test(patchCss),
        benchRules: verdict.errors.map((e) => e.rule),
      };
    }, { intent: BRACKET_INTENT, spec: BRACKET_SPEC });

    expect(report.applied).toBe(true);
    expect(report.boxHidden).toBe(false); // visibility/display stripped from the box…
    expect(report.boxOpacityKept).toBe(true); // …while opacity stays on an ANIMATED element
    expect(report.cellOpacityStripped).toBe(true); // opacity 0 on a never-animated cell goes
    expect(report.cellColorKept).toBe(true); // …and only that declaration goes
    expect(report.mediaHidden).toBe(false); // stripped inside @media too
    expect(report.mediaPaddingKept).toBe(true);
    expect(report.ownClassKept).toBe(true); // the patch's own class keeps everything
    // The end-to-end proof: the poisoned patch no longer produces the smoke's signature.
    expect(report.benchRules).not.toContain('bench-entrance');
    expect(report.benchRules).not.toContain('bench-replay');
  });

  test('a CSS transition on scaffold elements cannot steal the entrance from the timeline', async ({ page }) => {
    await open(page);
    test.setTimeout(60_000);
    // The SECOND cause of one signature, measured on the first candidate-pass brief
    // (2026-07-31): this is the real arm-D patch. Nothing here is hidden - the box and both
    // regions simply carry `transition: opacity/transform`, so every inline value GSAP
    // writes re-animates on the browser's own clock, and the bench reports the same
    // bench-entrance + bench-replay pair the hiding declarations used to produce.
    const report = await page.evaluate(async ({ intent, spec }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { normalizeCreativeSpec } = await import('/src/ai/creative/contracts.ts');
      const { compileScaffoldOnly } = await import('/src/ai/creative/pipeline.ts');
      const { applyCreativeStyle } = await import('/src/ai/creative/style.ts');
      const { productionSpxValidator } = await import('/src/ai/litePipeline.ts');
      const i = normalizeIntent(intent);
      const { scaffold } = compileScaffoldOnly(normalizeCreativeSpec(spec, i), i);
      const styled = applyCreativeStyle(scaffold, {
        summary: 'transitions',
        css: [
          '.creative-box { display: flex; opacity: 0; transform: translateY(10px);',
          '  transition: opacity 0.3s ease, transform 0.3s ease; }',
          '.creative-r-header { opacity: 0; transition-property: opacity; transition-duration: 0.4s; }',
          '.my-flourish { transition: opacity 0.3s ease; }',
        ].join('\n'),
      });
      if (!styled) return { applied: false };
      const patchCss = styled.css.slice(styled.css.indexOf('AI-authored'));
      const verdict = await productionSpxValidator()(styled);
      return {
        applied: true,
        boxTransition: /creative-box[^}]*transition/.test(patchCss),
        regionTransition: /creative-r-header[^}]*transition/.test(patchCss),
        boxLayoutKept: /creative-box[^}]*display\s*:\s*flex/.test(patchCss),
        boxTransformKept: /creative-box[^}]*transform\s*:\s*translateY/.test(patchCss),
        ownClassKept: /my-flourish[^}]*transition/.test(patchCss),
        benchRules: verdict.errors.map((e) => e.rule),
      };
    }, { intent: BRACKET_INTENT, spec: BRACKET_SPEC });

    expect(report.applied).toBe(true);
    expect(report.boxTransition).toBe(false);      // stripped from the box…
    expect(report.regionTransition).toBe(false);   // …and from a region, longhands included
    expect(report.boxLayoutKept).toBe(true);       // only that declaration goes
    expect(report.boxTransformKept).toBe(true);    // the resting pose is the design's own
    expect(report.ownClassKept).toBe(true);        // a patch-invented class keeps everything
    // The end-to-end proof, the same shape as the hiding-declarations pin.
    expect(report.benchRules).not.toContain('bench-entrance');
    expect(report.benchRules).not.toContain('bench-replay');
  });

  test('an OVERLAY may not paint an opaque full frame; a full-frame board may', async ({ page }) => {
    await open(page);
    test.setTimeout(60_000);
    // The owner ruling of 2026-07-31 (SMOKE-2026-07-31.md item 5, -vs-lt.md item 4), pinned
    // against the CSS that actually caused it: this is the real patch from the archived
    // bracket round - the design shadows --panel-bg to #000000 on the root (legal, :root is
    // untouched) and makes the box 100vw x 100vh painted with it, so a "valid" overlay
    // floods the frame opaque black. Every gate passed it because none measured coverage.
    const FLOOD = [
      '.creative { --panel-bg: #000000; --accent: #00aaff; }',
      '.creative-box { display: grid; height: 100vh; width: 100vw; position: relative;',
      '  background-color: var(--panel-bg); padding: calc(24px * var(--scale)); }',
      // Legal neighbours that must survive untouched: an opaque panel at content size, a
      // full-bleed element that paints nothing, and a gradient scrim that fades out.
      '.creative-r-header { background: var(--panel-bg); padding: calc(12px * var(--scale)); }',
      '.creative-guide { position: absolute; inset: 0; pointer-events: none; }',
      '.creative-scrim { position: absolute; inset: 0; background: linear-gradient(#000000, transparent); }',
    ].join('\n');
    const STRAP_SPEC = {
      ...BRACKET_SPEC,
      name: 'Name strap',
      layout: { family: 'strap', arrangement: 'stack', fullFrame: false, zone: 'bottom-left', sizeScale: 1 },
    };

    const report = await page.evaluate(async ({ intent, overlaySpec, boardSpec, css }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { normalizeCreativeSpec } = await import('/src/ai/creative/contracts.ts');
      const { compileScaffoldOnly } = await import('/src/ai/creative/pipeline.ts');
      const { applyCreativeStyle } = await import('/src/ai/creative/style.ts');
      const i = normalizeIntent(intent);
      const styled = (spec: unknown) => {
        const { scaffold } = compileScaffoldOnly(normalizeCreativeSpec(spec, i), i);
        const out = applyCreativeStyle(scaffold, { summary: 'flood', css });
        return out ? out.css.slice(out.css.indexOf('AI-authored')) : null;
      };
      return { overlay: styled(overlaySpec), board: styled(boardSpec) };
    }, { intent: BRACKET_INTENT, overlaySpec: STRAP_SPEC, boardSpec: BRACKET_SPEC, css: FLOOD });

    const overlay = report.overlay ?? '';
    const board = report.board ?? '';
    expect(overlay).not.toBe('');
    // The overlay: the FILL is stripped and the PAINT is kept. Which half survives is the
    // whole point - dropping the paint would leave an invisible full-frame box with the
    // content sprayed across the canvas, which is a broken graphic rather than a clamped one.
    expect(/creative-box[^}]*height\s*:\s*100vh/.test(overlay)).toBe(false);
    expect(/creative-box[^}]*width\s*:\s*100vw/.test(overlay)).toBe(false);
    expect(/creative-box[^}]*background-color\s*:\s*var\(--panel-bg\)/.test(overlay)).toBe(true);
    expect(/creative-box[^}]*display\s*:\s*grid/.test(overlay)).toBe(true); // the composition survives
    // Only the COMBINATION is touched: ordinary design is not.
    expect(/creative-r-header[^}]*background\s*:\s*var\(--panel-bg\)/.test(overlay)).toBe(true);
    expect(/creative-guide[^}]*inset\s*:\s*0/.test(overlay)).toBe(true);   // fills, paints nothing
    expect(/creative-scrim[^}]*inset\s*:\s*0/.test(overlay)).toBe(true);   // fills, fades to transparent
    // The mutation twin: the SAME css under a full-frame spec keeps everything. A board that
    // covers the canvas is the job, and is measured (scripts/creative-plate-visibility.mjs)
    // rather than refused.
    expect(/creative-box[^}]*height\s*:\s*100vh/.test(board)).toBe(true);
    expect(/creative-box[^}]*width\s*:\s*100vw/.test(board)).toBe(true);
  });

  test('the critique repair lands when it is no worse than the base, never when it is worse', async ({ page }) => {
    await open(page);
    // Owner ruling 2026-07-31 (SMOKE blocker 4). The old rule was `validation.ok`, so a
    // repair could not land on an already-invalid base - which is where 4 of 7 (round 1) and
    // most (round 2) of the bases actually were, and why criterion 8 was unmeasurable at
    // 1/20 landed. The property that must survive is "never break one", not "only perfect".
    const verdict = await page.evaluate(async () => {
      const { noWorseThan } = await import('/src/ai/creative/pipeline.ts');
      const result = (rules: string[]) => ({
        ok: rules.length === 0,
        errors: rules.map((rule) => ({ rule, message: rule, severity: 'error' as const })),
        warnings: [],
      });
      const base = result(['bench-contrast', 'bench-overflow']);
      return {
        cleanAlwaysLands: noWorseThan(base, result([])),
        sameFailuresLand: noWorseThan(base, result(['bench-contrast', 'bench-overflow'])),
        fewerFailuresLand: noWorseThan(base, result(['bench-contrast'])),
        newRuleRefused: noWorseThan(base, result(['bench-contrast', 'bench-entrance'])),
        moreOfTheSameRefused: noWorseThan(base, result(['bench-contrast', 'bench-contrast', 'bench-overflow'])),
        // No base to compare against: only a clean result may land.
        noBaseInvalidRefused: noWorseThan(null, result(['bench-contrast'])),
        noBaseCleanLands: noWorseThan(null, result([])),
      };
    });

    expect(verdict.cleanAlwaysLands).toBe(true);
    expect(verdict.sameFailuresLand).toBe(true);      // the new behaviour: measurable at last
    expect(verdict.fewerFailuresLand).toBe(true);
    expect(verdict.newRuleRefused).toBe(false);       // a NEW failure kind is damage
    expect(verdict.moreOfTheSameRefused).toBe(false); // …and so is more of the old one
    expect(verdict.noBaseInvalidRefused).toBe(false);
    expect(verdict.noBaseCleanLands).toBe(true);
  });

  test('the scaffold is airworthy on its own - it is the floor when a style patch is refused', async ({ page }) => {
    await open(page);
    test.setTimeout(60_000);
    const bench = await page.evaluate(async ({ intent, spec }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { normalizeCreativeSpec } = await import('/src/ai/creative/contracts.ts');
      const { compileScaffoldOnly } = await import('/src/ai/creative/pipeline.ts');
      const { productionSpxValidator } = await import('/src/ai/litePipeline.ts');
      const i = normalizeIntent(intent);
      const { scaffold } = compileScaffoldOnly(normalizeCreativeSpec(spec, i), i);
      // The SAME validator the arms inject: static validation + the live runtime bench +
      // the safety screen. A scaffold that cannot pass it is not a floor, it is a hole.
      const verdict = await productionSpxValidator()(scaffold.template);
      return { errors: verdict.errors.map((e) => `${e.rule}: ${e.message}`) };
    }, { intent: BRACKET_INTENT, spec: BRACKET_SPEC });

    expect(bench.errors).toEqual([]);
  });

  test('the compiled scaffold satisfies the structural check it will be measured by', async ({ page }) => {
    await open(page);
    test.setTimeout(60_000);
    // Stage 6 exists to make stage 8 pass by construction (plan §3.4). If a fresh scaffold
    // cannot satisfy its own intent, no amount of styling will.
    const findings = await page.evaluate(async ({ intent, spec }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { normalizeCreativeSpec } = await import('/src/ai/creative/contracts.ts');
      const { compileScaffoldOnly } = await import('/src/ai/creative/pipeline.ts');
      const { benchStructuralIntent } = await import('/src/validation/structuralIntentCheck.ts');
      const i = normalizeIntent(intent);
      const { scaffold } = compileScaffoldOnly(normalizeCreativeSpec(spec, i), i);
      const own = await benchStructuralIntent(scaffold.template, i);
      // The mutation twin: the SAME scaffold against an intent demanding a part it does not
      // carry must still report - a check that passes everything proves nothing.
      const harder = await benchStructuralIntent(
        scaffold.template,
        normalizeIntent({ ...intent, fields: Array.from({ length: 9 }, (_, n) => ({ key: `k${n}`, role: 'line', label: `L${n}` })) }),
      );
      return { own: own.map((f) => f.message), harder: harder.length };
    }, { intent: BRACKET_INTENT, spec: BRACKET_SPEC });

    expect(findings.own).toEqual([]);
    expect(findings.harder).toBeGreaterThan(0);
  });

  test('the style gate: a legal patch lands, and every wall refuses its own violation', async ({ page }) => {
    await open(page);
    const gate = await page.evaluate(async ({ intent, spec }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { normalizeCreativeSpec } = await import('/src/ai/creative/contracts.ts');
      const { compileScaffold } = await import('/src/ai/creative/scaffold.ts');
      const { applyCreativeStyle } = await import('/src/ai/creative/style.ts');
      const i = normalizeIntent(intent);
      const scaffold = compileScaffold(normalizeCreativeSpec(spec, i), i);
      const legal = { summary: 'x', css: '.creative-box { display: grid; gap: calc(20px * var(--scale)); }' };
      const landed = applyCreativeStyle(scaffold, legal);
      const headerInner = /data-region="header"[^>]*>([\s\S]*?)<\/div>\s*<!--/.exec(scaffold.template.html);
      return {
        legal: Boolean(landed),
        cssLanded: landed?.css.includes('display: grid') ?? false,
        // The scaffold CSS is kept and the patch appended - the design wins by cascade, it
        // does not replace the contracts above it.
        keptScaffoldCss: landed?.css.includes(':root') ?? false,
        rootRedeclared: applyCreativeStyle(scaffold, { summary: 'x', css: ':root { --accent: red; }' }) === null,
        fontFace: applyCreativeStyle(scaffold, { summary: 'x', css: '@font-face { font-family: x; }' }) === null,
        markupInCss: applyCreativeStyle(scaffold, { summary: 'x', css: '.a{} <script>alert(1)</script>' }) === null,
        remoteUrl: applyCreativeStyle(scaffold, { summary: 'x', css: '.a { background: url("https://x/y.png"); }' }) === null,
        emptyCss: applyCreativeStyle(scaffold, { summary: 'x', css: '   ' }) === null,
        unknownRegion: applyCreativeStyle(scaffold, {
          summary: 'x', css: '.a{color:red}', regions: [{ id: 'nope', html: '<b>x</b>' }],
        }) === null,
        droppedFieldId: applyCreativeStyle(scaffold, {
          summary: 'x', css: '.a{color:red}', regions: [{ id: 'header', html: '<div>gone</div>' }],
        }) === null,
        droppedRows: applyCreativeStyle(scaffold, {
          summary: 'x', css: '.a{color:red}', regions: [{ id: 'rounds', html: '<div class="x"></div>' }],
        }) === null,
        scriptInRegion: applyCreativeStyle(scaffold, {
          summary: 'x', css: '.a{color:red}', regions: [{ id: 'header', html: '<span id="f0"></span><script>x()</script>' }],
        }) === null,
        // …and the twin of the two region walls: a re-composition that KEEPS the contracts is
        // accepted, which is where the composition freedom actually lives.
        legalRegion: applyCreativeStyle(scaffold, {
          summary: 'x',
          css: '.a{color:red}',
          regions: [{ id: 'header', html: '<div class="creative-frame"><div class="creative-mask"><span id="f0">t</span></div></div>' }],
        }) !== null,
        headerHadField: (headerInner?.[1] ?? '').includes('id="f0"'),
      };
    }, { intent: BRACKET_INTENT, spec: BRACKET_SPEC });

    expect(gate.legal).toBe(true);
    expect(gate.cssLanded).toBe(true);
    expect(gate.keptScaffoldCss).toBe(true);
    expect(gate.legalRegion).toBe(true);
    expect(gate.headerHadField).toBe(true); // the dropped-id twin is testing a real id
    expect({
      rootRedeclared: gate.rootRedeclared,
      fontFace: gate.fontFace,
      markupInCss: gate.markupInCss,
      remoteUrl: gate.remoteUrl,
      emptyCss: gate.emptyCss,
      unknownRegion: gate.unknownRegion,
      droppedFieldId: gate.droppedFieldId,
      droppedRows: gate.droppedRows,
      scriptInRegion: gate.scriptInRegion,
    }).toEqual({
      rootRedeclared: true, fontFace: true, markupInCss: true, remoteUrl: true, emptyCss: true,
      unknownRegion: true, droppedFieldId: true, droppedRows: true, scriptInRegion: true,
    });
  });

  test('a normalized spec never loses a required part, however off-shape the emit', async ({ page }) => {
    await open(page);
    const report = await page.evaluate(async ({ intent }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { normalizeCreativeSpec } = await import('/src/ai/creative/contracts.ts');
      const i = normalizeIntent(intent);
      // The emit said nothing usable at all - the platform still has to compile something
      // that carries the brief, because the verify stage measures the BRIEF, not the emit.
      const empty = normalizeCreativeSpec({}, i);
      const garbage = normalizeCreativeSpec(
        { layout: { zone: 'nowhere', sizeScale: 99 }, palette: { accent: 'chartreuse' }, motion: { seconds: 40, character: 'explode' }, regions: 'nope' },
        i,
      );
      return {
        emptyRegions: empty.regions.map((r) => r.id),
        emptyRepeats: empty.regions.filter((r) => r.repeating).map((r) => r.id),
        zone: garbage.layout.zone,
        sizeScale: garbage.layout.sizeScale,
        accent: garbage.palette.accent,
        seconds: garbage.motion.seconds,
        character: garbage.motion.character,
        entranceOrder: garbage.motion.entranceOrder,
      };
    }, { intent: BRACKET_INTENT });

    expect(report.emptyRegions).toEqual(['header', 'rounds', 'champion']);
    expect(report.emptyRepeats).toEqual(['rounds']); // the intent's repeating part stays repeating
    expect(report.zone).toBe('bottom-left'); // no placement on the intent -> the honest default
    expect(report.sizeScale).toBe(1.2);
    expect(report.accent).toBe('#ffb020'); // a colour word is not a colour value
    expect(report.seconds).toBe(2);
    expect(report.character).toBe('rise');
    expect(report.entranceOrder).toEqual(['header', 'rounds', 'champion']);
  });

  test('concept diversity is measured on composition AND reading order, not on colour', async ({ page }) => {
    await open(page);
    const counts = await page.evaluate(async () => {
      const { normalizeConcepts, distinctConceptCount } = await import('/src/ai/creative/contracts.ts');
      const base = { name: 'a', compositionFamily: 'split', hierarchyOrder: ['x', 'y'], paletteCharacter: 'p', motionCharacter: 'm', rationale: 'r' };
      const reskins = normalizeConcepts({ concepts: [
        base,
        { ...base, name: 'b', paletteCharacter: 'different', motionCharacter: 'different' },
        { ...base, name: 'c', paletteCharacter: 'other' },
      ] });
      const real = normalizeConcepts({ concepts: [
        base,
        { ...base, name: 'b', compositionFamily: 'tower', hierarchyOrder: ['y', 'x'] },
        { ...base, name: 'c', compositionFamily: 'board', hierarchyOrder: ['y'] },
      ] });
      // Half-different: a new family but the SAME reading order does not count.
      const half = normalizeConcepts({ concepts: [
        base,
        { ...base, name: 'b', compositionFamily: 'tower' },
        { ...base, name: 'c', compositionFamily: 'board' },
      ] });
      return { reskins: distinctConceptCount(reskins), real: distinctConceptCount(real), half: distinctConceptCount(half), ids: real.map((c) => c.id) };
    });

    expect(counts.reskins).toBe(0);
    expect(counts.real).toBe(3);
    expect(counts.half).toBe(0);
    expect(counts.ids).toEqual(['c1', 'c2', 'c3']); // the platform assigns the ids, not the emit
  });

  test('knowledge cards are keyword-anchored, capped at two, and honestly absent', async ({ page }) => {
    await open(page);
    const picks = await page.evaluate(async () => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { cardsForIntent, cardsForFamily } = await import('/src/ai/creative/knowledgeCards.ts');
      const intent = (over: Record<string, unknown>) => normalizeIntent({
        kind: 'novel', novelDescription: '', confidence: 'high', summary: '',
        parts: [], fields: [], originalityRequested: false, ...over,
      });
      return {
        bracket: cardsForIntent(intent({ kind: 'type', typeId: 'bracket', summary: 'a knockout bracket' })).map((c) => c.family),
        strap: cardsForIntent(intent({ summary: 'a lower third naming the guest' })).map((c) => c.family),
        // A genuinely novel structure gets NO card rather than the nearest wrong one.
        novel: cardsForIntent(intent({ novelDescription: 'a rotating polyhedron of sentiment' })).map((c) => c.family),
        capped: cardsForIntent(intent({ summary: 'a bracket tower board split card ring ticker strip' })).length,
        byFamily: cardsForFamily('split').map((c) => c.family),
        unknownFamily: cardsForFamily('quantum').length,
      };
    });

    expect(picks.bracket).toEqual(['bracket']);
    expect(picks.strap).toEqual(['strap']);
    expect(picks.novel).toEqual([]);
    expect(picks.capped).toBe(2);
    expect(picks.byFamily).toEqual(['split']);
    expect(picks.unknownFamily).toBe(0);
  });

  test('arms C and D run end to end against a stubbed gateway - stages, gate, verify, critique repair', async ({ page }) => {
    await open(page);
    test.setTimeout(90_000);
    // Every model call is answered locally, so the whole staged pipeline is exercised for
    // free: the wiring between the stages is what breaks silently, and a paid run is a bad
    // place to discover it.
    const calls: string[] = [];
    const CONCEPTS = {
      concepts: [
        { name: 'Ledger', compositionFamily: 'bracket', hierarchyOrder: ['rounds', 'header', 'champion'], paletteCharacter: 'ink on paper', motionCharacter: 'settling', rationale: 'The tree is the story.' },
        { name: 'Floodlit', compositionFamily: 'board', hierarchyOrder: ['header', 'rounds'], paletteCharacter: 'stadium dark', motionCharacter: 'snap', rationale: 'Arena energy.' },
        { name: 'Column', compositionFamily: 'tower', hierarchyOrder: ['champion', 'rounds'], paletteCharacter: 'mono', motionCharacter: 'cascade', rationale: 'Progression as a list.' },
      ],
    };
    const STYLE = { summary: 'ink on paper', css: '.creative-box { display: grid; gap: calc(24px * var(--scale)); }\n.creative-row { border-bottom: calc(2px * var(--scale)) solid var(--accent); }' };
    const REPAIRED = { summary: 'fixed', css: '.creative-box { display: grid; gap: calc(28px * var(--scale)); }\n.creative-champion-fix { color: var(--accent); }' };
    let critiqueRound = 0;

    await page.route('**/api/ai/generate', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as { request?: { structuredOutput?: { name?: string } } };
      const tool = body.request?.structuredOutput?.name ?? '';
      calls.push(tool);
      const answer = (output: unknown) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ output, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }, provider: 'openrouter', model: 'stub', attempts: [] }),
      });
      if (tool === 'emit_concept_directions') return answer(CONCEPTS);
      if (tool === 'emit_creative_spec') return answer(BRACKET_SPEC);
      if (tool === 'emit_frame_critique') {
        critiqueRound += 1;
        return answer({ airworthy: false, findings: [{ question: 'Is the composition balanced?', problem: 'The champion sits in a hole.', severity: 'weak' }] });
      }
      if (tool === 'emit_creative_style') return answer(critiqueRound ? REPAIRED : STYLE);
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'x', message: 'unexpected stage' } }) });
    });

    const runs = await page.evaluate(async ({ intent }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { runCreativeArm } = await import('/src/ai/creative/pipeline.ts');
      const { productionSpxValidator } = await import('/src/ai/litePipeline.ts');
      const { benchStructuralIntent } = await import('/src/validation/structuralIntentCheck.ts');
      const i = normalizeIntent(intent);
      const input = {
        brief: 'An eight-team knockout bracket for a summer cup.',
        intent: i,
        context: { images: [], palette: null, resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 25 },
        validate: productionSpxValidator(),
        structuralCheck: benchStructuralIntent,
      };
      const pick = (r: Awaited<ReturnType<typeof runCreativeArm>>) => ({
        ok: r.ok,
        error: r.error ?? null,
        styleApplied: r.styleApplied,
        structural: r.structural.map((f) => f.message),
        concepts: r.concepts.length,
        specName: r.spec?.name ?? null,
        stages: r.stages.map((s) => s.stage),
        css: r.template?.css ?? '',
        critiqueFindings: r.critique?.findings.length ?? null,
        critiqueRepairApplied: r.critiqueRepairApplied ?? null,
      });
      const c = pick(await runCreativeArm('C', input));
      const d = pick(await runCreativeArm('D', {
        ...input,
        // A 1x1 PNG stands in for the rig's real screenshot: the critique's plumbing is what
        // this proves, and the vision model is stubbed anyway.
        capture: async () => 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      }));
      return { c, d };
    }, { intent: BRACKET_INTENT });

    // Arm C: three stages, the style patch through the gate, a valid and complete result.
    expect(runs.c.error).toBeNull();
    expect(runs.c.stages).toEqual(['concepts', 'creative-spec', 'scaffold', 'style']);
    expect(runs.c.concepts).toBe(3);
    expect(runs.c.specName).toBe('Summer Cup Bracket');
    expect(runs.c.styleApplied).toBe(true);
    expect(runs.c.css).toContain('.creative-row { border-bottom');
    expect(runs.c.ok).toBe(true);
    expect(runs.c.structural).toEqual([]);

    // Arm D: the critique ran, found something, and its ONE focused repair replaced the
    // design rather than stacking a second one on top of it.
    expect(runs.d.stages).toContain('critique');
    expect(runs.d.stages).toContain('critique-repair');
    expect(runs.d.critiqueFindings).toBe(1);
    expect(runs.d.critiqueRepairApplied).toBe(true);
    expect(runs.d.css).toContain('creative-champion-fix');
    expect(runs.d.css).not.toContain('.creative-row { border-bottom'); // the first patch is gone
    expect(calls.filter((c) => c === 'emit_frame_critique')).toHaveLength(1);
  });

  test('arms A and B run end to end against a stubbed gateway - control wiring, de-anchored coder, its repair round', async ({ page }) => {
    await open(page);
    test.setTimeout(120_000);
    // The two CODER arms. Arm B is the one with genuinely new glue (neutral example ->
    // repairLoop -> convertEmittedRegion -> the structural check), and its failure during a
    // paid run would waste the run - so it is exercised here, for free, including a repair
    // round. Arm A is the frozen control: what is proven is the WIRING, never its behaviour.
    let emitMode: 'fail-then-fix' | 'good' = 'fail-then-fix';
    let templateCalls = 0;
    const systems: string[] = [];
    const tools: string[] = [];

    await page.route('**/api/ai/generate', async (route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        request?: { system?: string; structuredOutput?: { name?: string } };
      };
      const tool = body.request?.structuredOutput?.name ?? '';
      tools.push(tool);
      const answer = (output: unknown) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ output, usage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 }, provider: 'openrouter', model: 'stub', attempts: [] }),
      });
      if (tool === 'emit_structural_intent') {
        return answer({
          kind: 'type', typeId: 'bracket', confidence: 'high', summary: 'A playoff bracket.',
          parts: [{ id: 'tree', role: 'bracket' }], fields: [], originalityRequested: false, beyondScope: false,
        });
      }
      if (tool === 'emit_design_spec') {
        return answer({
          fit: 'custom', reason: 'No catalog family carries this structure.',
          name: 'Test Slate', summary: 'A minimal test slate.', category: 'info-card',
          lines: [{ title: 'Name', sample: 'Hello AI' }],
        });
      }
      if (tool === 'emit_template') {
        systems.push(body.request?.system ?? '');
        templateCalls += 1;
        // Round 1 of the fail-then-fix mode has no update() - a deterministic 'runtime'
        // error, so the repair round is driven by the real validator, not by a stub flag.
        const broken = emitMode === 'fail-then-fix' && templateCalls === 1;
        return answer({ ...SLATE, js: broken ? 'var nothing = true;' : SLATE.js });
      }
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'x', message: 'unexpected stage' } }) });
    });

    const runArm = async (arm: 'A' | 'B') => page.evaluate(async ({ intent, arm }) => {
      const { normalizeIntent } = await import('/src/ai/structuralIntent.ts');
      const { runCreativeArm } = await import('/src/ai/creative/pipeline.ts');
      const { productionSpxValidator } = await import('/src/ai/litePipeline.ts');
      const { benchStructuralIntent } = await import('/src/validation/structuralIntentCheck.ts');
      const r = await runCreativeArm(arm as 'A' | 'B', {
        brief: 'A four-team playoff bracket.',
        intent: normalizeIntent(intent),
        context: { images: [], palette: null, resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 25 },
        validate: productionSpxValidator(),
        structuralCheck: benchStructuralIntent,
      });
      return {
        ok: r.ok,
        error: r.error ?? null,
        repairRounds: r.repairRounds,
        stages: r.stages.map((s) => s.stage),
        tokens: r.stages.reduce((sum, s) => sum + (s.usage?.outputTokens ?? 0), 0),
        // The emit is GROUNDED on the way in, not passed through: the data block survives
        // and the definition is parsed back into real fields.
        fieldCount: r.template?.fields.length ?? 0,
        hasAnimData: (r.template?.js ?? '').includes('NOACG_ANIM'),
        structural: r.structural.length,
      };
    }, { intent: BRACKET_INTENT, arm });

    const b = await runArm('B');
    const bTemplateCalls = templateCalls;
    const bSystems = [...systems];

    emitMode = 'good';
    templateCalls = 0;
    const a = await runArm('A');

    // Arm B: the de-anchored coder emitted, failed the REAL validator, repaired once, and
    // the repaired result is what came back.
    expect(b.error).toBeNull();
    expect(bTemplateCalls).toBe(2);
    expect(b.repairRounds).toBe(1);
    expect(b.stages).toEqual(['coder', 'repair-1']);
    expect(b.ok).toBe(true);
    expect(b.fieldCount).toBe(1);
    expect(b.hasAnimData).toBe(true);
    // The structural check ran and DISAGREED: a one-field slate does not serve a bracket
    // brief, whatever the validator thinks of its code. That gap is the measurement the
    // whole pilot turns on (§11 criterion 2) - a machine-valid result that is not the
    // graphic that was asked for. Its twin is the arm-C test above, where a scaffold built
    // for this same intent reports zero.
    expect(b.structural).toBeGreaterThan(0);
    expect(b.tokens).toBeGreaterThan(0); // the cost ledger the §12 numbers come from
    // …and BOTH of its calls carried the neutral example, repair included - a repair round
    // that quietly re-anchored on the catalog would break the whole A-vs-B comparison.
    expect(bSystems).toHaveLength(2);
    expect(bSystems.every((s) => s.includes('graphic-box') && !s.includes('.lower-third-box {'))).toBe(true);

    // Arm A: the control's wiring - the provider's own stages are read back off the
    // telemetry ring, which is where §12's cost and latency for this arm come from.
    expect(a.error).toBeNull();
    expect(a.stages).toContain('intent');
    expect(a.stages).toContain('design-spec');
    expect(a.stages).toContain('coder');
    expect(a.ok).toBe(true);
    expect(tools.filter((t) => t === 'emit_structural_intent')).toHaveLength(1);
  });

  test('the anti-anchoring rule: the de-anchored arm studies a skeleton, the control a catalog design', async ({ page }) => {
    await open(page);
    const prompts = await page.evaluate(async () => {
      const { coderSystemPrompt } = await import('/src/ai/claudeProvider.ts');
      const { neutralSkeletonTemplate } = await import('/src/ai/creative/neutralSkeleton.ts');
      const { lt01 } = await import('/src/templates/lowerThirds/lt01.ts');
      const control = coderSystemPrompt(lt01.create());
      const deAnchored = coderSystemPrompt(neutralSkeletonTemplate());
      // A line of the catalog design's OWN stylesheet - the design decisions, not the word
      // "lower-third", which the contracts section names as an example prefix either way.
      const catalogCss = lt01.create().css.split('\n').find((l) => l.includes('.lower-third-box')) ?? 'lower-third-box';
      return {
        controlCarriesCatalog: control.includes(catalogCss),
        deAnchoredCarriesCatalog: deAnchored.includes(catalogCss),
        deAnchoredCarriesSkeleton: deAnchored.includes('graphic-box'),
        // The contracts half is IDENTICAL either way - that is what makes A-vs-B attributable
        // to the example rather than to two different prompts.
        sameContracts: control.replace(/[\s\S]*?## The SPX contract/, '').slice(0, 400)
          === deAnchored.replace(/[\s\S]*?## The SPX contract/, '').slice(0, 400),
      };
    });

    expect(prompts.controlCarriesCatalog).toBe(true);
    expect(prompts.deAnchoredCarriesCatalog).toBe(false);
    expect(prompts.deAnchoredCarriesSkeleton).toBe(true);
    expect(prompts.sameContracts).toBe(true);
  });
});
