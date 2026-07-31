# handoff - end-of-session handoff

Shared canonical procedure for the `handoff` workflow - invoked as `/handoff` in Claude Code,
`$handoff` in Codex. Cross-references to other workflows below use their plain names (e.g.
"the safe-merge workflow"); translate as `/safe-merge` in Claude Code, `$safe-merge` in Codex.

End-of-session handoff for **NoaCG Studio**. Usually run right after the safe-merge workflow,
so the work is typically already committed, merged, pushed, and validated. Do NOT redo that
work.

Optional focus from the user, if one was given at invocation.

## Output

**The question this workflow answers is "what should be done next?"** Everything else is
optional weight. No "what happened" summary, no hygiene checklist, no validation status
section, no mention of other branches or worktrees (the user prunes those deliberately, in
their own sessions).

### 1. What's next

A short list, best next step first. Concrete enough to act on without re-reading the chat.
Scope it to THIS session's line of work - never "go merge branch X". Include:

- **Unfinished work known only from this chat** - a half-done feature, a bug found but not
  fixed, a design agreed but not built, a decision deferred. This is the most valuable line in
  the output: git cannot reconstruct it and archiving the chat destroys it.
- **A blocking step the work implies** - a `supabase/` migration, a `VITE_*` env var, a
  `render-worker`/`player-host` rebuild, a nested `AGENTS.md`/`CLAUDE.md` or `docs/GOALS.md`
  now wrong.
- **Optional follow-ups**, clearly marked as optional so they are easy to skip.

If there is genuinely nothing to do next, say so in one line. Don't invent work.

### 2. Pasteable prompt - only if work remains

A single self-contained code block for a fresh Claude Code or Codex session: what was
completed, repo/branch state if it matters, the remaining work, key constraints or decisions
(point at the right nested `AGENTS.md`/`CLAUDE.md`), known risks, the best next step. No
transcript dump.

When work remains, include the exact current branch and short HEAD, whether the working tree is
clean, and the last known verification command/result tied to that commit. If verification is
missing or stale, say so as remaining work rather than running it during handoff.

Skip this section entirely when nothing remains - don't pad it out to look complete.

### 3. Bottom line

One or two lines, last. Lead with exactly one of these, verbatim, then why, in plain language:

- `SAFE TO ARCHIVE` - nothing is lost by closing this chat. The default after a clean run of
  the safe-merge workflow.
- `SAFE TO ARCHIVE WITH NOTES` - nothing lost, but there are follow-ups captured in the prompt.
- `NOT SAFE TO ARCHIVE YET` - closing now loses work or context: important changes uncommitted or
  unpushed, work that should have landed on `main` but didn't, a required migration/env step, or
  an unfinished task known only here. Say in one line exactly what to do first.

### 4. Whether this worktree can be cleaned up - report only, NEVER act

**Handoff deletes nothing.** The bottom line above is a judgement, and a judgement that has been
wrong before must never be wired to an irreversible action. Removing the worktree is the
cleanup-worktrees workflow's job, and it happens because the USER asked for it in that moment.

When the bottom line is `SAFE TO ARCHIVE` or `SAFE TO ARCHIVE WITH NOTES`, run the read-only
check and report what it says in one line:

    node scripts/cleanup-worktrees.mjs --self

It is a dry run: it never removes anything without `--apply`. It answers whether this worktree
is removable (branch contained in BOTH local `main` and `origin/main`, clean, not detached, not
the primary) and - the part git otherwise hides - lists ignored content that removal would
destroy: `.env`, bench output, logs. `git status` never mentions those, and removal deletes them
anyway.

Say which it is, and stop there:

- removable with nothing at risk - "this worktree can be removed with the cleanup-worktrees
  workflow; nothing unrecoverable is in it";
- removable but holding at-risk content - name the paths and sizes, because that is the part
  the user cannot see from anywhere else;
- not removable - give the reason it printed.

Never pass `--apply`, and never offer to sweep other worktrees.

## How to ground it (read-only)

Do this work for yourself - almost none of it reaches the response. Run the checks; don't print
commands for the user to run.

- **Where am I** - `git branch --show-current`, `git worktree list`, `git rev-parse --short HEAD`.
  Never ASSUME where `main` is; inspect every registered worktree and expect both `claude/*`
  and `codex/*` feature branches.
- **What's outstanding** - `git status --porcelain=v1 --branch`, untracked files worth keeping
  (`git ls-files --others --exclude-standard`), `git stash list`, any mid-merge/rebase state, and
  whether the work actually reached `main`/`origin/main` when the session's story says it did.
- **Validation** - reuse existing evidence: a `npm run build` already run, the safe-merge
  workflow's gate, any `e2e/` or in-browser check already done. `npm run build` (tsc + eslint +
  vite) is the gate; focused script tests may also apply. Do not run verification during
  handoff. If code changed after the last check, record verification as the next required action.

A finding reaches the response only if it is actionable, and then it belongs in the prompt as
remaining work. If the answer is the boring expected one, say nothing.

## Rules

- **Read, don't write.** Never merge, push, commit, delete, clean, stash, reset, or rewrite
  history, run builds, or execute tests. Report problems; never silently fix them. This holds for
  worktree cleanup too: section 4 reports, and the user runs the cleanup-worktrees workflow.
- **Create or update no files** - no handoff file, session summary, timestamped note, project
  document, or tool-specific memory. Deliver all continuation context in the response so the same
  handoff works in Claude Code and Codex.
- **Be fast enough to use after every session.**
