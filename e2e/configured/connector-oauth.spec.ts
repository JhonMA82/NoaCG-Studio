// covers: supabase/config.toml, supabase/migrations/0089_connector_token_role.sql, scripts/connector-oauth-spike.mjs
//
// THE REMOTE MCP CONNECTOR'S SIGN-IN, on the runner's local stack (docs/REMOTE_MCP_PLAN.md, AC-1
// and key decision 4). A chat client registers itself, a throwaway account approves it, and the
// token it gets carries `client_id`, is signed ES256, and holds the `noacg_connector` role, which
// PostgREST and Storage refuse outright; the same read with a first-party token still works, and
// a refresh keeps both. The flow is scripts/connector-oauth-spike.mjs, which a person runs against
// `npx supabase@2.111.0 start` the same way; this spec keeps it passing on every landing and prints
// its evidence into the run log. No page: what is under test is Supabase Auth and the database.

import { test, expect } from '@playwright/test';
import { REQUIRED_CHECKS, runConnectorSpike } from '../../scripts/connector-oauth-spike.mjs';
import { SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';

const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

test('a chat client signs in with PKCE and its token reaches no table, function or object directly', async () => {
  test.skip(!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY, 'needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
  test.skip(!/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(SUPABASE_URL), 'local stack only: the spike creates OAuth clients');
  const lines: string[] = [];
  const report = await runConnectorSpike({
    apiUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    serviceKey: SERVICE_ROLE_KEY,
    log: (line: string) => lines.push(line),
  });
  console.log(`connector OAuth spike:\n${lines.join('\n')}`);
  await test.info().attach('connector-oauth-spike.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  const failed = REQUIRED_CHECKS.filter((name) => !report.checks[name]?.ok);
  expect(failed, lines.join('\n')).toEqual([]);
});
