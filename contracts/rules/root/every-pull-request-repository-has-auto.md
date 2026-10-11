---
v: 1
scope: **
kind: rule
fires: contract
status: active
since: 2026-10-11
supersedes: root/auto-fix-always-repository-pull-requests
record: contracts/records/root/2026-10-11-every-pull-request-repository-has-auto.md
---
Every pull request of this repository has Auto-fix on, turned on without asking. One fixer per pull request: the Claude app's Auto-fix, the Codex chat's scheduled task, or for a wave row its orchestrator. A repair never loosens a test, check or limit, never deletes or skips a spec, and never writes a test-maintenance entry or a budget exception to make a gate pass; a spec that fails then passes on one commit goes to quarantine.
