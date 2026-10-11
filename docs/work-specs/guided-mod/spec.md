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
folder's, cut to one line of plain text (control characters become spaces). Dot folders are
skipped as well as `node_modules` and frames folders, and at most the first 500 folders by name
are looked into, 16 at a time. Packages are sorted by name. The band is "NoaCG", then the names
joined by ` · `, with `+n more` when they do not fit `bodyColumns` (else a lone name or a
count, which the `Text`'s `truncate-end` cuts), measured in terminal cells by a small table
(East Asian wide characters and most emoji count two; joined emoji do not); it gives way
while a survey holds the band. Folders are listed again at `session.start`, at `prompt.submit`
and after a `tool.call` that is not read-only (`isReadOnly`), never on a timer; a package made
outside the session shows at the next prompt. Manifests are read again only when their size or
time changes. The scan runs after the hook has returned, one at a time, and a trigger during a
scan gets one more pass.

**Traps (Claude Code 2.1.287).**
- `$` can never be assigned or passed as a value (`latest = $` is refused by the validator).
  Helpers take closures (`dir => $.fs.list(dir)`) or the state library's `read($, atom)`, and
  one named hook function may serve two events (`on('session.start', scanThenPass)`). Calling
  the closures after the hook returned works, in tests and in a real session.
- A test's `$` has no `fs` noun and no `session.cwd`, so `tests/world.tsx` takes the first
  path the mod lists as the working directory. AC-12's reach test needs a firmer anchor, such as
  an inline test plugin that lists `.` first.
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

**Check findings.** `claude plugin validate --strict` and `claude plugin test` (17 tests, terminal
and desktop) pass on 2.1.287 and 2.1.295, also under an empty profile as CI runs them; CI runs
both builds. Six
mutations (no `v_noacg` check, no frames skip, no `node_modules` skip, no rescan after a tool call,
a band drawn with no package, a scan two levels deep) each fail a test. A headless
`claude -p --plugin-dir cli/plugin-guide` session in a scratch folder loaded the module with no
skipped hook or refused tree, and a temporary log line showed the scan finding the package and
ignoring the frames folder. The same session loaded the mod from `CLAUDE_CODE_PLUGIN_DIRS` in a
profile's `settings.json` `env`, the README's Desktop route, on the 2.1.287 CLI. Not seen: the
band in a real terminal or the Desktop app (no sign-in on the build machine and no
pseudo-terminal); the phase-4 try-out is where it is looked at.

### Check of phase 1 (on `main` at a6545aa9d, by a separate session)

**Verdict: pass.** Re-derived on `main`, not taken from the build's report:
- AC-1: `claude plugin validate --strict` and `claude plugin test` (17 pass, terminal and desktop)
  pass on the 2.1.287 CLI and the Desktop's 2.1.295 binary. 2.1.295 also lists `prompt.submit` and
  `tool.call` as "gating hook without .catch": a fact the validator states, not a warning (a hook
  that throws there is skipped). Loaded with `--plugin-dir` under `claude -p` on both builds, the
  debug log shows the module admitted and its hooks settling (about 14 ms at start, 60 to 90 ms
  at a prompt), with no skipped hook, fault or refused tree. `tsc -p cli/plugin-guide` passes
  once the engine has laid the types.
- AC-2 and AC-3, real run: published `@noacg/cli` 0.10.1 scaffolded `evening/` in a scratch
  folder outside the repository; `validate --screenshots` wrote frames beside it and, run inside
  the package, a `shots/` folder marked `.noacg-frames`. A scratch copy of the mod with debug log
  lines on its reads (the product code unchanged) showed: `evening` found as "Evening news";
  `node_modules` (holding a NoaCG manifest) never listed; a marked folder holding a NoaCG manifest
  listed but its manifest never read; a plain OGraf manifest read and refused; the second scan
  reading no manifest again; the package itself as the working directory found as `.`. In a folder
  with no package it listed `.` and `src`, read no file and stored nothing.
- AC-5: `cli/plugin-guide` is in no file of the five assembled distribution packages
  (`assemble()`), not in `.claude-plugin/marketplace.json`, not in `npm pack --dry-run` (the
  `files` list is `dist`, `skill` and three documents), and no workflow but `guided-mod.yml`
  names it (release-cli.yml and toolkit-distribution.yml name only `cli/plugin` and
  `cli/plugin-mcp`). `check-toolkit-distribution.mjs` passes. The Guided mod workflow ran on
  PR #1001 on both builds (17 pass each); main's CI at the merge was green where finished.

**Not checked.** No model turn ran: the machine's sign-in had expired, so a rescan after a real
tool call and a package appearing mid-session were seen only in the tests. The band was not seen
drawn anywhere outside the test kit.

**Compared with the reference.** Anthropic's `code-modernization`, loaded the same way in an empty
folder, registers three commands, runs shell hooks at session start and takes about 320 ms there;
`noacg-guide` registers nothing and does only two folder listings. Phase 3's `/noacg-guide` is
where that quiet is spent: the reference registers its commands unconditionally.

### After phase 2 (recorded results)

**Layout.** `hooks/watch.ts` is the watching module: it reads `noacg` runs into reports, takes
fingerprints, and folds reports into records and states. `register.tsx` only calls its exports,
so a CLI `status` read replaces that one file; discovery stays in `hooks/packages.ts` (its
`Found` is `{ dir, name }`). `types/index.d.ts` now gives each `NoacgPackage` a `status`
(`checked`, `edited`, `unchecked`) and a `record` (`PackageRecord`: `check` with `ok`, `frames`
with `dir`, `saved` with `url`, `pack` with `url` or `file`, each with `at`, `sha256` and `via`
`terminal` or `mcp`). `tests/cli.ts` holds the published CLI 0.10.1's output, copied from real
runs; `tests/world.tsx` stands the project at `ROOT` (`/work`), answers `session.root`,
`session.cwd` and the store, and runs commands (`world.run`) and MCP calls (`world.mcp`) with
given output.

**Decisions.**
- Paths are anchored on `$.session.root()`, absolute, not on `.`: a shell `cd` moves the
  session's working directory, so phase 1's relative listing could follow it. A terminal run's
  paths resolve against `$.session.cwd()` read before the call and any `cd` in the command; an
  MCP call's against the root, where its server runs. A `cd` inside a subshell ends with it, and
  `pushd`/`popd` are followed. Windows paths compare without case; against a Windows root, Git
  Bash's `/c/...` reads as `c:/...`.
- A check passes only on the CLI's `OK - n error(s)` verdict from a run that exited 0, whose
  frames did not stop part way, and that ran the full gate: `--no-bench`, `--no-house-contract`
  (MCP `bench: false`, `houseContract: false`) pass nothing. A `FAIL` verdict records a failed
  check, which takes an earlier pass back. Anything else (a usage error, a network failure,
  output cut before the verdict, a run in the background) records nothing, so it neither passes
  nor demotes a package. The verdict is tied to its package by the
  `Regenerated the package in <dir>.` line that follows it, which covers loops, pipes and the
  MCP tool. `validate` exits 0 exactly when its report says OK with every frame shot, so where
  several ran in one command each report is its own evidence; a lone one must also end a call
  that exited 0, and a lone one with no such line falls back to the verdict alone.
- A `save` that went through records a passing check and `saved` with the same fingerprint (it
  runs the same gate); one refused for errors fails the check; not logged in records nothing.
  `pack` records `pack` for every package named, never a check. A `screenshot` counts only when
  its output names the file (its `Wrote` line or its JSON), since the call's exit code may be
  another command's. A `scaffold` clears the record of the folder it wrote, so a new package
  where an old one stood starts with none. Frames keep their folder, absolute; through MCP they
  come back as images, so `dir` is null.
- The fingerprint is SHA-256 over lines of path and file SHA-256, in path order, read with
  `$.fs.read(file, { as: 'bytes' })` and hashed in place (`sha256` in `watch.ts`, checked against
  the FIPS 180-4 vectors and Node's on a real package). Left out: the generated files at the
  package's top (the list in `cli/src/workspace.ts`), folders marked `.noacg-frames`,
  `node_modules` and `.git`. A file over 4 MiB (what `$.fs.read` takes) counts by size and time;
  at most 2,000 files, 8 folders deep. File digests are kept in memory by size and time; a file
  that cannot be read is read again next time. It is taken in the `tool.call` hook straight after
  the run, before anything else can edit the files, and on each scan only for packages with a
  passing check. Only the root and folders directly below it are fingerprinted.
- Records live in `$.store` under `records:<root>` as `{ packages: { <dir>: PackageRecord } }`,
  read on every scan that finds a package (no module cache, so a reload or a second session in
  the folder sees the same) and written only when a run is recorded, straight after that read. A
  write that fails keeps its runs for the next scan. The mod writes no file; a
  test refuses `fs.write`. Where no package exists the store is never opened (the quiet tests
  now assert it).
- The band has a second line under the names: the counts with zeros left out, then
  `saved: <names>` as many as fit, else `<n> saved`; with one package, its state alone
  (`checked · saved`). Phase 1's band test was changed on purpose to expect that line.

**Traps.**
- A Bash run that exits non-zero reaches `tool.call` as `isError` with the text
  `Exit code N` and the output; the Bash result has no exit code field. With `--json` the
  report's lines go to stderr, which the session's text includes unless the command drops it,
  and the JSON names no package folder.
- `validate` rewrites the generated half on every run and may rewrite sources on the first
  (normalize, a stale generated half), so the fingerprint must be taken after the run. On a real
  scaffolded package, validating again without an edit kept the fingerprint, and an edit to
  `css/template.css` changed it.
- The scaffold's hint, `noacg validate <dir> --screenshots ./shots`, writes frames beside the
  package, in an unmarked folder; only frames inside a package are marked.
- MCP `pack` also sends to NoaCG Home whenever the machine holds a key, `out` or not.
- `$` still cannot be passed to a helper, so the scan's closures are written out twice, in
  `scanThenPass` and in the `tool.call` hook.
- 2.1.295's validator states `tool.call` and `prompt.submit` as gating hooks without `.catch`;
  the `tool.call` hook catches everything after `next`, so a run it cannot read never fails it.
- In tests, `session.root`, `session.cwd`, `store.get` and `store.set` are answered with
  `{ value }`; `fs.read` asked `as: 'bytes'` answers `{ value: { base64 } }`.
- `crypto.subtle.digest` resolves off the event loop, so the test kit's `clock.settle()` does not
  wait for it. With it, the scan after a run could still be under way when a test looked at the
  band: CI on Linux failed "edited since check, and back" on both builds (PR #1006, run
  38140503638), and six test processes in parallel here failed about one run in three. Hashing
  in place keeps a scan's work on the loop; 42 such parallel runs then passed on both builds.

**For phase 3.** The next step reads `record.check` (`ok: false` is a failed check),
`record.frames` and `record.saved`; "saved and edited since" is `saved.sha256` against the
current fingerprint, which a scan already takes for any package with a passing check. The band
is two lines now; the step makes a third or replaces the counts.

**Check findings (build).** `claude plugin validate --strict` and `claude plugin test` (53
tests) pass on 2.1.287 and on the Desktop's 2.1.295 binary; `tsc -p cli/plugin-guide` passes.
Thirteen mutations each failed a test before the review's fixes, and each fix came with a test
that fails without it. The mutations included: a pass from a run that exited non-zero, a pass
with stopped frames, a screenshot counted as a check, no `FAIL` verdict, generated files or
frames folders in the fingerprint, a fingerprint ignored, records cached past a session start, a
background run read, and paths compared with case on Windows. The watch module, run under Node
on the real output of `npx @noacg/cli@0.10.1` (`validate` passing, failing, with frames, `--json`
and a missing folder, `screenshot`, `save` without a key, `pack --out`, and the same verbs through
`noacg mcp`), reported each as the tests expect. Not seen: a model turn (the machine's sign-in
had expired), so the shape of a real session's `tool.call` result for the MCP tool comes from the
types and the tests; `save` and `pack --save` going through were read from `cli/src`, not run,
since that writes to a real library.

### Check of phase 2 (on `main` at de98eaf52, by a separate session)

**Verdict: fail.** In a real session a terminal `noacg` run records nothing, so AC-6 and AC-9
hold for the MCP form only. Everything else re-derived holds.

**The defect.** The engine's Bash record carries every optional key, `backgroundTaskId` among
them, set to `undefined` on a foreground run. `register.tsx` reads a run as backgrounded with
`'backgroundTaskId' in ran.result`, so every terminal run counts as one in the background and
gives no report. Seen on 2.1.287 and 2.1.295: a passing `noacg validate late` and
`npx @noacg/cli validate late` left `late` "not checked" with no record. The tests miss it because
`tests/world.tsx` answers Bash with `{ stdout, stderr, interrupted }` alone; with
`backgroundTaskId: undefined` added there, 14 of the 53 tests fail on main. A scratch copy that
reads `ran.result.backgroundTaskId !== undefined` passes all 53 with that harness and recorded
every terminal case below correctly. The fix for phase 3: that line, and the harness answering
Bash with the record's real keys.

**How it was run.** The machine's sign-in had expired, so no model turn ran. A scratch driver
plugin (outside the repository) called `$.tool.call` from `prompt.submit`, which goes through
every other plugin's `tool.call` hook, the permission check and the real tool, as a model's call
does. Each step was a new `claude -p` process with `--plugin-dir cli/plugin-guide` from main, a
scratch `CLAUDE_CONFIG_DIR`, published `@noacg/cli` 0.10.1 in a scratch folder, and its MCP
server through `--mcp-config`. The driver logged each value the mod wrote to its `packages` state.

**Per criterion.**
- AC-6, MCP form: a `scaffold` through MCP cleared its folder's record. A passing `validate` was
  recorded as checked. A `validate` of a package with a broken `js/template.js` (FAIL, the
  tool's `isError`) was recorded as `ok: false` and took the earlier pass back. `screenshot` alone
  gave frames with no folder and no check. `validate` with `screenshots: true` gave a check and
  frames with no folder. Terminal form: recorded nothing on main (above). With the one-line fix:
  `validate --screenshots ./shots` gave a check and frames with the absolute folder.
  `scaffold && validate && break && npx @noacg/cli validate` (exit 1, as `Exit code 1` and
  `isError`) ended as a failed check. `scaffold && screenshot --out frames/solo.png` gave frames
  with no check. `save` and `pack` were not run (they write to a real library).
- AC-7: the stored SHA-256 of `evening` (8 files, two binary fonts among them) matched a Node
  script written from the spec's wording. The script leaves out the generated files at the top,
  marked frames folders, `node_modules` and `.git`. After an edit to `css/template.css` outside
  any session, a new session showed the package "edited since check", on both forms.
- AC-8: records are in `<config>/plugins/store/noacg-guide_inline-<hash>.json` under
  `records:<root, lower case>`. The mod writes no file (`validate` lists no `$.fs.write`).
  Every step was a new process, and each started from the states the last one left. A run in a
  folder with no package wrote no state and opened no store key.
- AC-9: main's `band.ts` was run over the states the sessions wrote. It gave
  `1 checked · 2 not checked` after the MCP checks and `1 edited since check · 2 not checked`
  after the edit, at 100 columns and the same at 40. Saved names were not seen in a real run
  (no save).
- AC-1 to AC-5 still hold: `validate --strict` passes on both builds and lists no
  `$.prompt.submit`, `$.mcp.call`, `$.process`, `$.http`, `$.model` or `$.agent` call; 53 tests
  pass on both builds. Under load (16 test processes at once, 4 rounds, both builds, each run about
  ten times slower) 64 of 64 runs passed, so #1007 removed the race. `check-toolkit-distribution`
  passes and no file but `guided-mod.yml` names the folder.

**AC-5's "CI covers it" does not hold in practice.** The Guided mod check is not required: the
main ruleset requires only `CI gate` and `Reviewed`, so #1006 landed with both guided-mod jobs
red. The simplest fix is to run the same two steps as a job in `ci.yml`, skipped unless
`cli/plugin-guide/**` changed, and add it to `CI gate`'s `needs`. A path-filtered workflow cannot
be a required check, since it never reports on pull requests that leave the folder alone.

**Not seen.** A model's own tool call: its result shape is inferred from the driver's, since
`$.tool.call` is documented as the same call. The band drawn on a surface: a plugin's `$` has no
`ui.render` here, so the band text comes from `band.ts`. A real `save` or `pack`. The reference
plugin was not compared: the plan names it for commands and the pane (phases 3 and 4), and
phase 2 has no counterpart.

### Repair of phase 2 (after its check)

**What changed.**
- `register.tsx` reads a shell run as in the background only when its result names a task:
  `typeof ran.result.backgroundTaskId === 'string'`. Terminal runs record again.
- `tests/world.tsx` answers Bash with the engine's record (`shellResult`): every optional key
  present, undefined where it does not apply, as a `tool.call` hook saw it on 2.1.287 and
  2.1.295. PowerShell gets its declared keys; no PowerShell run was seen. `world.run`'s
  `background` is `'asked'` (`run_in_background`) or `'moved'` (moved by its timeout while
  running, as the real one below: no `run_in_background`, a task ID and `timedOutAfterMs`, the
  output so far kept). With the `in` test put back, 14 of 54 tests fail; with no result test at
  all, the `moved` test fails.
- CI: `guided-mod.yml` is gone. Its two steps are now the `guided-mod` job in `ci.yml`, on both
  builds. A step in the `plan` job runs it when the change under test touches
  `cli/plugin-guide` or `ci.yml`. `CI gate` needs the job: a skip passes (the plan is
  required), a failure fails it, a cancel is no verdict. The merge queue runs the same, so a red
  guided-mod run keeps a change from landing. `scripts/e2e-retry.test.mjs` runs the gate's
  shell and asserts that; `scripts/ci-guided-mod.test.mjs` runs the plan step's shell in a
  scratch repository, so a pathspec or base that turns the checks off fails the build.

**Decisions.**
- A string, not `!== undefined`: the declarations type the key `string`, and a real run moved by
  its timeout carried `backgroundTaskId: "btwctsdzw"` with `timedOutAfterMs: 1500`.
- The step diffs against the event's own base: the pull request's base, the merge group's
  `base_sha`, a push's `before`, a dispatch's `diff_base`. Unlike the E2E plan, a push to main
  diffs too: the job's result moves only with these files, since the builds are pinned. With
  no base, or one the clone lacks, the job runs. A change that leaves the folder alone costs one
  `git diff` and no runner. The mod-only manual run is gone with the workflow; run the two
  commands locally, or dispatch `ci.yml`.

**Traps.**
- A plugin that calls `$.tool.call` gets the result back without its undefined keys (the
  checker's driver saw five keys); a `tool.call` hook gets all twenty. Read the engine's shape
  from inside a hook.
- A run moved to the background had empty `stdout` (its output goes to a file), so the verdict
  is missing anyway; the result test is the second guard, for a run moved after printing.
- `tsc -p cli/plugin-guide` type-checks against the tools of the session that last loaded the
  folder. A `claude -p` here has no PowerShell tool, so its types fail the
  `e.tool === 'PowerShell'` comparisons; load once with `CLAUDE_CODE_USE_POWERSHELL_TOOL=1`
  first.

**Real run.** The sign-in was still expired, so the check's method: a scratch driver plugin
calling `$.tool.call` from `prompt.submit`, a new `claude -p --plugin-dir cli/plugin-guide`
process per step, published `@noacg/cli` 0.10.1 in a scratch folder outside the repository, the
CLI's MCP server through `--mcp-config`, and only `noacg`, `npx @noacg/cli` and that MCP tool
allowed. On 2.1.287: `noacg validate late --screenshots ./shots` gave checked and frames with
the absolute folder; `npx @noacg/cli validate solo` gave checked; after an edit to
`solo/css/template.css` outside any session, a new session showed it `edited`. On 2.1.295: a
failing `noacg validate late` (exit 1, `isError`, the result a string) took the pass back
(`ok: false`); `scaffold third && screenshot third --out frames/third.png` gave frames and no
check; MCP `validate solo` gave checked `via: mcp`. Each step started from the states the last
left. No refused tree or skipped hook named the mod. `validate --strict` and 54 tests pass on
both builds; `tsc -p` passes.

**For phase 3.** Nothing in "After phase 2" changes. The guided-mod job is now a required part
of `CI gate`, so a red mod test blocks landing.

### Second check of phase 2 (on `main` at bb56afae9, by a separate session)

**Verdict: pass.** After the repair, terminal runs record in a real session and the guided-mod
job holds `CI gate`. AC-6 to AC-9 were re-derived on both builds, and AC-1 to AC-5 still hold.

**How it was run.** The sign-in was still expired, so no model turn ran. A scratch driver
plugin outside the repository called `$.tool.call` from `prompt.submit`, and its own `tool.call`
hook logged the result as a hook gets it. Each step ran as a new `claude -p --plugin-dir
cli/plugin-guide` process from main. Every process had a scratch `CLAUDE_CONFIG_DIR`, the
published `@noacg/cli` 0.10.1 in a scratch folder first on `PATH`, its MCP server through
`--mcp-config` and an empty credentials folder. For `save` and `pack --save`, `NOACG_URL`
pointed at a local stand-in. It passed noacg.studio's pages through, so the CLI's bridge loaded,
and answered `/api/me/graphics` and `/api/me/packages` itself. That gave the CLI's real output
without writing to any library.

**The repair's trap, confirmed.** In the hook, a Bash result had all 20 keys, with
`backgroundTaskId` present and undefined. The caller got 5. An MCP result reached the hook as an
array of blocks, or as a string when `isError`.

**Per criterion.**
- AC-6, terminal, 2.1.287: `noacg scaffold` gave `evening` an empty record. `noacg validate
  evening` recorded checked (`via: terminal`). After a break to `js/template.js`,
  `npx @noacg/cli validate evening` (exit 1) recorded `ok: false` and took the pass back. Restored,
  `npx` recorded checked. `scaffold solo && screenshot solo --out solo-onair.png` gave frames with
  the PNG's folder and no check. `validate solo --screenshots ./shots` gave a check and frames in
  `.../shots`.
- AC-6, terminal, 2.1.295: `noacg validate third` recorded checked. `save` with no key recorded
  nothing. `pack third solo --out` recorded `pack` with the file on both packages. `save third` to
  the stand-in recorded a check and `saved` with the link. `pack --save` recorded `pack` with the
  link on both. A broken `third`, then `save` (refused, exit 1), recorded `ok: false`.
- AC-6, MCP, 2.1.295: `scaffold` gave an empty record. `validate` recorded checked
  (`via: mcp`); after a break it recorded `ok: false`. `screenshot` gave frames with `dir: null`
  and no check, and `validate` with `screenshots: true` gave both. `save` with no key recorded
  nothing. `pack` with `out` recorded the file. `save`, and `pack` with `save: true`, to the
  stand-in recorded the saved and sent links.
- AC-7: a Node script written from the spec's wording gave the stored `3f50429e…` for a copy of
  `evening` taken at its pass. Validating again after restoring the broken file stored the same
  value. An edit inside a session (a Bash `echo >>` to `css/template.css`, not a `noacg` run)
  marked `evening` edited at once. An edit outside any session marked `solo` edited in the next
  session, on both builds.
- AC-8: records are in `<profile>/plugins/store/noacg-guide_inline-<hash>.json` under
  `records:<root, lower case>`. The packages hold only the CLI's files, and the checkout's
  `git status` stayed clean. Each new process started from the states the last one left. In a
  folder with no package, a Bash run wrote no state and made no store folder.
- AC-9: main's `band.ts` was run over the states the sessions wrote. It gave, in order:
  `1 checked · 1 not checked`, `2 checked`, `1 checked · 1 edited since check`,
  `2 edited since check` and `2 checked · saved: Solo, Third`. After the outside edit it gave
  `1 checked · 1 edited since check · saved: Solo, Third`, or `· 2 saved` at 40 columns.
- All 25 sessions loaded the module. None logged a skipped hook, fault or refused tree naming
  the mod.
- AC-1 to AC-5: `validate --strict` passes on both builds, and its call list has no
  `$.prompt.submit`, `$.mcp.call`, `$.process`, `$.http`, `$.model` or `$.agent`. 54 tests pass
  on both builds. Under load (16 test processes at once, 6 rounds) 92 of 96 runs passed. All four
  failures were in the first, cold round: the test kit's 5-second limit on the first terminal
  test of `band.test.tsx` or `quiet.test.tsx`, which took about ten seconds there. No assertion
  failed, and the other 80 runs passed. On #1011 the plan step printed `Guided mod checks: true`
  and both legs ran (54 pass each), as did the merge group. The ruleset requires `CI gate`.
  Run on its own, the gate's shell from `ci.yml` exits 1 and names the job when the guided-mod
  result is `failure`, exits 1 on `cancelled`, and exits 0 on `success` or `skipped`. The two
  CI script tests pass, `check-toolkit-distribution` passes, and only `ci.yml` and its test
  name the folder.

**For phase 3 and the try-out.**
- `pack --save` runs the save gate on each graphic but records only `pack`, as decided. A save
  refused for errors records `ok: false` and keeps the old `saved` record. The next step must read
  the check before the saved record.
- On this machine the global `noacg` is 0.3.3, not 0.10.1. A run through it gives output the mod
  may not read. The try-out should start with `noacg --version` or use `npx @noacg/cli`.

**Not seen.** A model's own tool call; the band drawn on a surface (its text comes from
`band.ts`); a save into a real library (the stand-in took it). There was no reference comparison:
the plan names `code-modernization` for commands and the pane, and phase 2 has no counterpart.

### After phase 3 (one next step)

**Layout.** `hooks/steps.ts` holds the next step (`stepOf`), the attention order (`firstStep`)
and the link "Open in NoaCG" opens (`linkOf`). A scan stores each package's step in
`NoacgPackage.next` (`NextStep`: `rank`, `label` for the band, `request` for the prompt box,
`warning`), so phase 4's pane reads the same steps. `types/index.d.ts` adds `hidden` and `offer`
to the mod's `$.state`. `watch.ts` gains `runsNoacg` (a command line runs the CLI, any verb). The
band's third line is the step's label, then **Fill prompt**, **Open in NoaCG** (a `Link`) and
**Hide**. `tests/world.tsx` records `commands`, `fills` and `toasts`, answers `prompt.fill` as
`world.box` says (`takes`, `no_composer`, `dialog`), and runs `/noacg-guide` (`world.command`).
`tests/steps.test.tsx` covers AC-10 to AC-13.

**Decisions.**
- `/noacg-guide` is registered in every session, at the first dispatch of a load (the session's
  start), with `immediate: true`. AC-13 needs it in a folder with no package, so it cannot wait
  for one. It costs one registration: `session.start` settled in 16.5 ms in an empty folder (about
  14 ms in phase 1), and none of the attachments a prompt carries names it (`skill_listing`
  among them, seen through a driver's `session.append` hook on 2.1.287). A plugin's
  `$.command.register` command reaches the person's typeahead, not the model. The quiet tests
  were changed on purpose to expect exactly `['noacg-guide']` and no fill or toast.
- The command answers no text (`{}`): it shows the band again and, when it finds no package,
  sets `offer`, which draws **Start a package** until a package appears (run where packages
  exist, it clears `offer`, so the offer never outlives them). It fills "Make broadcast graphics with NoaCG."
  Phase 4 decides the pane and the text answer where nothing draws.
- Steps, lowest rank first: 0 the last check failed, 1 edited since check, 2 not checked, 3 no
  frames of the files as they are, 4 ready ("Save X, or send all graphics to a production"), 5
  saved and edited since ("Save X again", the request saying "as a second copy"). A package
  whose files are those it saved or packed (sent, or written to a file: the no-account way to a
  production) has no step, frames or not, and so does one edited back to them: once saved, the
  band stops asking. The warning "saving again adds a second library copy" rides on
  any step of a package saved and edited since. The check is read before the save, as the second
  phase-2 check asked. Equal ranks go by the band's order, by name. `stepOf` derives the status
  from the record itself, so a step cannot disagree with it.
- Requests name the package and its folder ("Check Evening news in evening/."); the band shows
  the shorter label. No "Next:" prefix: the label stands beside a Fill button.
- **Fill prompt** reads the box first (`$.prompt.read`): an empty box takes the request
  (`replace`), a draft keeps it on a line after (`append`), and a box already holding it is
  left alone. On any `isFilled: false` the request shows as a 12-second toast.
- **Open in NoaCG** is a `Link`: the surface opens it, and the mod makes no call. It is the
  newer of the step's package's saved link and sent pack; with no step, the first package with a
  link. Only an `http(s)` address is drawn: the links come from command output.
- **Hide** is session state. It comes back with `/noacg-guide`, or with any `noacg` run: a
  terminal command naming the CLI with any verb, in the background too, or the MCP tool.
- AC-12 is checked in CI: the guided-mod job's validate step fails when the validator lists a
  `$.prompt.submit`, `$.mcp.call`, `$.process`, `$.http`, `$.model` or `$.agent` call, or a
  `$.tool.call`, `$.command.run` or `$.session.append`/`send` (the "Buttons never act" boundary). The reach
  test moves the shell's folder outside the project root, runs commands and an MCP call naming
  folders outside it, presses every button and runs the command; the harness throws on any path
  outside `ROOT`. That is the firmer anchor phase 1 asked for.
- Fixed in phase 2's reading: `scaffold && validate` in one command lost the check, since the
  scaffold's reset was folded in after it. Seen in a real run on 2.1.295; the scaffold's reset now comes first,
  since a scaffold writes only into an empty folder and so precedes any other run on it in the
  same command, with tests.

**Compared with the reference.** `code-modernization`'s Next calls `$.prompt.fill` with the
default `replace` and toasts `Next: <text>` when `isFilled` is false; its commands are registered
at `session.start` in every session, the panel command `immediate`, each answered by its own hook.
Taken: the fill and its toast fallback (without the prefix, so the toast reads as the request),
registration at start, `immediate`, a hook that answers its own command. Left: its three
commands, shell hooks and two timers at start, a pane that opens unasked, steps marked to do by
hand, and the text answers ("Modernization pane shown"). Its hidden pane leaves a one-line bar;
here **Hide** hides the whole band.

**Traps.**
- A plugin cannot hook the same event twice without a matcher ("on("session.start") is
  registered twice"), and `$` cannot be passed on, so the registration lives in `scanThenPass`
  behind a module flag that a reload resets; a registration that failed is tried again at the
  next prompt.
- 2.1.295's validator reads a `command.run` hook as gating unless both the matcher and the
  `$.command.register` call spell the name as a literal; through a constant it was "gating hook
  without .catch".
- In Git Bash, `claude -p "/noacg-guide"` reaches Claude Code as `C:/Program Files/Git/noacg-guide`
  unless `MSYS_NO_PATHCONV=1` is set. With it, on both builds, the hook ran, made no model call,
  and the run printed an empty result and exited 0. The engine appended two `command` rows, which
  a later turn's model reads, so any text answer in phase 4 becomes context when the person runs
  the command.
- Another plugin's `$.command.list()` under `claude -p` does not list `/noacg-guide`, though the
  debug log says "$.command.register (noacg-guide): /noacg-guide listed".
- Under `claude -p`, `$.prompt.fill` answers `{ isFilled: false, refusal: 'no_composer' }`, so
  Fill there is the toast.
- `--allowedTools Bash` and `Bash(npx:*)` are dropped as dangerous under `-p`; a plugin's
  `$.tool.call` still runs ("Skipping auto mode classifier for Bash: called by plugin").
- A found `Link`'s `text` in the test kit is its address and its label run together; read
  `children`.
- `tsc -p` trap from phase 2 still holds: a plain `claude -p` relays the types without
  PowerShell.

**Check findings (build).** `claude plugin validate --strict` passes on 2.1.287 and 2.1.295
and lists `$.clock.now`, `$.command.register`, `$.fs.list`, `$.fs.read`, `$.prompt.fill`,
`$.prompt.read`, `$.session.cwd`, `$.session.root`, `$.state.*`, `$.store.*`, `$.ui.resolve`
and `$.ui.toast`; 2.1.295 lists the command hook as "answers its own command". `claude plugin test`: 69 tests
pass on both builds; `tsc -p cli/plugin-guide` passes. Seven mutations each failed a test: no
toast fallback, no return on a `noacg` run, the attention order reversed, `offer` on by default
(the quiet tests), no root filter on a run's target (the reach test), the scaffold folded after
the check, and frames asked of a saved package. Real run, as "How a phase is checked" says: a
scratch driver plugin calling `$.tool.call`, a new `claude -p --plugin-dir cli/plugin-guide`
process per step, a scratch profile, and published `@noacg/cli` 0.10.1 through `npx -y`. On
2.1.287: two scaffolds gave "Check Evening news" and "Check Scores"; `validate evening` and
`validate scores --screenshots ./shots` gave "Show the frames of Evening news" and "Save Scores,
or send all graphics to a production"; `pack scores --out` left Scores with no step; an edit to
`evening/css/template.css` gave "Check Evening news again"; a broken `js/template.js` and a
failing validate gave "Fix Evening news and check it again". On 2.1.295: `scaffold fourth &&
validate fourth --screenshots ./shots` gave "Save Fourth, ..." once the fix above was in, and
`/noacg-guide` there set `hidden` and `offer` false; in an empty folder (2.1.287) it set `offer`
true. Its first try set `offer` true beside packages: under `claude -p` the command ran before the
session's first scan ended, so it now waits for a scan under way. No skipped hook, fault or
refused tree named the mod.

**Review.** The pre-merge review's ten findings, all checked against the code: fixed were the
narrow CI pattern, a failed registration never retried, Fill over a typed draft, an offer
outliving the packages, a link of any scheme, a package edited back to its saved files still
asked to be checked, and the `status` argument that could disagree with the record. Kept, as
decided above: a pack written to a file ends the steps, the link is the named package's only,
and a scaffold's reset is read first (a scaffold needs an empty folder, so `validate x;
scaffold x` cannot happen). The simplify pass then shared the shell test in the tool hook, read
the band's three values at once, started the scan before the registration, and drew one band
frame for both the offer and the packages. It left the CI pattern a list of what is ruled out
rather than of what is allowed, as AC-12 words it.

**Not seen.** The band drawn on a surface, a Fill landing in a real prompt box, and a click on
the link: no sign-in and no pseudo-terminal here, so they are the phase-4 try-out's. A save went
through only in the tests, so the second-copy warning comes from them.
