// The spacing instrument must count content that ESCAPES its panel.
//
// THE DEFECT (docs/NOACG_PRO_PLAN.md §15.6, first item). Panel membership was geometric
// containment alone, so a name hanging off the edge of its panel was not counted as the panel's
// content at all: it was dropped from the union, the children that stayed home were measured
// against the far edge, and the WORST overflow of the instruments round reported the ROOMIEST
// padding. Phase A's own numbers inherit that blindness unless it is closed first.
//
// FOUR TESTS, because an overflow check that can only prove it fires is satisfied by one that
// flags everything, and because "outside the panel" and "cut off inside it" are different
// defects that the layout box cannot tell apart:
//   1. a well-formed panel stays quiet, and its padding is measured off its real content;
//   2. the same panel with one line hanging off the right raises `text-escapes-panel`, names
//      the side and the pixels, and reports the padding on that side as NEGATIVE;
//   3. the same overflow CLIPPED by a mask stays quiet - the text is cut off, not on the
//      picture, and only the visual rect can say so;
//   4. a decorative member running past the edge is recorded but raises nothing - a bleed is a
//      composition, and an instrument that fails one teaches designs to be timid.
//
// The fixtures are hand-laid geometry rather than catalog designs on purpose: this pins the
// MEASUREMENT, and a catalog design would move the numbers every time someone restyles it.
// Free - no model call, no tokens.

import { expect, test } from '@playwright/test';

type Page = import('@playwright/test').Page;

interface Escape { desc: string; side: string; px: number; isText: boolean }
interface Spacing {
  panel: string | null;
  padding: { top: number; right: number; bottom: number; left: number } | null;
  escapes: Escape[];
  findings: { code: string; detail: string }[];
}

/**
 * The panel: 600x220 at (100,100). Its content is an accent, a name and a role, and every case
 * below varies ONE thing about the name - its width, whether a mask clips it, or whether it is
 * text at all.
 */
function fixture(options: { nameWidth: number; clip: boolean; decorativeBleed?: boolean }): string {
  const nameBox = `position:absolute;left:60px;top:30px;width:${options.nameWidth}px;height:70px;`
    + 'font:700 60px/70px Arial, sans-serif;color:#fff;white-space:nowrap';
  const name = options.clip
    // The house `.PREFIX-mask { overflow: hidden }` shape: the line lays out past its mask and
    // is painted cut off at the panel's edge.
    ? `<div style="position:absolute;left:60px;top:30px;width:520px;height:70px;overflow:hidden">
         <div id="f0" style="width:${options.nameWidth}px;height:70px;font:700 60px/70px Arial, sans-serif;color:#fff;white-space:nowrap">Alexandra Riva</div>
       </div>`
    : `<div id="f0" style="${nameBox}">Alexandra Riva</div>`;
  // A decorative member with no text of its own, running 90px past the panel's right edge.
  const bleed = options.decorativeBleed
    ? '<div style="position:absolute;left:560px;top:180px;width:230px;height:8px;background:#f6a623"></div>'
    : '';
  return `<!doctype html><html><head><meta name="color-scheme" content="dark"></head>
<body style="margin:0;background:#333">
  <div id="panel" style="position:absolute;left:100px;top:100px;width:600px;height:220px;background:#101216">
    <div style="position:absolute;left:24px;top:30px;width:8px;height:160px;background:#f6a623"></div>
    ${name}
    <div id="f1" style="position:absolute;left:60px;top:130px;width:400px;height:30px;font:500 24px/30px Arial, sans-serif;color:#ccc">Chief Political Correspondent</div>
    ${bleed}
  </div>
</body></html>`;
}

async function measure(page: Page, html: string): Promise<{ spacing: Spacing; panelFill: number | null }> {
  return page.evaluate(async (doc) => {
    document.getElementById('spike-fixture')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'spike-fixture';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
      + 'z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = doc;
    await new Promise((resolve) => { frame.onload = resolve; });
    const inner = frame.contentDocument as Document;
    await inner.fonts.ready;
    const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts');
    const { measureProportion } = await import('/src/ai/spike/proportionCheck.ts');
    const spacing = measureSpacing(inner);
    const proportion = measureProportion(inner);
    frame.remove();
    return { spacing, panelFill: proportion.panelFill };
  }, html) as Promise<{ spacing: Spacing; panelFill: number | null }>;
}

test.describe('the spacing instrument sees content that escapes its panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await page.locator('.topbar').waitFor();
  });

  test('a panel whose content stays inside reports positive padding and no escape', async ({ page }) => {
    const { spacing, panelFill } = await measure(page, fixture({ nameWidth: 400, clip: false }));

    expect(spacing.panel).toBe('div#panel');
    expect(spacing.escapes).toEqual([]);
    expect(spacing.findings.map((f) => f.code)).not.toContain('text-escapes-panel');
    // Measured off the real content: left 24px, right 600-(60+400)=140px, both positive.
    expect(spacing.padding?.left).toBeGreaterThan(0);
    expect(spacing.padding?.right).toBeGreaterThan(0);
    expect(panelFill).toBeGreaterThan(0);
    expect(panelFill).toBeLessThanOrEqual(1);
  });

  test('a line hanging off the panel is named, with its side and its pixels', async ({ page }) => {
    // 1200px wide from x=60 inside a 600px panel: 660px out through the right edge.
    const { spacing, panelFill } = await measure(page, fixture({ nameWidth: 1200, clip: false }));

    expect(spacing.panel).toBe('div#panel');
    const escaped = spacing.findings.filter((f) => f.code === 'text-escapes-panel');
    expect(escaped).toHaveLength(1);
    expect(escaped[0].detail).toContain('div#f0');
    expect(escaped[0].detail).toContain('right');

    expect(spacing.escapes).toHaveLength(1);
    expect(spacing.escapes[0]).toMatchObject({ desc: 'div#f0', side: 'right', isText: true });
    expect(spacing.escapes[0].px).toBeCloseTo(660, 0);

    // THE ORIGINAL DEFECT: this side used to read as the roomiest padding in the round.
    expect(spacing.padding?.right).toBeLessThan(0);
    // …and the panel is now honestly reported as too small for what it holds.
    expect(panelFill).toBeGreaterThan(1);
  });

  test('the same overflow CLIPPED by a mask is not an escape - it is cut off', async ({ page }) => {
    const { spacing } = await measure(page, fixture({ nameWidth: 1200, clip: true }));

    expect(spacing.panel).toBe('div#panel');
    expect(spacing.findings.map((f) => f.code)).not.toContain('text-escapes-panel');
    expect(spacing.escapes).toEqual([]);
    expect(spacing.padding?.right).toBeGreaterThan(0);
  });

  test('a decorative member bleeding past the edge is recorded, not flagged', async ({ page }) => {
    const { spacing } = await measure(page, fixture({ nameWidth: 400, clip: false, decorativeBleed: true }));

    expect(spacing.findings.map((f) => f.code)).not.toContain('text-escapes-panel');
    expect(spacing.escapes).toHaveLength(1);
    expect(spacing.escapes[0]).toMatchObject({ side: 'right', isText: false });
    expect(spacing.escapes[0].px).toBeCloseTo(190, 0);
    // A bleed does not move the padding either: the union is the content that stayed home.
    expect(spacing.padding?.right).toBeGreaterThan(0);
  });
});
