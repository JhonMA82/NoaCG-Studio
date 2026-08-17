// Assemble a production package (model/productionPack.ts v1) from a pack source
// directory: packs/<pack>/manifest.json + one template.html/style.css/logic.js per
// graphic directory. Output: public/packs/<pack>.noacgpack.json (committed - the
// sample card fetches it as a static asset).
//
// This script gates what plain node CAN check: the SPX definition parses, every
// field has its element, names/layers/cue references line up, and the emitted JS
// stays inside the old-CEF envelope (no ?. / ??; CasparCG 2.3.x - docs/CLOUD_PLAYOUT.md §3).
// The full validateTemplate/bench gate runs at IMPORT (components/home/
// importProductionPack.ts), which e2e/production-pack.spec.ts drives against this
// very file - so a graphic that fails the real gate cannot silently ship.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const packDir = process.argv[2] ?? join(repo, 'packs', 'fight-night');
const packName = basename(packDir);
const outFile = join(repo, 'public', 'packs', `${packName}.noacgpack.json`);

const fail = (msg) => {
  console.error(`build-production-pack: ${msg}`);
  process.exit(1);
};

const manifest = JSON.parse(readFileSync(join(packDir, 'manifest.json'), 'utf8'));
if (!manifest.name || !Array.isArray(manifest.graphics) || manifest.graphics.length === 0) {
  fail('manifest.json needs a name and a non-empty graphics list');
}

/** Pull the SPXGCTemplateDefinition literal out of template.html (the first
 *  <script> block) so fields can be checked and carried as parsed data. */
function parseDefinition(html, slug) {
  const match = /window\.SPXGCTemplateDefinition\s*=\s*(\{[\s\S]*?\});\s*<\/script>/.exec(html);
  if (!match) fail(`${slug}: template.html carries no SPXGCTemplateDefinition`);
  let def;
  try {
    def = JSON.parse(
      match[1]
        .replace(/\/\/[^\n]*/g, '') // JSON with comments stripped
        .replace(/,\s*([}\]])/g, '$1'),
    );
  } catch (e) {
    fail(`${slug}: definition is not valid JSON (${e.message})`);
  }
  return def;
}

const names = new Set();
const graphics = manifest.graphics.map((entry) => {
  const { slug, name, layer } = entry;
  if (!slug || !name) fail('every graphics entry needs slug + name');
  if (names.has(name)) fail(`duplicate graphic name "${name}"`);
  names.add(name);

  const dir = join(packDir, slug);
  const html = readFileSync(join(dir, 'template.html'), 'utf8');
  const css = readFileSync(join(dir, 'style.css'), 'utf8');
  const js = readFileSync(join(dir, 'logic.js'), 'utf8');

  // Old-CEF envelope: CasparCG 2.3.x (~Chromium 65) rejects the whole file on ?. or ??.
  // Comments are stripped first - the rule is about CODE, and the files name the rule.
  const stripped = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const [file, code] of [['logic.js', js], ['template.html', html]]) {
    if (/\?\.|\?\?/.test(stripped(code))) fail(`${slug}/${file}: uses ?. or ?? (old-CEF rule)`);
  }

  const def = parseDefinition(html, slug);
  const fields = Array.isArray(def.DataFields) ? def.DataFields : [];
  const seen = new Set();
  for (const f of fields) {
    if (!f.field || seen.has(f.field)) fail(`${slug}: duplicate or missing field id "${f.field}"`);
    seen.add(f.field);
    if (!new RegExp(`id="${f.field}"`).test(html)) {
      fail(`${slug}: field ${f.field} has no element id="${f.field}" (the fN contract)`);
    }
  }

  const settings = { ...def };
  delete settings.DataFields;
  return {
    name,
    layer,
    template: {
      name,
      type: 'blank',
      resolution: { width: 1920, height: 1080, label: '1920×1080 (Full HD)' },
      fps: 50,
      html,
      css,
      js,
      fields,
      settings,
      assets: [],
      layers: [],
    },
  };
});

const cues = (manifest.cues ?? []).map((cue) => {
  if (!names.has(cue.graphic)) fail(`cue "${cue.label}" points at unknown graphic "${cue.graphic}"`);
  return cue;
});

const pack = {
  format: 'noacg-production-pack',
  v: 1,
  name: manifest.name,
  graphics,
  ...(cues.length ? { cues } : {}),
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(pack, null, 2) + '\n');
console.log(`built ${outFile} (${graphics.length} graphics, ${cues.length} cues)`);
