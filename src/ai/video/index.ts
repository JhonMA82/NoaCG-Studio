// Video provider selection, mirroring ai/index.ts: the established motion-design harness
// when the selected gateway route is configured, the deterministic offline stub otherwise.

import { aiConfigured } from '../settings';
import type { VideoAIProvider } from './provider';
import { claudeVideoProvider } from './claudeVideoProvider';
import { stubVideoProvider } from './stubVideoProvider';

export function getVideoAiProvider(): VideoAIProvider {
  return aiConfigured() ? claudeVideoProvider : stubVideoProvider;
}
