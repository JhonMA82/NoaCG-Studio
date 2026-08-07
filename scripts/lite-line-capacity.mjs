// How much text a lower third's SUPPORTING line actually holds on ONE line.
//
//   node scripts/lite-line-capacity.mjs            # the six audited NoaCG Lite chassis
//   node scripts/lite-line-capacity.mjs --all      # every lower third in the catalog
//   node scripts/lite-line-capacity.mjs --json out.json
//
// SPENDS NO TOKENS. Needs the dev server (it renders the real templates through it).
//
// Why this exists. `LITE_CATALOG` tells the model a chassis has `capacity:high` or
// `capacity:medium`, and that word is one of the few facts it has when choosing. The word was
// authored by hand. Measured 2026-08-07 against the first real generation round, it disagrees
// with the render: designs advertised `capacity:high` wrapped a perfectly ordinary job title
// onto two and three lines, because their supporting line is set in TRACKED UPPERCASE (lt02,
// lt11 and lt25 all declare `text-transform: uppercase` plus the family's wide
// `--label-tracking`), which costs roughly a third of the characters a reader expects.
//
// No existing gate can see that. `overflow-sweep` asks whether a box escapes the frame and a
// wrapped line does not - the panel simply grows downward. The runtime bench's stress pass
// doubles every value and asks the same question. `type-floor` measures font SIZE. So a
// five-line "lower third" passes every check the platform owns, which is exactly the class of
// defect that only a rendered frame reveals.
//
// The method is the field-coverage one, inverted: render the real template, drive the real
// field through `update()`, and read the painted result back - never parse the CSS and reason
// about it. Tracking, transform, font metrics, the auto-fit cap and the panel padding all land
// in the measurement for free, and none of them could be inferred reliably from the source.

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';

// The six audited Lite chassis (src/ai/liteContract.ts LITE_CATALOG), with the capacity word
// each one currently advertises to the model. Duplicated deliberately: this script must be
// able to report the CLAIM against the measurement, and importing the TS contract into a .mjs
// gate would buy nothing but a build step.
const LITE_CHASSIS = [
  { id: 'lt11', name: 'House Strap', claims: 'high' },
  { id: 'lt02', name: 'Underline', claims: 'high' },
  { id: 'lt05', name: 'Angle Slab', claims: 'medium' },
  { id: 'lt15', name: 'Frost Strap', claims: 'medium' },
  { id: 'lt25', name: 'Masthead', claims: 'high' },
  { id: 'lt32', name: 'Scrim', claims: 'high' },
];

// Real role wording, not filler: `Xxxxx` repeated measures a width no operator ever types, and
// tracked uppercase makes per-character width vary enough that the alphabet matters. These are
// the job titles the frozen fixture bank already uses, longest last.
const ROLES = [
  'Head Coach',
  'Creative Director',
  'Evening News Anchor',
  'East Africa Correspondent',
  'Student Union President',
  'Emergency Management Director',
  'Professor of Environmental Engineering',
  'VP, Responsible AI and Platform Safety',
  'International Development Policy Research Fellow',
];

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const ALL = args.includes('--all');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://localhost:${devPort()}/app`, { waitUntil: 'domcontentloaded' });

await page.evaluate(async () => {
  window.__cat = await import('/src/templates/catalog.ts');
  window.__comp = await import('/src/preview/composeDocument.ts');
  window.__struct = await import('/src/model/structure.ts');
});

const targets = ALL
  ? (await page.evaluate(() => (window.__cat.CATALOG['lower-third'] || []).map((v) => ({ id: v.id, name: v.name, claims: '?' }))))
  : LITE_CHASSIS;

await page.evaluate(() => {
  /**
   * Render one chassis, drive its supporting line through `update()` with each candidate
   * string, and report how many lines the painted element takes.
   *
   * Line count is height / line-height rather than a wrap detector: `getClientRects()` would
   * answer per fragment and a design that pads or line-clamps its own line would report a
   * number that has nothing to do with what a viewer sees.
   */
  window.__capacity = async (id, roles) => {
    document.body.innerHTML = '';
    const variant = window.__cat.variantById(id);
    const template = variant.create({});
    const prefix = window.__struct.detectPrefix(template.html);
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1920px;height:1080px;border:0;position:fixed;left:-5000px;top:0';
    frame.srcdoc = window.__comp.composeDocument(template);
    document.body.appendChild(frame);
    await new Promise((r) => setTimeout(r, 900));

    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    // Settle to the on-air state before measuring: mid-entrance a line can be scaled or
    // clipped, and a capacity read taken then describes a frame nobody holds on.
    try { win.play && win.play(); } catch { /* a design with no play() still measures */ }
    await new Promise((r) => setTimeout(r, 2400));

    // The supporting line is the SECOND text field. Reading it off the definition rather than
    // guessing `f1` keeps this correct for a design whose first field is a logo slot.
    const fields = (win.SPXGCTemplateDefinition?.DataFields ?? [])
      .filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea');
    const roleField = fields[1]?.field ?? 'f1';
    const el = doc.querySelector(`.${prefix}-title`) ?? doc.getElementById(roleField);
    if (!el) return { id, error: 'no supporting line element' };

    const measure = async (text) => {
      win.update(JSON.stringify({ [roleField]: text }));
      await new Promise((r) => setTimeout(r, 90));
      const cs = win.getComputedStyle(el);
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const lines = Math.max(1, Math.round(el.getBoundingClientRect().height / lineHeight));
      return { lines, fontPx: Math.round(parseFloat(cs.fontSize) * 10) / 10, transform: cs.textTransform, tracking: cs.letterSpacing };
    };

    const rows = [];
    for (const role of roles) rows.push({ role, chars: role.length, ...(await measure(role)) });

    // The break-even point: the longest single-line string, found by bisecting a real role
    // rather than by dividing a width by an average glyph. Tracked uppercase has no stable
    // average - that is the whole reason the authored capacity word was wrong.
    const longest = roles[roles.length - 1];
    let lo = 1;
    let hi = longest.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const { lines } = await measure(longest.slice(0, mid).trim());
      if (lines <= 1) lo = mid; else hi = mid - 1;
    }
    const style = await measure(longest.slice(0, lo).trim());
    frame.remove();
    return { id, maxSingleLineChars: lo, fontPx: style.fontPx, transform: style.transform, tracking: style.tracking, rows };
  };
});

const results = [];
for (const target of targets) {
  const r = await page.evaluate(([id, roles]) => window.__capacity(id, roles), [target.id, ROLES]);
  results.push({ ...target, ...r });
}
await browser.close();

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 1));

console.log('Supporting-line capacity, measured at 1920x1080 with default options.\n');
console.log('chassis  name            claims  1-line max  size  transform  tracking   wraps at');
for (const r of results) {
  if (r.error) { console.log(`${r.id.padEnd(8)} ${String(r.name).padEnd(15)} ERROR: ${r.error}`); continue; }
  const firstWrap = r.rows.find((row) => row.lines > 1);
  console.log(
    `${r.id.padEnd(8)} ${String(r.name).padEnd(15)} ${String(r.claims).padEnd(7)} ` +
    `${String(r.maxSingleLineChars).padEnd(11)} ${String(r.fontPx).padEnd(5)} ` +
    `${String(r.transform).padEnd(10)} ${String(r.tracking).padEnd(10)} ` +
    (firstWrap ? `${firstWrap.chars} chars ("${firstWrap.role}")` : 'no wrap in the bank'),
  );
}

const worst = results.filter((r) => !r.error).sort((a, b) => a.maxSingleLineChars - b.maxSingleLineChars);
if (worst.length) {
  console.log(`\nTightest: ${worst[0].id} at ${worst[0].maxSingleLineChars} characters. ` +
    `Widest: ${worst[worst.length - 1].id} at ${worst[worst.length - 1].maxSingleLineChars}.`);
  console.log('A capacity word in LITE_CATALOG that disagrees with this column is telling the model something untrue.');
}
