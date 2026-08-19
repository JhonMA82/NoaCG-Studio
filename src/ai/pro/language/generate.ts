// THE ONE MODEL CALL Phase A makes.
//
// One forced structured call, on a TEXT route, for a few hundred output tokens. That is the
// whole model surface of the phase, and the size of it is the argument: the concept-and-rebuild
// engine spent $0.0777 a graphic of which 86% was a flat-rate concept IMAGE that the compiler
// then failed to keep (docs/NOACG_PRO_PLAN.md §16, `pro-generation-cost` in the ledger). A design
// language is words about a look, and words are the cheap part of a model.
//
// A NULL SESSION IS THE UNMETERED PATH, exactly as `pro/pipeline.ts` treats it: a caller spending
// their own key or running the offline stub is never booked against the hosted allowance.

import { callModelDetailed } from '../../modelGateway';
import {
  MODEL_CALL_RETRY_DELAY_MS,
  outputBudget,
  shouldRetryModelCall,
  type AiGatewaySurface,
  type ModelRoute,
} from '../../modelTypes';
import { startAiRun } from '../../telemetry';
import type { ProSession } from '../session';
import {
  DESIGN_LANGUAGE_TOOL,
  languageFallbacks,
  normalizeDesignLanguage,
  type DesignLanguage,
} from './contract';
import { designLanguageSystemPrompt, designLanguageUserMessage, type LanguageBrief } from './prompt';

/** An answer size a design language comfortably fits in - it is a page of enum values. */
const EXPECTED_OUTPUT_TOKENS = 700;

export interface GeneratedLanguage {
  language: DesignLanguage;
  /** Which fields the model did not answer legibly and fell back to the house's. An empty list
   *  is the normal case; a long one is a round measuring the fallback rather than the model. */
  fallbacks: string[];
  costUsd: number;
  /** `reasoning` is the slice of `output` the model spent THINKING, when the provider reports
   *  it separately. Recorded because a checkpoint that thinks pays completion rates for tokens
   *  nobody reads, and a round comparing two checkpoints on cost alone cannot see which one it
   *  is - a design language is ~200 tokens of enum values, so a large reasoning share is the
   *  whole difference between a cheap answer and a dear one. */
  usage: { input: number; output: number; reasoning: number };
  model: string;
}

export async function generateDesignLanguage(
  brief: LanguageBrief,
  route: ModelRoute,
  options: {
    session?: ProSession | null;
    temperature?: number;
    seed?: number;
    /**
     * The gateway surface. `pro` is the PRODUCT's - policied, and metered against the hosted
     * allowance through `session`. A bench round passes `spike`, which carries the same
     * zero-data-retention posture and reaches no user's allowance: a measurement run must not
     * book a classroom's capacity, and the round is not a product call pretending to be one.
     */
    surface?: AiGatewaySurface;
  } = {},
): Promise<GeneratedLanguage> {
  const run = startAiRun('pro-generate');
  const t0 = Date.now();
  try {
    const call = () => callModelDetailed({
      system: designLanguageSystemPrompt(),
      messages: [{ role: 'user', content: designLanguageUserMessage(brief) }],
      tool: DESIGN_LANGUAGE_TOOL,
      route,
      surface: options.surface ?? 'pro',
      cacheSystem: true,
      maxTokens: outputBudget(EXPECTED_OUTPUT_TOKENS),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.seed === undefined ? {} : { seed: options.seed }),
      ...(options.session ? { proGenerationId: options.session.generationId } : {}),
    });
    let result;
    try {
      result = await call();
    } catch (error) {
      // ONE bounded in-session retry, on a provider outage only (shouldRetryModelCall). It is
      // safe because it stays inside the SAME reservation: the failed call settled nothing, so
      // it consumed no call budget, no start and no money - the admission simply pays for the
      // retry from the booking the first attempt left untouched. Without this, a quarter-second
      // gateway wobble was a user-visible failure that also burned a scarce daily start.
      if (!shouldRetryModelCall(error, 0)) throw error;
      await new Promise((resolve) => setTimeout(resolve, MODEL_CALL_RETRY_DELAY_MS));
      result = await call();
    }
    run.stage('design', t0, result.model, result.usage);
    run.finish(true);
    const language = normalizeDesignLanguage(result.output);
    return {
      language,
      fallbacks: languageFallbacks(result.output, language),
      // An unreported cost counts as zero - the same honest limit the Pro ceiling carries.
      costUsd: result.usage.estimatedCost?.amount ?? 0,
      usage: {
        input: result.usage.inputTokens ?? 0,
        output: result.usage.outputTokens ?? 0,
        reasoning: result.usage.reasoningTokens ?? 0,
      },
      model: result.model,
    };
  } catch (error) {
    run.finish(false);
    throw error;
  }
}
