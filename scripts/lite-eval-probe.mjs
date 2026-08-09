// Ask this checkout's dev server what Lite would do for the eval identity, before anything is
// spent. scripts/ai-lite-eval.mjs makes the same call and aborts on it, but this costs nothing
// and separates "configuration is wrong" from "the round failed".
//
//   node scripts/lite-eval-probe.mjs
//
// The port comes from scripts/dev-port.mjs, so it follows this worktree's reservation rather
// than a number written down when the tool was last used.

import { devPort } from './dev-port.mjs';
import { benchEnv, benchEnvPath } from './lite-eval-paths.mjs';

const env = benchEnv();
const token = env.NOACG_LITE_EVAL_BEARER_TOKEN ?? '';
if (!token) {
  console.error(`${benchEnvPath()} carries no NOACG_LITE_EVAL_BEARER_TOKEN.`);
  console.error('Run scripts/bench-env.mjs then scripts/lite-eval-stamp.mjs first.');
  process.exit(1);
}

const port = process.env.DEV_PORT ?? devPort();
const url = `http://localhost:${port}/api/ai/lite/status`;
let response;
try {
  response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
} catch (error) {
  console.error(`${url} is not answering (${error.message}).`);
  console.error('Start the bench server first: npm run dev:bench');
  process.exit(1);
}

const body = await response.json().catch(() => null);
console.log(`HTTP ${response.status} from ${url}`);
console.log(JSON.stringify(body, null, 2));
process.exit(response.ok ? 0 : 1);
