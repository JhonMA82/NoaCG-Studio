// The ONE bounded errors-back repair loop (docs/AI_PLATFORM_PLAN.md §5) - the mechanics
// both Creative AI coders share: emit once, validate, and while BLOCKING findings remain,
// hand the exact findings back for a re-emit, re-validating EVERY round so a repair that
// comes back broken never masquerades as fixed. A result that still fails after the
// budget is returned WITH its validation attached - surfaced, never auto-applied and
// never silently discarded; what counts as blocking (the SPX editability demotion, the
// video soft-finding demotion) stays each caller's policy, injected as a filter.
//
// Deliberately mechanics-only: prompts, grounding, message shapes, telemetry, and
// progress wording remain provider-owned - the seam unifies the LOOP, not the harness
// (provider adapters never own validation policy, src/ai/AGENTS.md).

/** The finding shape both validators speak - the validator seam's common currency. */
export interface SeamFinding {
  rule: string;
  message: string;
}

/** The verdict subset the loop reads. ValidationResult (SPX) and VideoValidation both
 *  satisfy it structurally - no type in either world changes to plug in. */
export interface SeamVerdict {
  ok: boolean;
  errors: SeamFinding[];
  warnings: SeamFinding[];
}

/** The shared budget: the initial emit plus up to two errors-back rounds. */
export const MAX_REPAIR_ROUNDS = 2;

export interface RepairLoopOptions<E, V extends SeamVerdict> {
  /** The FIRST emit, already produced - the loop owns rounds, not the opening call. */
  emitted: E;
  /** Validate one emit. Runs once up front and again after every repair round. */
  validate: (emitted: E) => Promise<V>;
  /** One repair round: the CURRENT findings and source go back to the model. */
  reEmit: (findings: SeamFinding[], current: E, round: number) => Promise<E>;
  /** Which findings force a round (default: every error). Callers narrow this - e.g.
   *  the SPX path excludes editability findings on fresh builds - while reEmit still
   *  receives the FULL error list, so demoted findings ride along in any round a
   *  blocking finding triggers. */
  blocking?: (verdict: V) => SeamFinding[];
  maxRounds?: number;
  /** Fires before each round - progress lines and telemetry counters hook here. */
  onRound?: (round: number) => void;
}

export async function repairLoop<E, V extends SeamVerdict>(
  options: RepairLoopOptions<E, V>,
): Promise<{ emitted: E; validation: V }> {
  const maxRounds = options.maxRounds ?? MAX_REPAIR_ROUNDS;
  const blocking = options.blocking ?? ((verdict: V) => verdict.errors);
  let emitted = options.emitted;
  let validation = await options.validate(emitted);
  for (let round = 1; round <= maxRounds && blocking(validation).length > 0; round++) {
    options.onRound?.(round);
    emitted = await options.reEmit(validation.errors, emitted, round);
    validation = await options.validate(emitted);
  }
  return { emitted, validation };
}

/** The findings block every repair message quotes - one wording, both harnesses. */
export function findingsList(findings: SeamFinding[]): string {
  return findings.map((finding) => `- ${finding.rule}: ${finding.message}`).join('\n');
}
