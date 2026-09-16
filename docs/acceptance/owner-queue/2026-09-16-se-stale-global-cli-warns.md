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

From this worktree, without touching the real global install:

1. Write a cache file the launcher already checks before it hits the network, claiming a newer
   `latest` than anything installed:
   `node -e "require('fs').writeFileSync(require('path').join(require('os').tmpdir(),'noacg-cli-latest-version.json'), JSON.stringify({latest:'9.9.9', checkedAt: Date.now()}))"`
2. `node cli/plugin-mcp/mcp-server.mjs < /dev/null` (closing stdin makes the MCP server exit
   immediately instead of waiting on a command that will never arrive).
3. Delete the file the first command wrote, so the next real session reads npm's actual `latest`
   instead of the planted one:
   `node -e "require('fs').rmSync(require('path').join(require('os').tmpdir(),'noacg-cli-latest-version.json'), {force:true})"`

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
reads that copy's own `package.json`, compares it to a registry read cached for a day (1.5 s
timeout, silent on any failure so a slow or offline network never blocks a session start or prints
a wrong warning), and reuses the existing stderr line for a mismatch. An explicit `NOACG_CLI`
override - a checkout under active development - skips the check, since differing from `latest` is
expected there.

`cli/src/commands/doctor.ts` still reports only the version of the copy running it, and does not
separately name what `resolveCli()` would resolve to; the backlog file's second, separable proposal
(teaching `doctor` to say that too) was left undecided rather than done.
