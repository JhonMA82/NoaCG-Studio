// Stop hook: always leaves a "what's next" menu behind before the session goes idle, so
// coming back to it later starts with concrete options instead of a blank prompt.
//
// Stop fires after every assistant turn, not only when a whole task is done - so this blocks
// unconditionally, every time. `stop_hook_active` tells us this is the second attempt in the
// same chain (Claude Code already honored one block here); only ever block once per stop, or
// this loops forever.

import { readHookInput, deny } from './lib.mjs';

const input = await readHookInput();
if (input?.stop_hook_active) process.exit(0); // already blocked once this chain - let it stop

deny(
  'Before actually stopping: invoke the Skill tool with skill: "next" now to leave the user a ' +
    'menu of next-step options for when they return to this session, then stop.',
);
