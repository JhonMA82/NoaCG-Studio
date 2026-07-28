import assert from 'node:assert/strict';
import test from 'node:test';
import { machineScore } from './video-benchmark-scoring.mjs';

test('a rejected generation receives no credit from the mounted fallback source', () => {
  assert.equal(machineScore({
    ok: false,
    gate: { ok: true, probed: true },
    render: { attempted: true, ok: true },
    issues: [],
    deadVars: [],
    repairRounds: 2,
    automatedChecks: {
      generationSuccess: false,
      typeScriptBuildSuccess: true,
      engineCompatibility: true,
      visualCompleteness: true,
      dataFieldCorrectness: true,
    },
  }), 0);
});

test('a valid first-pass rendered generation receives full machine credit', () => {
  assert.equal(machineScore({
    ok: true,
    render: { attempted: true, ok: true },
    repairRounds: 0,
    automatedChecks: {
      generationSuccess: true,
      typeScriptBuildSuccess: true,
      engineCompatibility: true,
      visualCompleteness: true,
      dataFieldCorrectness: true,
    },
  }), 100);
});
