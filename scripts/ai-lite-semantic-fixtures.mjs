// Locked, provider-free semantic fixtures. Changing a brief or expected chassis changes the
// benchmark, so append a new fixture version instead of silently rewriting this bank.
export const LITE_SEMANTIC_FIXTURE_VERSION = 1;

const inference = (manual = false) => ({
  category: 'lower-third',
  confidence: manual ? 1 : 0.94,
  alternatives: [{ category: 'title', confidence: 0.18, reason: 'A title is possible only if the named person is removed.' }],
});

const ready = ({ variantId, fallbackVariantIds, intent, lines, styleIntent, manual = false }) => ({
  status: 'ready',
  aiCategory: 'lower-third',
  spec: {
    fit: 'catalog',
    reason: 'The measured chassis matches the requested role, field count, and design character.',
    name: 'Semantic fixture',
    summary: 'A category-correct adaptation of a proven lower-third chassis.',
    category: 'lower-third',
    variantId,
    fallbackVariantIds,
    categoryInference: inference(manual),
    styleIntent,
    intent: { kind: intent, primaryRole: lines[0].role, secondaryRole: lines[1]?.role },
    lines,
    typography: { headingWeight: 'bold', tracking: 'normal' },
    shape: { corner: 'sharp', accentForm: 'hairline', panel: 'solid' },
    flourish: '',
  },
});

const baseRequest = (prompt, fieldCount, manual = false) => ({
  prompt,
  generationSpec: {
    version: 1,
    category: manual ? 'lower-third' : 'auto',
    fields: Array.from({ length: fieldCount }, (_, index) => ({ label: `Field ${index + 1}`, kind: 'text' })),
  },
  resolution: { width: 1920, height: 1080 },
  fps: 50,
});

export const LITE_SEMANTIC_FIXTURES = [
  {
    id: 'history-lecturer', expectedReferences: ['ls17', 'lt32', 'lt37'],
    request: baseRequest('A heritage history lecture lower third for Dr Mira Shah, PhD, Senior Lecturer, Northbridge University. Quiet paper texture and editorial type.', 4),
    decision: ready({ variantId: 'ls17', fallbackVariantIds: ['lt37'], intent: 'person', lines: [
      { title: 'Name', sample: 'Dr Mira Shah', role: 'person-name' },
      { title: 'Post-nominals', sample: 'PhD', role: 'supporting-context' },
      { title: 'Position', sample: 'Senior Lecturer', role: 'person-role' },
      { title: 'Institution', sample: 'Northbridge University', role: 'organization' },
    ], styleIntent: { mood: 'restrained', era: 'heritage', energy: 'quiet', material: 'paper', paletteDirection: 'neutral-light', typographyCharacter: 'editorial-serif', shapeLanguage: 'ruled', texture: 'paper', motion: 'precise-draw' } }),
  },
  {
    id: 'fire-heat', expectedReferences: ['ls29', 'lt30', 'lt05'],
    request: baseRequest('A live public-news lower third from the wildfire heat zone: RED CANYON, Amina Cole, Climate Correspondent. Urgent, factual, high contrast.', 3),
    decision: ready({ variantId: 'ls29', fallbackVariantIds: ['lt30'], intent: 'person', lines: [
      { title: 'Location', sample: 'RED CANYON', role: 'location' }, { title: 'Name', sample: 'Amina Cole', role: 'person-name' }, { title: 'Role', sample: 'Climate Correspondent', role: 'person-role' },
    ], styleIntent: { mood: 'urgent', era: 'contemporary', energy: 'high', material: 'screen', paletteDirection: 'high-contrast', typographyCharacter: 'geometric', shapeLanguage: 'orthogonal', texture: 'clean', motion: 'technical-snap' } }),
  },
  {
    id: 'university', expectedReferences: ['lt02', 'ls17', 'lt49'],
    request: baseRequest('A calm accessible university lower third for Professor Elena Ruiz, Dean of Engineering. Minimal, humanist, generous and contemporary.', 2, true),
    decision: ready({ variantId: 'lt02', fallbackVariantIds: ['lt25'], intent: 'person', manual: true, lines: [
      { title: 'Name', sample: 'Professor Elena Ruiz', role: 'person-name' }, { title: 'Role', sample: 'Dean of Engineering', role: 'person-role' },
    ], styleIntent: { mood: 'restrained', era: 'contemporary', energy: 'measured', material: 'flat', paletteDirection: 'neutral-light', typographyCharacter: 'humanist', shapeLanguage: 'minimal', texture: 'clean', motion: 'precise-draw' } }),
  },
  {
    id: 'public-news', expectedReferences: ['lt30', 'ls29', 'lt25'],
    request: baseRequest('A four-field authoritative public-news credit for reporter Imani Okafor, Political Editor, Civic Desk, Westminster. Editorial rules, measured motion.', 4),
    decision: ready({ variantId: 'lt30', fallbackVariantIds: ['lt37'], intent: 'person', lines: [
      { title: 'Name', sample: 'Imani Okafor', role: 'person-name' }, { title: 'Role', sample: 'Political Editor', role: 'person-role' }, { title: 'Desk', sample: 'Civic Desk', role: 'organization' }, { title: 'Location', sample: 'Westminster', role: 'location' },
    ], styleIntent: { mood: 'authoritative', era: 'contemporary', energy: 'confident', material: 'paper', paletteDirection: 'brand-led', typographyCharacter: 'editorial-serif', shapeLanguage: 'ruled', texture: 'clean', motion: 'editorial-reveal' } }),
  },
  {
    id: 'documentary', expectedReferences: ['lt32', 'lt37', 'lt25'],
    request: baseRequest('A quiet cinematic documentary lower third for Nuru Bekele, Lake Tana archivist. Grain, restrained monochrome and a slow drift integrated with the shot.', 2),
    decision: ready({ variantId: 'lt37', fallbackVariantIds: ['lt32'], intent: 'person', lines: [
      { title: 'Name', sample: 'Nuru Bekele', role: 'person-name' }, { title: 'Role', sample: 'Lake Tana Archivist', role: 'person-role' },
    ], styleIntent: { mood: 'restrained', era: 'heritage', energy: 'quiet', material: 'light', paletteDirection: 'monochrome', typographyCharacter: 'cinematic', shapeLanguage: 'minimal', texture: 'grain', motion: 'cinematic-drift' } }),
  },
  {
    id: 'luxury', expectedReferences: ['lt25', 'lt37', 'lt32'],
    request: baseRequest('An ultra-luxury culture lower third for Ingrid Solberg, Creative Director. Couture restraint, heritage serif, paper texture and precise hairline reveal.', 2),
    decision: ready({ variantId: 'lt25', fallbackVariantIds: ['lt37'], intent: 'person', lines: [
      { title: 'Name', sample: 'Ingrid Solberg', role: 'person-name' }, { title: 'Role', sample: 'Creative Director', role: 'person-role' },
    ], styleIntent: { mood: 'luxurious', era: 'heritage', energy: 'measured', material: 'paper', paletteDirection: 'monochrome', typographyCharacter: 'editorial-serif', shapeLanguage: 'ruled', texture: 'paper', motion: 'precise-draw' } }),
  },
  {
    id: 'technology', expectedReferences: ['lt49', 'lt15', 'lt11'],
    request: baseRequest('A three-field technology conference lower third for Maya Chen, Systems Architect, Open Compute Lab. Cool frosted glass, geometric type and precise depth.', 3),
    decision: ready({ variantId: 'lt49', fallbackVariantIds: ['lt30'], intent: 'person', lines: [
      { title: 'Name', sample: 'Maya Chen', role: 'person-name' }, { title: 'Role', sample: 'Systems Architect', role: 'person-role' }, { title: 'Organization', sample: 'Open Compute Lab', role: 'organization' },
    ], styleIntent: { mood: 'technical', era: 'futurist', energy: 'measured', material: 'glass', paletteDirection: 'cool', typographyCharacter: 'geometric', shapeLanguage: 'layered', texture: 'frosted', motion: 'soft-depth' } }),
  },
  {
    id: 'esports', expectedReferences: ['lt41', 'ls12', 'lt05'],
    request: baseRequest('A high-energy esports player lower third for NOVA, Arctic Rift, Championship Final. Angled metal, condensed display type and a fast clean stinger.', 3),
    decision: ready({ variantId: 'lt41', fallbackVariantIds: ['ls12'], intent: 'person', lines: [
      { title: 'Player', sample: 'NOVA', role: 'person-name' }, { title: 'Team', sample: 'Arctic Rift', role: 'team-name' }, { title: 'Event', sample: 'Championship Final', role: 'event-name' },
    ], styleIntent: { mood: 'dramatic', era: 'futurist', energy: 'high', material: 'metal', paletteDirection: 'high-contrast', typographyCharacter: 'condensed', shapeLanguage: 'angled', texture: 'clean', motion: 'fast-stinger' } }),
  },
];
