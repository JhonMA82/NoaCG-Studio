// The BENCHMARK PREFLIGHT - the free dry run that answers "would this comparison have been
// worth paying for?" BEFORE a token is spent (docs/AI_LITE_PROMOTION.md).
//
// Every failure this checks for actually happened during the 2026-07-29/30 rounds, and each
// one produced a full, plausible-looking, completely worthless result set:
//
//   1. A saved or hardcoded model silently overrode the candidate, so every arm ran the
//      incumbent. vite.config.ts fills process.env from .env only for keys NOT already set,
//      so an injected route wins - but only if it is injected under the name the profile
//      actually reads. A typo there is invisible: the run succeeds, at the wrong model.
//   2. A route was missing from the approved-route catalog, so taskConfigured() failed
//      closed and the arm served nothing - correct behaviour, discovered after paying for
//      the arms around it.
//   3. Authentication and configuration mistakes (no key, the feature flag off, no provider
//      allowlist) which surface as uniform generation failures that read like a bad model.
//   4. Candidates compared against THEMSELVES, the compounding consequence of 1: the
//      compare script cannot ask the server which model it is serving (/status does not
//      expose the route, by design), so a failed injection looks exactly like a real run.
//
// The unifying property: none of these is visible in the OUTPUT. A comparison whose arms
// resolve to one model produces differences - sampling noise reads as model character - so
// the numbers look like findings. That is why this runs before the spend and why it
// resolves routes through the REAL profile and registry code rather than reimplementing
// the rules: a preflight that models the server's behaviour instead of executing it drifts
// from it, and then certifies runs the server will refuse.
//
// SPENDS NOTHING and reaches NO network. Pure resolution over environments.

import { liteProfile } from './aiLiteProfile.js';
import { importAnalysisProfile } from './aiImportAnalysisProfile.js';
import { importAnalysisTaskProfile, liteTaskProfile, taskConfigured } from './aiTaskRegistry.js';
import { approvedModelEntry, fundedModelRoute, modelRouteKey } from './aiModelCatalog.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';

/** One benchmark arm: the candidate it is meant to measure, and the environment the runner
 *  would start its server with. */
export interface PreflightArm {
  /** The model id the operator asked to measure - what the report will attribute results to. */
  candidate: string;
  /** The env the runner would inject for this arm (the runner's own variables only; the
   *  ambient environment underneath is passed separately so .env precedence is real). */
  env: Record<string, string | undefined>;
}

export type PreflightSeverity = 'error' | 'warning';

export interface PreflightFinding {
  severity: PreflightSeverity;
  /** Stable code so the runner and its tests can assert on the failure MODE, not wording. */
  code:
    | 'candidate-overridden'
    | 'route-not-approved'
    | 'route-not-configured'
    | 'arms-not-distinct'
    | 'missing-credentials'
    | 'feature-disabled'
    | 'no-baseline';
  arm?: string;
  message: string;
}

export interface PreflightArmResult {
  candidate: string;
  /** What the server would ACTUALLY serve for this arm. The whole point. */
  resolved: ModelRoute;
  configured: boolean;
}

export interface PreflightReport {
  arms: PreflightArmResult[];
  findings: PreflightFinding[];
  ok: boolean;
}

/**
 * Resolve a profile under a specific environment, using the real `liteProfile()`.
 *
 * `liteProfile` reads process.env directly (it is server request-path code and should keep
 * doing so), so the only honest way to ask "what would this environment produce" is to
 * install it, call, and restore. Single-threaded, synchronous, and restored in a finally -
 * the alternative is a second copy of the env-precedence rules, which is exactly the drift
 * this module exists to prevent.
 */
function underEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) saved.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** What one arm's environment would actually produce, resolved through the REAL profile
 *  and registry code for the task under test. */
interface ArmResolution {
  resolved: ModelRoute;
  /** The ROUTE half only (taskConfigured): prices, allowlist, catalog approval. The kill
   *  switch reports separately through `enabled`, so an arm that is wrong in both ways
   *  gets both findings in one dry run. */
  configured: boolean;
  providers: string[];
  priced: boolean;
  /** The task's kill switch UNDER THE ARM'S ENVIRONMENT, when the task checks it - so the
   *  diagnosis can name the flag instead of a generic refusal. */
  enabled?: boolean;
}

/** A task's preflight surface: how to resolve an arm's environment, and the names the
 *  diagnosis speaks in. Each task binds its own profile code - a resolver that MODELLED
 *  the profile instead of calling it would drift, which is the failure this file exists
 *  to prevent. */
export interface PreflightTask {
  /** Runs UNDER the arm's environment (underEnv) - reads process.env via the profile. */
  resolve: () => ArmResolution;
  /** The allowlist variable the diagnosis should name. */
  allowlistVar: string;
}

/** Lite / lite-design-spec - the original preflight target. */
export const litePreflightTask: PreflightTask = {
  resolve: () => {
    const profile = liteProfile();
    const task = liteTaskProfile(profile);
    return {
      resolved: profile.primary,
      configured: taskConfigured(task),
      providers: profile.openRouterProviders,
      priced: Boolean(task.routePolicy.prices[modelRouteKey(profile.primary)]),
    };
  },
  allowlistVar: 'AI_LITE_OPENROUTER_PROVIDERS',
};

/** imported-graphic-analysis - the vision task's separate model profile (AI_PLATFORM_PLAN
 *  §16.1). The 2026-07-29 vision round had NO preflight: two of five candidates failed all
 *  35 images identically and the reasons were never isolated, because nothing free ever
 *  asked "would this arm serve at all?". This binds the same checks to the profile that
 *  round actually resolved routes through. `configured` includes the task's own kill
 *  switch: the runner injects AI_TASK_IMPORT_ANALYSIS_ENABLED per arm, so an arm whose
 *  environment leaves it off would fail every call while looking configured. */
export const importAnalysisPreflightTask: PreflightTask = {
  resolve: () => {
    const profile = importAnalysisProfile();
    const task = importAnalysisTaskProfile(profile);
    return {
      resolved: profile.route,
      configured: taskConfigured(task),
      providers: profile.openRouterProviders,
      priced: Boolean(task.routePolicy.prices[modelRouteKey(profile.route)]),
      enabled: profile.enabled,
    };
  },
  allowlistVar: 'AI_IMPORT_ANALYSIS_OPENROUTER_PROVIDERS (falling back to AI_LITE_OPENROUTER_PROVIDERS)',
};

/** Why a route would not serve - the diagnosis, not just the verdict. A run that fails
 *  closed correctly is still a wasted afternoon if nobody said which gate closed. */
function routeDiagnosis(
  route: ModelRoute,
  providers: string[],
  priced: boolean,
  allowlistVar: string,
): string | null {
  if (!approvedModelEntry(route)) {
    return `${modelRouteKey(route)} is not in the approved-route catalog (api/_lib/aiModelCatalog.ts). `
      + 'A free-tier route must be listed there before it can be served at all, so this arm '
      + 'would fail closed. Add the audited entry in the same change as the run that justifies it.';
  }
  if (!providers.length) {
    return `No OpenRouter provider allowlist (${allowlistVar} is empty), so every `
      + 'call would be rejected before it reached a model.';
  }
  if (!priced) {
    return `${modelRouteKey(route)} has no price in the task's table, so the cost policy cannot admit it.`;
  }
  if (!fundedModelRoute(route)) {
    return `${modelRouteKey(route)} is approved but not FUNDED-eligible (decision 5: OpenRouter, `
      + 'under the funded-route price ceiling), so the free tier may not serve it.';
  }
  return null;
}

/**
 * The preflight. Give it the arms a comparison would run and the ambient environment it
 * would run them in; it reports what each arm would actually serve and every way the
 * comparison would be worthless.
 *
 * `ambient` is the environment the dev server would inherit (typically the parsed .env),
 * which is what makes finding 1 detectable: the arm's injected variables are applied ON TOP
 * of it, exactly as vite does, so a saved value that would win shows up as a win here.
 */
export function benchPreflight(
  arms: PreflightArm[],
  ambient: Record<string, string | undefined> = {},
  task: PreflightTask = litePreflightTask,
): PreflightReport {
  const findings: PreflightFinding[] = [];
  const results: PreflightArmResult[] = [];

  for (const arm of arms) {
    // The arm's own variables layered over the ambient environment - vite's precedence.
    const env = { ...ambient, ...arm.env };
    const { resolved, configured, providers, priced, enabled } = underEnv(env, task.resolve);
    results.push({ candidate: arm.candidate, resolved, configured: configured && enabled !== false });

    // 0. A task whose kill switch is folded into `configured` names it explicitly: an
    //    injected flag lost to a typo produces uniform failures that read like a bad model.
    if (enabled === false) {
      findings.push({
        severity: 'error',
        code: 'feature-disabled',
        arm: arm.candidate,
        message: 'The task is disabled under this arm\'s environment - its enable flag is not truthy there.',
      });
    }

    // 1. The candidate the arm claims to measure must be the one that would be served.
    if (resolved.model !== arm.candidate) {
      findings.push({
        severity: 'error',
        code: 'candidate-overridden',
        arm: arm.candidate,
        message:
          `This arm reports as "${arm.candidate}" but would serve "${resolved.model}". `
          + 'Something already in the environment outranks the injection (a saved '
          + 'route in .env, or the route injected under a name the profile '
          + 'does not read). Every result would be attributed to the wrong model.',
      });
    }

    // 2 + 3. The arm's route must actually be servable, with the reason when it is not.
    //    Independent of the kill switch above, so an arm wrong in both ways gets both
    //    findings in ONE dry run.
    if (!configured) {
      const why = routeDiagnosis(resolved, providers, priced, task.allowlistVar);
      findings.push({
        severity: 'error',
        code: approvedModelEntry(resolved) ? 'route-not-configured' : 'route-not-approved',
        arm: arm.candidate,
        message: why ?? `${modelRouteKey(resolved)} would not be served (taskConfigured is false).`,
      });
    }
  }

  // 4. Distinct arms must resolve to distinct models. This is the check the paid runner
  //    structurally CANNOT make at runtime, and the one whose absence turned a whole round
  //    into a comparison of one model against itself.
  const byResolved = new Map<string, string[]>();
  for (const row of results) {
    const key = modelRouteKey(row.resolved);
    byResolved.set(key, [...(byResolved.get(key) ?? []), row.candidate]);
  }
  for (const [route, candidates] of byResolved) {
    if (candidates.length > 1) {
      findings.push({
        severity: 'error',
        code: 'arms-not-distinct',
        message:
          `${candidates.length} arms (${candidates.join(', ')}) would all serve ${route}. `
          + 'They would produce different numbers - sampling noise between identical models '
          + 'reads as model character - so the comparison would look valid and mean nothing.',
      });
    }
  }

  if (arms.length < 2) {
    findings.push({
      severity: 'warning',
      code: 'no-baseline',
      message: 'Fewer than two arms: a comparison with nothing to beat is not a comparison.',
    });
  }

  return { arms: results, findings, ok: !findings.some((f) => f.severity === 'error') };
}

/**
 * The incumbent: whatever the profile serves when nothing overrides it. DERIVED rather than
 * named, because "the model in production today" is exactly what `liteProfile()`'s default
 * primary means - a constant repeating it here would keep pointing at the old model for one
 * round after a promotion, and that round's baseline would silently be the wrong thing.
 */
export function defaultIncumbentModel(): string {
  return underEnv(
    { AI_LITE_PRIMARY_MODEL: undefined, AI_LITE_PRIMARY_PROVIDER: undefined },
    () => liteProfile().primary.model,
  );
}

/** The import-analysis incumbent, derived the same way: whatever the task's profile serves
 *  when nothing overrides it. */
export function defaultImportAnalysisModel(): string {
  return underEnv(
    { AI_IMPORT_ANALYSIS_MODEL: undefined, AI_IMPORT_ANALYSIS_PROVIDER: undefined },
    () => importAnalysisProfile().route.model,
  );
}

/** Credential and flag checks for the paid runner, kept beside the route checks because
 *  they fail the same way: a uniform wall of generation errors that reads like a bad model.
 *  Reported as findings rather than thrown, so ONE dry run lists everything that is wrong. */
export function benchCredentialFindings(
  ambient: Record<string, string | undefined>,
  options: {
    requireEvalIdentity?: boolean;
    /** The kill-switch variable the AMBIENT environment must carry. Defaults to Lite's.
     *  Pass null for a task whose runner injects its own flag per arm - there the arm
     *  resolution (`configured`) is the honest check, not the ambient file. */
    enabledFlag?: string | null;
  } = {},
): PreflightFinding[] {
  const findings: PreflightFinding[] = [];
  const has = (key: string) => Boolean((ambient[key] ?? '').trim());

  if (!has('OPENROUTER_API_KEY')) {
    findings.push({
      severity: 'error',
      code: 'missing-credentials',
      message: 'OPENROUTER_API_KEY is not set - every generation would fail identically.',
    });
  }
  // The flag is read with boolEnv(..., false): absent means OFF, and an off profile serves
  // nothing while looking configured.
  const enabledFlag = options.enabledFlag === undefined ? 'AI_LITE_ENABLED' : options.enabledFlag;
  if (enabledFlag && !['1', 'true', 'yes', 'on'].includes((ambient[enabledFlag] ?? '').trim().toLowerCase())) {
    findings.push({
      severity: 'error',
      code: 'feature-disabled',
      message: `${enabledFlag} is not truthy - the profile would refuse every request.`,
    });
  }
  if (options.requireEvalIdentity) {
    const canMint = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'E2E_EMAIL', 'E2E_PASSWORD'].every(has);
    if (!canMint && !has('NOACG_LITE_EVAL_BEARER_TOKEN')) {
      findings.push({
        severity: 'error',
        code: 'missing-credentials',
        message:
          'No eval identity: set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL and '
          + 'E2E_PASSWORD so a token can be minted per candidate, or supply '
          + 'NOACG_LITE_EVAL_BEARER_TOKEN by hand (it expires after about an hour, and a long '
          + 'run outliving its token pays for results it cannot collect).',
      });
    } else if (!canMint) {
      findings.push({
        severity: 'warning',
        code: 'missing-credentials',
        message:
          'Only a hand-supplied bearer token is available; it cannot be refreshed per '
          + 'candidate, so a long comparison may outlive it.',
      });
    }
  }
  return findings;
}
