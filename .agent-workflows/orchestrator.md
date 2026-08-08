# orchestrator - plan and assign the day's work

Shared canonical procedure for the `orchestrator` workflow - invoked as `/orchestrator` (alias
`/o`) in Claude Code, `$orchestrator` (alias `$o`) in Codex. Cross-references to other workflows
below use their plain names (e.g. "the safe-merge workflow"); translate as `/safe-merge` in
Claude Code, `$safe-merge` in Codex.

Run at the START of a session that will orchestrate other sessions. **This session produces text
and nothing else.** It is deliberately not explicit-only, because a workflow that cannot act
cannot be invoked dangerously - do not "harden" it later, which would also break its alias.

## THIS SESSION NEVER ACTS

The single rule everything else serves. This session **plans work and never does any of it**, and
it **never touches another worktree** - not to check something, not to merge, not to tidy.

- No merge, push, commit, rebase, build, test, install, or edit of product code. Not even a
  one-line fix that is obviously right: it goes in a prompt.
- Nothing outside this checkout. Another worktree's files are read about through
  `worktree-activity.mjs` and planned around - never opened, never changed, never cleaned up.
- **Every command this session produces is for the USER to run, and names WHERE to run it** - the
  branch, and the checkout or worktree it belongs in. A command that must run somewhere else is
  printed with that location, never executed from here.

The reason is not caution, it is legibility: the moment this session starts doing work as well as
assigning it, nobody can tell which state came from the plan and which from a side effect.

## Input

Whatever the user pasted with or after the invocation, in any mix:

- **Handoff blocks** from finished sessions - the pasteable prompt from the handoff workflow.
- **Owner feedback from testing the newest build** - defects and reactions found by using the
  site. This OUTRANKS a handoff's own idea of what comes next: a handoff knows its own line of
  work, the owner knows what is actually broken.
- **A vague report** - "the wizard felt slow yesterday". That is ONE session whose first step is
  reproduce-and-scope, never N sessions invented from one sentence. The clarifying question goes
  in section 6.
- **Nothing.** Then plan from repository state alone and say that is what happened.

## Output

Six sections, in this order. Nothing else - no session summary, no restatement of the input.

### 1. The wave table

One row per session: letter, one-line goal, `START` (now, or `after <letter>`), `TOUCHES` (the
files or directories it will own), `MINTS` (any scarce shared slot it needs - see section 2), and
whether it needs a browser on this machine.

Letters are the day's vocabulary and, once assigned, never move.

### 2. What can run at once

**File overlap is the expensive failure, and a file list alone does not find it.** Two sessions
owning one file merge CLEANLY and produce a tree describing something neither of them built. Do a
deliberate pass across every `TOUCHES` set - and then across the collisions a `TOUCHES` diff calls
disjoint:

- **A scarce shared slot.** Two sessions minting migration `0036`; two re-recording
  `scripts/overflow-baseline.json`; two adding an e2e spec and so both editing
  `scripts/e2e-lists.mjs` / `scripts/e2e-affected.mjs`; two moving a landed goal out of
  `docs/GOALS.md` into `docs/GOALS_ARCHIVE.md`; two touching `package.json`. Different filenames,
  disjoint sets, clean merge, wrong result. **The plan ALLOCATES these up front** - A takes 0036,
  B takes 0037, C owns the baseline re-record - and each is named in that session's `MINTS`.
- **A renamed or re-signatured shared export.** One session changes it, another writes callers.
  Any session that renames or re-signatures something shared is **sequential by construction**,
  whatever the file sets say.

Then the second, unrelated limit: **One browser-driving job per MACHINE, not per worktree** (the
rule and its override live in the root `AGENTS.md`). Editing parallelises; a browser job does not.
Note what this does NOT cover: the per-change gate belongs to CI now, so the only work that needs
the laptop's browser is what CI cannot do - in-browser visual acceptance, the catalog gates
(`l3-sweep`, `type-floor`, `overflow-sweep`, `field-coverage`, `numerals`, `test:e2e:catalog`),
benches, and render smoke. Order those cheapest-first and tell the user to use the `:queued` form
of any e2e script.

### 3. Landing order

Two different things, never blended:

- **Branches already ahead of `main`** - `node scripts/merge-order.mjs` measures this with
  `git merge-tree`. Quote its own verdict words - `clear`, `caution`, `hold` - so the answer can be
  compared with what the safe-merge workflow prints an hour later. It is the authority here.
- **Today's new sessions**, which have no branches yet, so the script cannot see them. Give the
  order as an explicit PREDICTION from `TOUCHES`, `MINTS` and the wait-chain, and say that
  `merge-order.mjs` should be re-run once the branches exist.

**Section 3 is a report, not a pick.** A branch named here is NOT an offered safe-merge option, so
"merge A" said to this session does not invoke that flow. Answer it by naming the branch, its
current `merge-order.mjs` verdict, and where the safe-merge workflow has to run: that branch's own
worktree, which is the only place its gate can run. This session does not merge.

### 4. What I would push back on

**Mandatory. Never omit it, and never soften it to be agreeable.** The user asked for this
section because a day was once planned with four of six sessions serving goals the roadmap had
explicitly parked. Say plainly:

- **Which tasks do not serve the current push** (see the grounding recipe below for the two
  sections that settle this). A task can be good and still be wrong for today.
- **Real money.** Any task spending API money is called out UP FRONT with an estimate, and waits
  for an explicit go-ahead. A key in `.env` is not permission.
- **Size.** A structural rewrite of a primary surface, started beside four other sessions,
  deserves the sentence "are you sure, today?".
- **Work that is not ready** - an undecided design decision, or a dependency still in flight.
- **Cheap-check-first.** Where a reported defect has a known one-line cause, say so and put that
  check at the top of the prompt rather than opening an investigation.
- **A task you cannot write a WHY for.** Hand it over anyway, and say exactly that here.

If there is genuinely nothing to push back on, one line saying so. Do not invent a concern.

**Every pasted task gets a prompt.** Flagging is not vetoing: the concern goes above, the prompt
still goes below, and the decision stays the user's.

### 5. The prompts

One fenced block per session, in START order, each pasteable into a fresh session. Compact -
target ~20 lines:

```
BRANCH <tool>/<name>   START now | after A   TOUCHES <files>   MINTS <slot, or ->
GOAL   One sentence: what is true when this is done.
WHY    The real problem it solves, or the goal it serves.
READ   file, file, file.
DO     1. …  2. …  3. …
TRAPS  only what is written in no repo file
GATE   npm run build, then push and read the CI run. Commit each verified step. Never land on main.
```

- **`<tool>` is whichever tool will run it** - `claude/…` or `codex/…`. Never hardcode one.
- **WHY says what breaks if this is not done**, where GOAL says what will be true. It exists so
  the receiving session can TEST the assignment instead of obeying it. Same rule and same reason
  as the handoff workflow's, pinned there.
- **READ points, it never summarizes.** Name the files; the session reads them at current HEAD.
- **TRAPS carries only what exists nowhere but a chat.** A trap already in a repo file gets a
  pointer. Reprinting an area contract is how these get fat.
- **DO is verifiable steps**, not a topic list. Reproduce-before-fixing for any bug.
- **GATE is `npm run build` plus CI**, because the per-change suite belongs to CI, not the laptop -
  add a local browser job only for the work from section 2 that CI cannot do. Every prompt ends on
  `Never land on main`, because the session running it may never see this one.
- A task **delegated to the other tool** says so (in Claude Code that is the rescue workflow,
  which is Claude-only), and says the delegating session still verifies the result. Delegate for
  mechanical bulk edits, a settled design spanning many files, or a bug still failing after two
  genuine attempts.

### 6. Open questions, then one pick

Only decisions that change what the work IS and that the user alone can make; a question with an
obvious default is not a question. End with a short pick - start wave 1, reorder, hold one - so
the day begins in one tap rather than a paragraph.

## How to ground it

This session has to survive a whole day of follow-up questions, so its window is the scarce
resource. Reading is tiered.

**ALWAYS - the cheap set, first.** It produces the wave table, so if the window later runs short
the routing already exists.

- `node scripts/worktree-activity.mjs` - every other worktree's uncommitted and unmerged files.
  This is the collision input, and how a "finished" session is caught still holding work.
- `node scripts/merge-order.mjs` - the measured order for branches already ahead of `main`.
- `git log --oneline -5`, `git branch --show-current`, `git status --porcelain=v1 --branch`.
- **For each branch a pasted handoff names**: `git show-ref --verify refs/heads/<branch>` and
  `git branch --merged main`. A handoff that says "all merged" for a branch that never landed, or
  names a branch that no longer exists, is reported in section 4 - not written a prompt.
- **The north star, two ranges, nothing more:** `grep -n '^#' docs/GOALS.md` for the skeleton,
  then `sed -n '/^## NOW/,/^## NEXT/p' docs/GOALS.md` for the current push. `## NOW` is the push;
  `## NEXT`, `## THEN` and `## Parking lot` are parked. That is enough to classify every pasted
  task, whatever its own handoff says about urgency. Never read the whole file, and never read
  `docs/GOALS_ARCHIVE.md`.

**ONLY WHEN IT CHANGES ROUTING** - each read owes a question whose answer can move a session:
one source file to confirm or kill a suspected collision; the binding doc for a task whose scope
looks wrong; one memory or round doc when a pasted trap decides an order.

Prefer `grep` with a line range to opening a source file: in Claude Code, reading a file in an
area that has its own contract pulls that contract in too (22-1070 lines, depending on the area),
after which a second file in the same area is free.

**NEVER, unprompted:** product source for a task nobody flagged, plan docs for work nobody
pasted, reference images (name the path in the prompt), or a memory file browsed for background
rather than consulted for one fact.

Spend none of the reading into the prompts - those stay pointers, so a longer read never produces
a longer prompt.

## Rules

- **Read, don't write.** See "THIS SESSION NEVER ACTS" above; that section is the contract.
- **Never act on a collision.** Another worktree's in-flight work is reported and planned around.
- **Create or update no files.** The plan lives in the response. The wave table is the user's to
  keep; recovery is re-invoking with it pasted back, and the letters carry over unchanged.
- **Verify before you list.** A blocker, a collision or a landing order stated as fact came from a
  command run in this session - not from a handoff's prose, and not from memory of yesterday.
- **`TOUCHES` is a forecast**, not a copy of a handoff's retrospective file list. They answer
  different questions.
- **Letters are stable, and so is scope.** Never silently merge two pasted tasks or split one; if
  the shape is wrong, say so in section 4 and offer it.
- **Stay usable all day.** "Can B start now" is three checks, all required: A's branch contained
  in `main` (`git branch --merged main`), A's worktree clean, and the shared file no longer listed
  in flight. Answer from those plus a fresh `worktree-activity.mjs` run - never by re-planning.
