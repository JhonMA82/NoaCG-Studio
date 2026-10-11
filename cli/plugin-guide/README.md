# noacg-guide (trial)

A Claude Code mod for people making broadcast graphics with the `noacg` plugin. It shows the NoaCG
packages in the folder Claude Code was started in, in a band above the prompt:

```
NoaCG  Lower third · Scoreboard · +2 more
```

This is a trial for the owner to try. It is not published, not in the marketplace, the npm package
or the toolkit distribution, and its name may change. The plan is
`docs/work-specs/guided-mod/spec.md`.

## What it does now

- Finds packages: a folder `noacg scaffold` wrote (its `.ograf.json` manifest carries `v_noacg`),
  in the working directory or one folder below it. Frames folders (`.noacg-frames`),
  `node_modules` and dot folders are skipped.
- Looks again when the session starts, when you send a prompt and after a tool call that may have
  written files, so a package made during the session appears without a restart.
- Shows "NoaCG" and the package names in the band, as many as fit the width.

Where there is no package it draws nothing and adds nothing to the conversation. It never adds to
the model's context, registers no tool or command, and makes no network request, process run or
model call. It only lists folders and reads package manifests inside the working directory.

## Try it

From a checkout of this repository, in a terminal:

```
claude --plugin-dir /path/to/NoaCG-Studio/cli/plugin-guide
```

For the Desktop Code tab, name the folder in the `env` block of `~/.claude/settings.json` and start
a new session:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/NoaCG-Studio/cli/plugin-guide" } }
```

To turn it off, start without `--plugin-dir`, or remove that line.

It draws in the terminal and the Desktop Code tab. The VS Code panel, `claude -p` and Codex show
nothing. Claude Code 2.1.287 or newer.

## Checks

```
claude plugin validate --strict cli/plugin-guide
claude plugin test cli/plugin-guide
```

The tests mount the band on the `terminal` and `desktop` surfaces. CI runs both on pull requests
that touch this folder (`.github/workflows/guided-mod.yml`).
