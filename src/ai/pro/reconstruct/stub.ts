// The OFFLINE Pro pipeline - the stubProvider pattern (src/ai/AGENTS.md): with no AI
// configured, the flow still runs end to end on a deterministic locally-drawn concept and a
// fixed interpretation, which is what keeps the whole Pro UX e2e-testable without tokens.
// Nothing here reaches the network.

import type { SpxValidator } from '../../provider';
import type { Resolution } from '../../../model/types';
import type { PurposedImage } from '../../../model/imagePurpose';
import { uuid } from '../../../model/id';
import type { ProBrief, ProInterpretationV1 } from '../contract';
import { normalizeProInterpretation } from './normalize';
import { compileProPlan, validateProCompile } from './compile';
import { fillProLogoSlot } from './logoAsset';
import type { ProConcept, ProResult } from './pipeline';

const FRAME = { width: 1920, height: 1080 };
/** The stub concept's strap geometry, shared by the drawing and the interpretation so the
 *  two can never disagree about where things are. */
const PANEL = { x: 96, y: 830, w: 760, h: 150 };
const ACCENT = { x: 96, y: 830, w: 8, h: 150 };
const NAME = { x: 140, y: 862, w: 420, h: 44 };
const TITLE = { x: 140, y: 916, w: 380, h: 28 };
const LOGO = { x: 760, y: 858, w: 72, h: 72 };

/** Draw the deterministic concept: a dark strap with an amber accent over a plain backdrop.
 *  Deliberately modest - the stub exists to exercise the pipeline, not to impress. */
export async function stubProConcept(brief: ProBrief): Promise<ProConcept> {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME.width;
  canvas.height = FRAME.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d canvas is available for the offline concept.');

  ctx.fillStyle = '#23262e';
  ctx.fillRect(0, 0, FRAME.width, FRAME.height);
  ctx.fillStyle = '#16181d';
  ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  ctx.fillStyle = '#f5a623';
  ctx.fillRect(ACCENT.x, ACCENT.y, ACCENT.w, ACCENT.h);
  ctx.fillStyle = '#f5f6f8';
  ctx.font = '600 44px Inter, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(brief.name || 'Alexandra Riva', NAME.x, NAME.y, NAME.w);
  ctx.fillStyle = '#9aa0ab';
  ctx.font = '400 26px Inter, sans-serif';
  ctx.fillText(brief.title || 'Chief Correspondent', TITLE.x, TITLE.y, TITLE.w);
  if (brief.includeLogo) {
    ctx.fillStyle = '#2e3340';
    ctx.fillRect(LOGO.x, LOGO.y, LOGO.w, LOGO.h);
    ctx.strokeStyle = '#f5a623';
    ctx.lineWidth = 3;
    ctx.strokeRect(LOGO.x + 14, LOGO.y + 14, LOGO.w - 28, LOGO.h - 28);
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    mediaType: 'image/png',
    ...FRAME,
    model: 'stub',
    costUsd: 0,
  };
}

const norm = (rect: { x: number; y: number; w: number; h: number }) => ({
  x: rect.x / FRAME.width,
  y: rect.y / FRAME.height,
  w: rect.w / FRAME.width,
  h: rect.h / FRAME.height,
});

function stubInterpretation(brief: ProBrief): ProInterpretationV1 {
  return {
    version: 1,
    graphicType: 'lower-third',
    graphicTypeConfidence: 0.95,
    regions: [
      {
        kind: 'panel',
        bbox: norm(PANEL),
        confidence: 0.9,
        treatment: 'rebuild-shape',
        panel: { shape: 'panel', fill: { kind: 'solid', color: '#16181d' }, radiusNorm: 0.04, opacity: 1 },
      },
      {
        kind: 'panel',
        bbox: norm(ACCENT),
        confidence: 0.9,
        treatment: 'rebuild-shape',
        panel: { shape: 'accent-bar', fill: { kind: 'solid', color: '#f5a623' }, opacity: 1 },
      },
      {
        kind: 'text',
        bbox: norm(NAME),
        confidence: 0.92,
        treatment: 'rebuild-text',
        role: 'person-name',
        suggestedTitle: 'Name',
        sampleText: brief.name || 'Alexandra Riva',
        align: 'left',
        typography: {
          classification: 'sans',
          matchQuality: 'similar-available',
          suggestedFontId: 'inter',
          approxWeight: 600,
          fontSizeNorm: (NAME.h * 0.72) / FRAME.height,
          color: '#f5f6f8',
        },
      },
      {
        kind: 'text',
        bbox: norm(TITLE),
        confidence: 0.9,
        treatment: 'rebuild-text',
        role: 'person-role',
        suggestedTitle: 'Title',
        sampleText: brief.title || 'Chief Correspondent',
        align: 'left',
        typography: {
          classification: 'sans',
          matchQuality: 'similar-available',
          suggestedFontId: 'inter',
          approxWeight: 400,
          fontSizeNorm: (TITLE.h * 0.72) / FRAME.height,
          color: '#9aa0ab',
        },
      },
      ...(brief.includeLogo
        ? [{
            kind: 'logo' as const,
            bbox: norm(LOGO),
            confidence: 0.85,
            treatment: 'keep-asset' as const,
            suggestedTitle: 'Logo',
          }]
        : []),
    ],
    animation: { presetId: 'design-slide', speed: 1 },
    warnings: [],
  };
}

/** The offline twin of pipeline.ts `compileProConcept`: same normalize + compile + injected
 *  validation, zero model calls. */
export async function stubCompilePro(
  brief: ProBrief,
  concept: ProConcept,
  options: {
    resolution?: Resolution;
    fps?: number;
    validate?: SpxValidator;
    /** The as-is upload for the logo slot - filled BEFORE the gate, exactly as the remote
     *  pipeline does it (see compileProConcept's note). */
    logoMark?: PurposedImage | null;
  } = {},
): Promise<ProResult> {
  const plan = normalizeProInterpretation(
    stubInterpretation(brief),
    { width: concept.width, height: concept.height },
    uuid,
  );
  const compiled = fillProLogoSlot(
    await compileProPlan(plan, concept, brief, {
      resolution: options.resolution,
      fps: options.fps,
    }),
    options.logoMark ?? null,
  );
  // The same one seam the remote pipeline uses, so an offline run is scored identically -
  // gate findings plus the reconstruction's own refusals (compile.ts `validateProCompile`).
  const validation = await validateProCompile(compiled, options.validate);
  // Zero, not null: the offline stub reaches no provider, so nothing was spent - which is a
  // measured cost of nothing, not an unknown one.
  return { ...compiled, validation, concept, interpretCostUsd: 0 };
}
