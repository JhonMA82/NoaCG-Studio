// Deterministic normalization of an imported-graphic analysis (plan §6.2): clamp
// normalized coordinates, drop low-confidence regions, convert 0..1 boxes into DESIGN px
// against the artwork, snap weights into the suggested font's real range, and shape each
// text region into a DesignFieldSpec-ready proposal. NO model output reaches the draft
// unclamped - the schema bounds the shape, this bounds the meaning.

import { FONTS } from '../../model/fonts';
import type { DesignArt } from '../../model/wizard';
import type {
  ImportAnalysisRegion,
  ImportedGraphicAnalysisV1,
} from './contract';

/** Below this the region is noise, not a proposal (plan: a confidence floor). */
const CONFIDENCE_FLOOR = 0.35;

export interface FieldProposal {
  /** Draft-local id, minted here so checkbox state and applied specs share identity. */
  id: string;
  title: string;
  text: string;
  x: number;
  y: number;
  kind: 'area';
  width: number;
  fontId: string | null;
  fontSize: number;
  weight: number | null;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number | null;
  letterSpacing: number | null;
  confidence: number;
}

export interface AnalysisProposal {
  graphicType: ImportedGraphicAnalysisV1['graphicType'];
  graphicTypeConfidence: number;
  fields: FieldProposal[];
  animation: {
    presetId: 'design-fade' | 'design-slide' | 'design-pop' | 'design-blur';
    direction: 'both' | 'in' | 'out';
    speed: 0.75 | 1 | 1.5;
  } | null;
  warnings: string[];
  /** Honest accounting of what was NOT proposed. */
  skipped: { lowConfidence: number; nonText: number };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const ROLE_TITLES: Record<string, string> = {
  'person-name': 'Name',
  'person-role': 'Role',
  organization: 'Organization',
  'team-name': 'Team',
  'story-headline': 'Headline',
  'event-name': 'Event',
  location: 'Location',
  score: 'Score',
  time: 'Time',
  'supporting-context': 'Context',
};

function proposalTitle(region: ImportAnalysisRegion, index: number): string {
  const suggested = region.suggestedTitle?.trim();
  if (suggested) return suggested.slice(0, 80);
  if (region.role && ROLE_TITLES[region.role]) return ROLE_TITLES[region.role];
  return `Text ${index + 1}`;
}

/** Snap a claimed weight into the suggested font's REAL variable range; null when the
 *  design's default font decides (no suggestion carried). */
function snappedWeight(fontId: string | null, approxWeight: number | undefined): number | null {
  if (approxWeight === undefined) return null;
  const font = fontId ? FONTS.find((candidate) => candidate.id === fontId) : null;
  if (!font) return Math.min(900, Math.max(300, Math.round(approxWeight / 100) * 100));
  return Math.min(font.weights[1], Math.max(font.weights[0], Math.round(approxWeight / 100) * 100));
}

export function normalizeAnalysis(
  analysis: ImportedGraphicAnalysisV1,
  art: DesignArt,
  mintId: () => string,
): AnalysisProposal {
  const fields: FieldProposal[] = [];
  let lowConfidence = 0;
  let nonText = 0;

  for (const region of analysis.regions) {
    if (region.confidence < CONFIDENCE_FLOOR) {
      lowConfidence += 1;
      continue;
    }
    if (region.kind !== 'text') {
      nonText += 1;
      continue;
    }
    // Clamp the box into the frame BEFORE converting, so a slightly-out-of-frame claim
    // becomes an edge field rather than an off-canvas one.
    const bx = clamp01(region.bbox.x);
    const by = clamp01(region.bbox.y);
    const bw = Math.min(clamp01(region.bbox.w), 1 - bx);
    const bh = Math.min(clamp01(region.bbox.h), 1 - by);
    if (bw <= 0.005 || bh <= 0.005) {
      lowConfidence += 1;
      continue;
    }
    const boxX = bx * art.width;
    const boxY = by * art.height;
    const boxW = bw * art.width;
    const boxH = bh * art.height;
    const title = proposalTitle(region, fields.length);

    // The bundled-font pick is already enum-locked by the schema; re-validate anyway so
    // a contract drift degrades to "design default font", never to a broken family.
    const fontId = region.typography?.suggestedFontId
      && FONTS.some((candidate) => candidate.id === region.typography?.suggestedFontId)
      ? region.typography.suggestedFontId
      : null;

    // Size from the model's cap-height claim when it made one (cap/0.72 = font size,
    // the erase-seed rule), else from the box height; both capped so a block-shaped
    // region can never seed type its own slot must shrink (the erase-seed bound).
    const capBased = region.typography?.fontSizeNorm
      ? (region.typography.fontSizeNorm * art.height) / 0.72
      : boxH * 0.72;
    const widthFit = boxW / (0.55 * Math.max(4, title.length));
    const fontSize = Math.max(10, Math.min(Math.round(capBased), Math.round(widthFit), Math.round(art.height * 0.5)));

    const align = region.align ?? 'left';
    const anchorX = align === 'center' ? boxX + boxW / 2 : align === 'right' ? boxX + boxW : boxX;
    const letterSpacing = region.typography?.letterSpacing === 'tight'
      ? -Math.max(0.25, Math.round(fontSize * 0.015 * 4) / 4)
      : region.typography?.letterSpacing === 'wide'
        ? Math.max(0.5, Math.round(fontSize * 0.06 * 4) / 4)
        : null;

    fields.push({
      id: mintId(),
      title,
      text: (region.sampleText?.trim() || title).slice(0, 200),
      x: Math.round(anchorX),
      y: Math.round(boxY),
      kind: 'area',
      // The slot is the room the text had, plus the side-bearing margin the erase seeds
      // learned the hard way - a slot a hair narrower than its own text shrinks on arrival.
      width: Math.max(64, Math.round(boxW + fontSize * 0.12)),
      fontId,
      fontSize,
      weight: snappedWeight(fontId, region.typography?.approxWeight),
      color: region.typography?.color && /^#[0-9a-fA-F]{6}$/.test(region.typography.color)
        ? region.typography.color
        : '#ffffff',
      align,
      lineHeight: region.typography?.lineHeightRatio
        ? Math.min(3, Math.max(0.7, region.typography.lineHeightRatio))
        : null,
      letterSpacing,
      confidence: clamp01(region.confidence),
    });
  }

  return {
    graphicType: analysis.graphicType,
    graphicTypeConfidence: clamp01(analysis.graphicTypeConfidence),
    fields,
    animation: analysis.animation
      ? {
          presetId: analysis.animation.presetId,
          direction: analysis.animation.direction,
          speed: analysis.animation.speed ?? 1,
        }
      : null,
    warnings: analysis.warnings.slice(0, 8),
    skipped: { lowConfidence, nonText },
  };
}
