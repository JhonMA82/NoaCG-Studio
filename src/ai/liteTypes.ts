import type { ModelUsage } from './modelTypes';

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

export interface LiteDesignSpec {
  fit: 'catalog';
  reason: string;
  name: string;
  summary: string;
  category: 'lower-third' | 'info-card' | 'ticker' | 'game-timer' | 'scoreboard' | 'infographic';
  variantId: string;
  lines: { title: string; sample: string }[];
  extraFields?: { title: string; ftype: 'textfield' | 'textarea' | 'number' | 'filelist'; value: string }[];
  useLogoSlot?: boolean;
  zone?: string;
  paletteId?: string;
  palette?: { accent: string; text: string; textDim: string; panel: string };
  fontId?: string;
  sizeScale?: number;
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

export type LiteDecision =
  | { status: 'ready'; spec: LiteDesignSpec }
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
  limits: LitePublicLimits;
  allowance?: LiteAllowance;
}

export interface LiteOutcomeRequest {
  generationId: string;
  action: 'usable' | 'validation-failed' | 'accepted' | 'discarded';
  resolvedCategory?: string;
  validationRuleCodes?: string[];
  runtimeMs?: number;
}

export interface LiteOutcomeResponse {
  recorded: true;
}
