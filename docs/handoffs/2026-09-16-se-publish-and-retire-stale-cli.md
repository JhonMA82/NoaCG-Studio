# SE - publish 0.3.3, retire the stale CLI

Branch `claude/se-publish-and-retire-stale-cli`.

## Done

**`@noacg/cli` 0.3.3 is published, verified independently, and this laptop is on it.**

- `npm view @noacg/cli version` -> `0.3.3`. `npm view @noacg/cli dist-tags.latest` -> `0.3.3`.
  Provenance attestation present: `https://registry.npmjs.org/-/npm/v1/attestations/@noacg%2fcli@0.3.3`,
  predicate type `https://slsa.dev/provenance/v1`.
- The publish succeeded on the **first attempt** - no 202/404 race. `npm run release:cli`'s own
  registry poll read the version straight away rather than needing its six-minute retry window;
  the run was `cli-v0.3.3` (35113488486), 58 s, every step green including the GitHub Release.
- This machine's global install: `npm i -g @noacg/cli@latest`, then `noacg --version` -> `0.3.3`
  (was 0.2.0). Run only after `node scripts/e2e-runs.mjs` confirmed no other row was mid-measurement.

**The stale-CLI backlog is closed on the mechanism, not the one-time install.**
`docs/backlog/a-stale-global-cli-wins-over-npx-silently.md` is deleted (this repo's convention for
closing one, per `dbffbb29`). `cli/plugin-mcp/mcp-server.mjs` now reads the resolved copy's own
`package.json` version and compares it, off the startup critical path, against npm's `latest` -
cached to a day-scoped file (write-then-rename, since concurrent `noacg-mcp` processes in separate
worktrees can race the same file), 1.5 s registry timeout, silent on any failure. A mismatch prints
on the stderr channel the npx-fallback notice already used. The check runs only when `resolveCli()`
did **not** return the `NOACG_CLI` override path - checking merely whether the env var is set was a
review finding: a stale or deleted override falls through to a normal resolve, and that resolved
copy still needs the check. `NOACG_CLI_LATEST_CACHE_FILE` is a new override so a diagnostic run can
avoid the shared cache path.

Verified by hand, three shapes: no override + mismatched planted cache -> warns and prints the exact
line; no override + matching real registry -> silent; valid `NOACG_CLI` override -> silent even with
a mismatched planted cache; stale/nonexistent `NOACG_CLI` path -> falls through and warns.

**`docs/DEMO_2026-09-25.md` section 7 row 16 is closed, R2.3's status cell reads WORKS.**
`docs/AGENT_CLI.md` and `docs/PROMISE_AUDIT.md` updated to describe the fix instead of the open
defect. R2.2's cell (the fresh-machine beat) updated too, since it cited the now-deleted backlog
file.

**`docs/acceptance/owner-queue/2026-09-16-se-stale-global-cli-warns.md`** carries a under-a-minute
route: plant a fake `latest` in a scratch file via `NOACG_CLI_LATEST_CACHE_FILE`, run the launcher
with stdin closed, read the stderr line, clean up. Verified by running it exactly as written.

**`/check` ran in full, inline, in this turn** (no background subagents - the trap named in the
prompt). `review-request.mjs` scope: base `d5a9a86b`, 5 files plus 1 deletion
(`cli/plugin-mcp/mcp-server.mjs`, `docs/AGENT_CLI.md`, `docs/DEMO_2026-09-25.md`,
`docs/PROMISE_AUDIT.md`, `docs/acceptance/owner-queue/2026-09-16-se-stale-global-cli-warns.md`,
deleted `docs/backlog/a-stale-global-cli-wins-over-npx-silently.md`). Scope-checked against
`git diff --name-only` from the merge base: matched exactly.

- `review: delegated` (5/5 fixed) - the code-review skill forked and returned five findings
  directly: the override-detection gap above, the registry read sitting on the startup critical
  path, an unguarded shared cache file racing across concurrent `noacg-mcp` processes, the
  acceptance walk's route writing into that same shared cache, and an `AbortController` constructed
  outside its own try/catch. All five fixed.
- `simplify: inline` (1/1 fixed) - the simplify skill returned fan-out instructions (launch four
  background agents), which this workflow counts as not run, so the pass was done here: found and
  removed one duplicated condition (`usedOverride` re-derived `resolveCli()`'s own override check;
  replaced with `cli !== process.env.NOACG_CLI`, since `resolveCli()` returns the override path
  verbatim when it uses it).
- `verify: inline` - `npm run build > <uniquely-named log> 2>&1; echo $?` twice (once before the
  simplify commit, once after), both exit 0, both 1785 tests / 1784 pass / 0 fail / 1 skipped.
- `taste: not applicable` - nothing here can move what a graphic looks like.
- Verdict stamped at `c1aa1f28`: PASS.

## What is left, and why

**Section 7 row 14 and the R2.1/R2.4 status cells are not touched here, on purpose.** Mid-session
the wave coordinator asked this row to also close row 14 (`the noacg login fix is written and not
published`) and flip R2.1/R2.4 to reflect the publish, since row SA's PR #301 narrowed row 14 to
exactly that condition and the condition is now true. I re-checked `gh pr view 301` three times
across this session (most recently just before queuing) and it is still **OPEN, not merged** -
`headRefName: claude/sa-link-opens-the-graphic`, `"Wait for the cloud before deciding a graphic's
deep link is dead"`. Per the coordinator's own fallback instruction, I did not wait for it and did
not guess at its text.

**The one thing left: once PR #301 lands on `origin/main`, delete section 7 row 14 and flip both
the R2.1 and R2.4 status cells** in `docs/DEMO_2026-09-25.md` to reflect that `@noacg/cli` 0.3.3 -
carrying the `noacg login` exit fix - is now on the npm registry, so `npx -y @noacg/cli login`
serves the fixed version rather than the hanging 0.3.2. Read SA's branch and its own handoff first;
it differs from `main` by exactly two lines there (row 14, and the last sentence of R2.4's status
cell) and carries the reasoning to complete. Do not touch rows 12, 15, or 17 - untouched by this row
and edited by others today.

**Not done, and separable on purpose** (per the closed backlog file's own framing): `doctor` still
reports only the version of the copy running it, and does not separately name what `resolveCli()`
would resolve to. Teaching it to do both was the backlog file's second, harder-to-decide proposal;
this row implemented the first (the launcher's own warning) and left the second open rather than
guessing at a product decision.

## Traps not in any repo file

- **The npm-registry check must run after the CLI import, not before it**, or it reintroduces
  exactly the per-session latency this launcher exists to eliminate (see the file's own header
  comment on why `npx` was replaced). The fix fires the check with `.then()`/`.catch()` rather than
  `await`, so the warning - if any - can print a beat after the real MCP server is already live.
- **`NOACG_CLI` being *set* is not the same as `resolveCli()` having *used* it.** A stale or deleted
  override path falls through to a normal resolve inside `resolveCli()`; checking the env var alone
  would have silently exempted exactly the stale-global case the whole fix exists to catch. Compare
  against `resolveCli()`'s actual return value instead of re-deriving the condition.
- **The version-cache file is shared by every `noacg-mcp` process on the machine**, and this repo
  runs many concurrent worktrees deliberately. Any diagnostic that writes to it directly (as the
  first draft of the acceptance walk did) can leak a planted value into another session's real
  warning. `NOACG_CLI_LATEST_CACHE_FILE` exists so a walk never has to touch the shared file.
- **A background bash task's log stopping growth does not mean the command finished** - `npm run
  build`'s `node --test` phase can pause visibly between large test files. Waiting on a bounded
  background watcher that polls log size is not the same as reading the command's own exit code;
  the coordinator caught this mid-session and the final verification here was run synchronously
  with `echo $?` immediately after, per the root rule about reading a build's own exit code.

## Pointers

- `cli/plugin-mcp/mcp-server.mjs` - `readOwnVersion`, `fetchLatestVersion`, and the check site
  guarding the CLI import.
- `docs/AGENT_CLI.md` - "Releasing to npm" (the recipe followed here) and the "Closed 2026-09-16"
  paragraph replacing the open-defect description.
- `docs/acceptance/owner-queue/2026-09-16-se-stale-global-cli-warns.md` - the owner's under-a-minute
  route.
- `docs/DEMO_2026-09-25.md` - R2.2, R2.3, and (still open) row 14 / R2.1 / R2.4.
- `docs/handoffs/2026-09-16-sb-cli-exits-and-r25.md` - confirmed 0.3.3 was ready to publish and why.
- PR #301 (`claude/sa-link-opens-the-graphic`) - open at the time of writing; carries the row-14
  narrowing this handoff's "what is left" section completes.
