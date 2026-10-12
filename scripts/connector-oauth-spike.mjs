#!/usr/bin/env node
// The remote MCP connector's sign-in, end to end against a LOCAL Supabase stack, the way a chat
// client does it (docs/REMOTE_MCP_PLAN.md, AC-1 and key decision 4):
//
//   1. read the authorization server's discovery metadata and its JWKS;
//   2. register a client dynamically (no apikey, as Claude.ai or ChatGPT would);
//   3. run the authorization code flow with PKCE (S256) as a throwaway test account, standing in
//      for the consent page with the account's own session;
//   4. exchange the code, verify the access token's ES256 signature against the JWKS, and read its
//      `client_id` and `role`;
//   5. probe the token boundary: the connector token against PostgREST (a table read, a write, a
//      capability-slug RPC) and Storage, the same read with a first-party token, Auth's own
//      account endpoint, and a refresh;
//   6. ask whether a port-agnostic loopback redirect (`http://localhost/callback` registered,
//      `http://localhost:<port>/callback` used, as Claude Code does) is accepted.
//
// Run it with a local stack up (`npx supabase@2.111.0 start`, the version CI pins):
//   node scripts/connector-oauth-spike.mjs            # reads `supabase status` for URL and keys
//   node scripts/connector-oauth-spike.mjs --json     # the full evidence as JSON
// VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY win when set, which is
// how e2e/configured/connector-oauth.spec.ts runs it on CI's local stack. It refuses any URL that
// is not localhost: it creates and deletes an account and OAuth clients, and must never reach a
// hosted project. Exit 1 when a step of AC-1 or decision 4 fails.

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const PINNED_CLI = '2.111.0';
export const CONNECTOR_ROLE = 'noacg_connector';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const decodePart = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** Header and payload of a JWT, unverified. */
export function decodeJwt(token) {
  const [h, p] = String(token).split('.');
  return { header: decodePart(h), payload: decodePart(p) };
}

/** True when the JWT's signature verifies against the JWKS key with its `kid` (ES256 or RS256). */
export async function verifyJwt(token, jwks) {
  const [h, p, s] = token.split('.');
  const { alg, kid } = decodePart(h);
  const jwk = (jwks.keys ?? []).find((k) => k.kid === kid);
  if (!jwk) return false;
  const params =
    alg === 'ES256' ? [{ name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' }]
    : alg === 'RS256' ? [{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, { name: 'RSASSA-PKCS1-v1_5' }]
    : null;
  if (!params) return false;
  const pub = { ...jwk };
  delete pub.d;
  const key = await webcrypto.subtle.importKey('jwk', pub, params[0], false, ['verify']);
  return webcrypto.subtle.verify(params[1], key, Buffer.from(s, 'base64url'), Buffer.from(`${h}.${p}`));
}

export function isLocalUrl(url) {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The stack's URL and keys: the environment first, else `npx supabase@<pin> status -o json`. */
export function localStack(env = process.env) {
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY) {
    return { apiUrl: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY };
  }
  const out = execFileSync('npx', ['-y', `supabase@${PINNED_CLI}`, 'status', '-o', 'json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
    windowsHide: true,
  });
  const status = JSON.parse(out.slice(out.indexOf('{')));
  return { apiUrl: status.API_URL, anonKey: status.ANON_KEY, serviceKey: status.SERVICE_ROLE_KEY };
}

async function call(url, { method = 'GET', headers = {}, json, form, redirect = 'follow' } = {}) {
  const init = { method, headers: { ...headers }, redirect };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (form) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(form).toString();
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: keep the text */
  }
  return { status: res.status, location: res.headers.get('location'), body };
}

/** One line of evidence for a probe answer: status and the error code or message, never a token. */
const brief = (r) => {
  const b = r.body && typeof r.body === 'object' ? r.body : {};
  const why = b.code ?? b.error_code ?? b.error ?? b.statusCode ?? '';
  const msg = b.message ?? b.msg ?? b.error_description ?? (typeof r.body === 'string' ? r.body.slice(0, 120) : '');
  return `${r.status}${why ? ` ${why}` : ''}${msg ? ` - ${msg}` : ''}`;
};

/**
 * Run the whole flow and return the evidence. `checks` holds what AC-1 and decision 4 require
 * (each { ok, detail }); `findings` holds answers recorded for the next phases, not judged here.
 * @param {{ apiUrl: string, anonKey: string, serviceKey: string, log?: (line: string) => unknown }} stack
 * @returns {Promise<{ checks: Record<string, { ok: boolean, detail: string }>, findings: Record<string, string> }>}
 */
export async function runConnectorSpike({ apiUrl, anonKey, serviceKey, log = () => {} }) {
  if (!isLocalUrl(apiUrl)) throw new Error(`refusing ${apiUrl}: the spike runs against a local stack only`);
  const auth = `${apiUrl.replace(/\/$/, '')}/auth/v1`;
  const rest = `${apiUrl.replace(/\/$/, '')}/rest/v1`;
  const storage = `${apiUrl.replace(/\/$/, '')}/storage/v1`;
  const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const checks = {};
  const findings = {};
  const check = (name, ok, detail) => {
    checks[name] = { ok: Boolean(ok), detail };
    log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
  };
  const note = (name, detail) => {
    findings[name] = detail;
    log(`NOTE  ${name}: ${detail}`);
  };
  const cleanup = { userId: '', clients: [] };

  try {
    // 1. Discovery and keys.
    const disco = await call(`${auth}/.well-known/oauth-authorization-server`);
    const meta = disco.body ?? {};
    check(
      'discovery',
      disco.status === 200 && meta.registration_endpoint && (meta.code_challenge_methods_supported ?? []).includes('S256'),
      `${disco.status}; issuer ${meta.issuer}; registration ${meta.registration_endpoint ?? 'none'}; PKCE ${JSON.stringify(meta.code_challenge_methods_supported)}`,
    );
    if (disco.status !== 200) return { checks, findings };
    const rfc8414 = await call(`${new URL(apiUrl).origin}/.well-known/oauth-authorization-server/auth/v1`);
    note('discovery_path_inserted', `${new URL(apiUrl).origin}/.well-known/oauth-authorization-server/auth/v1 answers ${rfc8414.status} (RFC 8414 form a client derives from the issuer)`);
    const jwks = (await call(meta.jwks_uri ?? `${auth}/.well-known/jwks.json`)).body ?? { keys: [] };
    note('jwks', (jwks.keys ?? []).map((k) => `${k.kid} ${k.alg ?? k.kty}`).join(', ') || 'no keys');

    // 2. A throwaway account, and its first-party session (what the consent page holds).
    const email = `connector-spike-${Date.now()}@example.test`;
    const password = `spike-${b64url(randomBytes(9))}`;
    const created = await call(`${auth}/admin/users`, { method: 'POST', headers: admin, json: { email, password, email_confirm: true } });
    cleanup.userId = created.body?.id ?? '';
    const signedIn = await call(`${auth}/token?grant_type=password`, { method: 'POST', headers: { apikey: anonKey }, json: { email, password } });
    const userToken = signedIn.body?.access_token;
    const firstParty = userToken ? decodeJwt(userToken) : null;
    check(
      'first_party_session',
      Boolean(userToken) && !firstParty.payload.client_id && firstParty.payload.role === 'authenticated',
      userToken ? `alg ${firstParty.header.alg}; role ${firstParty.payload.role}; client_id ${firstParty.payload.client_id ?? 'absent'}` : brief(signedIn),
    );
    if (!userToken) return { checks, findings };

    // 3. Dynamic client registration, no apikey: a chat client has none.
    const redirectUri = 'http://127.0.0.1:53682/callback';
    const reg = await call(meta.registration_endpoint, {
      method: 'POST',
      json: {
        client_name: 'NoaCG connector spike',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
    });
    const clientId = reg.body?.client_id;
    if (clientId) cleanup.clients.push(clientId);
    check('dynamic_registration', reg.status === 201 && clientId, clientId ? `${reg.status}; client_id ${clientId}` : brief(reg));
    if (!clientId) return { checks, findings };

    // 4. Authorization code flow with PKCE.
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const state = b64url(randomBytes(12));
    const authorizeUrl = new URL(meta.authorization_endpoint);
    for (const [k, v] of Object.entries({
      response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
      code_challenge: challenge, code_challenge_method: 'S256', state, scope: 'openid email',
    })) authorizeUrl.searchParams.set(k, v);
    const authorize = await call(authorizeUrl.href, { redirect: 'manual' });
    const consentUrl = authorize.location ? new URL(authorize.location) : null;
    const authorizationId = consentUrl?.searchParams.get('authorization_id');
    check(
      'authorize_redirects_to_consent',
      authorize.status === 302 && authorizationId,
      authorizationId ? `302 to ${consentUrl.origin}${consentUrl.pathname}?authorization_id=…` : `${brief(authorize)} location ${authorize.location}`,
    );
    if (!authorizationId) return { checks, findings };

    // What the consent page does, with the signed-in account's own session.
    const asPage = { apikey: anonKey, Authorization: `Bearer ${userToken}`, Origin: consentUrl.origin };
    const details = await call(`${auth}/oauth/authorizations/${authorizationId}`, { headers: asPage });
    note('consent_details', details.status === 200
      ? `client "${details.body?.client?.name}", scope "${details.body?.scope}", redirect ${details.body?.redirect_uri}`
      : brief(details));
    const consent = await call(`${auth}/oauth/authorizations/${authorizationId}/consent`, { method: 'POST', headers: asPage, json: { action: 'approve' } });
    const back = consent.body?.redirect_url ? new URL(consent.body.redirect_url) : null;
    const code = back?.searchParams.get('code');
    check(
      'consent_returns_code',
      code && back.searchParams.get('state') === state && back.href.startsWith(redirectUri),
      code ? `redirect to ${back.origin}${back.pathname} with code and the same state` : brief(consent),
    );
    if (!code) return { checks, findings };

    // 5. Exchange the code with the verifier (form-encoded, public client).
    const token = await call(meta.token_endpoint, {
      method: 'POST',
      form: { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier },
    });
    const accessToken = token.body?.access_token;
    const claims = accessToken ? decodeJwt(accessToken) : null;
    check(
      'token_carries_client_id',
      accessToken && claims.payload.client_id === clientId && claims.payload.sub === cleanup.userId,
      accessToken
        ? `client_id ${claims.payload.client_id}; sub is the test account; aud ${JSON.stringify(claims.payload.aud)}; scope "${claims.payload.scope ?? ''}"; refresh token ${token.body.refresh_token ? 'issued' : 'absent'}; id_token ${token.body.id_token ? 'issued' : 'absent'}`
        : brief(token),
    );
    if (!accessToken) return { checks, findings };
    const verified = await verifyJwt(accessToken, jwks);
    check('token_signed_asymmetric', verified && claims.header.alg !== 'HS256', `alg ${claims.header.alg}, kid ${claims.header.kid}, signature ${verified ? 'verifies' : 'does NOT verify'} against the JWKS`);

    // 6. Decision 4: the token boundary.
    check('connector_role', claims.payload.role === CONNECTOR_ROLE, `role claim "${claims.payload.role}" (hook ${claims.payload.role === CONNECTOR_ROLE ? 'applied' : 'not applied'})`);
    const asConnector = { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
    const asUser = { apikey: anonKey, Authorization: `Bearer ${userToken}` };
    const userRead = await call(`${rest}/documents?select=id&limit=1`, { headers: asUser });
    const read = await call(`${rest}/documents?select=id&limit=1`, { headers: asConnector });
    const write = await call(`${rest}/documents`, { method: 'POST', headers: { ...asConnector, Prefer: 'return=minimal' }, json: {} });
    const rpc = await call(`${rest}/rpc/control_show_by_slug`, { method: 'POST', headers: asConnector, json: { p_slug: 'connector-spike' } });
    const rpcAnon = await call(`${rest}/rpc/control_show_by_slug`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, json: { p_slug: 'connector-spike' } });
    const objects = await call(`${storage}/object/list/user-assets`, { method: 'POST', headers: asConnector, json: { prefix: '', limit: 1 } });
    const refused = (r) => r.status === 401 || r.status === 403;
    check('first_party_rest_allowed', userRead.status === 200, `GET documents with a first-party token: ${brief(userRead)}`);
    check(
      'connector_rest_refused',
      refused(read) && refused(write) && refused(rpc) && objects.status >= 400,
      `GET documents ${brief(read)} | POST documents ${brief(write)} | rpc control_show_by_slug ${brief(rpc)} (anon key alone: ${rpcAnon.status}) | storage list user-assets ${brief(objects)}`,
    );

    // Auth's own account endpoints read the session, not the role: recorded for phase 2.
    const me = await call(`${auth}/user`, { headers: asConnector });
    const meUpdate = await call(`${auth}/user`, { method: 'PUT', headers: asConnector, json: { data: { connector_spike_probe: true } } });
    note('auth_user_endpoint_with_connector_token', `GET /auth/v1/user ${brief(me)} | PUT /auth/v1/user (user_metadata) ${brief(meUpdate)}`);

    // Refresh: the new token keeps client_id and the hook's role.
    const refreshed = await call(meta.token_endpoint, {
      method: 'POST',
      form: { grant_type: 'refresh_token', refresh_token: token.body.refresh_token ?? '', client_id: clientId },
    });
    const rClaims = refreshed.body?.access_token ? decodeJwt(refreshed.body.access_token).payload : null;
    check(
      'refresh_keeps_boundary',
      rClaims && rClaims.client_id === clientId && rClaims.role === CONNECTOR_ROLE && refreshed.body.refresh_token !== token.body.refresh_token,
      rClaims ? `client_id ${rClaims.client_id === clientId ? 'kept' : 'lost'}; role "${rClaims.role}"; refresh token ${refreshed.body.refresh_token !== token.body.refresh_token ? 'rotated' : 'reused'}` : brief(refreshed),
    );

    // 7. Port-agnostic loopback: Claude Code's callback is http://localhost:<any port>/callback.
    const loopReg = await call(meta.registration_endpoint, {
      method: 'POST',
      json: { client_name: 'NoaCG connector spike (loopback)', redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'], token_endpoint_auth_method: 'none' },
    });
    if (loopReg.body?.client_id) cleanup.clients.push(loopReg.body.client_id);
    const tryRedirect = async (uri) => {
      const u = new URL(meta.authorization_endpoint);
      for (const [k, v] of Object.entries({ response_type: 'code', client_id: loopReg.body?.client_id ?? '', redirect_uri: uri, code_challenge: challenge, code_challenge_method: 'S256' })) u.searchParams.set(k, v);
      const r = await call(u.href, { redirect: 'manual' });
      return r.status === 302 && r.location?.includes('authorization_id=') ? 'accepted' : `refused (${brief(r)})`;
    };
    note(
      'loopback_port_agnostic',
      loopReg.body?.client_id
        ? `registered without a port: localhost:49152 ${await tryRedirect('http://localhost:49152/callback')}, 127.0.0.1:49152 ${await tryRedirect('http://127.0.0.1:49152/callback')}, exact http://localhost/callback ${await tryRedirect('http://localhost/callback')}; registered with its port (step 3, as a client that registers per connection does): accepted`
        : `registration without a port: ${brief(loopReg)}`,
    );
  } finally {
    for (const id of cleanup.clients) await call(`${auth}/admin/oauth/clients/${id}`, { method: 'DELETE', headers: admin }).catch(() => {});
    if (cleanup.userId) await call(`${auth}/admin/users/${cleanup.userId}`, { method: 'DELETE', headers: admin }).catch(() => {});
  }
  return { checks, findings };
}

/** The steps every run must pass. */
export const REQUIRED_CHECKS = [
  'discovery', 'first_party_session', 'dynamic_registration', 'authorize_redirects_to_consent',
  'consent_returns_code', 'token_carries_client_id', 'token_signed_asymmetric', 'connector_role',
  'first_party_rest_allowed', 'connector_rest_refused', 'refresh_keeps_boundary',
];

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const json = process.argv.includes('--json');
  let stack;
  try {
    stack = localStack();
  } catch {
    console.error(`No local stack answered. Start one with: npx supabase@${PINNED_CLI} start`);
    process.exit(1);
  }
  const report = await runConnectorSpike({ ...stack, log: json ? () => {} : (line) => console.log(line) });
  const missing = REQUIRED_CHECKS.filter((name) => !report.checks[name]?.ok);
  if (json) console.log(JSON.stringify(report, null, 2));
  console.log(missing.length ? `\nFAILED: ${missing.join(', ')}` : `\nAll ${REQUIRED_CHECKS.length} required checks pass.`);
  process.exit(missing.length ? 1 : 0);
}
