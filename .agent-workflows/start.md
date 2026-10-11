# start - open a session and prepare phone access

Shared canonical procedure, invoked as `/start` in Claude Code and `$start` in Codex. Only the
owner uses it, when he opens a local session on purpose. No hook, agent, subagent, orchestrator
or workflow invokes it.

The root instructions are already in context. Do not reread them or load unrelated context.

- **Codex:** reply `Ready.` and stop. Its desktop connection already handles remote task creation.
- **Claude Code on Windows:** run
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/claude-remote.ps1 ensure` from this checkout.
  It starts or reuses one hidden, long-running Remote Control server per repository, shared
  across worktrees, without an idle conversation. It survives closing this initial session.
  Report `Ready.` plus the result and measured server memory in one short line.
- **Claude Code elsewhere:** reply `Ready.`; this Windows launcher does not apply.

A running process is not proof of a working phone connection. Never claim phone access was
tested unless a session was actually created from the phone. On failure, report the concrete
reason and the next step instead of claiming the server started. First-time CLI login, Remote
Control consent or workspace trust must be completed interactively on the laptop; do not copy
desktop credentials or automatically answer consent prompts.

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/claude-remote.ps1 status` reports the managed server
and its current RAM. Use `stop` to stop it only when the owner requests it; stopping the server
disconnects its remote sessions. The server is explicitly long-running for phone access, so
do not clean it up when this initial conversation ends.

The launcher itself exits after starting the native CLI. Reported memory covers that server
process only; active sessions and their tools use additional RAM. The laptop must remain awake
and online. After reboot, a stopped server, or a network outage that makes the CLI exit, the
next local `/start` starts it again. This does not install an automatic startup task or change
power settings. The next prompt decides what else to read.
