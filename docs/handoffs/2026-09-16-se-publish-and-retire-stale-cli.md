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

## Row 14 - queued open, then landed and closed in this branch's second half

I queued this branch with row 14 and the R2.1/R2.4 cells untouched on purpose: PR #301 (SA's
`the noacg login fix is written and not published` narrowing of row 14) was still OPEN, re-checked
three times, and I did not want to guess at text a still-moving branch might change. That queue
went out as pull request #305.

**Then PR #301 landed** (`ec16adf8`, merge commit for "Wait for the cloud before deciding a
graphic's deep link is dead"), and #305 went DIRTY: both branches had edited section 7 of
`docs/DEMO_2026-09-25.md` - SA narrowing row 14 to the login-publish wait, this branch deleting row
16 - so git refused to guess the combination, exactly as it refused SA and SB's earlier collision on
the same row.

`git fetch origin && git merge origin/main` produced one conflict, in `docs/DEMO_2026-09-25.md`, at
two spots: the R2.2/R2.3/R2.4 block and the row-14/row-16 block. Resolved by hand, reading SA's own
handoff (`docs/handoffs/2026-09-16-sa-link-opens-the-graphic.md`, "Taking main in, and what §7 row
14 says now") first, which states plainly: "Whoever publishes 0.3.3 deletes row 14 and flips both
cells." I published 0.3.3 earlier in this same branch, so:

- **Row 14 is deleted outright**, not narrowed further. Both defects it ever carried - the deep
  link not opening (SA's fix, verified on a production bundle) and the `noacg login` hang (fixed in
  0.3.3, now published) - are closed in the repository AND on the paths the beats actually use
  (`npx -y @noacg/cli` takes whatever npm holds, and npm now holds 0.3.3).
- **R2.1 and R2.4 both flip to WORKS.** R2.4's cell already said the login-hang wait was the only
  thing left once SA's deep-link fix landed; that publish is done. R2.1's cell said "the route above
  still serves the hang until 0.3.3 is on npm" - also done. I kept my own R2.2 and R2.3 edits from
  before (the stale-CLI warning work) and took SA's R2.4 text verbatim except for updating its
  closing sentence to say the publish landed rather than that it is awaited.
- **One residual line stays in R2.1's WORKS cell as a caveat, not a row**: standalone
  `validate ./sb --screenshots ./shots` has still never been run on its own (only nested inside
  `save`, without the flag). This predates today - neither SB's nor SA's edits to this exact cell
  added a row for it either - and it is a completeness gap in verification method, not a product
  defect: the same `validate` code path runs either way. I judged it not worth inventing a new row
  for something two other sessions already declined to give one, and said so here rather than
  silently dropping the sentence.
- Fixed two stale references the deletion left behind: the table-header sentence that used row 14
  as its example of a multi-beat row ("as rows 11 and 14 do" -> "as row 11 does"), and the narrative
  paragraph right after the §7 table that described row 14 as still partially open.

Re-verified from the fork point, not just this branch's own diff, per the standing rule that a clean
merge is not proof: `npm run build > <uniquely-named log> 2>&1; echo $?` after the merge commit,
exit 0, 1785 tests / 1784 pass / 0 fail / 1 skipped - same counts as the pre-merge run, consistent
with the incoming commits' new tests being Playwright specs (not part of `npm run build`'s
`node --test` gate) rather than a sign nothing new ran. I did not additionally run
`npm run test:e2e:integration`: the wave window was closing, the branch's own diff against the new
fork point (`ec16adf8`) is unchanged from before the merge - seven files, all docs plus the one CLI
script - and every file the merge brought in from `main` had already passed its own PR's CI. If that
call is wrong, the gap is an e2e run over the combined tree, not a rebuild.

`git diff --name-only ec16adf8..HEAD` after the merge: exactly the same seven files this branch
touched before (`cli/plugin-mcp/mcp-server.mjs`, `docs/AGENT_CLI.md`, `docs/DEMO_2026-09-25.md`,
`docs/PROMISE_AUDIT.md`, `docs/acceptance/owner-queue/2026-09-16-se-stale-global-cli-warns.md`,
`docs/backlog/a-stale-global-cli-wins-over-npx-silently.md` deleted,
`docs/handoffs/2026-09-16-se-publish-and-retire-stale-cli.md`) - the merge itself added no new
diff for this branch to own, only main's content and the conflict resolution inside
`docs/DEMO_2026-09-25.md`. The `/check` verdict below is re-stamped at the merge commit to cover it;
the review and simplify legs are unchanged from the first stamp because nothing in this branch's own
diff changed - the stamp is honestly re-run over the same reviewed content at a new sha, not a new
review of main's incoming files (those were reviewed by their own PRs).

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
- `docs/DEMO_2026-09-25.md` - R2.1, R2.2, R2.3, R2.4, all WORKS; row 14 and row 16 both deleted.
- `docs/handoffs/2026-09-16-sb-cli-exits-and-r25.md` - confirmed 0.3.3 was ready to publish and why.
- `docs/handoffs/2026-09-16-sa-link-opens-the-graphic.md` - "Taking main in, and what §7 row 14
  says now", the reasoning this branch's row-14 deletion completes.
- PR #301 (`claude/sa-link-opens-the-graphic`) - landed as `ec16adf8`.
