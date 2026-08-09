// Free semantic round: no provider, token, or external network calls. It compiles every locked
// decision through the production Lite pipeline and judges the rendered hold frame.
import path from 'node:path';
import { devPort } from './dev-port.mjs';
import { runCompileJobs } from './ai-lite-bench/compileRunner.mjs';
import { LITE_SEMANTIC_FIXTURES, LITE_SEMANTIC_FIXTURE_VERSION } from './ai-lite-semantic-fixtures.mjs';

const base = `http://localhost:${devPort()}`;
const jobs = LITE_SEMANTIC_FIXTURES.map((fixture) => ({
  id: fixture.id,
  arm: 'semantic-free',
  briefId: fixture.id,
  decision: fixture.decision,
}));
const { rows } = await runCompileJobs(jobs, {
  base,
  outDir: path.resolve(`./lite-bench-out/semantic-v${LITE_SEMANTIC_FIXTURE_VERSION}`),
  capture: false,
});

let failures = 0;
for (const row of rows) {
  const fixture = LITE_SEMANTIC_FIXTURES.find((item) => item.id === row.id);
  const relevant = fixture.expectedReferences.includes(row.variantId);
  const holdClean = (row.holdFindings ?? []).length === 0;
  if (!row.ok || !relevant || !holdClean) {
    failures += 1;
    console.error(`${row.id}: variant=${row.variantId}; rules=${row.ruleCodes.join(',')}; hold=${(row.holdFindings ?? []).join(',')}`);
  }
}
console.log(`Free Lite semantic benchmark v${LITE_SEMANTIC_FIXTURE_VERSION}: ${rows.length - failures}/${rows.length} category-correct, machine-valid, hold-clean.`);
if (failures) process.exitCode = 1;
