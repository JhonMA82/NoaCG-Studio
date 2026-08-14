// The ONE lifecycle capture rig every Lite review artifact is filmed with.
//
// WHY IT IS A MODULE. `scripts/ai-lite-eval.mjs` films a Lite DECISION; the value gate
// (`scripts/ai-lite-value-gate.mjs`) films a plain wizard ASSEMBLY of the same brief, and the
// whole point of that gate is that a human compares the two. Two capture loops would make the
// arms differ by their rig - a different entrance wait, a different trim lead-in, a different
// moment called "hold" - and every one of those differences reads in a gallery as the graphic
// being better or worse. The seam is therefore drawn at the only place the two callers genuinely
// differ: how the template gets BUILT inside the page. Everything after that - the clear hold,
// play, the four stills, the mid-clip update, stop, the video trim - is this file.
//
// The builder is an in-page function, so it is passed as `buildFn`/`buildArg` and evaluated by
// Playwright in the dev server's module context, where `/src/...` imports resolve.

import { spawn } from 'node:child_process';
import { rename, unlink } from 'node:fs/promises';
import path from 'node:path';

/**
 * The longer copy the mid-clip `update()` sends, keyed by the LINE ROLE it replaces.
 *
 * Shared rather than copied because it is a measurement instrument: the swap exists to ask
 * whether the design still holds a realistically long name, and two arms answered with two
 * different "long" strings would be two different questions.
 */
export const UPDATE_COPY = {
  'person-name': 'Alexandra Chen-Williams',
  'person-role': 'Senior Correspondent, International Desk',
  organization: 'Coastal Resilience Research Institute',
  'team-name': 'Northbridge United',
  'story-headline': 'Regional rail services return to normal',
  'event-name': 'Closing Plenary and Awards',
  location: 'Central Convention Hall',
  'social-handle': '@updated_handle',
  'call-to-action': 'Watch the full briefing',
  'supporting-context': 'Live update',
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function trimMotionVideo(ffmpeg, rawPath, finalPath, startSeconds) {
  try {
    await run(ffmpeg, [
      '-y',
      // Cut 1.0s before play, inside the stage's guaranteed 1.5s CLEAR HOLD (the wait
      // after the initial data update): the wall-clock -> video-clock mapping drifts by
      // the recorder's startup latency, so a tight cut clipped into the entrance (first
      // frame showed a half-drawn graphic) and a naive wide one reached back past the
      // stage swap (first frame showed the app UI). The recording ends after the exit
      // settles and there is no duration cap, so the last frame stays clear too.
      '-ss', Math.max(0, startSeconds - 1.0).toFixed(3),
      '-i', rawPath,
      '-an',
      '-c:v', 'libvpx-vp9',
      '-crf', '22',
      '-b:v', '0',
      finalPath,
    ]);
    await unlink(rawPath).catch(() => {});
  } catch {
    await unlink(finalPath).catch(() => {});
    await rename(rawPath, finalPath);
  }
}

/** True when motion settled; false after the 5s budget. Never throws: a design with an
 *  idle loop (a blinking cursor, a pulse) NEVER settles, and discarding a paid,
 *  machine-usable result over that is worse than capturing the animation mid-flight -
 *  the still is honest either way, and the row records motionSettled for the reviewer. */
export async function waitForMotionToSettle(page) {
  let previous = '';
  let stableSamples = 0;
  for (let sample = 0; sample < 50; sample += 1) {
    const signature = await page.evaluate(() => {
      const frame = document.querySelector('#lite-eval-frame');
      const root = frame?.contentDocument?.body.firstElementChild;
      if (!root) return '';
      return [root, ...root.querySelectorAll('*')].map((element) => {
        const rect = element.getBoundingClientRect();
        const style = frame.contentWindow.getComputedStyle(element);
        return [
          rect.x, rect.y, rect.width, rect.height,
          style.transform, style.opacity, style.clipPath,
        ].join('|');
      }).join('\n');
    });
    if (signature && signature === previous) stableSamples += 1;
    else stableSamples = 0;
    if (stableSamples >= 4) return true;
    previous = signature;
    await page.waitForTimeout(100);
  }
  return false;
}

/**
 * Build a graphic in the page, then film its whole lifecycle at native resolution.
 *
 * `buildFn` runs INSIDE the page with `buildArg` and must mount the composed document in an
 * iframe with id `lite-eval-frame` and return at least:
 *   { entranceDurationMs, exitDurationMs, initialData, updateData }
 * Everything else it returns is passed straight back to the caller, which is how the eval keeps
 * carrying its rule codes and design parameters without this module knowing what they are.
 */
export async function captureLifecycle({
  browser, base, out, rawVideoDir, label, itemId, buildFn, buildArg, ffmpeg = 'ffmpeg',
}) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: rawVideoDir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const video = page.video();
  const recordingStarted = Date.now();
  try {
    await page.goto(`${base}/app`, { waitUntil: 'domcontentloaded' });
    const measured = await page.evaluate(buildFn, buildArg);
    await page.evaluate((initialData) => {
      document.querySelector('#lite-eval-frame')?.contentWindow?.update(JSON.stringify(initialData));
    }, measured.initialData);
    // The CLEAR HOLD the clip trim anchors into: the stage is built, the initial data is
    // in, and the graphic is CSS-hidden - these frames are the honest clear-before-cue
    // state the trim's 1.0s lead-in must land inside (see trimMotionVideo).
    await page.waitForTimeout(1500);
    const motionStarted = Date.now();
    await page.evaluate(() => document.querySelector('#lite-eval-frame')?.contentWindow?.play());
    await page.waitForTimeout(220);
    const entranceFile = `${label}-${itemId}-entrance.png`;
    await page.screenshot({ path: path.join(out, entranceFile) });
    await page.waitForTimeout(Math.max(0, measured.entranceDurationMs + 250 - (Date.now() - motionStarted)));
    const motionSettled = await waitForMotionToSettle(page);
    await page.waitForTimeout(80);
    const holdFile = `${label}-${itemId}-hold.png`;
    await page.screenshot({ path: path.join(out, holdFile) });
    // THE TEXT SWAP A GALLERY READER SEES MID-CLIP. Deliberate: a second update() with longer
    // copy, fired only after the entrance wait AND waitForMotionToSettle, so it always lands
    // inside the hold. stop() is 600 ms further on (180 + 420 below), so this can never overlap
    // the exit tween - and the wait is a measurement, not a sleep, so a slow entrance moves it
    // rather than clipping it. Nothing in the graphic re-fires it: update() writes textContent
    // and next()/timer transitions are operator-driven (docs/AI_LITE_PLAN.md section 4).
    await page.evaluate((updateData) => {
      document.querySelector('#lite-eval-frame')?.contentWindow?.update(JSON.stringify(updateData));
    }, measured.updateData);
    await page.waitForTimeout(180);
    const updateFile = `${label}-${itemId}-update.png`;
    await page.screenshot({ path: path.join(out, updateFile) });
    await page.waitForTimeout(420);
    const exitStarted = Date.now();
    await page.evaluate(() => document.querySelector('#lite-eval-frame')?.contentWindow?.stop());
    await page.waitForTimeout(220);
    const exitFile = `${label}-${itemId}-exit.png`;
    await page.screenshot({ path: path.join(out, exitFile) });
    await page.waitForTimeout(Math.max(0, measured.exitDurationMs + 250 - (Date.now() - exitStarted)));
    await waitForMotionToSettle(page);
    await page.close();
    await context.close();
    const motionFile = `${label}-${itemId}.webm`;
    if (video) {
      await trimMotionVideo(
        ffmpeg,
        await video.path(),
        path.join(out, motionFile),
        (motionStarted - recordingStarted) / 1000,
      );
    }
    return {
      ...measured,
      motionSettled,
      phaseFiles: { entrance: entranceFile, hold: holdFile, update: updateFile, exit: exitFile },
      ...(video ? { motionFile } : {}),
    };
  } finally {
    if (!page.isClosed()) await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}
