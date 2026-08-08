import type { ModelUsage } from './modelTypes';
// Both trees import this file, so it stays dependency-light - and src/feedback/contract.ts is
// held to the same discipline (pure, no DOM, no env), which is why the discard vocabulary can
// live there instead of being copied here.
import type { LiteDiscardReason } from '../feedback/contract';

export type CreativeAiProfileId = 'lite';

export type LiteUnsupportedCode =
  | 'unsupported-category'
  | 'multi-graphic-request'
  | 'advanced-state-machine'
  | 'reference-recreation'
  | 'import-conversion'
  | 'video-request'
  | 'external-data'
  | 'too-complex';

export type LiteLowerThirdIntentKind =
  | 'person'
  | 'story'
  | 'event'
  | 'team'
  | 'organization'
  | 'promotion';

export type LiteLowerThirdLineRole =
  | 'person-name'
  | 'person-role'
  | 'organization'
  | 'team-name'
  | 'story-headline'
  | 'event-name'
  | 'location'
  | 'social-handle'
  | 'call-to-action'
  | 'supporting-context';

export interface LiteLowerThirdIntent {
  kind: LiteLowerThirdIntentKind;
  primaryRole: LiteLowerThirdLineRole;
  secondaryRole?: LiteLowerThirdLineRole;
}

export interface LiteDesignSpec {
  fit: 'catalog';
  reason: string;
  name: string;
  summary: string;
  category: 'lower-third' | 'info-card' | 'ticker' | 'game-timer' | 'scoreboard' | 'infographic';
  variantId: string;
  intent: LiteLowerThirdIntent;
  lines: { title: string; sample: string; role: LiteLowerThirdLineRole }[];
  extraFields?: { title: string; ftype: 'textfield' | 'textarea' | 'number' | 'filelist'; value: string }[];
  useLogoSlot?: boolean;
  /** Still on the wire, deliberately IGNORED by the compile since v9 - Lite assembles with
   *  `keepChassisZone`, so placement is the chosen design's own `defaultZone`. It cannot be
   *  deleted while the model still emits it (liteContract.ts). */
  zone?: string;
  paletteId?: string;
  palette?: { accent: string; text: string; textDim: string; panel: string };
  fontId?: string;
  sizeScale?: number;
  /** `presetId` is still on the wire and still ignored by the compile, for the same reason
   *  `zone` is - see liteContract.ts. Motion is the chosen design's own. */
  animation?: { presetId?: string; easing?: string; speed?: number; steps?: boolean };
  motionCharacter?: string;
  typography?: {
    scaleRatio?: number;
    headingWeight?: 'regular' | 'semibold' | 'bold' | 'black';
    kickerCase?: 'caps' | 'as-written';
    tracking?: 'tight' | 'normal' | 'wide';
  };
  density?: 'airy' | 'standard' | 'compact';
  alignment?: 'left' | 'center' | 'right';
  shape?: {
    corner?: 'sharp' | 'soft' | 'round';
    accentForm?: 'bar' | 'hairline' | 'block' | 'none';
    panel?: 'solid' | 'translucent' | 'outline' | 'none';
  };
  flourish?: '' | null;
}

export interface LiteGenerationSpec {
  version: 1;
  category: string;
  fields: {
    label: string;
    kind: string;
    description?: string;
    example?: string;
  }[];
  styleNotes?: string;
  mood?: string;
  avoidNotes?: string;
  brandColors?: { accent: string; text: string; textDim: string; panel: string } | null;
  animation?: Record<string, unknown>;
}

/**
 * A model-authored SKIN: bounded restyling CSS (plus optional decorative inner HTML) for
 * the neutral canvas chassis. Same writable surface as the polish pass — override CSS
 * appended after the design CSS, never :root/@font-face/scripts. The browser applies it
 * through the polish gate and REVERTS to the spec's house chassis when any check fails.
 */
export interface LiteSkinPatch {
  summary: string;
  css: string;
  html?: string;
}

/** The vision judge's four axes, each an integer 1-5 (5 = excellent). */
export interface LiteSkinJudgeScores {
  legibility: number;
  hierarchy: number;
  briefFit: number;
  strapShape: number;
}

export interface LiteSkinJudgeRequest {
  /** The generation being judged - the server verifies ownership before spending. */
  generationId: string;
  brief: string;
  skinSummary: string;
  /** Base64 PNG of the settled HOLD frame, downscaled by the caller (the server caps size). */
  imageBase64: string;
}

export interface LiteSkinJudgeResult {
  verdict: 'pass' | 'fail';
  scores: LiteSkinJudgeScores;
  /** One short judge sentence - eval tooling context only, never stored server-side. */
  reason: string;
  /** The server-configured minimum every axis must reach for a pass. */
  threshold: number;
  usage: ModelUsage;
}

export type LiteDecision =
  | { status: 'ready'; spec: LiteDesignSpec; skin?: LiteSkinPatch }
  | {
      status: 'unsupported';
      code: LiteUnsupportedCode;
      message: string;
      suggestedBrief?: string;
    };

export interface LiteConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LiteGenerationRequest {
  idempotencyKey: string;
  prompt: string;
  generationSpec?: LiteGenerationSpec | null;
  priorSpec?: LiteDesignSpec;
  conversation?: LiteConversationTurn[];
  palette?: { accent: string; text: string; textDim: string; panel: string } | null;
  primaryFont?: { family: string; uploaded: boolean } | null;
  hasLogo?: boolean;
  resolution: { width: number; height: number };
  fps: number;
}

export interface LiteGenerationResult {
  generationId: string;
  decision: LiteDecision;
  usage: ModelUsage;
  attemptCount: number;
  repairCount: number;
  expiresAt: string;
}

export interface LiteAllowance {
  dailyStartsRemaining: number;
  monthlyStartsRemaining: number;
  dailySuccessesRemaining: number;
  monthlySuccessesRemaining: number;
}

export interface LitePublicLimits {
  promptCharacters: number;
  conversationTurns: number;
  conversationCharacters: number;
  fields: number;
  logos: number;
  logoBytes: number;
}

export interface LiteStatusResponse {
  profile: 'lite';
  enabled: boolean;
  available: boolean;
  requiresSignIn: boolean;
  reason?: 'disabled' | 'sign-in' | 'not-configured' | 'capacity';
  supportedCategories: string[];
  /** The skin experiment's server flag - additive, so older servers simply omit it. */
  skinEnabled?: boolean;
  /** The skin vision judge's server flag - additive; the eval rig gates its judge calls on it. */
  skinJudgeEnabled?: boolean;
  limits: LitePublicLimits;
  allowance?: LiteAllowance;
}

export interface LiteOutcomeRequest {
  generationId: string;
  action: 'usable' | 'validation-failed' | 'accepted' | 'discarded';
  resolvedCategory?: string;
  validationRuleCodes?: string[];
  runtimeMs?: number;
  /** The enumerated set migration 0011's CHECK constraint allows, expressed ONCE in
   *  src/feedback/contract.ts. It used to be written out here, again in the endpoint validator,
   *  and again in the SQL - three copies of a list that has to agree, which is how a value
   *  ends up accepted by the endpoint and rejected by the database. */
  discardReason?: LiteDiscardReason;
}

export interface LiteOutcomeResponse {
  recorded: true;
}

export interface LiteVariantQualityPrior {
  variantId: string;
  intentKind: LiteLowerThirdIntentKind;
  accepted: number;
  discarded: number;
}
