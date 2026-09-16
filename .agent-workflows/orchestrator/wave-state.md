# The wave-state file - the plan's durable copy

At the path `node scripts/wave-plan-store.mjs --path <date> <day|night>` prints - the store beside
the job store, NEVER a checkout, because a plan in a worktree dies with it. It holds, under
headings the check reads by name: `## Wave table` (columns L, goal, START, TOUCHES, MINTS, POOL,
browser); every prompt verbatim; `Pools at plan time:`, `Window starts: <iso>`, `Window ends: <iso>`
lines (read by `wave-horizon.mjs`), and on a night wave a `## Candidates` list the refill loop draws
on (`night.md`); `## Handoffs`, one line per file read (`- consumed: <file> -> row B`);
`## Weekly review` and `## Owner receipts`, one line per item `weekly-candidates.mjs` and
`owner-receipts.mjs` list; then the tick's heartbeat lines and whatever the morning report needs
nowhere else - a ruling taken for the owner, an unplanned launch and its reason. **A plan launches
when `node scripts/wave-plan-check.mjs` passes** - it refuses a plan outside the store, a row
without a pool, a slot minted twice, a missing path, a prompt not ending on QUEUE, an unclassified
handoff or weekly candidate row, an unmentioned standing owner ask, and a night plan with no
`Window ends:` line. A correction sends the rows back through the collision pass before it ships.
