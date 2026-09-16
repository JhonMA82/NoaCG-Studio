// Stop / SubagentStop hook: a session that ends its turn WAITING on something that cannot wake it
// is told so, at that moment, and continues. The reasoning and the patterns live in
// scripts/stop-wait.mjs (the pure, tested half); this file is the shell around it.
//
// Cost: the message regexes run at every turn end and are microseconds. Git, the job store and the
// refusal count are read only when a wait is declared, which is rare, so an ordinary turn end pays
// nothing. Nothing expensive may move above the `declaresWait` line.

import { closeSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHookInput, warn, gitOutput } from './lib.mjs';
import { decide, declaresWait, lastAssistantText, MAX_REFUSALS } from '../stop-wait.mjs';

const input = await readHookInput();
if (!input) process.exit(0);

function readTail(file, bytes) {
  const size = statSync(file).size;
  const length = Math.min(size, bytes);
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buffer, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  return buffer.toString('utf8');
}

const text =
  typeof input.last_assistant_message === 'string'
    ? input.last_assistant_message
    : typeof input.transcript_path === 'string'
      ? lastAssistantText(input.transcript_path, { readTail })
      : null;

if (!declaresWait(text)) process.exit(0);

// Only now is anything expensive touched: the branch this session sits on, and whether the
// queue already holds it - a queued or landed branch needs nobody awake.
let landingState = null;
try {
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const branch = gitOutput(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])?.trim();
  if (branch && branch !== 'HEAD') {
    const { jobsDir, readJobs, landingStateFor } = await import('../jobs-store.mjs');
    const dir = jobsDir(); // the job store is per git common dir, shared by every worktree
    if (dir) landingState = landingStateFor(branch, readJobs(dir)).state;
  }
} catch {
  landingState = null; // fail open on the facts, never on the message
}

// HOW MANY TIMES THIS SESSION HAS ALREADY BEEN REFUSED. One small file per session or row, named by
// the id Claude Code gives it, under the scratchpad the harness already hands us (a per-session temp
// directory it cleans up), so two rows of the same wave never touch each other's count.
function refusalFile() {
  const key = String(input.agent_id || input.session_id || '').replace(/[^\w.-]/g, '');
  if (!key) return null;
  const base = typeof input.scratchpad_dir === 'string' && input.scratchpad_dir ? input.scratchpad_dir : tmpdir();
  const dir = join(base, 'stop-wait-refusals');
  mkdirSync(dir, { recursive: true });
  return join(dir, `${key}.count`);
}

let file = null;
let refusals = 0;
try {
  file = refusalFile();
  if (file) {
    const count = Number.parseInt(readFileSync(file, 'utf8'), 10);
    refusals = Number.isInteger(count) && count > 0 ? count : 0;
  }
} catch (error) {
  // A missing file is the ordinary first stop and reads as zero. Anything else means the count is
  // unavailable, and an uncountable guard must never become an endless one.
  if (error?.code !== 'ENOENT') file = null;
}
// Without a count, fall back to exactly what this hook did before the count existed: the harness's
// own `stop_hook_active` flag, which allows one refusal per session and can never loop.
if (!file) refusals = input.stop_hook_active === true ? MAX_REFUSALS : 0;

const message = decide({ text, refusals, landingState });
if (message) {
  let counted = true;
  try {
    writeFileSync(file, String(refusals + 1), 'utf8');
  } catch {
    counted = false;
  }
  // Refuse only when the refusal was recorded, or when the harness's flag is holding the line
  // instead. A refusal nobody counted, on a session nobody is counting, is how a row gets stuck.
  if (counted || input.stop_hook_active !== true) warn(message);
}
process.exit(0);
