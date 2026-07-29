# next - plan what to do next in this session

Shared canonical procedure for the `next` workflow - invoked as `/next` in Claude Code, `$next`
in Codex. Cross-references to other workflows below use their plain names (e.g. "the safe-merge
workflow"); translate the same way: `/safe-merge` in Claude Code, `$safe-merge` in Codex, and
likewise for "the handoff workflow" / "the cleanup-worktrees workflow".

Mid-session planning for **NoaCG Studio**. The user wants to decide what to do next in THIS
session and expects real, choosable options - or an honest "we're done". This workflow only
plans and presents; implementation starts after the user picks.

Optional focus from the user, if one was given at invocation.

## The honesty rule (overrides everything below)

**Never invent work to have something to offer.** If the session's line of work is complete,
verified, and committed, and nothing actionable is outstanding, the correct output is one short
paragraph saying exactly that - and, if true, that the natural next step is the safe-merge
workflow or the handoff workflow, not more work here. A padded option list is a failure of this
workflow. "Nothing more to be done in this session" is a fully valid, complete answer.

This never waives the clickable pick (section 2b): an honest "nothing left" still ends in a
choice offered to the user, not invented work.

Do not downgrade real gaps to reach that answer either: uncommitted changes, a failing check, a
bug found but not fixed, or a step the work implies (migration, env var, doc now wrong) mean the
session is NOT done, and fixing that is option one.

## How to ground it (read-only, a couple of minutes max)

Do this for yourself; almost none of it reaches the response. Never write, commit, or fix
anything while grounding. Stop researching once you have enough for good options - this is a
quick scan, not an audit.

- **This chat first.** The best options come from the session itself: work started but not
  finished, a bug or smell noticed in passing, a decision made but not built, a review finding
  deferred, something the user said earlier and dropped. Re-read the conversation before
  touching git. Skip anything the user already declined this session.
- **Repo state.** `git branch --show-current`, `git status --porcelain=v1 --branch`,
  `git log --oneline -5`, untracked files worth keeping. Uncommitted verified work is always a
  candidate option; unverified work makes verification the option.
- **What the other worktrees are already doing.** Run `node scripts/worktree-activity.mjs` - a
  LIVE scan (the session-start snapshot is stale by now) listing every other worktree with work
  in flight: its branch, its last commit and how long ago, and the files it has uncommitted or
  committed-but-not-yet-merged. This is what tells you an option is already someone else's job,
  and which files an option would collide on. Several worktrees are normally active at once.
- **Verification gap.** Was `npm run build` run after the last code change? Is there observable
  behaviour that was never checked in the browser or with a focused `e2e/` spec? A green build
  alone does not close a UI-visible change. But absence of a test is a gap, not a bug - never
  claim something is broken without evidence it is.
- **Evidence in the work area** - `TODO`/`FIXME`/`HACK` markers and open questions in the files
  this session touched, plus the nested `AGENTS.md`/`CLAUDE.md` and `docs/` contracts that govern
  them.
- **The backlog, only if the session's own work is exhausted:** `docs/GOALS.md` (unchecked
  milestones). Do not consult tool-private memory as shared project truth.
- **Verify before you list.** Backlog entries, memory notes, old TODOs, and handoff prompts go
  stale: before offering one, spend the thirty seconds to confirm in the current code/git that
  it is still open and not already done. A completed item offered as work is this workflow's
  worst failure mode after invented work.

## Output

**Write the whole response telegram-short: bullets and fragments, no prose paragraphs, no
headers, phone-glanceable.** Terse wording never excuses vague content - every fact below
still lands, in fewer words.

### 0. Pending question / obvious next step comes first

The user may have missed that the conversation already contains an unanswered question, a
choice waiting on them, or one obvious next action. Check for that before anything else. If it
exists, restate it in 1-2 compact lines at the very top and make it option 1 (or the whole
answer) - never bury it under new options, and never invent new work while it is open.

### 1. Where this session stands

ONE line: what the session set out to do; done/verified/committed or not.

### 2. The options

**Numbered 1..N (max 5), best first**, so the user can answer "1" or "do option 2" from a
phone. Each option 1-2 lines, fragment style:

- **`N. Imperative title`** - what + size (must fit rest of session; bigger item = its first
  well-defined slice, said so). Why now + evidence citing something specific in THIS repo (a
  file, commit, doc line, chat moment) - an option that would read true in any repository is
  banned. Real risk/blocker appended only if one exists; no ritual fields.

Sources rank in this order: session leftover > verification gap > landing the work (the
safe-merge workflow + push) > backlog (`docs/GOALS.md`). Prefer product-meaningful work
over easy filler - a test or doc task earns its place only by closing a real risk, not by being
convenient. Every option must fit the product pillars and the governing nested
`AGENTS.md`/`CLAUDE.md`/`docs/` contracts.

When the session's work is committed and verified, **"merge and push via the safe-merge
workflow" is a first-class option** - often the recommended one. Offering it here is fine; the
user picking it is what makes it user-initiated. Never run it yourself off this workflow.

**Run every candidate option past the worktree scan before listing it:**

- **Already under way elsewhere** (another worktree's branch and files plainly cover that job) -
  do NOT offer it. Say so instead in one line below the options: what, which branch, how recent.
- **Overlaps files in flight elsewhere without being the same job** - still offerable, but the
  option must name the collision (`files X, Y also in flight on <branch>`) and say what to do
  about it: land that branch first, take the slice that misses those files, or do it in that
  worktree instead. Pick one and recommend it - never just flag the clash.
- **Stale overlap** (that worktree's last commit is old and nothing is uncommitted) - name it as
  a caution, not a blocker.
- **Landing this branch** while another worktree is in flight on the same files - still a fine
  option, but say in one line which branch will have to take main afterwards.
- The scan is evidence, not permission: two worktrees touching one file is often fine. Never
  suppress a genuinely good option over an incidental overlap - flag it and move on.

**Optionally add ONE wildcard**: a creative improvement just outside the current scope, clearly
labelled **(speculative)** and pitched as a maybe, not a need - grounded options never get this
label. At most one; zero is fine and usually right.

Mark exactly one option as **recommended**, why in a few words. If only one honest option
exists, list only that one - do not pad.

### 2b. ALWAYS end with a clickable pick - no exceptions

**Every single run of this workflow MUST finish with a way for the user to choose by pressing a
button or typing a short reply.** In Claude Code that is an AskUserQuestion call; in Codex,
present the same numbered choice and ask the user to reply with a number. The user reads this
on a phone and should be able to answer in one tap or one digit - never make them type a
paragraph. A run that ends in prose alone is a failed run, *including* the "nothing left to do"
run.

- Recommended option first, its label suffixed `(Recommended)`.
- In Claude Code, the AskUserQuestion tool takes **2-4 options**. If you wrote 5 numbered
  options, carry the top 4 - the auto-added "Other" covers the rest.
- Labels must match the numbered options above so "option 2" and the button (or typed digit)
  agree.
- Never skip this because the answer feels obvious, because there is only one real option, or
  because there is no work left. Those cases still get a pick - see section 3.

### 3. If the answer is "nothing"

Skip the numbered list. 1-2 lines: session complete, the evidence (build/e2e/commit state), and
the natural close. No consolation backlog list.

**Then still offer a pick** - the close is a choice too. Build it from whichever of these are
genuinely available, recommended one first:

- **The safe-merge workflow** - only when this session's branch is committed, verified, and
  actually mergeable. Picking it is what makes it user-initiated; still never run it unasked.
- **The handoff workflow** - write the handoff note and close out.
- **Stop here** - nothing further, leave the session as is.
- **Start something new** - open the backlog (`docs/GOALS.md`)
  and plan fresh work outside this session's line.

Two of those is enough to satisfy the minimum; the handoff workflow plus **Stop here** is the
honest floor when nothing else applies.

### 4. Then stop

Present the options, offer the pick, and END THE TURN. Do not start any option, "get a head
start", or stage changes. The user approves with the button/number (or a title, "do the
recommended one") - only then begin, and do only the picked option.

## Rules

- **Read, don't write.** The planning turn changes nothing. No commits, fixes, file creation, or
  memory writes.
- **Options must be about THIS session's line of work.** Suggesting the safe-merge workflow /
  push for this session's branch is in scope; never execute it unasked. Never offer
  repo/workspace cleanup (leftover worktrees, stale branches, node_modules pruning, etc.) - the
  user handles those deliberately elsewhere. Same for other worktrees' business or work that
  plainly belongs in a fresh session - name that separately in one line if it exists.
- **Never act on a collision.** Reporting one is the whole job here: do not merge, rebase, pull,
  stash, or edit anything in another worktree, and never suggest doing it for them silently.
- **Respect the user's focus argument** - filter options through it; if it filters everything
  out, say so rather than stretching.
- **Be fast and cheap.** Grounding is a couple of minutes of reads. Never run the full e2e suite
  or anything that spends tokens/money to generate options.
