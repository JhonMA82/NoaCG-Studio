// DOES THIS SHELL COMMAND START HEAVY BROWSER WORK? - the one place that decides.
//
// WHY IT IS ITS OWN MODULE. Two consumers need the same answer from opposite directions:
// `scripts/hooks/guard-command.mjs` asks it of a command ABOUT to run, and `scripts/e2e-runs.mjs`
// asks the equivalent of a process ALREADY running. Keeping the list of sweeps in both meant two
// copies of the same fact, and a sweep added to one and not the other is a silent hole - the
// guard would refuse to start it while the detector reported the machine idle, or the reverse.
//
// It also has to be importable, and the hook is not: `guard-command.mjs` reads stdin at module
// top level, so importing it to test its matchers would hang waiting for input that never comes.
// A pure module has no such problem, which is the second reason this file exists.
//
// The matchers are POSITIONAL. Matching a bare string anywhere in the command text was wrong in
// a way that bit within a day: `grep -n "npm run test:e2e" AGENTS.md` contains the phrase and
// starts nothing, and denying it teaches everyone to route around the guard. So the command is
// split on shell separators and each segment is tested at its FIRST token, where an invocation
// has to live. A quoted argument is never in that position.

/**
 * The repo scripts that spin up a dev server and a pile of headless Chromium, as one alternation
 * shared by the command matcher below and the process detector in `scripts/e2e-runs.mjs`.
 *
 * Deliberately a NAMED list rather than "every script that imports chromium" - 36 of them do, and
 * most are one-off analysis tools nobody runs during normal work. Blocking those would train
 * people to route around the guard. This covers the catalog quality gates AGENTS.md documents,
 * the factory, the render smokes and the `*bench*` family. Anything missed is still absorbed by
 * the worker ladder (`scripts/e2e-workers.mjs`), which sizes a run off free memory whatever else
 * is resident.
 */
export const SWEEP_SCRIPTS =
  'l3-sweep|type-floor|overflow-sweep|field-coverage|numerals|factory|catalog-geometry|acceptance-shots|render-smoke[\\w-]*|[\\w-]*bench[\\w-]*';

/**
 * A command line's segments, each trimmed to the token an invocation would occupy. Leading
 * `VAR=value` prefixes are stripped so `NOACG_ALLOW_PARALLEL_E2E=1 npm run test:e2e` is still
 * recognised as an npm invocation.
 */
export function commandSegments(text) {
  return text
    .split(/&&|\|\||[;|\n]/)
    .map((segment) => segment.trim().replace(/^(?:[A-Za-z_]\w*=\S*\s+)+/, ''));
}

/** Does this command start a Playwright run - through npm, npx, or the affected/focus entry point? */
export function invokesE2e(text) {
  return commandSegments(text).some(
    (segment) =>
      /^(?:(?:npm|pnpm)\s+run\s+|yarn\s+)?test:e2e[\w:]*(?:\s|$)/.test(segment) ||
      /^(?:npx\s+)?playwright\s+test(?:\s|$)/.test(segment) ||
      /^node\s+\S*e2e-affected\.mjs(?:\s|$)/.test(segment),
  );
}

/**
 * Does this command start a catalog sweep or a bench? They cost the same memory as a suite, so
 * they belong in the same mutual exclusion - the guard used to serialise suite-against-suite and
 * then let a sweep start alongside one, which costs exactly as much.
 */
export function invokesSweep(text) {
  const direct = new RegExp(`^node\\s+\\S*scripts[/\\\\](${SWEEP_SCRIPTS})\\.mjs(?:\\s|$)`);
  const viaNpm = /^(?:(?:npm|pnpm)\s+run\s+|yarn\s+)(?:bench|video):[\w:]+(?:\s|$)/;
  return commandSegments(text).some((segment) => direct.test(segment) || viaNpm.test(segment));
}
