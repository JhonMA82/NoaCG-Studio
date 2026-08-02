// Import-robustness sweep over the local spx_examples corpus (docs/SPX_EXAMPLES_CORPUS.md).
//
// Runs every real-world SPX template through the SAME import path a user's dropped file
// takes (model/importTemplate.ts importHtmlTemplate, with sibling css/js gathered the way
// importZipTemplate would) plus parseDefinition and validateTemplate, and reports parse
// coverage: definitions found vs present, fields extracted, lifecycle detected, crashes.
//
// The corpus is licence-restricted reference material and NEVER enters the repo or CI:
// this script runs by hand, on a machine that has the folder, against a running dev server
// (Vite serves the source modules - the l3-sweep driving pattern).
//
//   node scripts/spx-corpus-sweep.mjs [corpus-dir] [out-dir]
//
// corpus-dir defaults to <repo-root>/spx_examples; the script exits 0 with a note when the
// folder is absent, so it is safe to invoke anywhere. out-dir (default ./spx-corpus-out,
// gitignored) receives report.json with the per-file rows.

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { devPort } from './dev-port.mjs';

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const corpusDir = resolve(process.argv[2] || join(repoRoot, 'spx_examples'));
const outDir = resolve(process.argv[3] || './spx-corpus-out');

if (!existsSync(corpusDir)) {
  console.log(`spx-corpus-sweep: corpus not present at ${corpusDir} - nothing to do.`);
  process.exit(0);
}

// ---------- collect templates ----------

/** Recursively list .html files under dir (skips zips' contents by construction - they are files). */
function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...htmlFiles(p));
    else if (/\.html?$/i.test(name)) out.push(p);
  }
  return out;
}

const files = htmlFiles(join(corpusDir, 'templates'));
console.log(`spx-corpus-sweep: ${files.length} .html files under ${relative(process.cwd(), corpusDir)}\\templates`);

// Vendor libraries the zip importer would keep out of the JS pane, plus the interface file
// it deliberately skips. For DIALECT detection we still read spx_interface.js separately -
// that is where update()/play() usually live in the wild.
const VENDOR_JS = /(?:^|\/)(?:gsap[^/]*|anime[^/]*|jquery[^/]*|lottie[^/]*|bodymovin[^/]*|moment[^/]*|splitting[^/]*|webcg[^/]*|jsmovieclip[^/]*|axios[^/]*|granim[^/]*|lodash[^/]*|chroma[^/]*|color2k[^/]*)\.js$/i;
const INTERFACE_JS = /spx_interface\.js$/i;

/** Gather the sibling css/js a zip of this template's folder would carry into the import. */
function gatherSiblings(htmlPath, raw) {
  const base = dirname(htmlPath);
  const css = [];
  const js = [];
  const interfaceJs = [];
  const refs = [
    ...[...raw.matchAll(/<link\b[^>]*href=["']([^"']+\.css)["']/gi)].map((m) => m[1]),
    ...[...raw.matchAll(/<script\b[^>]*src=["']([^"']+\.js)["']/gi)].map((m) => m[1]),
  ];
  for (const ref of refs) {
    if (/^(?:https?:)?\/\//i.test(ref)) continue; // CDN reference - reported via rawExternalRefs
    const p = resolve(base, ref.replace(/^\.\//, ''));
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    if (/\.css$/i.test(p)) css.push(text);
    else if (INTERFACE_JS.test(ref)) interfaceJs.push(text);
    else if (!VENDOR_JS.test(ref)) js.push(text);
  }
  return { css: css.join('\n\n'), js: js.join('\n\n'), interfaceJs: interfaceJs.join('\n\n') };
}

// ---------- drive the real import modules through the dev server ----------

const port = devPort();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
try {
  await page.goto(`http://localhost:${port}/app`, { waitUntil: 'domcontentloaded', timeout: 15000 });
} catch {
  console.error(`spx-corpus-sweep: no dev server on port ${port} - start it first (npm run dev).`);
  await browser.close();
  process.exit(1);
}

const rows = [];
for (const file of files) {
  const rel = relative(join(corpusDir, 'templates'), file).replaceAll('\\', '/');
  const raw = readFileSync(file, 'utf8');
  const extra = gatherSiblings(file, raw);
  const row = await page.evaluate(async ({ rel, raw, extra }) => {
    const { importHtmlTemplate } = await import('/src/model/importTemplate.ts');
    const { parseDefinition } = await import('/src/model/spxDefinition.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');

    const r = { file: rel };
    r.rawHasDef = /SPXGCTemplateDefinition/.test(raw);
    r.bytes = raw.length;

    try {
      const def = parseDefinition(raw);
      r.defParsed = def !== null;
      if (def) {
        r.fieldCount = def.fields.length;
        r.ftypes = [...new Set(def.fields.map((f) => f.ftype))].sort();
        r.steps = def.settings.steps;
        r.out = def.settings.out;
      }
    } catch (e) {
      r.defCrash = String(e && e.message ? e.message : e);
    }

    try {
      const { template, detection } = importHtmlTemplate(rel, raw, { css: extra.css, js: extra.js });
      r.importedFields = template.fields.length;
      r.resolution = detection.resolution ? `${detection.resolution.width}x${detection.resolution.height}` : null;
      const allJs = [template.js, extra.interfaceJs, template.html].join('\n');
      r.lifecycle = ['update', 'play', 'stop', 'next'].filter((fn) =>
        new RegExp(`function\\s+${fn}\\s*\\(|window\\.${fn}\\s*=`).test(allJs));
      r.hasRunTemplateUpdate = /runTemplateUpdate/.test(allJs);
      r.hiddenHolder = /id=["'](?:hiddenSpxData|SPXdataFields|dataFields)["']/.test(template.html);
      try {
        const v = validateTemplate(template);
        r.valid = v.ok;
        r.errorRules = [...new Set((v.errors || []).map((e) => e.rule))].sort();
      } catch (e) {
        r.validateCrash = String(e && e.message ? e.message : e);
      }
    } catch (e) {
      r.importCrash = String(e && e.message ? e.message : e);
    }
    return r;
  }, { rel, raw, extra });
  rows.push(row);
}
await browser.close();

// ---------- report ----------

const withDef = rows.filter((r) => r.rawHasDef);
const parsed = withDef.filter((r) => r.defParsed);
const parseMisses = withDef.filter((r) => !r.defParsed && !r.defCrash);
const crashes = rows.filter((r) => r.defCrash || r.importCrash || r.validateCrash);
const noFields = parsed.filter((r) => r.fieldCount === 0);
const lifecycleless = withDef.filter((r) => r.lifecycle && r.lifecycle.length === 0);

const count = (sel) => {
  const m = new Map();
  for (const r of rows) for (const k of sel(r) || []) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`\n=== spx-corpus-sweep ===`);
console.log(`files: ${rows.length}, with a definition: ${withDef.length}, parsed: ${parsed.length}`);
console.log(`definition present but NOT parsed: ${parseMisses.length}`);
for (const r of parseMisses) console.log(`  MISS  ${r.file}`);
console.log(`crashes (import/parse/validate threw): ${crashes.length}`);
for (const r of crashes) console.log(`  CRASH ${r.file}: ${r.defCrash || r.importCrash || r.validateCrash}`);
console.log(`parsed definitions with zero fields: ${noFields.length}`);
for (const r of noFields) console.log(`  0-FIELDS ${r.file}`);
console.log(`templates with a definition but no detectable lifecycle fn: ${lifecycleless.length}`);
console.log(`hidden data-holder dialect: ${rows.filter((r) => r.hiddenHolder).length}`);
console.log(`\nftype coverage (files):`);
for (const [k, n] of count((r) => r.ftypes)) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log(`\ntop validation error rules (foreign templates fail house rules by design):`);
for (const [k, n] of count((r) => r.errorRules).slice(0, 12)) console.log(`  ${String(n).padStart(4)}  ${k}`);

mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, 'report.json');
writeFileSync(reportPath, JSON.stringify({ generatedFrom: corpusDir, rows }, null, 2));
console.log(`\nfull rows -> ${relative(process.cwd(), reportPath)}`);
