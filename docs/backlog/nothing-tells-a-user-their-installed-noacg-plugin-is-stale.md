# Nothing tells a user their installed NoaCG plugin is stale

**Filed:** 2026-09-16. **Source:** measurement in the agent-door audit (`docs/AGENT_DOOR_AUDIT.md`)

## Why
This laptop - the machine the 2026-09-25 demo runs from - loads a NoaCG skill that is nineteen days
old, and nothing anywhere says so.

```
$ claude plugin list
  noacg@noacg-studio   Version: 0.2.0   Scope: user   Status: enabled
```

The marketplace ships 0.3.3. The gap is a marketplace checkout that was cloned on 2026-08-28 and
never refreshed (`~/.claude/plugins/known_marketplaces.json`: `"lastUpdated":
"2026-08-28T11:25:47.632Z"`), still pinned to the pre-rename repo `miwco/NoaCG-Studio`. The skill
text a session actually loads is 96 lines; the repository's is 107.

This is the same class of defect that was closed for the CLI on 2026-09-16, but that fix is narrower
than it first looks, and the gap is correspondingly wider. The npm-`latest` comparison lives only in
`cli/plugin-mcp/mcp-server.mjs:156-161` - the OPTIONAL MCP plugin's launcher. The `noacg` binary
itself (`cli/package.json` bin -> `dist/index.js`) has no such check, and `cli/src/bridgeClient.ts:183`
is a bridge-protocol mismatch, a different condition entirely. So the warning reaches only the
entrance we recommend LEAST: a terminal user, which is the entrance `docs/AGENT_DOOR_AUDIT.md` §5
argues for, is told nothing about a stale CLI either. The plugin has no equivalent at all. So the
door we ask strangers to walk
through can silently serve them last month's instructions, and the person most exposed is the one
who installed earliest - which on 2026-09-25 is the owner.

Nothing auto-updates a Claude Code marketplace: `claude plugin marketplace update` exists and is
manual. A user has no reason to suspect they need it, because the plugin reports itself as enabled
and working either way.

## What it would take
The smallest fix is a line in `noacg doctor`, which already prints the deployment, the browser and
the bridge version and is the command the README's setup prompt tells every agent to run. Give it
one more row: the `noacg-graphic` skill version the caller is running, compared against the version
this CLI ships. The CLI is invoked BY the skill, so it can be told - the skill's own command lines
can pass the version it was loaded from (or `doctor` can read the plugin manifest next to the skill
on disk), and `doctor` prints `skill 0.2.0 (0.3.3 available - run: claude plugin marketplace update
noacg-studio)` when they differ. Silent when they match, exactly like the MCP launcher's warning.

While that row is being added, `doctor` is also the natural home for the CLI's OWN staleness check,
which today exists only inside the optional MCP launcher (above). The comparison is already written
in `mcp-server.mjs` - day-scoped cache file, 1.5 s registry timeout, silent on any failure - so
moving it to where both entrances can call it costs less than writing a second one.

Two smaller things worth doing in the same pass, both one-liners:
- Re-point this machine's marketplace at the current repo name. The entry still says
  `miwco/NoaCG-Studio`; GitHub 301s it to `NoaCG/NoaCG-Studio`, so it works today and depends on a
  redirect nobody controls forever.
- Say in `cli/README.md` that a plugin installed earlier does not update itself, and give the
  update command. One sentence next to the install block.

## Evidence
Read on 2026-09-16 on this laptop: `claude plugin list` -> `noacg@noacg-studio 0.2.0`;
`~/.claude/plugins/known_marketplaces.json` -> `noacg-studio` sourced from `miwco/NoaCG-Studio`,
`lastUpdated 2026-08-28T11:25:47.632Z`; the cached checkout's HEAD is `403ec2a` (2026-08-28);
`wc -l` of the installed `SKILL.md` is 96 against the repository's 107.
A fresh install in a scratch config dir on the same machine and in the same hour produced 0.3.3, so
the marketplace and the plugin are correct - only the already-installed copy is stale.
Codex, on the same machine, holds 0.3.3 (`codex plugin list`), so this is specific to the
Claude Code install.
