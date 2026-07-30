// Tests for the admin gate (api/_lib/adminAuth.ts).
//
// The property under test is NEGATIVE and it is the whole security posture: every way of
// failing produces the same 404, byte for byte, and none of them is distinguishable from a
// route that does not exist. A test that only proved "an admin gets in" would pass happily
// while a 403 leaked the surface's existence to everyone else.
//
// Everything here is reachable without a network call: the gate short-circuits before it
// would contact Supabase in each of these cases, which is itself worth pinning - an
// unauthenticated flood must not cost a getUser() round trip per request.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { adminConfigured, adminNotFound, meetsRole, requireAdmin, resetAdminDb } from './adminAuth.js';

const ENV = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'ADMIN_RATE_WINDOW_SEC',
  'ADMIN_RATE_MAX',
  'IP_HASH_SALT',
] as const;
const original = new Map(ENV.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of ENV) delete process.env[name];
  resetAdminDb();
});

afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetAdminDb();
});

/** Each request gets its own client IP so the shared burst-gate counters (keyed on a salted
 *  IP hash, kept on globalThis) do not leak between tests. */
let clientCounter = 0;
function request(headers: Record<string, string> = {}): Request {
  clientCounter += 1;
  return new Request('http://localhost/api/admin/session', {
    headers: { 'x-forwarded-for': `10.0.0.${clientCounter % 250}`, ...headers },
  });
}

function configure() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'server-secret';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
}

async function body(response: Response) {
  return { status: response.status, text: await response.text(), type: response.headers.get('content-type') };
}

test('the refusal is one fixed 404, and nothing else', async () => {
  const canonical = await body(adminNotFound());
  assert.equal(canonical.status, 404);
  assert.deepEqual(JSON.parse(canonical.text), { error: { code: 'not_found', message: 'Not found' } });
  assert.match(canonical.type ?? '', /application\/json/);
});

test('an unconfigured backend has no admin surface', async () => {
  assert.equal(adminConfigured(), false);
  const gate = await requireAdmin(request({ authorization: 'Bearer anything' }));
  assert.equal(gate.ok, false);
  assert.ok(!gate.ok);
  assert.deepEqual(await body(gate.response), await body(adminNotFound()));
});

test('a configured backend still refuses a caller with no token', async () => {
  configure();
  assert.equal(adminConfigured(), true);
  const gate = await requireAdmin(request());
  assert.ok(!gate.ok);
  assert.deepEqual(await body(gate.response), await body(adminNotFound()));
});

test('no-backend and no-token are indistinguishable to the caller', async () => {
  const offline = await requireAdmin(request({ authorization: 'Bearer anything' }));
  configure();
  const online = await requireAdmin(request());
  assert.ok(!offline.ok && !online.ok);
  assert.deepEqual(await body(offline.response), await body(online.response));
});

test('a malformed authorization header is not a token', async () => {
  configure();
  for (const authorization of ['', 'Bearer', 'Basic abc', 'Bearer    ']) {
    const gate = await requireAdmin(request({ authorization }));
    assert.ok(!gate.ok, authorization);
    assert.deepEqual(await body(gate.response), await body(adminNotFound()));
  }
});

test('the burst gate refuses with the same 404, never a 429', async () => {
  configure();
  process.env.ADMIN_RATE_MAX = '2';
  process.env.ADMIN_RATE_WINDOW_SEC = '60';

  // One fixed client, so all four requests meet the same counter.
  const fixed = () =>
    new Request('http://localhost/api/admin/session', { headers: { 'x-forwarded-for': '203.0.113.9' } });

  const responses = [];
  for (let i = 0; i < 4; i += 1) {
    const gate = await requireAdmin(fixed());
    assert.ok(!gate.ok);
    responses.push(await body(gate.response));
  }
  const canonical = await body(adminNotFound());
  for (const response of responses) assert.deepEqual(response, canonical);
});

test('role ranking is ordered and an unknown minimum is not satisfied by accident', () => {
  assert.equal(meetsRole('owner', 'support'), true);
  assert.equal(meetsRole('owner', 'owner'), true);
  assert.equal(meetsRole('admin', 'support'), true);
  assert.equal(meetsRole('admin', 'owner'), false);
  assert.equal(meetsRole('support', 'support'), true);
  assert.equal(meetsRole('support', 'admin'), false);
  assert.equal(meetsRole('support', 'owner'), false);
});
