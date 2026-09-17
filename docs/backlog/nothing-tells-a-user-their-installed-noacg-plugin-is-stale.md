# This laptop's marketplace is still pinned to the pre-rename repo name

**Filed:** 2026-09-16. **Source:** measurement in the agent-door audit (`docs/AGENT_DOOR_AUDIT.md`)

This file kept its slug after most of it was done on 2026-09-17, because `docs/AGENT_CLI.md`,
`cli/src/skillVersion.ts` and `cli/src/npmLatest.mjs` all point here for the measurement below.

## Why
One thing is left, and it is one line. This machine's marketplace entry still names the pre-rename
repository `miwco/NoaCG-Studio` (`~/.claude/plugins/known_marketplaces.json`). GitHub 301s that to
`NoaCG/NoaCG-Studio`, so it works today and will keep working until the redirect stops, which is a
promise nobody in this project controls.

Re-pointing it swaps the skill text under every session running against that checkout, so it is a
MORNING item on a quiet machine, never something a wave row does at night with three sessions live.

## What it would take
`claude plugin marketplace remove noacg-studio` then
`claude plugin marketplace add NoaCG/NoaCG-Studio`, on a machine with nothing running, followed by
`claude plugin update noacg@noacg-studio` and one `noacg doctor` to confirm the skill row has gone
quiet. Nothing in the repository changes.

## What landed on 2026-09-17
`noacg doctor` now names a stale install, so the state below is visible instead of silent
(`docs/AGENT_CLI.md`, "The installed skill can be older than everything else"):

```
skill        0.2.0 in Claude Code, but this CLI ships 0.3.3 - an installed plugin never updates itself
             run: claude plugin marketplace update noacg-studio && claude plugin update noacg@noacg-studio
```

The version comes from the plugin manifest beside the skill on disk - never from the skill text,
which would only carry a version on copies that were already current, and never from a directory
name. The CLI's own npm-`latest` check, which used to live only inside the optional MCP launcher,
moved to `cli/src/npmLatest.mjs`; `doctor` runs it and the launcher reads a generated copy of the
same file. `cli/README.md` says beside the install block that a plugin does not update itself.

## Evidence
Read on 2026-09-16 on this laptop: `claude plugin list` -> `noacg@noacg-studio 0.2.0`;
`~/.claude/plugins/known_marketplaces.json` -> `noacg-studio` sourced from `miwco/NoaCG-Studio`,
`lastUpdated 2026-08-28T11:25:47.632Z`; the cached checkout's HEAD is `403ec2a` (2026-08-28);
`wc -l` of the installed `SKILL.md` is 96 against the repository's 107.
A fresh install in a scratch config dir on the same machine and in the same hour produced 0.3.3, so
the marketplace and the plugin are correct - only the already-installed copy is stale.
Codex, on the same machine, holds 0.3.3 (`codex plugin list`), so this is specific to the
Claude Code install.

Still true on 2026-09-17: `noacg doctor` on this laptop prints the 0.2.0 row above, and its `--json`
report carries the Codex install at 0.3.3 beside it - matching, and therefore silent on screen.
