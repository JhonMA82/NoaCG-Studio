#!/usr/bin/env node
// THE DESIGN-RULES AUDIT SWEEP (docs/DESIGN_RULES_PLAN.md §5 R1d) - the evidence the owner
// ratifies the number table on, gathered BEFORE anything hard-enforces.
//
//   node scripts/design-rules-audit-sweep.mjs [--catalog-only|--archive-only]
//       [--archive=C:/claude/noacg-lite-eval-archive] [--json=<file>] [--report=<file>]
//
// Two populations, one instrument set (the canonical rules in src/model/designRules.ts, read
// through the same spike instruments the iterate loop feeds from - nothing here re-states a
// number):
//
//   1. THE FULL SHIPPED CATALOG - every variant rendered at 1920x1080 with its own defaults
//      (the type-floor.mjs pattern). Answers: how many shipped designs does each rule fail?
//   2. THE ARCHIVED TYPE-SWEEP CELLS (typesweep-*-2026-08-18) - the 42 model cells re-rendered
//      from their archived final-round template.json plus the 7 catalog anchors rebuilt from
//      the catalog, joined against the owner's 49 blind verdicts (notes.md). Answers, per
//      rule: how many owner-PASSED cells would it have stopped (false positives) and how many
//      owner-FAILED cells would it have caught (true positives)?
//
// The report states every disagreement between the owner table and the catalog it indicts -
// and the table still wins for the round; the evidence goes to the owner (the plan's own
// sequencing rule). Browser-driving: take the machine's slot first (e2e-runs --wait).

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { devPort } from './dev-port.mjs';

const BASE = `http://localhost:${devPort()}`;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const ARCHIVE = value('archive') ?? 'C:/claude/noacg-lite-eval-archive';
const BLIND_DIR = path.join(ARCHIVE, 'typesweep-blind-final-2026-08-18');
const ROUND_DIRS = {
  'pro-iterate-out-minimax-m2.7-types': path.join(ARCHIVE, 'typesweep-minimax-2026-08-18'),
  'pro-iterate-out-gemini-3.7-flash-types': path.join(ARCHIVE, 'typesweep-gemini-2026-08-18'),
};
const BANK = path.resolve('benchmarks/pro/v1/custom/briefs.json');
const JSON_OUT = value('json') ?? null;
const REPORT = value('report') ?? 'benchmarks/design-rules/AUDIT-2026-08-19.md';
const NOTES = path.resolve('benchmarks/pro/evidence/round-2026-08-18-typesweep/notes.md');

// The same per-type anchor table the iterate runner's --anchors mode uses.
const ANCHOR_VARIANTS = {
  'lower-third': 'lt27',
  scoreboard: 'sb01',
  'quiz-board': 'qz01',
  ticker: 'tk01',
  'stat-panel': 'ig01',
  countdown: 'gt05',
  'podium-score': 'sb21',
};

/** Rules whose findings BLOCK under the ratified table, vs report-only warnings. */
const BLOCKING_RULES = [
  'text-under-size-floor', 'text-low-contrast', 'text-outside-safe-area',
  'mark-outside-safe-area', 'text-over-rule', 'lines-crowded', 'text-escapes-panel',
  'ticker-margins-uneven',
];
const WARNING_RULES = [
  'text-size-warning-band', 'text-unprotected-over-video', 'text-under-weight-floor',
  'hairline-functional-stroke', 'text-decorative-assumed',
];

const bank = JSON.parse(await readFile(BANK, 'utf8'));
const briefById = new Map(bank.briefs.map((b) => [b.id, b]));

// ── The owner's verdicts and the blind key ─────────────────────────────────────────────
const notes = await readFile(NOTES, 'utf8');
const verdicts = new Map();
for (const m of notes.matchAll(/^- \*\*X-(\d+)\*\* - ([A-Z*/]+(?:\s*\(soft\))?)/gm)) {
  const word = m[2];
  verdicts.set(`X-${m[1]}`, {
    word,
    airable: word.startsWith('AIR') || word.startsWith('OK*'),
  });
}
const keyHtml = await readFile(path.join(BLIND_DIR, 'key.html'), 'utf8');
const keyRows = [...keyHtml.matchAll(
  /<tr><td>(X-\d+)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td>\s*<td>([^<]*)<\/td><td>([^<]*)<\/td>/g,
)].map((m) => ({ id: m[1], round: m[2], model: m[3], cell: m[4], type: m[5] }));
if (keyRows.length !== 49) {
  console.error(`Expected 49 key rows, parsed ${keyRows.length} - the key format moved.`);
  process.exit(2);
}
for (const row of keyRows) {
  if (!verdicts.has(row.id)) {
    console.error(`No owner verdict parsed for ${row.id} - the notes format moved.`);
    process.exit(2);
  }
}

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first.`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.keyboard.press('Escape');

// One measurement function in the page, shared by both populations.
await page.evaluate(async () => {
  const bust = '?t=' + Date.now();
  window.__cat = await import('/src/templates/catalog.ts' + bust);
  window.__comp = await import('/src/preview/composeDocument.ts' + bust);
  window.__wiz = await import('/src/model/wizard.ts' + bust);
  window.__anchors = await import('/src/ai/spike/anchors.ts' + bust);
  const { measureReadability } = await import('/src/ai/spike/readabilityCheck.ts' + bust);
  const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts' + bust);
  const { measureTickerMargins } = await import('/src/ai/spike/tickerCheck.ts' + bust);
  window.__measureDoc = (doc, ticker) => {
    const readability = measureReadability(doc, { mode: 'standard', target: { profile: 'tv' } });
    const spacing = measureSpacing(doc, {});
    return {
      readability: {
        findings: readability.findings,
        readings: readability.readings,
      },
      collisions: spacing.findings.filter((f) => f.code === 'text-over-rule' || f.code === 'lines-crowded'),
      textEscapes: spacing.escapes.filter((e) => e.isText),
      ticker: ticker ? measureTickerMargins(doc) : null,
    };
  };
  window.__mountAndMeasure = async (template, data, opts = {}) => {
    document.getElementById('audit-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'audit-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = window.__comp.composeDocument(template);
    await new Promise((r) => { frame.onload = r; });
    await new Promise((r) => setTimeout(r, 250));
    const win = frame.contentWindow;
    let playError = null;
    try {
      if (data) win.update(JSON.stringify(data));
      win.play();
    } catch (e) {
      playError = String(e?.message ?? e).slice(0, 200);
    }
    await win.document.fonts.ready;
    await new Promise((r) => setTimeout(r, 1900));
    const hold = window.__measureDoc(win.document, Boolean(opts.ticker));
    const steps = [];
    for (let k = 1; k <= (opts.steps ?? 0); k += 1) {
      if (typeof win.next !== 'function') break;
      try { win.next(); } catch { break; }
      await new Promise((r) => setTimeout(r, 1300));
      steps.push({ step: k, ...window.__measureDoc(win.document, Boolean(opts.ticker)) });
    }
    frame.remove();
    return { playError, hold, steps };
  };
});

// ── Population 1: the full shipped catalog ─────────────────────────────────────────────
const catalogResults = [];
if (!flag('archive-only')) {
  const targets = await page.evaluate(() =>
    window.__wiz.CATEGORIES.flatMap((c) =>
      (window.__cat.CATALOG[c.id] || []).map((v) => ({ id: v.id, cat: c.id, name: v.name }))));
  console.log(`catalog sweep: ${targets.length} variants`);
  for (const t of targets) {
    if (t.cat === 'imported-design') continue; // the user's own artwork - not ours to hold to floors
    const measured = await page.evaluate(async ({ id, ticker }) => {
      const variant = window.__cat.variantById(id);
      if (!variant) return { error: 'gone' };
      let template;
      try {
        template = variant.create({});
      } catch (e) {
        return { error: String(e?.message ?? e).slice(0, 200) };
      }
      return window.__mountAndMeasure(template, null, { ticker });
    }, { id: t.id, ticker: /ticker/.test(t.cat) });
    catalogResults.push({ ...t, ...measured });
    if (catalogResults.length % 50 === 0) console.log(`  ...${catalogResults.length}`);
  }
}

// ── Population 2: the archived sweep cells against the owner's verdicts ────────────────
const archiveResults = [];
if (!flag('catalog-only')) {
  console.log(`archive sweep: ${keyRows.length} cells`);
  for (const row of keyRows) {
    const briefId = row.cell.split('.')[0];
    const entry = briefById.get(briefId);
    const declaredSteps = Math.min(entry?.brief.steps?.length ?? 0, 6);
    const ticker = row.type === 'ticker';
    let measured;
    if (row.round === 'pro-iterate-out-anchors') {
      // The anchors were never archived as code - they are catalog designs, rebuilt exactly
      // as the runner's --anchors mode builds them (the type's anchor variant + the brief's
      // own words, by field order).
      measured = await page.evaluate(async ({ variantId, brief, steps, ticker }) => {
        const variant = window.__cat.variantById(variantId);
        if (!variant) return { error: `variant ${variantId} gone` };
        const template = variant.create({});
        const sample = Object.values(window.__anchors.dataFor(brief));
        const text = template.fields.filter((f) => ['textfield', 'textarea', 'number'].includes(f.ftype));
        const data = Object.fromEntries(text.map((f, i) => [f.field, sample[i] ?? String(f.value ?? '')]));
        const presses = Math.max(0, (parseInt(template.settings.steps, 10) || 1) - 1);
        return window.__mountAndMeasure(template, data, { steps: Math.min(Math.max(steps, presses), 6), ticker });
      }, { variantId: ANCHOR_VARIANTS[row.type], brief: entry.brief, steps: declaredSteps, ticker });
    } else {
      const codeDir = path.join(ROUND_DIRS[row.round], 'code', row.cell);
      let rounds;
      try {
        rounds = (await readdir(codeDir)).filter((d) => d.startsWith('round-'))
          .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
      } catch {
        archiveResults.push({ ...row, error: 'no archived code' });
        continue;
      }
      const template = JSON.parse(await readFile(path.join(codeDir, rounds[rounds.length - 1], 'template.json'), 'utf8'));
      measured = await page.evaluate(async ({ template, brief, steps, ticker }) => {
        const data = window.__anchors.dataFor(brief);
        return window.__mountAndMeasure(template, data, { steps, ticker });
      }, { template, brief: entry.brief, steps: declaredSteps, ticker });
    }
    const verdict = verdicts.get(row.id);
    archiveResults.push({ ...row, verdict: verdict.word, airable: verdict.airable, ...measured });
    console.log(`  ${row.id} ${row.cell} (${verdict.word})${measured.error ? ` ERROR ${measured.error}` : ''}`);
  }
}
await browser.close();

// ── Analysis ───────────────────────────────────────────────────────────────────────────
const ruleHits = (result) => {
  const hits = new Set();
  const eat = (m) => {
    if (!m) return;
    for (const f of m.readability?.findings ?? []) hits.add(f.code);
    for (const f of m.collisions ?? []) hits.add(f.code);
    if (m.textEscapes?.length) hits.add('text-escapes-panel');
    for (const f of m.ticker?.findings ?? []) hits.add(f.code);
  };
  eat(result.hold);
  for (const s of result.steps ?? []) eat(s);
  return hits;
};

const allRules = [...BLOCKING_RULES, ...WARNING_RULES];
const perRule = {};
for (const rule of allRules) {
  const shipped = catalogResults.filter((r) => !r.error && ruleHits(r).has(rule));
  const cells = archiveResults.filter((r) => !r.error);
  const falsePositives = cells.filter((r) => r.airable && ruleHits(r).has(rule));
  const truePositives = cells.filter((r) => !r.airable && ruleHits(r).has(rule));
  perRule[rule] = {
    kind: BLOCKING_RULES.includes(rule) ? 'blocking' : 'warning',
    shippedFail: shipped.length,
    shippedExamples: shipped.slice(0, 8).map((r) => r.id),
    falsePositives: falsePositives.map((r) => r.id),
    truePositives: truePositives.map((r) => r.id),
  };
}

// Size-threshold sensitivity off the catalog's own readings: what would each candidate
// primary/secondary floor fail? (fractions of the 1080 reference)
const sensitivity = { primary: {}, secondary: {} };
{
  const primaryMax = [];
  const secondaryMin = [];
  for (const r of catalogResults) {
    if (r.error || !r.hold) continue;
    const info = r.hold.readability.readings.filter((x) => x.role !== 'decorative');
    const primaries = info.filter((x) => x.role === 'primary').map((x) => x.fontPx);
    const secondaries = info.filter((x) => x.role === 'secondary').map((x) => x.fontPx);
    if (primaries.length) primaryMax.push({ id: r.id, px: Math.max(...primaries) });
    if (secondaries.length) secondaryMin.push({ id: r.id, px: Math.min(...secondaries) });
  }
  for (const t of [0.04, 0.046, 0.05, 0.06]) {
    const fails = primaryMax.filter((x) => x.px < t * 1080);
    sensitivity.primary[`${(t * 100).toFixed(1)}%`] = { failPx: Math.round(t * 1080), fails: fails.length, of: primaryMax.length, examples: fails.slice(0, 6).map((x) => `${x.id}@${x.px}px`) };
  }
  for (const t of [0.0185, 0.022, 0.04, 0.05]) {
    const fails = secondaryMin.filter((x) => x.px < t * 1080);
    sensitivity.secondary[`${(t * 100).toFixed(2)}%`] = { failPx: Math.round(t * 1080), fails: fails.length, of: secondaryMin.length, examples: fails.slice(0, 6).map((x) => `${x.id}@${x.px}px`) };
  }
}

const payload = {
  capturedAt: new Date().toISOString(),
  base: BASE,
  catalogCount: catalogResults.length,
  archiveCount: archiveResults.length,
  perRule,
  sensitivity,
  catalogResults,
  archiveResults,
};
if (JSON_OUT) {
  await writeFile(JSON_OUT, JSON.stringify(payload, null, 1));
  console.log(`json: ${JSON_OUT}`);
}

// ── The report ─────────────────────────────────────────────────────────────────────────
const cells = archiveResults.filter((r) => !r.error);
const airableCells = cells.filter((r) => r.airable);
const failCells = cells.filter((r) => !r.airable);
const lines = [];
lines.push('# Design-rules audit - the evidence under the owner table');
lines.push('');
lines.push(`Run ${new Date().toISOString().slice(0, 10)} by \`scripts/design-rules-audit-sweep.mjs\` over`
  + ` **${catalogResults.filter((r) => !r.error).length} shipped catalog variants** (settled holds, own defaults, standard mode / tv profile)`
  + ` and the **${cells.length} archived type-sweep cells** re-rendered from \`typesweep-*-2026-08-18\``
  + ` and joined against the owner's 49 blind verdicts (notes.md). Rules read from`
  + ' `src/model/designRules.ts` through the same instruments the iterate loop feeds from.');
lines.push('');
lines.push('**Where a number below fails owner-passed designs, that disagreement is stated here and the');
lines.push('table still binds for the R3 round - the evidence goes to the owner, the standard stays the');
lines.push("owner's (docs/DESIGN_RULES_PLAN.md §5).**");
lines.push('');
lines.push(`Verdict base: ${airableCells.length} airable cells (AIR/OK*), ${failCells.length} non-airable (TWEAKS/FAIL).`);
lines.push('');
lines.push('## Per rule');
lines.push('');
lines.push('| rule | kind | shipped designs failing | owner-PASSED cells it stops (FP) | owner-FAILED cells it catches (TP) |');
lines.push('|---|---|---|---|---|');
for (const [rule, r] of Object.entries(perRule)) {
  lines.push(`| ${rule} | ${r.kind} | ${r.shippedFail}${r.shippedExamples.length ? ` (${r.shippedExamples.join(', ')}${r.shippedFail > 8 ? ', …' : ''})` : ''}`
    + ` | ${r.falsePositives.length}${r.falsePositives.length ? ` (${r.falsePositives.join(', ')})` : ''}`
    + ` | ${r.truePositives.length}${r.truePositives.length ? ` (${r.truePositives.join(', ')})` : ''} |`);
}
lines.push('');
lines.push('## Size-floor sensitivity (catalog readings, % of the 1080 reference)');
lines.push('');
lines.push('| floor | px | shipped designs under it |');
lines.push('|---|---|---|');
for (const [pct, s] of Object.entries(sensitivity.primary)) {
  lines.push(`| primary ${pct} | ${s.failPx} | ${s.fails}/${s.of}${s.fails ? ` (${s.examples.join(', ')}${s.fails > 6 ? ', …' : ''})` : ''} |`);
}
for (const [pct, s] of Object.entries(sensitivity.secondary)) {
  lines.push(`| secondary ${pct} | ${s.failPx} | ${s.fails}/${s.of}${s.fails ? ` (${s.examples.join(', ')}${s.fails > 6 ? ', …' : ''})` : ''} |`);
}
lines.push('');
lines.push('## Reading the table');
lines.push('');
lines.push('- A BLOCKING rule with false positives above zero would have stopped a graphic the owner');
lines.push('  aired: each is named so the owner can re-ratify or adjust the number with open eyes.');
lines.push('- True positives count cells the machine DELIVERED clean and the owner rejected - the');
lines.push('  §22.1 escape classes, now measured.');
lines.push('- Warning rules never stop a delivery; their counts show what the advisory channel says.');
lines.push('');

await mkdir(path.dirname(path.resolve(REPORT)), { recursive: true });
await writeFile(path.resolve(REPORT), `${lines.join('\n')}\n`);
console.log(`report: ${REPORT}`);
