import { test, expect, type Page } from '@playwright/test';

// The Entry step's HEIGHT BUDGET. Step 0 is the app's first screen, and it has to fit a
// short laptop window whole: `.wz-hero` carries the comment "every vertical margin here is
// budgeted - if you grow one, take the height from another", which nothing enforced until
// this spec. Growing a margin, a font size, or a card's padding past the budget shows up
// here as a scroller that overflows, or as the video strip clipped below the fold.
//
// The wizard auto-opens only on a first-ever visit (no autosaved project). Every test gets a
// fresh context, so a plain `goto('/app')` lands on the Entry step.

/** Open /app at a fixed window size and wait for the Entry step to be laid out. */
async function entryStepAt(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('[data-entry="video"]')).toBeVisible();
}

/** How far `.wz-step`'s content exceeds its scrollport. 0 means the whole step is on screen. */
async function stepOverflowPx(page: Page): Promise<number> {
  return page.locator('.wz-step').evaluate((el) => el.scrollHeight - el.clientHeight);
}

for (const [width, height] of [[1366, 768], [1440, 900]] as const) {
  test(`the entry step fits a ${width}x${height} window without scrolling`, async ({ page }) => {
    await entryStepAt(page, width, height);
    expect(await stepOverflowPx(page)).toBe(0);
  });
}

test('the video strip is fully inside the scrollport at 1366x768', async ({ page }) => {
  await entryStepAt(page, 1366, 768);

  // Geometry, not visibility: an element clipped away by a scrolling ancestor still reports
  // `toBeVisible()`, which is exactly how the strip shipped below the fold in the first place.
  const clipped = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="wz-video-strip"]')!.getBoundingClientRect();
    const port = document.querySelector('.wz-step')!.getBoundingClientRect();
    return {
      above: strip.top < port.top - 0.5,
      below: strip.bottom > port.bottom + 0.5,
      left: strip.left < port.left - 0.5,
      right: strip.right > port.right + 0.5,
    };
  });
  expect(clipped).toEqual({ above: false, below: false, left: false, right: false });
});

test('the video card keeps a compact readable layout on mobile', async ({ page }) => {
  await entryStepAt(page, 390, 844);
  await page.locator('.wz-step').evaluate((el) => el.scrollTo(0, el.scrollHeight));

  const geometry = await page.locator('[data-entry="video"]').evaluate((card) => {
    const rect = card.getBoundingClientRect();
    const icon = card.querySelector('.wz-entry-icon')!.getBoundingClientRect();
    const title = card.querySelector('strong')!.getBoundingClientRect();
    const hint = card.querySelector('.hint')!.getBoundingClientRect();
    return {
      cardHeight: rect.height,
      cardWidth: rect.width,
      hintWidth: hint.width,
      iconRight: icon.right,
      titleLeft: title.left,
      hintLeft: hint.left,
    };
  });

  expect(geometry.cardHeight).toBeLessThan(220);
  expect(geometry.hintWidth).toBeGreaterThan(geometry.cardWidth * 0.7);
  expect(geometry.iconRight).toBeLessThan(geometry.titleLeft);
  expect(Math.abs(geometry.titleLeft - geometry.hintLeft)).toBeLessThan(1);
});

test('the three mode cards fill the grid with no hole', async ({ page }) => {
  await entryStepAt(page, 1366, 768);

  // THE ALIGNMENT CONTRACT (re-design/handoff.md §2a). Before this, the icon sat on its own
  // line above the title and the grid sized each row to its tallest card, so the longest
  // description made row 1 taller than row 2 (measured: 179px against 138px) and every card's
  // copy began at a different offset. Geometry, because the defect is invisible to any
  // assertion about which elements exist.
  const cards = await page.locator('.wz-entry .wz-entry-card').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const head = el.querySelector('.wz-entry-head').getBoundingClientRect();
      const icon = el.querySelector('.wz-entry-icon').getBoundingClientRect();
      const title = el.querySelector('strong').getBoundingClientRect();
      const hint = el.querySelector('.hint').getBoundingClientRect();
      return {
        entry: el.dataset.entry,
        left: r.left, width: r.width, height: r.height,
        // Where each block sits INSIDE its own card — the card-relative offsets are what has
        // to match across all four, since the two rows sit at different page positions.
        headTop: head.top - r.top,
        hintTop: hint.top - r.top,
        // Same row: the icon's box overlaps the title's vertically and precedes it.
        iconRight: icon.right, titleLeft: title.left,
        iconMidY: icon.top + icon.height / 2, titleMidY: title.top + title.height / 2,
      };
    }),
  );
  // THREE in the default studio since the kit card retired (its question moved into the
  // Browse step's build-mode switch); Advanced mode adds a fourth.
  expect(cards.map((c) => c.entry)).toEqual(['template', 'ai', 'import-graphic']);

  // NO HOLE. An odd count in a two-column grid would leave an empty cell that reads as a card
  // that failed to render, so the last card spans the row
  // (`.wz-entry-card:last-child:nth-child(odd)`). Rows stay equal in height either way.
  const round = (n: number) => Math.round(n);
  expect(new Set(cards.map((c) => round(c.height))).size).toBe(1);
  expect(round(cards[0].width)).toBe(round(cards[1].width));
  expect(round(cards[2].width)).toBeGreaterThan(round(cards[0].width) * 1.9);
  expect(round(cards[0].left)).toBe(round(cards[2].left));
  expect(round(cards[1].left)).toBeGreaterThan(round(cards[0].left));

  for (const c of cards) {
    // The title row is one flex line: the icon precedes the title and shares its centreline.
    expect(c.iconRight, `${c.entry}: icon before title`).toBeLessThanOrEqual(c.titleLeft);
    expect(Math.abs(c.iconMidY - c.titleMidY), `${c.entry}: icon on the title's line`).toBeLessThan(4);
    // Every card's copy starts at the same y — the whole point of the fixed-height blocks.
    expect(round(c.headTop), `${c.entry}: title row offset`).toBe(round(cards[0].headTop));
    expect(round(c.hintTop), `${c.entry}: description offset`).toBe(round(cards[0].hintTop));
  }

  // THE ROWS STAY EQUAL WHEN ONE CARD OUTGROWS THE RESERVE. With today's copy every
  // description fits the three-line block, so the heights above would match even without
  // `grid-auto-rows: 1fr` — which would leave the rule that actually holds the grid together
  // unproven, and the day someone writes a fourth line the ragged rows come back. So force
  // that day: overflow one card's copy and require the others to follow it.
  const heights = await page.locator('.wz-entry .wz-entry-card').evaluateAll((els) => {
    els[0].querySelector('.hint').textContent = 'x '.repeat(220);
    return els.map((el) => Math.round(el.getBoundingClientRect().height));
  });
  expect(new Set(heights).size, `rows stayed equal: ${heights.join(', ')}`).toBe(1);
});

test('the mode cards stack into one column on a phone', async ({ page }) => {
  await entryStepAt(page, 390, 844);

  // The two-column grid is a DESKTOP measure. Left at two columns on a 390px screen each card
  // got a 164px column — about 110px of text beside the icon — so every title wrapped to two
  // lines with the icon floating against the middle of the block, and the descriptions ran
  // seven to eleven lines of two-word rows. Measured then: four cards 291px tall each.
  const cards = await page.locator('.wz-entry .wz-entry-card').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const title = el.querySelector('strong').getBoundingClientRect();
      const icon = el.querySelector('.wz-entry-icon').getBoundingClientRect();
      return {
        entry: el.dataset.entry,
        left: Math.round(r.left), width: Math.round(r.width), top: Math.round(r.top),
        titleHeight: title.height,
        titleLineHeight: parseFloat(getComputedStyle(el.querySelector('strong')).lineHeight),
        iconRight: icon.right, titleLeft: title.left,
      };
    }),
  );
  expect(cards).toHaveLength(3);

  // One column: every card shares a left edge and a width, and each starts below the last.
  expect(new Set(cards.map((c) => c.left)).size).toBe(1);
  expect(new Set(cards.map((c) => c.width)).size).toBe(1);
  const tops = cards.map((c) => c.top);
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);

  for (const c of cards) {
    // ONE line of title. This is the assertion that fails the day the column narrows again —
    // a wrapped title is what turns these cards back into screen-tall ragged blocks.
    expect(c.titleHeight, `${c.entry}: title wrapped`).toBeLessThan(c.titleLineHeight * 1.6);
    // And the icon still leads that line rather than floating beside a block.
    expect(c.iconRight, `${c.entry}: icon before title`).toBeLessThanOrEqual(c.titleLeft);
  }
});

test('a window too short for the step cues its overflow', async ({ page }) => {
  await entryStepAt(page, 1280, 620);

  // The premise: this window really is too short. Without it the two assertions below would
  // pass vacuously the day the step grows a scrollbar it should not have.
  expect(await stepOverflowPx(page)).toBeGreaterThan(0);

  const step = page.locator('.wz-step');
  await expect(step).toHaveAttribute('data-overflow');
  await expect(page.locator('.wz-step-fade')).toHaveCSS('opacity', '1');

  // Scrolled to the bottom there is nothing left to cue, so the fade retires.
  await step.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(step).not.toHaveAttribute('data-overflow');
  await expect(page.locator('.wz-step-fade')).toHaveCSS('opacity', '0');
});
