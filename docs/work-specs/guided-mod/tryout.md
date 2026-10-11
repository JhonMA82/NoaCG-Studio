# Try-out: the guided package mod

A walk through `noacg-guide` (`cli/plugin-guide/`) to judge how it feels before it is published or
joins the toolkit. It takes about 15 minutes of your own time, plus a few minutes of setup and
however long Claude takes to make and check the package in step 1. Nothing waits on it: what you
notice becomes the next plan, or the mod is dropped. The README says what the mod does; this says what to try and what to look at.

## Before you start (about 5 minutes)

- Pull `main` in your checkout of NoaCG Studio.
- Be signed in to Claude Code: `claude auth status` should say `"loggedIn": true`; if not, start
  `claude` and run `/login`.
- Use the CLI through `npx`: the global `noacg` on this machine is an old 0.3.3. Your first
  prompt below tells Claude so.
- Sign the CLI in to NoaCG now, so the save in step 4 goes straight through: run
  `npx -y @noacg/cli@0.10.1 whoami`. If it says "Not logged in", run
  `npx -y @noacg/cli@0.10.1 login` and approve it in the browser page that opens.
- Make an empty folder for the walk, for example `C:\shows\tryout`, and start Claude Code there
  in a terminal at least 110 columns wide, so the pane can sit beside the conversation:

  ```
  cd C:\shows\tryout
  claude --plugin-dir C:\claude\NoaCG-Studio\cli\plugin-guide
  ```

**Look for:** nothing new on screen. An empty folder gets no band, no message and no extra
context.

## 1. A new brief to a package (5 minutes, plus Claude's work)

Type `/noacg-guide`. A pane opens with **Start a package** selected. Press Enter, then Esc: the
pane closes and you are back in the prompt with the request in it. Finish the prompt and send it:

> Make broadcast graphics with NoaCG. A lower third for the evening news: name and title. Use
> `npx -y @noacg/cli@0.10.1` for every noacg command; the global `noacg` here is an old 0.3.3.

Let Claude make and check the package. How long that takes is up to Claude's pace, not yours.

**Look for:**
- The band appears as soon as the package exists, with its name and "not checked". (While the
  pane is open the band steps aside, since the pane shows the same.)
- After Claude's check, the step moves on by itself: "See how ... looks", then "Save ..., or send
  all graphics to a production". The step reads as something you would say.
- **Fill prompt** only fills the box; nothing is sent until you press Enter.
- `/noacg-guide` again shows the pane: the state, the time of each record, and the frames folder.
  Click (or Ctrl+click) the folder: it should open in Explorer. Esc closes the pane.

## 2. An edit after a check (3 minutes)

Ask for a change ("make the strap blue"), or edit the package's `css/template.css` yourself and
send any prompt.

**Look for:**
- "edited since check" and "Check ... again" in the band.
- **Fill prompt** in the band, then Enter: after Claude checks it, the package is back to
  checked. Open the pane: the record times changed.

## 3. Resuming in a new session (2 minutes)

Type `/exit`, then start Claude Code again in the same folder with the same command.

**Look for:** the same states and the same next step before you type anything, and the same
record times in the pane. Nothing was written into the package folder.

## 4. The hand-off to NoaCG (3 minutes)

Press **Fill prompt** on the save step and send it. The CLI is signed in from before you started;
if the save says it is not, run the `login` line from there and send the prompt again.

**Look for:**
- The package has no step once it is saved, and **Open in NoaCG** opens it in your library.
- Edit it once more (as in step 2). The band adds a line, "saving again adds a second library
  copy", and it is whole at your terminal's width.
- Optional: ask Claude to send all graphics to a production. **Open in NoaCG** then opens the
  production.

## If you have time

- **Hide**, then a `noacg` run or `/noacg-guide`: the band comes back.
- A narrow terminal (under 110 columns): the pane opens above the prompt instead of beside it.
- The Desktop Code tab: add the `CLAUDE_CODE_PLUGIN_DIRS` line from the README and start a new
  session there.

## What to tell me

What felt unclear or in the way, any text that was cut or wrong, a step you would not have sent,
and whether you would keep it. To turn it off, start Claude Code without `--plugin-dir`.
