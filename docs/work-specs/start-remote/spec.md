# Start Claude Remote Control with /start

## Why and goal

The owner wants to run `/start` once after opening the laptop, then create local Claude Code
sessions from the phone without preparing placeholder conversations. The laptop is RAM
constrained. Authorized by the owner's request on 2026-10-11.

## Scope and decisions

- Claude Code on Windows ensures one managed Remote Control server per repository, shared
  across worktrees. Codex keeps its existing `Ready.` behaviour.
- Use `--spawn worktree --no-create-session-in-dir --capacity 4`. Capacity limits concurrent
  sessions, not idle memory allocation.
- Launch the native CLI hidden with no resident wrapper or polling daemon. Store PID, process
  start time and local logs under the shared Git directory. Reuse only a matching live process.
- Report the server process's working set and private bytes. Do not describe an unmeasured
  server as lightweight or count these numbers as total memory of active sessions.
- Report login, consent, trust or startup failures. Never bypass those checks or forward the
  desktop app's credentials. Running is distinct from a verified phone connection.
- No boot task, power-setting changes, restart loop, cloud work or Codex remote changes.

## Acceptance

### AC-1: Claude /start starts and reuses the server

The first invocation starts one hidden native process in the primary repository directory;
another invocation, including from another worktree, reuses it. No idle conversation is created.
Concurrent invocations cannot start duplicates. The server survives the calling shell exiting.

### AC-2: Failure and stale state are handled honestly

An exited process, stale PID or recycled PID is not reported as running. Missing CLI, login,
first-time consent and workspace trust failures produce actionable output. No other session
is stopped. Status/stop operates only on the recorded matching process.

### AC-3: Memory use is visible

Start and status report working set and private bytes for the server. There is no resident
helper after start. Live Claude idle RAM and phone session creation are checked when CLI
authentication is available; otherwise the limitation is reported explicitly.

### AC-4: Adapters preserve the shared workflow

Claude and Codex adapters still point to the canonical workflow. Codex replies `Ready.` without
starting Claude. Claude reports the result without claiming phone access was verified.

## Verification on 2026-10-11

- AC-1: passed with a temporary native executable: the server outlives its launching shell,
  repeated and simultaneous starts launch one process, and a linked worktree finds the same PID.
- AC-2: passed missing CLI, missing login, consent prompt, early exit, recycled PID and stop
  cases. The real installed Claude CLI returned the login instruction; subsequent status
  confirmed no managed server remained.
- AC-3: working-set and private-byte reporting passed against the native fixture. No launch
  helper remains resident. Actual idle Claude RAM and phone session creation are not checked:
  the standalone CLI is not signed in. Desktop app login did not authenticate that CLI.
- AC-4: shared-instruction checks and their mutation tests passed. Codex retains its existing
  adapter and the canonical workflow's Codex branch replies Ready without starting Claude.
- All 8 lifecycle tests and 7 Windows window-hiding tests passed. Affected repository checks
  passed. Full builds and browser suites are left to pull request CI.

The Windows launcher uses an explicit ShellExecute relay and a short-lived Node process to
avoid inheriting the command tool's pipes. Both helpers exit; only the native server persists.

## Live startup follow-up on 2026-10-11

After CLI login and consent, live startup exposed a delayed rejection: Claude prints
`Error: This folder is already served` and remains alive for roughly a minute before exiting.
Process liveness alone incorrectly reported success during that delay.

AC-2 additionally requires startup to fail on an explicit Claude error and start/status to reject
an already-served error even while the recorded process is alive. Cleanup targets only the
matching failed managed process. Generic historical session errors must not stop an established
server. No retry daemon or takeover of unrelated sessions is added.

The owner's idle manual setup server had no child sessions and was replaced with the requested
background server. Claude temporarily rejected the folder registration after the old process
stopped, then accepted the background server. The native CLI reported Ready with capacity 0/4;
repeated start reused its PID. Its idle process tree contained only Claude: about 115 MiB working
set and 258 MiB private committed memory, with under one second of accumulated CPU time.
Phone session creation still awaits confirmation from the owner.

Follow-up verification: all 13 Windows lifecycle tests passed, including delayed duplicate rejection,
startup errors, late status/reuse rejection and preservation after a generic historical error.
Affected repository checks and git diff --check passed. Full builds remain on pull request CI.
