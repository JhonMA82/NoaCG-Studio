---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# A stale global `@noacg/cli` now says so, instead of running silently

`docs/backlog/a-stale-global-cli-wins-over-npx-silently.md` (filed 2026-09-10) found that
`noacg-mcp` prefers an installed `@noacg/cli` over npx by design, and keeps whatever version it
finds forever, with nothing on screen saying so - this laptop served the owner's own MCP server a
year-old **0.2.0** while the docs told him to check with `npx -y @noacg/cli doctor`, which fetches
`latest` and reports that instead. This laptop is now on **0.3.3** (`npm i -g @noacg/cli@latest`,
2026-09-16), which fixes today, but the file was about the next machine, not this one. The fix
below is what makes it stay fixed: the launcher now compares its resolved copy against npm's
`latest` and warns on stderr when they disagree.

## Route, under a minute

From this worktree, without touching the real global install **or the real machine-wide cache** -
this laptop normally runs several sessions in separate worktrees at once, and the real cache file
is shared by every `noacg-mcp` process on it, so a planted value there would leak into whichever
one happens to launch in the same window. `NOACG_CLI_LATEST_CACHE_FILE` points the launcher at a
throwaway file instead:

1. Pick a scratch path and write a cache entry into it claiming a newer `latest` than anything
   installed:
   `node -e "require('fs').writeFileSync('./nwv.json', JSON.stringify({latest:'9.9.9', checkedAt: Date.now()}))"`
2. `NOACG_CLI_LATEST_CACHE_FILE=./nwv.json node cli/plugin-mcp/mcp-server.mjs < /dev/null` (closing
   stdin makes the MCP server exit immediately instead of waiting on a command that will never
   arrive).
3. Delete the scratch file: `node -e "require('fs').rmSync('./nwv.json', {force:true})"`. The real
   machine-wide cache was never touched, so no other session's warning is affected.

## What to look at

Step 2 prints, on stderr, before the MCP server's own output:

```
[noacg] the installed @noacg/cli is 0.3.3; npm's latest is 9.9.9. Run
[noacg] `npm i -g @noacg/cli@latest` to update it.
```

That is the same line a genuinely stale machine will see - the version numbers are the only thing
the planted cache file changes. With no planted cache file (the normal case), the same command
prints nothing on stderr as long as the installed copy matches npm's real `latest`, which is what
running it right now, unmodified, will show for this laptop.

## What it was, and what it is now

The launcher already had a stderr channel for exactly this kind of notice - the one it prints when
no `@noacg/cli` is installed at all and it falls back to npx. What was missing was any check when a
copy IS found: `resolveCli()` returned a path and nothing ever asked what version it was. The fix
reads that copy's own `package.json` and compares it, off the startup critical path, to a registry
read cached for a day (1.5 s timeout, silent on any failure so a slow or offline network never
blocks a session start or prints a wrong warning), reusing the existing stderr line for a mismatch.
The cache write is write-then-rename, because several `noacg-mcp` processes in separate worktrees
can race past the day-old TTL together on this machine. The check runs only when the resolved copy
did NOT come from an explicit `NOACG_CLI` override - a checkout under active development is
expected to differ from `latest` - and `NOACG_CLI_LATEST_CACHE_FILE` (used by the route above)
exists purely so a diagnostic run can avoid the shared cache path.

`cli/src/commands/doctor.ts` still reports only the version of the copy running it, and does not
separately name what `resolveCli()` would resolve to; the backlog file's second, separable proposal
(teaching `doctor` to say that too) was left undecided rather than done.
