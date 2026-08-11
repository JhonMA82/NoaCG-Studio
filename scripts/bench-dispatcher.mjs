// Preloaded into the BENCH dev server only (scripts/dev-bench.mjs spawns Vite with
// `--import` pointing here). Nothing in the app, the api/ functions, or the ordinary
// `npm run dev` server loads it.
//
// WHAT IT FIXES. Node's global fetch is undici, and undici gives up after 300 s waiting for
// response HEADERS (`UND_ERR_HEADERS_TIMEOUT`). That limit is invisible from the calling code:
// it is not our AbortController, so `api/_lib/aiGateway.ts` cannot see it as a timeout and
// reports the generic "The AI provider could not be reached" instead - which is what the Phase
// 0 round reported, 24 times, after the surface's own 900 s timeout had already been raised.
//
// A non-streaming chat completion sends NO headers until the model has finished, so the
// header wait is the whole generation. Measured 2026-08-11 on the spike's real prompt:
// `moonshotai/kimi-k3` takes 235 s on the exemplar arm before a single byte comes back, and a
// repair round sends that prompt PLUS the full current template, so the wall is not
// theoretical - it sits just above the number the round has to clear.
//
// WHY HERE AND NOT IN api/. Production wants the 300 s ceiling: every managed surface answers
// a user who is waiting, and a serverless function has its own limit regardless. This is a
// background bench run against reasoning checkpoints that think for minutes. Widening the
// limit for the bench server is the containment; widening it in shared code would change how
// long a real user's failing generation hangs.

import { Agent, setGlobalDispatcher } from 'undici';

/** Fifteen minutes, matching the spike surface's own `timeoutMs` in
 *  api/_lib/aiSurfacePolicy.ts. The AbortController there stays the real bound - this only
 *  stops undici from cutting the connection first, so a run's timeout is decided in one place
 *  that a reader can find. */
const BENCH_TIMEOUT_MS = 900_000;

setGlobalDispatcher(new Agent({
  headersTimeout: BENCH_TIMEOUT_MS,
  bodyTimeout: BENCH_TIMEOUT_MS,
}));

console.log(`[bench] undici header/body timeout raised to ${BENCH_TIMEOUT_MS / 1000}s for this server`);
