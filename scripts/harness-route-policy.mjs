// THE SPEND POLICY FOR HARNESS RUNS, in one place so every bench answers it the same way.
//
// The policy (owner, 2026-08-09): harness work runs on the VERCEL AI GATEWAY, on open-weight
// or otherwise cheap models. A frontier model reached through its own provider API - OpenAI,
// Anthropic - is used only when there is a stated reason, the standing example being "compare
// what NoaCG Pro produces against a frontier model". This project has no revenue; a habit of
// reaching for the dear route is the failure mode, not one deliberate comparison.
//
// The product side of this rule is already structural and stays that way: api/_lib/
// aiModelCatalog.ts pins FUNDED_ROUTE_PROVIDER = 'vercel' and a per-million price ceiling, and
// the task registry fails closed on an uncatalogued route. What was missing is the BENCH side -
// a runner takes its route from a flag, so nothing stopped `--interpret-route=anthropic:…`
// except remembering not to type it.
//
// This module is a gate on the flag, not on the product. It refuses a non-gateway route unless
// the operator names a reason, and hands the reason back so the round records WHY it was paid
// for. The reason is not validated - it is a sentence for a human reading the round later.
//
// WHO CALLS THIS, AND WHO DOES NOT NEED TO. Every paid runner that lets an operator NAME a
// provider goes through here: pro-spike, creative-route-bench, creative-pilot-bench (all three
// of its routes - it can run its arms on different models, so gating the headline one alone
// would leave the coder and the critique free to reach a flagship), pro-machine-probe, and
// ai-bench-compare - which names only a MODEL and resolves the provider from the running app's
// saved settings, so it is checked on the RESOLVED pair. (`pro-bench` and `pro-interpret-probe`
// were on this list until 2026-08-15, when the concept-and-reconstruct engine they drove was
// deleted - docs/NOACG_PRO_PLAN.md §16.)
//
// Three paid runners need no call, and that is a property of their design rather than an
// oversight - check before "fixing" one:
//   - ai-vision-run    - candidates are model ids; the provider allowlist is resolved by
//                        querying the gateway's own endpoint listing (ai-bench-server.mjs
//                        `providerAllowlistFor`), so a route off the gateway is inexpressible.
//   - ai-lite-compare  - candidates come from qualify.json, which is built from the approved
//                        catalog, and the route is server configuration.
//   - ai-lite-spike    - cannot see or set the route at all; it measures whatever
//                        AI_LITE_PRIMARY_* the server was started with, and says so.
// Adding a call to any of those would gate a value no operator can steer, which reads as
// protection while protecting nothing.

/** The transport every funded and every routine harness route goes through. */
export const GATEWAY_PROVIDER = 'vercel';

/** Parse `provider:model`. Returns null when the shape is wrong rather than guessing. */
export function parseRoute(route) {
  const value = String(route ?? '').trim();
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) return null;
  return { provider: value.slice(0, separator), model: value.slice(separator + 1) };
}

/**
 * Enforce the policy for one route. Returns `{ provider, model, frontierReason }` when the run
 * may proceed, and EXITS with a printed refusal when it may not - a bench about to spend real
 * money is the wrong place to throw an exception a caller might swallow.
 *
 * `flag` names the option the route came from, and is what the refusal tells the operator to
 * re-type. `source` overrides that wording for a route the operator did not type at all - the
 * harness comparison reads its route back out of the running app's own settings, and telling
 * someone to add a flag to a value no flag produced is a dead end.
 *
 * `reason` is whatever `--frontier-reason=` carried. A gateway route ignores it entirely.
 */
export function requireAllowedRoute(route, { flag, reason, source }) {
  const named = source ?? `--${flag}`;
  const parsed = parseRoute(route);
  if (!parsed) {
    console.error(`${named} must be <provider>:<model> (got ${JSON.stringify(route ?? null)}).`);
    process.exit(1);
  }
  // A gateway route needs no reason - but one the operator STATES anyway is recorded rather
  // than dropped: a $25/M model routed through the gateway passes on transport alone, and the
  // round should still say why it was paid for (the claude-opus-5 precedent, 2026-08-17).
  const stated = String(reason ?? '').trim();
  if (parsed.provider === GATEWAY_PROVIDER) {
    return { ...parsed, frontierReason: stated.length ? stated : null };
  }
  if (stated.length < 10) {
    console.error(`\nREFUSED: ${named} = ${route} is not a ${GATEWAY_PROVIDER} gateway route.`);
    console.error('Harness runs use the gateway (open-weight or cheap models). A direct');
    console.error('provider route is for a named comparison only, and the round records why:');
    console.error(`  --frontier-reason="compare Pro against a frontier model"`);
    console.error('The reason is written into the round\'s results, so it must be a sentence,');
    console.error('not a placeholder.');
    process.exit(1);
  }
  console.log(`FRONTIER ROUTE (${named}): ${route}`);
  console.log(`  reason: ${stated}`);
  console.log('  This is off the gateway and off the funded price ceiling. It bills accordingly.');
  return { ...parsed, frontierReason: stated };
}
