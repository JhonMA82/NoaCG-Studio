// What the selector plans today for five representative change shapes (sprint focus on, traced map on, as CI runs it).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const planner = await import(pathToFileURL(join(ROOT, 'scripts/e2e-affected.mjs')).href);
const traced = await import(pathToFileURL(join(ROOT, 'scripts/e2e-traced.mjs')).href);
const map = traced.readTracedMap();
const minutes = JSON.parse(readFileSync(join(ROOT, 'scripts/e2e-durations.json'), 'utf8')).minutes;
const med = [...Object.values(minutes)].sort((a, b) => a - b)[Math.floor(Object.keys(minutes).length / 2)];
const scenarios = {
  'playout-only (CueRundown.tsx + playout-dashboard.css)': ['src/components/home/CueRundown.tsx', 'src/styles/playout-dashboard.css'],
  'playout-only (CueRundown.tsx alone)': ['src/components/home/CueRundown.tsx'],
  'one catalog template added (new file src/templates/lowerThirds/lt99.ts + catalog registration)': ['src/templates/lowerThirds/lt99.ts', 'src/templates/catalog.ts'],
  'one catalog template added (new file only)': ['src/templates/lowerThirds/lt99.ts'],
  'editor-only (EditorFoundation.tsx + foundation.css)': ['src/components/editorFoundation/EditorFoundation.tsx', 'src/components/editorFoundation/foundation.css'],
  'editor-only (commandAdapter.ts)': ['src/components/editorFoundation/commandAdapter.ts'],
  'shared model (src/model/structure.ts)': ['src/model/structure.ts'],
  'shared rendering (src/preview/settleGraphic.ts)': ['src/preview/settleGraphic.ts'],
  'shared storage (src/store/templateStore.ts)': ['src/store/templateStore.ts'],
  'uncertain impact (new src/sync/replication.ts, no covers line)': ['src/sync/replication.ts'],
  'uncertain impact (new helper e2e/_newhelper.ts)': ['e2e/_newhelper.ts'],
  'docs only': ['docs/GOALS.md'],
};
for (const [name, files] of Object.entries(scenarios)) {
  for (const focus of [true, false]) {
    const p = planner.planFor(files, { sprintFocus: focus, traced: map });
    const specs = p.mode === 'full' ? Object.keys(minutes) : p.specs;
    const mins = specs.reduce((a, s) => a + (minutes[s] ?? med), 0);
    const sh = planner.shardsFor({ mode: p.mode, specs: p.specs });
    console.log(`${focus ? '[focus on ]' : '[focus off]'} ${name}: mode=${p.mode}${p.focusApplied ? '+focus' : ''} specs=${specs.length} table-min=${mins.toFixed(1)} shards=${sh} catalog=${p.catalog} unmapped=${JSON.stringify(p.unmapped)} traceOnly=${(p.traced && p.traced.added ? p.traced.added.length : 0)}`);
  }
}
