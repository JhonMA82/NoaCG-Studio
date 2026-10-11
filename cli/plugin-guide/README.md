# noacg-guide (trial)

A Claude Code mod for people making broadcast graphics with the `noacg` plugin. It shows the NoaCG
packages in the folder Claude Code was started in, where each stands and what to ask for next.

This is a trial for the owner to try. It is not published, not in the marketplace, the npm package
or the toolkit distribution, and its name may change. The plan is
`docs/work-specs/guided-mod/spec.md`; the try-out is `docs/work-specs/guided-mod/tryout.md`.

## What it shows

A band above the prompt, once the folder holds a package:

```
NoaCG  Lower third · Scoreboard · Ticker
       1 checked · 1 edited since check · 1 not checked · saved: Scoreboard
       Check Scoreboard again  [ Fill prompt ]  Open in NoaCG  [ Hide ]
       saving again adds a second library copy
```

- The packages by name, then how many are checked, edited since check and not checked, and which
  are saved.
- One next step: the package that needs attention first (a failed check, then edited since
  check, not checked, not yet seen, ready to save), with the step in plain words. Once a package
  is saved, sent or written to a pack file as it is, it has no step. After a save, an edit adds a
  line warning that saving again adds a second library copy.
- **Fill prompt** puts the step's request in the prompt box for you to edit or send; it never
  sends it. Where the box cannot take it, a toast shows the text. **Open in NoaCG** opens the
  saved graphic or sent production. **Hide** hides the band until you type `/noacg-guide` or a
  `noacg` command runs.

`/noacg-guide` opens a pane beside the conversation (above the prompt on a narrow terminal or
outside the fullscreen layout) with every package: its state, each record with its time, the
frames folder and pack file as links, the saved or sent link, and its next step with a **Fill**
button. It follows each new record. Esc or `/noacg-guide` again closes it. In a folder with no
package it offers **Start a package**, which fills the prompt with "Make broadcast graphics with
NoaCG." It opens with that button selected, or with the **Fill** of the package that needs
attention first, so Enter fills the request at once. When no package has a step left, nothing
is selected.

Where nothing draws (the VS Code panel, `claude -p`), `/noacg-guide` answers with the same list
and next steps as text. That text stays in the conversation, so the model reads it later.

## What it records, and where

After a `noacg` run in a terminal (`noacg ...`, `npx @noacg/cli ...`) or through the `noacg` MCP
tool, it records what the run reported for the package: checked (only when `validate` passed and
the run exited 0) or failed, frames with their folder, saved with its link, and a pack with its
link or file. A screenshot alone is never a check. Each record is tied to a SHA-256 of the
package's source and asset files, so an edit afterwards shows "edited since check".

The records are kept per folder on this machine, in the mod's own store: a JSON file under your
Claude Code configuration folder (`~/.claude/plugins/store/`), never in a package, a pack or the
repository. A new session in the same folder shows the same states.

It makes no network request, process run or model call, never sends a prompt or calls a tool, and
adds nothing to the model's context except the text answer above when you run the command. Its
one registration is `/noacg-guide`, which the model is not told about. It lists folders and reads
package files inside the folder Claude Code was started in. Where there is no package it draws
nothing.

## Try it

Pull `main` in a checkout of this repository first. You need Claude Code 2.1.287 or newer, signed
in.

In a terminal, start Claude Code in the folder you make graphics in:

```
claude --plugin-dir /path/to/NoaCG-Studio/cli/plugin-guide
```

For the Desktop Code tab, name the folder in the `env` block of `~/.claude/settings.json`, then
start a new session in the Code tab:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/NoaCG-Studio/cli/plugin-guide" } }
```

On Windows, write the path with `/` or `\\`, as in `C:/claude/NoaCG-Studio/cli/plugin-guide`. A
single `\` breaks the file, and then nothing loads.

To turn it off, start without `--plugin-dir`, or remove that line and start a new session.

## Limits

- It draws in the terminal and the Desktop Code tab only. The VS Code panel and `claude -p` get
  the text answer; Codex has no mods.
- No frame previews or thumbnails in the pane: frames open as a folder.
- No artwork, brand or data input: it only reads what `noacg` runs reported.
- It sees only what runs in the session. A package edited outside Claude Code shows "edited since
  check" at the next prompt, but a check run outside it is not recorded. Nor is a run it cannot
  read: one in the background, or one whose output was cut before its verdict.

## Checks

```
claude plugin validate --strict cli/plugin-guide
claude plugin test cli/plugin-guide
```

The tests mount the band and the pane on the `terminal` and `desktop` surfaces. CI runs both
whenever a change touches this folder or `.github/workflows/ci.yml` (its `guided-mod` job), in the
pull request and in the merge queue, and a red run keeps the change from landing. It also fails
when the validator lists a call that sends a prompt, calls a tool, an MCP server or a command,
appends to the conversation, runs a process, fetches, calls a model or starts an agent.
