// Import-robustness sweep over the local spx_examples corpus (docs/SPX_EXAMPLES_CORPUS.md).
//
// Runs every real-world SPX template through BOTH import paths a user's dropped file can
// take and reports parse coverage - definitions found vs present, fields extracted,
// lifecycle detected, crashes - for each:
//
//   - the HTML path (importHtmlTemplate), with the sibling css/js a zip would carry;
//   - the ZIP path (importZipTemplate), driven from a real in-memory zip of the template's
//     own folder. It is NOT the same code: the zip importer picks the entry point itself,
//     concatenates EVERY .css and .js under the entry's folder rather than only the files
//     the markup references, rewrites `../` asset urls, and turns binaries into data URLs.
//     Every one of those is a place the two paths can disagree, and only the html one was
//     ever swept - so a template that imports cleanly when dropped as a file could still
//     break when the user drops the folder as a zip.
//
// The report ends with a DIFF section naming the templates where the zip path does worse.
// Pass --no-zip to run the html pass alone.
//
// The corpus is licence-restricted reference material and NEVER enters the repo or CI:
// this script runs by hand, on a machine that has the folder, against a running dev server
// (Vite serves the source modules - the l3-sweep driving pattern).
//
//   node scripts/spx-corpus-sweep.mjs [corpus-dir] [out-dir] [--no-zip]
//
// corpus-dir defaults to <repo-root>/spx_examples; the script exits 0 with a note when the
// folder is absent, so it is safe to invoke anywhere. out-dir (default ./spx-corpus-out,
// gitignored) receives report.json with the per-file rows.

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import JSZip from 'jszip';
import { devPort } from './dev-port.mjs';

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const runZip = !process.argv.includes('--no-zip');
const corpusDir = resolve(positional[0] || join(repoRoot, 'spx_examples'));
const outDir = resolve(positional[1] || './spx-corpus-out');

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

// ---------- build the zip a user would drop ----------

// The extensions importZipTemplate turns into bundled assets (its ASSET_MIME map). Anything
// else in the folder is carried into the zip only if it is .css/.js, which is what the
// importer concatenates.
const ZIP_ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|avif|woff2?|ttf|otf)$/i;
// Caps so one orchestra package's alpha WebM library cannot turn a sweep into a 1 GB run.
// Text is never capped - it is what the import path actually reads. Whatever a cap drops is
// COUNTED and printed, because a silent cap reads as "the whole folder was tested".
const ASSET_FILE_CAP = 256 * 1024;
const ZIP_ASSET_CAP = 4 * 1024 * 1024;

/**
 * Every file under dir, recursively - but NOT into a subdirectory that holds .html files of
 * its own. Those are other templates' folders, and pulling them in models a user who zipped
 * a whole vendor tree rather than one template. (importZipTemplate really would concatenate
 * all of it - `inBase` is a prefix test - but that is a different, rarer mistake and it
 * drowns the per-template signal this sweep is after.)
 */
function allFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) {
      out.push(p);
      continue;
    }
    if (readdirSync(p).some((n) => /\.html?$/i.test(n))) continue;
    out.push(...allFiles(p));
  }
  return out;
}

/**
 * A zip holding ONE template: its html at the zip root, plus the css/js/assets from its
 * folder at their relative paths. Sibling .html files are left out deliberately - the
 * importer picks its own entry (index.html first) and would otherwise test a different
 * template than the row says, which is also why the row stays 1:1 with the html pass.
 */
async function buildZip(htmlPath, raw) {
  const base = dirname(htmlPath);
  const zip = new JSZip();
  zip.file(htmlPath.slice(base.length + 1), raw);

  let assetBytes = 0;
  const omitted = [];
  for (const p of allFiles(base)) {
    if (p === htmlPath) continue;
    const rel = p.slice(base.length + 1).replaceAll('\\', '/');
    if (/\.html?$/i.test(p)) continue;
    if (/\.(css|js)$/i.test(p)) {
      zip.file(rel, readFileSync(p, 'utf8'));
      continue;
    }
    if (!ZIP_ASSET_EXT.test(p)) continue;
    const size = statSync(p).size;
    if (size > ASSET_FILE_CAP || assetBytes + size > ZIP_ASSET_CAP) {
      omitted.push({ path: rel, bytes: size });
      continue;
    }
    assetBytes += size;
    zip.file(rel, readFileSync(p));
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { base64: buf.toString('base64'), zipBytes: buf.length, assetsOmitted: omitted };
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
      const lifecycleIn = (js) => ['update', 'play', 'stop', 'next'].filter((fn) =>
        new RegExp(`function\\s+${fn}\\s*\\(|window\\.${fn}\\s*=`).test(js));
      // Two different questions. `lifecycle` includes spx_interface.js, which is where the
      // Softpix lineage keeps update()/play() - that is the DIALECT reading. But NEITHER
      // importer carries that file into the template, so `lifecycleInTemplate` is what the
      // user actually ends up with, and it is the only fair thing to compare the zip
      // against. Diffing the two would report the interface file as a zip regression.
      const allJs = [template.js, extra.interfaceJs, template.html].join('\n');
      r.lifecycle = lifecycleIn(allJs);
      r.lifecycleInTemplate = lifecycleIn([template.js, template.html].join('\n'));
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

  if (runZip) {
    const built = await buildZip(file, raw);
    row.zip = await page.evaluate(async ({ rel, base64 }) => {
      const { importZipTemplate } = await import('/src/model/importTemplate.ts');
      const { validateTemplate } = await import('/src/validation/validateTemplate.ts');

      const z = {};
      try {
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        const { template, detection } = await importZipTemplate(`${rel.split('/').pop()}.zip`, bytes.buffer);
        z.importedFields = template.fields.length;
        z.resolution = detection.resolution ? `${detection.resolution.width}x${detection.resolution.height}` : null;
        z.assetCount = template.assets ? template.assets.length : 0;
        z.jsBytes = template.js.length;
        // The predicted break: the zip importer concatenates every .js in the folder into
        // ONE classic script. A file written as an ES module lands here as bare import /
        // export statements, which is a SyntaxError the moment the preview runs it.
        z.moduleSyntaxInJs = /^[ \t]*(?:import|export)[\s{*]/m.test(template.js);
        z.lifecycle = ['update', 'play', 'stop', 'next'].filter((fn) =>
          new RegExp(`function\\s+${fn}\\s*\\(|window\\.${fn}\\s*=`).test(`${template.js}\n${template.html}`));
        try {
          const v = validateTemplate(template);
          z.valid = v.ok;
          z.errorRules = [...new Set((v.errors || []).map((e) => e.rule))].sort();
        } catch (e) {
          z.validateCrash = String(e && e.message ? e.message : e);
        }
      } catch (e) {
        z.importCrash = String(e && e.message ? e.message : e);
      }
      return z;
    }, { rel, base64: built.base64 });
    row.zip.zipBytes = built.zipBytes;
    row.zip.assetsOmitted = built.assetsOmitted;
  }

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

if (runZip) {
  const zipped = rows.filter((r) => r.zip);
  const zipCrashes = zipped.filter((r) => r.zip.importCrash || r.zip.validateCrash);
  const moduleJs = zipped.filter((r) => r.zip.moduleSyntaxInJs);
  // A template only counts as a REGRESSION where the html path did better, so a template
  // that is broken both ways stays out of this list - it is an import bug, not a zip bug.
  const worse = zipped.filter((r) => {
    if (r.importCrash) return false;
    const z = r.zip;
    if (z.importCrash || z.validateCrash) return true;
    if ((z.importedFields ?? 0) < (r.importedFields ?? 0)) return true;
    if ((z.lifecycle?.length ?? 0) < (r.lifecycleInTemplate?.length ?? 0)) return true;
    return r.valid === true && z.valid === false;
  });
  const omitting = zipped.filter((r) => r.zip.assetsOmitted?.length);
  const omittedFiles = omitting.reduce((n, r) => n + r.zip.assetsOmitted.length, 0);

  console.log(`\n=== zip path (importZipTemplate) ===`);
  console.log(`zips built: ${zipped.length}`);
  console.log(`crashes (import/validate threw): ${zipCrashes.length}`);
  for (const r of zipCrashes) console.log(`  CRASH ${r.file}: ${r.zip.importCrash || r.zip.validateCrash}`);
  console.log(`ES module syntax concatenated into the classic JS pane: ${moduleJs.length}`);
  for (const r of moduleJs) console.log(`  MODULE-JS ${r.file}`);
  console.log(`WORSE than the html path: ${worse.length}`);
  for (const r of worse) {
    const z = r.zip;
    const why = z.importCrash || z.validateCrash
      || `fields ${r.importedFields}->${z.importedFields}, lifecycle ${r.lifecycleInTemplate?.length}->${z.lifecycle?.length}, valid ${r.valid}->${z.valid}`;
    console.log(`  WORSE ${r.file}: ${why}`);
  }
  console.log(`assets left out by the size caps: ${omittedFiles} files across ${omitting.length} templates`);
}

mkdirSync(outDir, { recursive: true });
const reportPath = join(outDir, 'report.json');
writeFileSync(reportPath, JSON.stringify({ generatedFrom: corpusDir, rows }, null, 2));
console.log(`\nfull rows -> ${relative(process.cwd(), reportPath)}`);
