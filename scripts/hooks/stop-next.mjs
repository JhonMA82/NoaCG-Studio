// Stop hook: leaves a "what's next" menu behind before the session goes idle, so coming back
// to it later starts with concrete options instead of a blank prompt.
//
// Stop fires after every assistant turn, not only when a whole task is done - so this would
// block unconditionally if it didn't check anything. Two situations make that wrong:
//
//   1. The turn just launched work that is still running in the background (a backgrounded
//      Bash/PowerShell command, an Agent, a Workflow, or a /loop's ScheduleWakeup). Forcing
//      /next here produces a plan based on an incomplete picture, and the natural completion
//      notification will bring the session back on its own - the Stop hook fires again then,
//      with an accurate picture.
//   2. The turn just ran the safe-merge workflow. Its own flow already ends with a report, and
//      its guarded cleanup can remove the very worktree this hook would be running /next in -
//      forcing another summary immediately after is redundant at best and broken at worst.
//
// `stop_hook_active` tells us this is the second attempt in the same chain (Claude Code
// already honored one block here); only ever block once per stop, or this loops forever.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { deny, readHookInput } from './lib.mjs';

// Skill invocations whose own flow already provides closure - forcing /next right after is
// redundant noise, or (safe-merge's cleanup) can even run in a worktree that no longer exists.
const SKIP_AFTER_SKILLS = new Set(['safe-merge']);

// Only run as the hook (reading stdin, calling process.exit) when invoked directly - importing
// this module for its exported helper (e.g. from tests) must not trigger any of that.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

async function main() {
  const input = await readHookInput();
  if (input?.stop_hook_active) process.exit(0); // already blocked once this chain - let it stop

  if (await hasReasonToSkip(input?.transcript_path)) process.exit(0);

  deny(
    'Before actually stopping: invoke the Skill tool with skill: "next" now to leave the user a ' +
      'menu of next-step options for when they return to this session, then stop.',
  );
}

/**
 * True when the most recent turn (since the last real user message) shows work still in
 * flight, or just ran a skill whose own flow already closes the loop. Fails safe: any missing
 * or unreadable transcript, or any shape we don't recognize, returns false so behavior falls
 * back to today's unconditional block rather than silently skipping /next.
 */
export async function hasReasonToSkip(transcriptPath) {
  if (!transcriptPath) return false;

  let entries;
  try {
    const raw = await readFile(transcriptPath, 'utf8');
    entries = raw
      .split('\n')
      .filter(Boolean)
      .map(safeParse)
      .filter(Boolean);
  } catch {
    return false;
  }

  const currentTurnBlocks = collectCurrentTurnBlocks(entries);
  const toolCalls = currentTurnBlocks.filter((block) => block?.type === 'tool_use');

  return toolCalls.some(isInFlightOrSelfClosing);
}

/** Content blocks from every message since the last real (human-authored) user turn. */
function collectCurrentTurnBlocks(entries) {
  const blocks = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (isRealUserMessage(entry)) break;
    const content = entry?.message?.content;
    if (Array.isArray(content)) blocks.push(...content);
  }
  return blocks;
}

/**
 * A genuine human prompt, as opposed to a synthetic "user" entry the harness injects for a
 * tool_result, a Skill/slash-command body substitution, or Stop-hook feedback. All three of
 * those synthetic kinds carry free `text` content indistinguishable from a real prompt by
 * shape alone - the harness marks them with `isMeta: true`, which a real human message (typed
 * text or a slash-command invocation) never has. Trust that flag over content shape.
 */
function isRealUserMessage(entry) {
  if (entry?.type !== 'user') return false;
  if (entry?.isMeta === true) return false;
  const content = entry?.message?.content;
  if (typeof content === 'string') return content.trim().length > 0;
  return Array.isArray(content) && content.some((block) => block?.type === 'text');
}

function isInFlightOrSelfClosing(call) {
  switch (call.name) {
    case 'Skill':
      return SKIP_AFTER_SKILLS.has(call.input?.skill);
    case 'Workflow':
      return true; // always runs in the background, per its own tool description
    case 'Agent':
      return call.input?.run_in_background !== false; // background by default
    case 'Bash':
    case 'PowerShell':
      return call.input?.run_in_background === true;
    case 'ScheduleWakeup':
      return call.input?.stop !== true; // scheduled a future wake - the loop is still live
    default:
      return false;
  }
}

function safeParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
