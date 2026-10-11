# Guided package mod: a trial Claude Code mod for the agent toolkit

Authority: owner, 2026-10-11 (see `work.json`). Plan for `/plan-run guided-mod`: four phases, each
built by one session and checked by another on `main`.

## Why

When someone makes a graphics package with Claude Code and the `noacg` plugin, the agent knows the
commands. The person does not see where the package stands: which graphics were checked, which
changed since, whether a save is current, what to ask for next, and how to pick up tomorrow. A
Claude Code mod can show that beside the conversation in the terminal and the Desktop Code tab.
The owner wants to try how it feels before it is published or becomes part of the toolkit.

## Goal

A local trial plugin, `noacg-guide`, that shows each NoaCG package's state and one next step, and
fills the prompt when pressed. It is loaded by hand for the owner's try-out and ships nowhere.

## Decisions and boundaries

- **Trial only.** The plugin lives in `cli/plugin-guide/` and is not added to the toolkit
  distribution (`cli/scripts/toolkit-distribution.mjs`), `.claude-plugin/marketplace.json`, the npm
  package or the release workflow. `noacg-guide` is a working name; a public name and listing
  come later, from the owner.
- **No change to the toolkit.** `cli/src`, `cli/skill`, `cli/plugin` and `cli/plugin-mcp` stay as
  they are. The published CLI (0.10.1 on 2026-10-11) is what the mod watches.
- **State by watching.** The CLI writes no receipts yet, so the mod records what `noacg` runs
  reported and fingerprints the package files itself. If the owner keeps the mod, this moves into
  the CLI as a `status` read and the mod reads that instead; keep the watching code in one module so
  it can be replaced.
- **Buttons never act.** A button fills the prompt with a plain-language request for the person to
  send, opens a link, or hides the band. The mod never submits prompts, calls tools, runs
  processes, makes network requests or calls a model. Writes (save, pack) go through a normal turn
  with normal permissions.
- **Quiet outside graphics work.** The toolkit rule applies: "minimal and only used when they are
  creating graphics" (`docs/AGENT_CLI.md`, "What a session pays"). Where there is no package and no
  `noacg` activity, the mod draws nothing, adds nothing to the model's context and registers no tool.
- **Surfaces.** Mods draw in the terminal and the Desktop Code tab. The VS Code panel,
  `claude -p`, the Agent SDK and cloud sessions run hooks but draw nothing; Codex has no mods. The
  command answers in text there. Claude Code 2.1.287 (terminal) is the oldest supported build; the
  Desktop app bundles its own (2.1.295 on 2026-10-11). Use the declaration file the engine writes
  for the build, `claude plugin validate --strict` and `claude plugin test` (load the
  `plugin-authoring` skill first).
- **Not in this plan.** Frame previews or thumbnails, artwork import, brand input, data bindings,
  pack changes, an editor link, directory submission, CLI changes.

Background: mods overview and surface table
(https://code.claude.com/docs/en/plugins/mods/overview); Anthropic's `code-modernization` plugin in
`anthropics/claude-plugins-official` is a working example of commands that work alone plus an
optional pane whose Next button fills the prompt.

## Acceptance criteria

### AC-1: The plugin loads cleanly
`cli/plugin-guide/` holds a manifest named `noacg-guide`, one hooks module and a README.
`claude plugin validate --strict` passes and `claude plugin test` passes on Claude Code 2.1.287,
with tests mounted on both the `terminal` and `desktop` surfaces. A session started with
`--plugin-dir cli/plugin-guide` logs no skipped hook and no refused tree.

### AC-2: Quiet outside graphics work
In a folder with no NoaCG package and no `noacg` activity in the session, the mod draws nothing,
adds no prompt context, section or attachment, registers no tool and makes no network request,
process run or model call. Tests show it for both surfaces.

### AC-3: It finds the packages
A folder that `noacg scaffold` created, in the working directory or one level below, counts as a
package from the moment it exists. Frames folders (`.noacg-frames` marker) and `node_modules` are
ignored. A package created during the session appears without a restart.

### AC-4: The band names the packages
Where packages exist, the band above the prompt shows "NoaCG" and the packages by name, sized to the
band's width, on the terminal and the Desktop surface.

### AC-5: It ships nowhere and CI covers it
The folder is absent from the toolkit distribution, the marketplace file, the npm package and the
release workflow; the distribution drift check and the repository checks stay green. Pull requests
that touch the folder run `claude plugin validate --strict` and `claude plugin test` on it in CI.

### AC-6: It records what `noacg` runs reported
For `validate` (with or without `--screenshots`), `screenshot`, `save` and `pack`, run through the
terminal (`noacg ...` or `npx @noacg/cli ...`) or through the `noacg` MCP tool, the mod records for
the package the run targeted: checked (only when validation passed), frames (with their folder),
saved (with the returned link), sent or written pack (with the link or file).

### AC-7: A record is tied to the files it saw
Each record carries a SHA-256 over the package's source and asset bytes, without generated files
and frames folders. When the files change afterwards, the package shows "edited since check". A
failed validation, a run that exited non-zero, or a screenshot alone never shows as checked.

### AC-8: Records survive and stay out of packages
Records are kept per folder on this machine, in the mod's own store, never inside a package, a
pack or the repository. A new session in the same folder shows the same states.

### AC-9: The band summarises state
The band shows how many packages are checked, edited since check and not checked, and which are
saved. Tests cover pass, fail, edit after check, screenshot only, terminal and MCP forms, and a
restart.

### AC-10: One next step, in plain words
Each package has one next step from its state: not checked, check it; edited since check, check it
again; checked without frames, show the frames; checked, save it or send all graphics to a
production; saved and edited since, the step warns that saving again adds a second library copy.
The band shows the step for the package that needs attention first.

### AC-11: Buttons fill, open or hide, and run nothing
"Fill prompt" puts the next step's request in the prompt box in plain words and runs nothing; where
the box cannot be filled, a toast shows the text instead. "Open in NoaCG" appears only when a saved
or sent link exists and opens it. "Hide" hides the band until `/noacg-guide` or the next `noacg`
activity.

### AC-12: The mod's reach is provably small
`claude plugin validate` lists no `$.prompt.submit`, `$.mcp.call`, `$.process`, `$.http`,
`$.model` or `$.agent` call. Reads are limited to the working directory.

### AC-13: Starting from nothing
`/noacg-guide` in a folder without packages offers "Start a package", which fills the prompt with a
short request to make broadcast graphics with NoaCG.

### AC-14: The package pane
`/noacg-guide` opens a pane beside the conversation (terminal fullscreen layout and Desktop) that
lists every package with its state, the time of each record, the frames folder as a link, the saved
or sent link, and its next step with a Fill button. It updates when records change and closes with
Esc or the command.

### AC-15: Text where nothing draws
Where nothing draws (VS Code panel, `claude -p`), `/noacg-guide` answers with the same list and
next steps as text.

### AC-16: The README tells the owner how to use it
What it shows, what it records and where, that it makes no network request or model call, how to
load it in the Desktop Code tab and in a terminal from a checkout of `main`, how to turn it off, and
its limits (VS Code, Codex, no previews, no artwork or data).

### AC-17: A try-out script
`docs/work-specs/guided-mod/tryout.md` is a 15-minute walk for the owner: a new brief to a package,
an edit after a check, resuming in a new session, and the hand-off to NoaCG, with what to look for
at each step. Nothing waits on the owner's walk.

## Phases

1. **Loadable and quiet**: AC-1 to AC-5.
2. **Recorded results**: AC-6 to AC-9.
3. **One next step**: AC-10 to AC-13.
4. **Package pane and try-out**: AC-14 to AC-17.

Each phase keeps the earlier phases' criteria passing.

## How a phase is checked

The checker loads the plugin with `--plugin-dir` from current `main`, runs `claude plugin validate
--strict` and `claude plugin test`, and does a real run where the phase allows: scaffold and
validate a scratch package with the published CLI in a scratch folder, then read the mod's records
and `/noacg-guide`'s text answer through `claude -p`. How the band and pane look and feel is the
owner's try-out after phase 4, not a gate.

## Phase notes

Each phase's pull request adds what the next phase must allow for: decisions, traps, and the
check's findings.

### After phase 1 (loadable and quiet)

**Layout.** `hooks/register.tsx` is the one hooks module; it imports `hooks/packages.ts`
(discovery, the "watching" module to replace if the CLI gains a `status` read) and `hooks/band.ts`
(fitting names to a width). `types/index.d.ts` is the `$.state` contract: add each new value there
or `claude plugin validate` refuses the key. `tests/world.tsx` is the test harness: a working
directory in memory, the session's events, and a record of every call a quiet mod never makes.
`tsconfig.json` is the engine's (it extends the declarations it lays in `.claude-plugin/types/`,
which ignores itself); `tsc -p cli/plugin-guide` works once a session has loaded the folder.

**Decisions.** A package is a folder holding a `*.ograf.json` whose manifest has a `v_noacg`
object, so a plain OGraf graphic does not count. Its name is the manifest's `name`, else the
folder's. Dot folders are skipped as well as `node_modules` and frames folders, and at most 500
folders are looked into. Packages are sorted by name. The band is "NoaCG", then the names joined
by ` · `, with `+n more` (or a count, then an ellipsis) when they do not fit `bodyColumns`; it
gives way while a survey holds the band. Folders are listed again at `session.start`, at
`prompt.submit` and after a `tool.call` that is not read-only (`isReadOnly`), never on a timer;
a package made outside the session shows at the next prompt. Manifests are read again only when
their size or time changes. The scan runs after the hook has returned, one at a time.

**Traps (Claude Code 2.1.287).**
- `$` can never be assigned, passed or captured as a value: the validator refuses the module.
  Helpers take closures (`dir => $.fs.list(dir)`) or the state library's `read($, atom)`.
  Calling those closures after the hook returned works, in tests and in a real session.
- The engine hands `fs.*` hooks absolute paths; a test hook answering a `$` call returns
  `{ value }`, never the bare value.
- 2.1.287's test kit has no `mock.session` and no `ui.notify` event; a test that names either
  fails to load there. The local `claude` is 2.1.287; the Desktop's 2.1.295 binary is in
  `%APPDATA%\Claude\claude-code\2.1.295\<hash>\claude.exe`. Run both.
- A `Text` keeps no `key` in the drawn tree; tests find texts by `type`.
- Import plugin files without an extension (`./band`): `.ts` imports load but fail `tsc -p`
  against the engine's tsconfig.
- The quiet tests refuse `command.register`, `ui.open`, toasts, status and log lines in a folder
  with no package. Phase 3's `/noacg-guide` command and phase 2's records must keep AC-2: decide
  whether the command registers only once a package or `noacg` run exists, and change that test
  on purpose rather than loosen it. The `tool.call` hook already wraps every call; phase 2 reads
  `noacg` runs there.
- `$.store` is not mocked unless the test calls `mock.store(on)`.

**Check findings.** `claude plugin validate --strict` and `claude plugin test` (16 tests, terminal
and desktop) pass on 2.1.287 and 2.1.295, also under an empty profile as CI runs them. Six
mutations (no `v_noacg` check, no frames skip, no `node_modules` skip, no rescan after a tool call,
a band drawn with no package, a scan two levels deep) each fail a test. A headless
`claude -p --plugin-dir cli/plugin-guide` session in a scratch folder loaded the module with no
skipped hook or refused tree, and a temporary log line showed the scan finding the package and
ignoring the frames folder. Not seen: the band in a real terminal or the Desktop app (no sign-in
on the build machine and no pseudo-terminal); the phase-4 try-out is where it is looked at.
