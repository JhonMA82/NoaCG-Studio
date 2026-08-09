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
 * Enforce the policy for one route flag. Returns `{ provider, model, frontierReason }` when the
 * run may proceed, and EXITS with a printed refusal when it may not - a bench about to spend
 * real money is the wrong place to throw an exception a caller might swallow.
 *
 * `reason` is whatever `--frontier-reason=` carried. A gateway route ignores it entirely.
 */
export function requireAllowedRoute(route, { flag, reason }) {
  const parsed = parseRoute(route);
  if (!parsed) {
    console.error(`--${flag} must be <provider>:<model> (got ${JSON.stringify(route ?? null)}).`);
    process.exit(1);
  }
  if (parsed.provider === GATEWAY_PROVIDER) return { ...parsed, frontierReason: null };

  const stated = String(reason ?? '').trim();
  if (stated.length < 10) {
    console.error(`\nREFUSED: --${flag}=${route} is not a ${GATEWAY_PROVIDER} gateway route.`);
    console.error('Harness runs use the gateway (open-weight or cheap models). A direct');
    console.error('provider route is for a named comparison only, and the round records why:');
    console.error(`  --${flag}=${route} --frontier-reason="compare Pro against a frontier model"`);
    console.error('The reason is written into the round\'s results, so it must be a sentence,');
    console.error('not a placeholder.');
    process.exit(1);
  }
  console.log(`FRONTIER ROUTE on --${flag}: ${route}`);
  console.log(`  reason: ${stated}`);
  console.log('  This is off the gateway and off the funded price ceiling. It bills accordingly.');
  return { ...parsed, frontierReason: stated };
}
