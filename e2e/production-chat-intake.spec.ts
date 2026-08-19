import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';

// CHAT INTAKE (src/audience/chatIntake.ts): Twitch / YouTube live chat as a PRODUCER of
// submissions into the production's audience inbox.
//
// THE RULE THESE SPECS PIN: an ingested chat line goes on air the same way a phone's question
// does - it lands status 'new', the operator edits a broadcast version, approves, sends it to
// the rundown as an ordinary cue, and Takes it. The connector has no other exit; pause,
// throttle, dedupe and the door refusal are all visible, counted behaviour.
//
// The platform drivers themselves (a Twitch websocket, the YouTube poller) need a network, so
// the offline suite drives the TEST source instead - the same pipeline (identity, throttle,
// dedupe, counters, the submit door) with messages pushed by hand. It is reached through the
// dev-only window seam the intake module registers, never by importing the module in an
// evaluate: an evaluate's import can resolve a SECOND module instance (the ghost-store trap),
// whose registry would be empty while the app's own holds the sources the UI shows.

async function productionFor(page: Page, name: string): Promise<void> {
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill(name);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
}

/** Attach a test chat source to the named production's OWN intake (the one the workspace
 *  holds), parking the push handle on the window for later evaluates. */
async function attachTestSource(page: Page, showName: string): Promise<void> {
  await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === name);
    if (!show) throw new Error(`no production named ${name}`);
    const seam = (window as unknown as {
      __noacgChatIntake?: { for(id: string): { addTest(label?: string): unknown } };
    }).__noacgChatIntake;
    if (!seam) throw new Error('the chat intake test seam is missing');
    (window as unknown as Record<string, unknown>).__chatTest = seam.for(show.id).addTest();
  }, showName);
}

type PushHandle = { push(author: string, text: string, id?: string | null): void };

function pushChat(page: Page, author: string, text: string, id?: string): Promise<void> {
  return page.evaluate(([a, t, i]) => {
    const held = (window as unknown as { __chatTest?: { source?: unknown } & PushHandle }).__chatTest;
    if (!held) throw new Error('no test chat source attached');
    held.push(a as string, t as string, (i as string | null) ?? null);
  }, [author, text, id ?? null] as const);
}

test('a chat line reaches air the way a phone question does: inbox, edit, approve, cue, Take', async ({ page }) => {
  await createProject(page, { name: 'House Q&A' });
  await productionFor(page, 'Chat In');

  await page.getByTestId('tab-audience').click();
  await expect(page.getByTestId('production-audience')).toBeVisible();
  await page.getByTestId('audience-open').check();

  await attachTestSource(page, 'Chat In');
  // The source is on the board: platform + label as TEXT, with a live indicator.
  const source = page.getByTestId('chat-source-test');
  await expect(source).toBeVisible();
  await expect(source).toContainText('Chat · Test');
  await expect(source.locator('.pd-aud-source-dot')).toHaveClass(/live/);

  await pushChat(page, 'rivergirl', 'This is the best show you have done all year', 'm1');

  // It lands in the INBOX as an ordinary 'new' submission - the platform rides the author
  // line as plain text (the audience category's rule: text, never a logo).
  const row = page.locator('.pd-aud-row').first();
  await expect(row).toBeVisible();
  await expect(row.locator('.pd-aud-author')).toHaveText('rivergirl · Chat');
  await expect(row.locator('.pd-aud-body')).toContainText('best show you have done all year');
  await expect(page.getByTestId('chat-source-stats')).toHaveText('1 in · 0 dropped');

  // The operator's ordinary moderation: tidy the broadcast version, approve - which moves the
  // row out of the Inbox filter and into Approved - then send it from there.
  await row.getByTestId('audience-edit-body').fill('Best show of the year - thank you!');
  await row.getByTestId('audience-approve').click();
  await expect(page.locator('.pd-aud-row')).toHaveCount(0); // the inbox is done with it
  await page.getByTestId('audience-filter-approved').click();
  const approved = page.locator('.pd-aud-row').first();
  await expect(approved.locator('.pd-aud-author')).toHaveText('rivergirl · Chat');
  await approved.getByTestId('audience-send').click();
  await expect(page.getByTestId('audience-note')).toContainText('airs when you Take it');

  // And the ONE exit works end to end: the cue airs on Take, with the edited text and the
  // chat author's name on it.
  await page.getByTestId('tab-playout').click();
  const cue = page.locator('.pd-cue', { hasText: 'Best show of the year' }).first();
  await expect(cue).toBeVisible();
  await cue.click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('verb-take').click();
  await expect(program.locator('body')).toContainText('Best show of the year - thank you!');
  await expect(program.locator('body')).toContainText('rivergirl · Chat');
});

test('the throttle and the dedupe refuse visibly, and what passes is what the inbox holds', async ({ page }) => {
  await createProject(page, { name: 'House Q&A' });
  await productionFor(page, 'Firehose');
  await page.getByTestId('tab-audience').click();
  await page.getByTestId('audience-open').check();
  await attachTestSource(page, 'Firehose');

  // One synchronous burst, so the 10-per-10-s intake window cannot slide mid-test: three
  // warm-up lines, an exact re-delivery of the first (the dedupe case), then a ten-line
  // flood. 3 + 7 fit the window; the duplicate and the last 3 of the flood are refused.
  await page.evaluate(() => {
    const held = (window as unknown as { __chatTest?: { push(a: string, t: string, i?: string): void } }).__chatTest;
    if (!held) throw new Error('no test chat source attached');
    for (let i = 0; i < 3; i += 1) held.push(`viewer${i}`, `warm-up line ${i}`, `d${i}`);
    held.push('viewer0', 'warm-up line 0', 'd0');
    for (let i = 0; i < 10; i += 1) held.push(`crowd${i}`, `flood line ${i}`, `f${i}`);
  });

  // The counters say exactly what happened - a limiter that drops silently reads as a broken
  // connector - and the inbox holds exactly what was accepted, each line its own author, so
  // the per-author caps never bit.
  await expect(page.getByTestId('chat-source-stats')).toHaveText('10 in · 4 dropped');
  await expect(page.getByTestId('audience-filter-inbox')).toContainText('(10)');
});

test('a closed door refuses chat the same as phones, and the surface says so', async ({ page }) => {
  await createProject(page, { name: 'House Q&A' });
  await productionFor(page, 'Doors Shut');
  await page.getByTestId('tab-audience').click();
  await attachTestSource(page, 'Doors Shut');

  // The door is closed. The submit refusal is COUNTED, and the strip explains it - without
  // the hint, every dropped line reads as a connector fault.
  await expect(page.getByTestId('chat-sources-closed-hint')).toBeVisible();
  await pushChat(page, 'early-bird', 'Am I first?', 'e1');
  await expect(page.getByTestId('chat-source-stats')).toHaveText('0 in · 1 dropped');
  await expect(page.locator('.pd-aud-row')).toHaveCount(0);

  // Opening the door clears the hint and lets the next line through.
  await page.getByTestId('audience-open').check();
  await expect(page.getByTestId('chat-sources-closed-hint')).toBeHidden();
  await pushChat(page, 'early-bird', 'Am I first now?', 'e2');
  await expect(page.getByTestId('chat-source-stats')).toHaveText('1 in · 1 dropped');
  await expect(page.locator('.pd-aud-row')).toHaveCount(1);
});

test('pause stops collecting without counting a backlog, resume collects again, remove disconnects', async ({ page }) => {
  await createProject(page, { name: 'House Q&A' });
  await productionFor(page, 'Half Time');
  await page.getByTestId('tab-audience').click();
  await page.getByTestId('audience-open').check();
  await attachTestSource(page, 'Half Time');

  await pushChat(page, 'viewer-one', 'Before the pause', 'p1');
  await expect(page.getByTestId('chat-source-stats')).toHaveText('1 in · 0 dropped');

  // PAUSED means not collecting: nothing lands, and nothing is remembered as "dropped" - an
  // operator pausing a firehose does not want ten minutes of backlog counted against it.
  await page.getByTestId('chat-source-pause').click();
  await expect(page.getByTestId('chat-source-pause')).toContainText('Resume');
  await pushChat(page, 'viewer-two', 'Shouted into the void', 'p2');
  await pushChat(page, 'viewer-three', 'Also unheard', 'p3');

  await page.getByTestId('chat-source-pause').click(); // resume
  await pushChat(page, 'viewer-four', 'After the pause', 'p4');
  // 2 in proves the paused pair truly vanished - three landings would read 4 in.
  await expect(page.getByTestId('chat-source-stats')).toHaveText('2 in · 0 dropped');
  await expect(page.locator('.pd-aud-row')).toHaveCount(2);

  await page.getByTestId('chat-source-remove').click();
  await expect(page.getByTestId('chat-source-test')).toHaveCount(0);
});

test('the add form refuses what no driver could use, before any source row exists', async ({ page }) => {
  await createProject(page, { name: 'House Q&A' });
  await productionFor(page, 'Form Check');
  await page.getByTestId('tab-audience').click();

  // A Twitch name that is not one.
  await page.getByTestId('chat-add-channel').fill('not a channel!!');
  await page.getByTestId('chat-add-connect').click();
  await expect(page.getByTestId('chat-add-note')).toContainText('Not a Twitch channel name');

  // YouTube needs a video AND a key - and says which is missing.
  await page.getByTestId('chat-add-platform').selectOption('youtube');
  await page.getByTestId('chat-add-video').fill('definitely-not-a-video-url');
  await page.getByTestId('chat-add-connect').click();
  await expect(page.getByTestId('chat-add-note')).toContainText('Not a YouTube video id');
  await page.getByTestId('chat-add-video').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByTestId('chat-add-connect').click();
  await expect(page.getByTestId('chat-add-note')).toContainText('API key');

  // Nothing connected - refusing at the form means no row was born to show an error on.
  await expect(page.locator('.pd-aud-source')).toHaveCount(0);
});
