# noacg-guide (trial)

A Claude Code mod for people making broadcast graphics with the `noacg` plugin. It shows the NoaCG
packages in the folder Claude Code was started in, where each stands and what to ask for next, in
a band above the prompt:

```
NoaCG  Lower third · Scoreboard · Ticker
       1 checked · 1 edited since check · 1 not checked · saved: Lower third
       Check Scoreboard again  [ Fill prompt ]  Hide
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
- Shows "NoaCG" and the package names in the band, as many as fit the width, and under them how
  many are checked, edited since check and not checked, and which are saved.
- Records what `noacg` runs reported, run in a terminal (`noacg ...`, `npx @noacg/cli ...`) or
  through the `noacg` MCP tool: `validate` (checked when it passed and exited 0, not checked when
  it failed), frames from `validate --screenshots` or `screenshot` with their folder, `save` with
  the link it returned, and `pack` with its link or file. A screenshot alone is never a check.
- Ties each record to a SHA-256 of the package's source and asset files, leaving out the files
  `noacg validate` regenerates and frames folders. When those files change after a check, the
  package shows "edited since check"; changing them back shows it checked again.
- Gives each package one next step from what it recorded: check it, fix what a failed check
  found, check it again after an edit, show its frames, then save it or send all the graphics to
  a production. Once its files are saved, sent or written to a pack file as they are, it has
  none. After a save, an edit adds "saving again adds a second library copy". The band shows the
  step of the package that needs attention first: a failed check, then edited since check, not
  checked, no frames, ready to save; equal ones by name.
- Buttons never act on their own. **Fill prompt** puts the step's request in the prompt box, in
  plain words, for you to edit or send, on a line after anything you had typed; where the box
  cannot take it, a toast shows the text. **Open in NoaCG** appears when the package the band
  names was saved or sent, and opens that link. **Hide** hides
  the band until you type `/noacg-guide` or a `noacg` command runs.
- `/noacg-guide` brings a hidden band back. In a folder with no package it offers **Start a
  package**, which fills the prompt with "Make broadcast graphics with NoaCG."

The records are kept per folder on this machine, in the mod's own store: a JSON file under your
Claude Code configuration folder (`~/.claude`), never in a package, a pack or the repository. A
new session in the same folder shows the same states. A run the mod cannot read (one in the
background, or one whose output was cut before its verdict) records nothing.

Where there is no package it draws nothing and adds nothing to the conversation. It never adds to
the model's context, registers no tool, and makes no network request, process run or model call;
it never sends a prompt or calls a tool itself. Its one registration is the `/noacg-guide`
command, which the model is not told about. It lists folders and reads package files inside the
folder Claude Code was started in, and reads and writes only its own store.

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

The tests mount the band on the `terminal` and `desktop` surfaces. CI runs both whenever a change
touches this folder or `.github/workflows/ci.yml` (its `guided-mod` job), in the pull request and
in the merge queue, and a red run keeps the change from landing. It also fails when the validator
lists a call that sends a prompt, calls a tool, an MCP server or a command, appends to the
conversation, runs a process, fetches, calls a model or starts an agent.
