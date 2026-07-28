import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { hasReasonToSkip } from './stop-next.mjs';

function writeTranscript(t, lines) {
  const dir = mkdtempSync(join(tmpdir(), 'noacg-stop-next-'));
  const path = join(dir, 'transcript.jsonl');
  writeFileSync(path, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return path;
}

const userPrompt = (text) => ({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
const toolResult = (id) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id }] } });
const assistantToolUse = (name, input = {}, id = 'tool_1') => ({
  type: 'assistant',
  message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
});
// The harness's ACTUAL shape for a Skill/slash-command body and for Stop-hook feedback: a
// `type: 'user'` entry with plain `text` content - structurally identical to a real prompt -
// but flagged `isMeta: true`. A real transcript delivers this as TWO entries right after the
// Skill tool_use (a tool_result ack, then this body); tests below model both.
const skillBody = (text, sourceToolUseID) => ({
  type: 'user',
  isMeta: true,
  sourceToolUseID,
  message: { role: 'user', content: [{ type: 'text', text }] },
});
const hookFeedback = (text) => ({ type: 'user', isMeta: true, message: { role: 'user', content: [{ type: 'text', text }] } });
// A real human slash-command invocation (as opposed to the assistant calling the Skill tool):
// plain string content, no isMeta - indistinguishable in shape from typed free text.
const slashCommand = (text) => ({ type: 'user', message: { role: 'user', content: text } });

test('no transcript path - falls back to forcing /next', async () => {
  assert.equal(await hasReasonToSkip(undefined), false);
});

test('missing/unreadable transcript file - falls back to forcing /next', async () => {
  assert.equal(await hasReasonToSkip(join(tmpdir(), 'does-not-exist.jsonl')), false);
});

test('plain turn with no tool calls - forces /next', async (t) => {
  const path = writeTranscript(t, [userPrompt('do the thing'), { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } }]);
  assert.equal(await hasReasonToSkip(path), false);
});

test('backgrounded Bash command still in flight - skips /next', async (t) => {
  const path = writeTranscript(t, [
    userPrompt('run the e2e suite'),
    assistantToolUse('Bash', { command: 'npm run test:e2e', run_in_background: true }),
    toolResult('tool_1'),
  ]);
  assert.equal(await hasReasonToSkip(path), true);
});

test('foreground Bash command - forces /next', async (t) => {
  const path = writeTranscript(t, [
    userPrompt('run the build'),
    assistantToolUse('Bash', { command: 'npm run build' }),
    toolResult('tool_1'),
  ]);
  assert.equal(await hasReasonToSkip(path), false);
});

// Regression: a command started in the FOREGROUND (no run_in_background flag) can still end up
// running in the background if it overruns its own timeout - the harness auto-demotes it
// mid-call. The tool_use input never shows this; only the tool_result text does. This was
// missed by checking only `input.run_in_background`, so a still-running build got treated as
// "done" and the hook forced /next while the build the user was waiting on was still going.
test('a foreground command auto-demoted to background after timing out - skips /next', async (t) => {
  const path = writeTranscript(t, [
    userPrompt('run the build'),
    assistantToolUse('Bash', { command: 'npm run build' }, 'b1'),
    {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'b1',
            content:
              'Command did not complete within its 120s timeout and was moved to the background (ID: bikm0a660). Output is being written to: ...',
          },
        ],
      },
    },
  ]);
  assert.equal(await hasReasonToSkip(path), true);
});

test('a foreground command that finished normally (plain tool_result) - forces /next', async (t) => {
  const path = writeTranscript(t, [
    userPrompt('run the build'),
    assistantToolUse('Bash', { command: 'npm run build' }, 'b1'),
    toolResult('b1'),
  ]);
  assert.equal(await hasReasonToSkip(path), false);
});

test('Workflow call - always treated as in flight', async (t) => {
  const path = writeTranscript(t, [userPrompt('run a workflow'), assistantToolUse('Workflow', { script: '...' })]);
  assert.equal(await hasReasonToSkip(path), true);
});

test('background Agent (default) - skips /next', async (t) => {
  const path = writeTranscript(t, [userPrompt('spawn an agent'), assistantToolUse('Agent', { description: 'x', prompt: 'y' })]);
  assert.equal(await hasReasonToSkip(path), true);
});

test('foreground Agent (run_in_background: false) - forces /next', async (t) => {
  const path = writeTranscript(t, [
    userPrompt('spawn an agent'),
    assistantToolUse('Agent', { description: 'x', prompt: 'y', run_in_background: false }),
  ]);
  assert.equal(await hasReasonToSkip(path), false);
});

test('ScheduleWakeup without stop - a live /loop - skips /next', async (t) => {
  const path = writeTranscript(t, [
    userPrompt('/loop 5m /babysit-prs'),
    assistantToolUse('ScheduleWakeup', { delaySeconds: 300, prompt: '/babysit-prs', reason: 'polling' }),
  ]);
  assert.equal(await hasReasonToSkip(path), true);
});

test('ScheduleWakeup with stop: true - loop ended - forces /next', async (t) => {
  const path = writeTranscript(t, [userPrompt('/loop 5m /babysit-prs'), assistantToolUse('ScheduleWakeup', { stop: true })]);
  assert.equal(await hasReasonToSkip(path), false);
});

test('safe-merge skill invocation - skips /next', async (t) => {
  const path = writeTranscript(t, [userPrompt('/safe-merge'), assistantToolUse('Skill', { skill: 'safe-merge' })]);
  assert.equal(await hasReasonToSkip(path), true);
});

test('an unrelated skill invocation - forces /next', async (t) => {
  const path = writeTranscript(t, [userPrompt('/handoff'), assistantToolUse('Skill', { skill: 'handoff' })]);
  assert.equal(await hasReasonToSkip(path), false);
});

// Regression: the harness delivers a Skill call's own instructions back as a `type: 'user'`
// entry with plain `text` content (see skillBody() above) - structurally identical to a real
// prompt. An early version of isRealUserMessage() treated that as a turn boundary, which threw
// away the Skill(safe-merge) tool_use it was walking back to find, so the hook forced /next
// again immediately after a real safe-merge run. This models the actual sequence recorded in a
// live transcript: Skill tool_use -> tool_result ack -> isMeta skill-body text -> the many plain
// Bash calls safe-merge itself makes while running its phases.
test('safe-merge body substitution and its phases do not mask the original Skill call', async (t) => {
  const path = writeTranscript(t, [
    userPrompt('/safe-merge'),
    assistantToolUse('Skill', { skill: 'safe-merge' }, 'skill_1'),
    toolResult('skill_1'),
    skillBody('**First, check for a repo-specific version.** ...', 'skill_1'),
    assistantToolUse('Bash', { command: 'git fetch origin --prune' }, 'b1'),
    toolResult('b1'),
    assistantToolUse('Bash', { command: 'git push origin main' }, 'b2'),
    toolResult('b2'),
  ]);
  assert.equal(await hasReasonToSkip(path), true);
});

// Regression: Stop-hook feedback is also isMeta - it must not count as a turn boundary either,
// or a second stop attempt right after the hook's own denial would lose the very context (e.g.
// an in-flight background task) that made it deny in the first place.
test('Stop hook feedback does not mask in-flight work from before it', async (t) => {
  const path = writeTranscript(t, [
    userPrompt('run the e2e suite in the background'),
    assistantToolUse('Bash', { command: 'npm run test:e2e', run_in_background: true }, 'b1'),
    toolResult('b1'),
    hookFeedback('Stop hook feedback: [node scripts/hooks/stop-next.mjs]: Before actually stopping...'),
  ]);
  assert.equal(await hasReasonToSkip(path), true);
});

// A genuine slash-command invocation typed by the human (plain string content, no isMeta) is
// indistinguishable in shape from free text and must still reset the boundary - work from
// before the user's own new command should not leak into the freshly-started turn.
test('a real slash-command message still resets the boundary', async (t) => {
  const path = writeTranscript(t, [
    assistantToolUse('Bash', { command: 'npm run test:e2e', run_in_background: true }, 'old_1'),
    toolResult('old_1'),
    slashCommand('/next'),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } },
  ]);
  assert.equal(await hasReasonToSkip(path), false);
});

test('only looks at blocks since the last real user message', async (t) => {
  const path = writeTranscript(t, [
    assistantToolUse('Bash', { command: 'npm run test:e2e', run_in_background: true }, 'old_1'),
    toolResult('old_1'),
    userPrompt('now do something unrelated'),
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } },
  ]);
  assert.equal(await hasReasonToSkip(path), false);
});

test('malformed JSON lines are skipped rather than crashing', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'noacg-stop-next-'));
  const path = join(dir, 'transcript.jsonl');
  writeFileSync(path, 'not json\n' + JSON.stringify(userPrompt('hi')) + '\n');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(await hasReasonToSkip(path), false);
});
