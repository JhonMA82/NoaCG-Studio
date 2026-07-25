---
description: Delegate to Codex safely - always backgrounds the task and polls for you, since foreground silently dies past 10 minutes and background jobs otherwise get no automatic follow-up
argument-hint: '[--model <model|spark>] [--effort <none|minimal|low|medium|high|xhigh>] [--resume|--fresh] <what Codex should investigate, solve, or continue>'
allowed-tools: Bash, PowerShell, Agent
---

Raw user request:
$ARGUMENTS

## Why this command exists, not `/codex:rescue` directly

`/codex:rescue` with no flag defaults to foreground, and real rescue tasks in this repo routinely
run 10-35 minutes - well past the Bash tool's hard ~600-second cap. A foreground call that runs
long gets silently killed with **no output at all** (the plugin's own rule for that case: "if the
Bash call fails, return nothing"). Backgrounding avoids the kill, but then `/codex:status` and
`/codex:result` are both `disable-model-invocation: true` - you can never check on a background
job by calling those slash commands yourself, only the user typing them can. This command does
both halves: force background, then poll the underlying script directly and report back.

## Procedure

1. **Force background.** Take the raw request above. If it already contains `--background`,
   leave it. If it contains `--wait`, drop that token (foreground is not safe for tasks in this
   repo). Either way, make sure `--background` is present before forwarding.

2. **Launch.** Invoke the `codex:codex-rescue` subagent via the `Agent` tool
   (`subagent_type: "codex:codex-rescue"`), forwarding the modified request exactly as
   `/codex:rescue` would. Its reply is one line: "`<title>` started in the background as
   `<jobId>`. Check `/codex:status <jobId>` for progress." Extract `<jobId>`. If the launch fails
   or returns nothing, stop and tell the user plainly - do not retry silently.

3. **Resolve the plugin root.** List `~/.claude/plugins/cache/openai-codex/codex/` (Windows:
   `%USERPROFILE%\.claude\plugins\cache\openai-codex\codex\`) and pick the highest semver version
   directory present. Call that `<plugin-root>` below.

4. **Poll directly - never through the disabled slash command.** `/codex:status` can't be
   invoked by you automatically, but the script it wraps has no such restriction when called
   directly. Roughly every 60-90 seconds, run:
   `node "<plugin-root>/scripts/codex-companion.mjs" status <jobId> --json`
   and read the job's `status`/`phase`. Chain further Bash/PowerShell calls as needed - one tool
   call may itself run out of time before the job finishes. Keep going until `status` is
   `completed`, `failed`, or `cancelled`. Tell the user once, early, that you're polling in the
   background instead of going silent for the rest of the turn.

5. **Detect a hang instead of waiting forever.** If `phase` doesn't move (e.g. stuck at
   `starting`) and the job's log file gets no new line for several consecutive polls (roughly
   5+ minutes with zero log progress), stop polling. Tell the user the job appears hung, quoting
   the log file's last line and its timestamp. Do not keep waiting silently, and do not launch a
   duplicate job as a silent workaround.

6. **Report the result in full.** Once `status` is `completed` (or `failed`/`cancelled`), run
   `node "<plugin-root>/scripts/codex-companion.mjs" result <jobId> --json` and present the
   complete result - verdict, summary, findings, file paths - the same fidelity `/codex:result`
   would give, not paraphrased or condensed.

## Rules

- Never fall back to foreground for anything nontrivial here - avoiding that failure mode is the
  entire point of this command.
- The Agent tool call returning is only proof the job was *queued*, not that it's done. Steps
  4-6 are what actually confirm completion.
- If the plugin directory from step 3 doesn't exist, Codex isn't installed the way this command
  expects - stop and point the user at `/codex:setup`.
