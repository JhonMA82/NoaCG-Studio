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
