// The NoaCG Lite benchmark suite definitions - frozen briefs, gold specs, the trivial
// floor, and the repair suite. Versioned: any change to a frozen brief, an expected label,
// a gold spec, or a repair expectation is a NEW suite version, never a silent rewrite
// (results recorded under different versions are not comparable).
//
// The CORE suite is visible and used during development. The hidden holdout lives in
// holdout.mjs and must never be used for prompt tuning or shown in development reports.

// v2: the contrast expectation changed from refusal to deterministic clamping
// (repair-contrast-clamped). Per docs/AI_LITE_BENCHMARK.md a changed expectation is a NEW
// suite version - results recorded under v1 are not comparable across that line.
export const LITE_BENCH_SUITE_ID = 'lite-spec-v2';

// ── The core suite (8 briefs, each with a labelled expected outcome) ─────────
//
// Briefs marked with a fixtureId reuse the exact prompt text from
// scripts/ai-lite-lower-third-fixtures.mjs so the paid eval runner and this suite can
// never drift apart on shared briefs. Expected decisions: Lite is lower-third-only, so
// off-category briefs are EXPECTED-UNSUPPORTED - a model (or the zero-cost pattern
// screen) forcing them into a lower third is the UNSUPPORTED_FORCED failure.
//
// `fields` are the labelled operator values - the gold and floor compilers use them, and
// category-accuracy scoring compares `expect` against the returned decision.

export const CORE_SUITE = [
  {
    id: 'core-news-reporter',
    fixtureId: 'news-reporter',
    brief: 'A restrained public-news lower third for reporter name Amina Okafor and role East Africa Correspondent. Dark editorial palette, clear hierarchy, calm entrance.',
    expect: {
      decision: 'ready',
      aiCategory: 'lower-third',
      intentKind: 'person',
      roles: ['person-name', 'person-role'],
    },
    fields: {
      primary: { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
      secondary: { title: 'Role', sample: 'East Africa Correspondent', role: 'person-role' },
    },
  },
  {
    id: 'core-esports-player',
    fixtureId: 'esports-player',
    brief: 'An energetic esports lower third for player nickname NOVA and team Arctic Rift. Sharp hierarchy, fast controlled entrance, excellent legibility.',
    expect: {
      decision: 'ready',
      aiCategory: 'lower-third',
      intentKind: 'person',
      roles: ['person-name', 'team-name'],
    },
    fields: {
      primary: { title: 'Player', sample: 'NOVA', role: 'person-name' },
      secondary: { title: 'Team', sample: 'Arctic Rift', role: 'team-name' },
    },
  },
  {
    id: 'core-university-speaker',
    fixtureId: 'university-speaker',
    brief: 'A university lecture lower third for speaker name Dr. Anika Ramanathan and academic role Professor of Environmental Engineering. Modern, credible, calm, and accessible.',
    expect: {
      decision: 'ready',
      aiCategory: 'lower-third',
      intentKind: 'person',
      roles: ['person-name', 'person-role'],
    },
    fields: {
      primary: { title: 'Speaker', sample: 'Dr. Anika Ramanathan', role: 'person-name' },
      secondary: { title: 'Role', sample: 'Professor of Environmental Engineering', role: 'person-role' },
    },
  },
  {
    id: 'core-house-direction',
    brief: 'A lower third in NoaCG’s own house style - dark control-room panel, one amber on-air accent, restrained glow - for presenter name Noa Lehti and role Broadcast Director. Confident and premium.',
    expect: {
      decision: 'ready',
      aiCategory: 'lower-third',
      intentKind: 'person',
      roles: ['person-name', 'person-role'],
      // The one brief with a chassis-level expectation: the house style IS lt11.
      variantId: 'lt11',
    },
    fields: {
      primary: { title: 'Name', sample: 'Noa Lehti', role: 'person-name' },
      secondary: { title: 'Role', sample: 'Broadcast Director', role: 'person-role' },
    },
  },
  {
    id: 'core-ambiguous-default',
    fixtureId: 'ambiguous-default',
    brief: 'Create a professional lower third for Taylor Morgan, Senior Producer. Choose a sensible broadcast style and make both fields immediately editable.',
    expect: {
      decision: 'ready',
      aiCategory: 'lower-third',
      intentKind: 'person',
      roles: ['person-name', 'person-role'],
    },
    fields: {
      primary: { title: 'Name', sample: 'Taylor Morgan', role: 'person-name' },
      secondary: { title: 'Role', sample: 'Senior Producer', role: 'person-role' },
    },
  },
  {
    id: 'core-title-card-longtext',
    brief: 'A full-screen title card that opens the programme with the long title Understanding the Baltic Sea: Currents, Climate and Coastal Communities, plus a presenter credit line.',
    expect: { decision: 'unsupported', unsupportedCode: 'unsupported-category' },
  },
  {
    id: 'core-info-card-multiline',
    brief: 'A multi-line information card listing tonight’s four panel guests with their roles, stacked under a heading.',
    expect: { decision: 'unsupported', unsupportedCode: 'unsupported-category' },
  },
  {
    id: 'core-video-request',
    brief: 'Generate a 20-second cinematic intro video with a 3D scene and camera moves for our esports show.',
    expect: { decision: 'unsupported', unsupportedCode: 'video-request' },
  },
];

// ── The Phase 0 spike selection ──────────────────────────────────────────────
//
// Six fixture-bank briefs spanning the supported space (three core genres + the three
// hardest text-stress fixtures), used by scripts/ai-lite-spike.mjs. From the frozen bank
// so spike results stay comparable with later screening runs.

export const SPIKE_FIXTURE_IDS = [
  'news-reporter',
  'esports-player',
  'university-speaker',
  'long-name',
  'multilingual',
  'story-headline',
];

// ── The SKIN spike selection ─────────────────────────────────────────────────
//
// The six skin-* briefs from the fixture bank (v2): distinctive visual styles no house
// chassis carries. Run with `npm run bench:spike -- --suite=skin` against a server
// started with AI_LITE_SKIN_ENABLED=1 - the spike runner refuses a paid skin run when
// the status endpoint reports the flag off, because a skin-disabled route would compile
// every brief to a house chassis and measure nothing the suite exists to measure.

export const SKIN_SPIKE_FIXTURE_IDS = [
  'skin-brutalist-poster',
  'skin-neon-synthwave',
  'skin-hand-crafted',
  'skin-luxury-runway',
  'skin-retro-festival',
  'skin-terminal-hud',
];

// ── Gold specs (the calibration CEILING) ─────────────────────────────────────
//
// Hand-written, deliberately good decisions for three core briefs, compiled through the
// production pipeline. If these do not review well, the CATALOG is the ceiling and no
// model choice will move it - that is the most valuable measurement in the system.
// Shapes must pass validateLiteDecision (pinned by scripts/ai-lite-bench.test.mjs).

export const GOLD_SPECS = [
  {
    briefId: 'core-news-reporter',
    decision: {
      status: 'ready',
      aiCategory: 'lower-third',
      spec: {
        fit: 'catalog',
        reason: 'Public-news reporter super: the editorial rule-led Masthead carries a calm, credible hierarchy.',
        name: 'Reporter strap',
        summary: 'Editorial masthead lower third with a confident name over a tracked role line.',
        category: 'lower-third',
        variantId: 'lt25',
        intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
        lines: [
          { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
          { title: 'Role', sample: 'East Africa Correspondent', role: 'person-role' },
        ],
        flourish: '',
      },
    },
  },
  {
    briefId: 'core-esports-player',
    decision: {
      status: 'ready',
      aiCategory: 'lower-third',
      spec: {
        fit: 'catalog',
        reason: 'High-energy esports player ident: the condensed Angle Slab carries fast controlled motion.',
        name: 'Player strap',
        summary: 'Bold forward-leaning sport slab with the nickname leading and the team beneath.',
        category: 'lower-third',
        variantId: 'lt05',
        intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'team-name' },
        lines: [
          { title: 'Player', sample: 'NOVA', role: 'person-name' },
          { title: 'Team', sample: 'Arctic Rift', role: 'team-name' },
        ],
        flourish: '',
      },
    },
  },
  {
    briefId: 'core-university-speaker',
    decision: {
      status: 'ready',
      aiCategory: 'lower-third',
      spec: {
        fit: 'catalog',
        reason: 'University lecture super: the panel-free Underline reads modern, credible, and calm.',
        name: 'Speaker strap',
        summary: 'Minimal underline lower third with generous whitespace and a long-title-capable role line.',
        category: 'lower-third',
        variantId: 'lt02',
        intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
        lines: [
          { title: 'Speaker', sample: 'Dr. Anika Ramanathan', role: 'person-name' },
          { title: 'Role', sample: 'Professor of Environmental Engineering', role: 'person-role' },
        ],
        flourish: '',
      },
    },
  },
];

// ── The trivial floor ────────────────────────────────────────────────────────
//
// A seeded-random valid chassis within the correct category, carrying the brief's
// labelled fields untouched. A model that does not clearly beat this on human review is
// contributing nothing beyond the catalog itself.

/** Deterministic PRNG (mulberry32) - benchmark runs must not depend on Math.random(). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the floor decision for a labelled core brief: a seeded-random chassis whose
 * intentKinds allow the brief's labelled intent. `catalog` is LITE_CATALOG (passed in -
 * this file stays importable without the TypeScript contract).
 */
export function floorDecision(brief, catalog, seed) {
  if (brief.expect.decision !== 'ready') return null;
  const eligible = catalog.filter((entry) => entry.intentKinds.includes(brief.expect.intentKind));
  if (!eligible.length) return null;
  const pick = eligible[Math.floor(seededRandom(seed)() * eligible.length)];
  const lines = [brief.fields.primary, ...(brief.fields.secondary ? [brief.fields.secondary] : [])];
  return {
    status: 'ready',
    aiCategory: pick.aiCategory,
    spec: {
      fit: 'catalog',
      reason: 'Trivial floor: random valid chassis in the correct category.',
      name: 'Floor',
      summary: 'Random valid chassis carrying the labelled fields.',
      category: pick.category,
      variantId: pick.variantId,
      intent: {
        kind: brief.expect.intentKind,
        primaryRole: lines[0].role,
        ...(lines[1] ? { secondaryRole: lines[1].role } : {}),
      },
      lines: lines.map(({ title, sample, role }) => ({ title, sample, role })),
      flourish: '',
    },
  };
}

// ── The repair suite (validator regression, zero model calls) ────────────────
//
// Malformed or semantically inconsistent decisions with the EXACT rule codes
// validateLiteDecision must emit. This pins the platform half of the repair loop: the
// server feeds these codes back to the model, so a code that stops firing (or fires
// wrongly) silently changes what every candidate is asked to repair.

const repairRequest = (prompt) => ({
  prompt,
  resolution: { width: 1920, height: 1080 },
  fps: 50,
});

const readyDecision = (spec) => ({ status: 'ready', aiCategory: 'lower-third', spec });

const baseSpec = () => ({
  fit: 'catalog',
  reason: 'r',
  name: 'n',
  summary: 's',
  category: 'lower-third',
  variantId: 'lt11',
  intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
  lines: [
    { title: 'Name', sample: 'Ada Example', role: 'person-name' },
    { title: 'Role', sample: 'Example Editor', role: 'person-role' },
  ],
  flourish: '',
});

export const REPAIR_SUITE = [
  {
    id: 'repair-unknown-variant',
    request: repairRequest('A lower third for Ada Example, Example Editor.'),
    decision: readyDecision({ ...baseSpec(), variantId: 'lt99' }),
    expectErrors: ['variant_not_allowed'],
  },
  {
    id: 'repair-category-variant-mismatch',
    request: repairRequest('A lower third for Ada Example, Example Editor.'),
    decision: readyDecision({ ...baseSpec(), category: 'info-card' }),
    expectErrors: ['category_variant_mismatch'],
  },
  {
    id: 'repair-line-count',
    request: repairRequest('A lower third for Ada Example, Example Editor.'),
    decision: readyDecision({
      ...baseSpec(),
      lines: [
        { title: 'Name', sample: 'Ada Example', role: 'person-name' },
        { title: 'Role', sample: 'Example Editor', role: 'person-role' },
        { title: 'Extra', sample: 'One line too many', role: 'supporting-context' },
      ],
    }),
    expectErrors: ['line_count_invalid'],
  },
  {
    id: 'repair-primary-role-mismatch',
    request: repairRequest('A lower third for Ada Example, Example Editor.'),
    decision: readyDecision({
      ...baseSpec(),
      lines: [
        { title: 'Role', sample: 'Example Editor', role: 'person-role' },
        { title: 'Name', sample: 'Ada Example', role: 'person-name' },
      ],
    }),
    expectErrors: [
      'primary_role_mismatch', 'secondary_role_mismatch',
      'slot_role_mismatch:primary', 'slot_role_mismatch:secondary',
    ],
  },
  {
    id: 'repair-intent-variant-mismatch',
    request: repairRequest('A promotional lower third with the call to action Subscribe now.'),
    decision: readyDecision({
      ...baseSpec(),
      // lt32 Scrim, not lt25: five of the six chassis serve `promotion` now, because declaring
      // it on only one turned every call-to-action brief into a forced answer and then a refusal
      // (benchmarks/lite/ROUND-2026-08-08-QUALITY.md §5.4). lt32 stays out on capacity - 28
      // characters on its supporting line against a call to action plus a URL - which is what
      // keeps this fixture able to exercise the check at all.
      variantId: 'lt32',
      intent: { kind: 'promotion', primaryRole: 'call-to-action' },
      lines: [{ title: 'Call to action', sample: 'Subscribe now', role: 'call-to-action' }],
    }),
    expectErrors: ['intent_variant_mismatch'],
  },
  {
    id: 'repair-extra-fields-forbidden',
    request: repairRequest('A lower third for Ada Example, Example Editor.'),
    decision: readyDecision({
      ...baseSpec(),
      extraFields: [{ title: 'Ticker', ftype: 'textfield', value: 'x' }],
    }),
    expectErrors: ['lower_third_extra_fields_forbidden'],
  },
  {
    id: 'repair-flourish-forbidden',
    request: repairRequest('A lower third for Ada Example, Example Editor.'),
    decision: readyDecision({ ...baseSpec(), flourish: 'particle shimmer' }),
    expectErrors: ['flourish_forbidden'],
  },
  {
    // Kept as a REGRESSION pin with no expected errors, the same way the palette case below is.
    // Every audited chassis declared `logo: false` until 2026-08-09, so asking for the logo slot
    // was always a refusal; all six carry a measured brand slot now
    // (benchmarks/lite/BRAND-AUDIT-2026-08-09.md), and the correct expectation is that this
    // validates. The `logo_not_supported` rule stays in validateLiteDecision - it guards the
    // next chassis audited in without a slot, and a rule deleted because today's bank cannot
    // reach it is the mistake `zone` and `animation.presetId` record in src/ai/AGENTS.md.
    // The invisible mark, as a fixture. lt11's logo surface follows the PALETTE, this request
    // supplies a dark panel, and the mark is transparent with dark ink - so the frame would show
    // a logo field, no rule codes, and nothing a viewer can see. That is exactly what the
    // 2026-08-09 brand round produced twice, and it is the reason the check is a measurement
    // rather than a prompt line: the teaching it replaces was literally satisfied by both frames.
    id: 'repair-logo-contrast-low',
    request: {
      ...repairRequest('A news lower third for Ada Example, Example Editor, carrying our logo.'),
      palette: { accent: '#3b7dd8', text: '#f2f5fa', textDim: '#b3bccb', panel: '#111722' },
      hasLogo: true,
      mark: { shape: 'wordmark', backing: 'transparent', ink: 'dark' },
    },
    decision: readyDecision({ ...baseSpec(), useLogoSlot: true }),
    // No expected errors, and that is the FINDING. Shipped as a refusal on 2026-08-09 this
    // exact decision produced `generation_failed` twice in a paid round - the repair round
    // could not save it, the same way the palette floor could not be repaired by the model.
    // It is applied now: the chassis is re-picked, or the mark is dropped and the graphic
    // still ships. A regression pin, beside the palette case that made the same move.
    expectErrors: [],
  },
  {
    id: 'repair-logo-not-supported',
    request: repairRequest('A lower third for Ada Example, Example Editor.'),
    decision: readyDecision({ ...baseSpec(), useLogoSlot: true }),
    expectErrors: [],
  },
  {
    // Kept as a REGRESSION pin with no expected errors: this palette used to be refused
    // (primary_text_contrast_low + secondary_text_contrast_low) and the repair round could
    // not save it, so a near-miss killed the generation. The floor is applied by clamping
    // now, so the correct expectation is that it validates - if this ever errors again,
    // the clamp regressed.
    id: 'repair-contrast-clamped',
    request: repairRequest('A lower third for Ada Example, Example Editor.'),
    decision: readyDecision({
      ...baseSpec(),
      palette: { accent: '#ffb000', text: '#777777', textDim: '#6a6a6a', panel: '#666666' },
    }),
    expectErrors: [],
  },
  {
    id: 'repair-requested-role-missing',
    request: repairRequest('A lower third for reporter name Ada Example and role Example Editor.'),
    decision: readyDecision({
      ...baseSpec(),
      intent: { kind: 'organization', primaryRole: 'organization', secondaryRole: 'supporting-context' },
      lines: [
        { title: 'Organization', sample: 'Example Newsroom', role: 'organization' },
        { title: 'Context', sample: 'Nightly briefing', role: 'supporting-context' },
      ],
    }),
    expectErrors: ['requested_role_missing:person-name', 'requested_role_missing:person-role'],
  },
  {
    id: 'repair-valid-unsupported-passes',
    request: repairRequest('A branching state machine with four parallel groups.'),
    decision: {
      status: 'unsupported',
      unsupportedCode: 'advanced-state-machine',
      message: 'Lite does not create advanced branching or parallel state machines.',
      suggestedBrief: 'Ask for one graphic with a simple entrance, hold, update, and exit.',
    },
    expectErrors: [],
  },
  {
    id: 'repair-valid-gold-passes',
    request: repairRequest('A lower third for Ada Example, Example Editor.'),
    decision: readyDecision(baseSpec()),
    expectErrors: [],
  },
];
