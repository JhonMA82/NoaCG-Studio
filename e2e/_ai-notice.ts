import type { Page } from '@playwright/test';
import { AI_NOTICE_VERSION } from '../src/ai/consentNotice';

/**
 * Pre-accept the AI disclosure notice (src/ai/consent.ts). Any spec that arms the REMOTE
 * AI path (seeding `spx-gfx-ai` with configuredProviders, or driving NoaCG Lite) seeds
 * this alongside, so generations proceed without the first-use dialog. Specs that
 * exercise the dialog itself (e2e/ai-consent.spec.ts) deliberately do not.
 */
export async function acceptAiNotice(page: Page): Promise<void> {
  await page.addInitScript((version: string) => {
    localStorage.setItem(
      'spx-gfx-ai-notice',
      JSON.stringify({ version, acceptedAt: new Date().toISOString() }),
    );
  }, AI_NOTICE_VERSION);
}
