// Shared per-candidate dev-server orchestration for the paid benches.
//
// Both the Lite comparison and the vision suite need the same thing: the route under test
// is SERVER configuration (the runners never receive a model id, so they never see a key,
// a route or a provider body), which means varying the candidate means restarting the
// server with a different environment. vite.config.ts fills process.env from .env only for
// keys that are not already set, so an injected route wins while .env still supplies the
// secrets, and nothing here edits .env.

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { devPort } from './dev-port.mjs';

export const BASE = `http://localhost:${devPort()}`;

/** Read .env without loading it into this process: the bench needs the test-account
 *  credentials, not the provider keys. */
export async function readEnvFile() {
  const env = {};
  try {
    const raw = await readFile(path.resolve('.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) env[match[1]] = match[2].trim();
    }
  } catch { /* absent - the caller falls back to a hand-supplied token */ }
  return env;
}

/** Access tokens last about an hour and a full bench outruns that, so one minted at the
 *  start dies partway and takes the remaining candidates with it - after they were paid
 *  for. Callers mint per candidate. Credentials are the dedicated test account the
 *  configured e2e suite already uses (e2e/configured/_helpers.ts). */
export function tokenMinter(fileEnv) {
  const credentials = {
    url: process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || '',
    anon: process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || '',
    email: process.env.E2E_EMAIL || fileEnv.E2E_EMAIL || '',
    password: process.env.E2E_PASSWORD || fileEnv.E2E_PASSWORD || '',
  };
  const canMint = Object.values(credentials).every(Boolean);
  return {
    canMint,
    async freshToken(fallback = '') {
      if (!canMint) return fallback;
      const response = await fetch(`${credentials.url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: credentials.anon, 'content-type': 'application/json' },
        body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json();
      if (!body.access_token) throw new Error('could not mint a bench token');
      return body.access_token;
    },
  };
}

export function startServer(env) {
  return spawn('npm', ['run', 'dev'], { env: { ...process.env, ...env }, shell: true, stdio: 'ignore' });
}

/** The dev script is a WRAPPER, so killing the returned child kills the wrapper and
 *  orphans the server holding the port - once per candidate, until the next run fails on
 *  strictPort. Kill the whole tree. */
export function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
}

/** Poll a status endpoint until it reports the task is available. A status endpoint does
 *  not expose the model id (by design), so this proves the server is UP and configured -
 *  never which candidate it is serving. The injected environment is that evidence. */
export async function waitForReady(statusPath, token, budgetMs = 90_000) {
  const deadline = Date.now() + budgetMs;
  let lastReason = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}${statusPath}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) {
        const status = await response.json();
        if (status.available) return status;
        lastReason = status.reason ?? 'unavailable';
      } else {
        lastReason = `HTTP ${response.status}`;
      }
    } catch { /* still booting */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`dev server never became available (${lastReason})`);
}

/** Give the port time to release before the next candidate binds it: strictPort turns a
 *  late release into a hard failure rather than a silent reassignment. */
export const settlePort = () => new Promise((resolve) => setTimeout(resolve, 3000));
