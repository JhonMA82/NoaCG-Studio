// Design-knowledge cards (docs/CREATIVE_MODE_PLAN.md §5) - how the CREATE path learns
// broadcast design WITHOUT being shown a finished catalog design to copy (the §4
// anti-anchoring rule, the F3 diagnosis).
//
// A card teaches ANATOMY and PRINCIPLES for one composition family: the hierarchy it reads
// in, its structure in StructuralIntent vocabulary, the numeric guardrails DESIGN_LANGUAGE
// already publishes, the motion grammar that suits it, its named failure modes, and where it
// does and does not fit. Never CSS values beyond the published ranges, never markup.
//
// Two rules from the measured lessons, both load-bearing:
//   - a card REPLACES generic language for its family rather than stacking on top of it (the
//     load-ceiling finding) - so at most two cards ever reach a prompt;
//   - cards are advisory taste input, never routing law: an intent that matches no card gets
//     none, and the family list must not become the second enum §6 exists to prevent.

import type { StructuralIntent } from '../../model/structuralIntent';

export interface KnowledgeCard {
  family: string;
  /** What the eye must take first, second, last. */
  hierarchy: string;
  /** The family's parts, in StructuralIntent vocabulary (parts, repeating, item parts). */
  anatomy: string;
  /** Numbers from docs/DESIGN_LANGUAGE.md - ranges, never one prescribed value. */
  guardrails: string;
  /** Which motion grammar suits it, and why. */
  motion: string;
  /** The named ways this family is got wrong. */
  failureModes: string;
  /** What it is for, and what it is NOT for. */
  fit: string;
  /** Words in a brief or an intent that select this card. */
  keywords: string[];
}

export const KNOWLEDGE_CARDS: KnowledgeCard[] = [
  {
    family: 'strap',
    hierarchy: 'Name first and biggest; role/affiliation second at roughly half its weight; any kicker (LIVE, a category) is read last and exists to classify, not to compete.',
    anatomy: 'One non-repeating identity part with two or three text parts stacked in one column, optionally an image part beside it. No lists.',
    guardrails: 'Name 44-64 px at 1080p, weight 600-800, line-height 1.05-1.15. Role 22-30 px, weight 400-500. Kicker 16-22 px, 600-700, caps with wide tracking. 4-10 px between name and role, 8-14 px to a kicker. Wrap cap around 800 px (~42% of frame).',
    motion: 'One entrance for the block, then the lines settling in reading order - a short stagger (60-120 ms) beats moving every line the same distance. Exits are faster than entrances.',
    failureModes: 'Role line so close in size to the name that neither leads; a panel wide enough for the longest imaginable name so every real name floats in a void; a kicker chip bigger than the information it labels; text that lands outside the safe area once a long name wraps.',
    fit: 'For identifying ONE person or thing while the picture continues. Not for comparison, not for lists, not for anything that needs to be read from across a room.',
    keywords: ['lower third', 'strap', 'name', 'guest', 'speaker', 'caption', 'astons', 'title bar'],
  },
  {
    family: 'tower',
    hierarchy: 'The rows are the content; the header exists to say what the columns mean. The live/leading row outranks everything, including the header.',
    anatomy: 'A repeating part (one row per item) whose item parts are a position, an identity, and one or two figures - bound to ONE list field, one item per line, never to numbered fields per row.',
    guardrails: 'Row text 24-34 px at 1080p; the type floor is 20 px and it is not negotiable. Keep column widths fixed so figures align vertically - a right-aligned numeric column is the whole point of a tower. 6-12 px row rhythm.',
    motion: 'Rows cascade in order, 40-80 ms apart, never all at once and never row-by-row slowly enough to read as a loading screen. The measured-motion rule applies: a cascade whose length depends on the data is a builder, not a keyframe.',
    failureModes: 'Proportional figures that jitter between rows; a row count the design assumed (five) meeting the data it got (eleven); highlighting the live row by colour alone so it disappears on a monochrome feed; long identities pushing the figures off their column.',
    fit: 'For ORDERED, comparable rows - timing, standings, leaderboards. Not for two things (that is a split) and not for one (that is a strap or a card).',
    keywords: ['tower', 'timing', 'standings', 'leaderboard', 'ranking', 'table', 'rows', 'list', 'order'],
  },
  {
    family: 'board',
    hierarchy: 'The title says what this board IS; the rows carry equal weight among themselves; the footer/status is read only when the viewer wants it.',
    anatomy: 'A titled container with one repeating part of equal items - the item parts are usually a label and a value, sometimes a time and a label.',
    guardrails: 'Labels 24-32 px, values may match or exceed them where the value is the news. Column gutters at least the cap height. Never more than ~8 rows on a full frame at broadcast reading distance.',
    motion: 'The container arrives first and the rows fill it - the reverse (rows arriving into nothing) reads as a mistake.',
    failureModes: 'A board that is a table with the grid drawn in (rules everywhere); rows that reflow when one value gets longer; no visual difference between a heading row and a data row.',
    fit: 'For a SET of peer items shown together - a schedule, results, key numbers. Not for a progression (that is a bracket) and not for a duel (that is a split).',
    keywords: ['board', 'schedule', 'results', 'fixtures', 'agenda', 'key numbers', 'panel'],
  },
  {
    family: 'split',
    hierarchy: 'Both sides are equal by construction and the eye must feel the confrontation before it reads either name. The versus mark, the time, or the round line is the third element and it belongs on the axis, not in a corner.',
    anatomy: 'Two (or N) mirrored parts of identical structure - identity, optional image, optional figures - plus one shared centre part. Equal weight is a structural promise: if one side reads as the host and the other as the visitor, the composition has already failed.',
    guardrails: 'Names 40-64 px; identical sizes both sides, never "the home team is bigger". Centre mark 1.2-2x the name size when it is a graphic device, or hairline-quiet when the names should carry the moment. Keep both sides inside the horizontal safe area with the longest plausible names.',
    motion: 'The two sides arrive from their own edges and MEET; the centre mark lands last, on the beat. Symmetric timing - a side that arrives late looks like a losing side.',
    failureModes: 'Asymmetry introduced by content (a crest on one side, a placeholder on the other); a centre mark so large it eats both names; three-way and five-way briefs squeezed into a two-side layout; long names shrinking on one side only.',
    fit: 'For a CONFRONTATION - a match-up, a debate, a head-to-head comparison. Works for three or five sides only if the mirror becomes a radial or an even row; it is not a list.',
    keywords: ['versus', 'vs', 'match-up', 'matchup', 'head to head', 'duel', 'face-off', 'split', 'debate'],
  },
  {
    family: 'bracket',
    hierarchy: 'The SHAPE is read before any name: a viewer must see the tournament narrowing. Then the live tie, then the names, then the scores.',
    anatomy: 'A repeating part per round, each containing a repeating part per tie, each tie containing two competitor parts. Round count and tie count both come from the DATA - one list field, one line per tie - never from a fixed layout.',
    guardrails: 'Competitor text 22-30 px; every round column the same width; the vertical gap between ties doubles each round, which is what makes the tree read as a tree. Connector lines 2-3 px, never heavier than the type.',
    motion: 'Round by round, left to right, in the order the tournament happened - which is also how advancement reads. The champion arrives last and alone.',
    failureModes: 'A tree that shows rounds but not who advanced; ties that reflow when one name is long; a 4-team bracket drawn with 8-team spacing (all air, no shape); silently rendering a double-elimination brief as a single tree - the honest answer is to say the structure is outside scope.',
    fit: 'For single-elimination progression at 4 or 8 competitors. Not for round-robin, not for a losers bracket, not for a league.',
    keywords: ['bracket', 'playoff', 'knockout', 'elimination', 'tournament', 'tree', 'semifinal', 'quarterfinal'],
  },
  {
    family: 'card',
    hierarchy: 'A headline, a body, and a footer - and the card only works if the headline could stand alone on air for two seconds and still mean something.',
    anatomy: 'One container, two to four non-repeating text parts, optionally one image part. If it needs a list, it is a board.',
    guardrails: 'Headline 44-64 px, body 22-30 px with line-height 1.2-1.35, at most ~3 body lines before it stops being a card. Measure 600-800 px.',
    motion: 'One arrival for the whole card, with the headline leading by a beat. Full-frame cards may hold longer and exit faster.',
    failureModes: 'A body long enough to be a document; a headline that is really a kicker; decoration in the corners that survives no crop.',
    fit: 'For ONE statement the viewer should take away. Not for comparison, not for data.',
    keywords: ['card', 'title card', 'topic', 'statement', 'quote', 'notice', 'announcement'],
  },
  {
    family: 'ring',
    hierarchy: 'The FIGURE is the graphic; the ring is its adverb. Whatever the ring is drawn around must be readable with the ring removed.',
    anatomy: 'One value part plus one drawn progress part, optionally a label and a target. The drawn part is measured motion, not a keyframe.',
    guardrails: 'Figure 56-96 px; stroke 8-16 px at 1080p; the arc starts at 12 o\'clock and runs clockwise or it reads as a clock face going backwards.',
    motion: 'The arc grows to its own measured value and the figure counts with it - the two must land together or the number looks wrong.',
    failureModes: 'Feeding a raw total to a percentage ring (3% raised drawn as a full circle); an arc so thin it disappears on a compressed feed; a ring around a figure whose units are never stated.',
    fit: 'For ONE proportion - a share of the vote, a goal, a countdown. Not for several proportions (that is a board of bars).',
    keywords: ['ring', 'meter', 'gauge', 'percent', 'progress', 'goal', 'donut', 'dial'],
  },
  {
    family: 'full-frame',
    hierarchy: 'The frame is yours, which is why restraint is the discipline: one dominant element, one supporting group, and a lot of deliberate emptiness.',
    anatomy: 'A background treatment plus two or three placed groups. Nothing here repeats unless the graphic is really a board wearing a full-frame coat.',
    guardrails: 'Keep everything inside a 5% safe inset; dominant type 64-120 px; do not centre everything by default - an off-centre axis with generous air reads more designed than symmetry does.',
    motion: 'One slow, confident entrance; full frames are on air longer, so the motion can afford to settle. Never bounce a full frame.',
    failureModes: 'Filling the frame because it is there; a background gradient doing the work of a composition; text at the exact centre of a 16:9 frame with no other axis.',
    fit: 'For a moment that owns the screen - a reveal, an opener, a result. Not for anything shown over live pictures.',
    keywords: ['full frame', 'fullscreen', 'opener', 'reveal', 'winner', 'title sequence', 'cover'],
  },
  {
    family: 'strip',
    hierarchy: 'A strip is read in passing, so ONE thing may be legible at a time: the current item. Everything else is context.',
    anatomy: 'One repeating part travelling or rotating through a fixed window, bound to one list field, plus a fixed label part.',
    guardrails: 'Item text 24-32 px; travel is linear and continuous (ease: none is the only correct easing here) or a hard rotation; a strip that neither travels nor rotates is a static notice and belongs in another family.',
    motion: 'Measured motion by definition - the distance is the content width, which no keyframe can hold. One item per beat, and the beat must be slower than reading speed.',
    failureModes: 'A marquee that snaps back to the start instead of looping seamlessly; items so short the strip looks empty; a strip and a strap on air at once fighting for the same edge.',
    fit: 'For a continuing sequence of short items along one edge. Not for anything the viewer must act on.',
    keywords: ['ticker', 'strip', 'crawl', 'marquee', 'headlines', 'scroller', 'rotator'],
  },
];

const cardByFamily = new Map(KNOWLEDGE_CARDS.map((c) => [c.family, c]));

/** A card's text as it reaches a prompt. Deliberately compact: two cards must cost less than
 *  the generic language they replace (the load-ceiling finding). */
export function cardText(card: KnowledgeCard): string {
  return `### The ${card.family} family
- Hierarchy: ${card.hierarchy}
- Anatomy: ${card.anatomy}
- Numbers (at 1080p): ${card.guardrails}
- Motion: ${card.motion}
- How it is got wrong: ${card.failureModes}
- Fits: ${card.fit}`;
}

/**
 * Select 0-2 cards for an intent, DETERMINISTICALLY (plan §5) - keyword-anchored, which is
 * the video harness's measured lesson about reference cards, not a similarity score.
 * Matching nothing returns nothing: a hybrid or genuinely novel structure is better served
 * by no card than by the nearest wrong one.
 */
export function cardsForIntent(intent: StructuralIntent, brief = ''): KnowledgeCard[] {
  const hay = [
    brief,
    intent.summary,
    intent.novelDescription ?? '',
    intent.typeId ?? '',
    ...(intent.families ?? []),
    ...intent.parts.map((p) => `${p.id} ${p.role}`),
  ].join(' ').toLowerCase();

  const scored = KNOWLEDGE_CARDS.map((card) => {
    // A declared family or type name is a direct hit and outranks loose keyword matches.
    const declared = (intent.families ?? []).some((f) => f.toLowerCase().includes(card.family)) ? 3 : 0;
    const hits = card.keywords.filter((k) => hay.includes(k)).length;
    return { card, score: declared + hits };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.card.family.localeCompare(b.card.family));

  return scored.slice(0, 2).map((s) => s.card);
}

/** The cards a chosen concept's family selects, for the stages that run AFTER the pick. */
export function cardsForFamily(family: string): KnowledgeCard[] {
  const direct = cardByFamily.get(family.toLowerCase());
  if (direct) return [direct];
  const loose = KNOWLEDGE_CARDS.find((c) => family.toLowerCase().includes(c.family));
  return loose ? [loose] : [];
}
