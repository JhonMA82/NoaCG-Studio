# orchestrator - plan and assign the day's work

Shared canonical procedure for the `orchestrator` workflow - invoked as `/orchestrator` (alias
`/o`) in Claude Code, `$orchestrator` (alias `$o`) in Codex. Cross-references to other workflows
below use their plain names (e.g. "the safe-merge workflow"); translate as `/safe-merge` in
Claude Code, `$safe-merge` in Codex.

Run at the START of a session that will orchestrate other sessions. This session assigns work
and never does it.

## Input

Whatever the user pasted with or after the invocation, in any mix:

- **Handoff blocks** from finished sessions - the pasteable prompt from the handoff workflow.
- **Owner feedback from testing the newest build** - defects and reactions found by using the
  site. This OUTRANKS a handoff's own idea of what comes next: a handoff knows its own line of
  work, the owner knows what is actually broken.
- **Nothing.** Then plan from repository state alone and say that is what happened.

## Output

Six sections, in this order. Nothing else - no session summary, no restatement of the input.

### 1. The wave table

One row per session. Columns: letter, one-line goal, `START` (now, or `after <letter>`),
`TOUCHES` (the files or directories it owns), gate slot.

Letters are the day's vocabulary - the user will say "merge A" for the rest of the day, so a
letter, once assigned, never moves.

### 2. What can run at once - and the two separate reasons it cannot

- **File overlap.** Two sessions owning one file is the expensive failure, not a late merge:
  git merges parallel edits to one surface CLEANLY and produces a tree describing something
  neither session built. Do a deliberate overlap pass across every `TOUCHES` set and say which
  pairs are disjoint. When two sessions need one file, they are sequential - there is no
  careful way to share it.
- **The machine.** One browser-driving job per machine, always: a suite, a catalog sweep and a
  bench are the same workload under different names, and this laptop is RAM-bound. Editing runs
  in parallel; the GATE does not. Give the gate slots in an order (cheapest first) and tell the
  user to use the `:queued` form of any e2e script regardless.

### 3. Merge order

Best-first, with the reason each precedes the next. Then, always: `node scripts/merge-order.mjs`
ranks this for real with `git merge-tree` and beats the table - name it as the authority, not as
a suggestion.

### 4. What I would push back on

**Mandatory. Never omit it, and never soften it to be agreeable.** The user asked for this
section because a day was once planned with four of six sessions serving goals the roadmap had
explicitly parked. Say plainly:

- **Which tasks do not serve the current push.** Read the north star in `docs/GOALS.md` - the
  current push section and what sits under NEXT - and name which pasted tasks serve it and
  which serve something parked behind it. A task can be good and still be wrong for today.
- **Real money.** Any task spending API money is called out UP FRONT with an estimate, and it
  waits for an explicit go-ahead. A key in `.env` is not permission.
- **Size.** A structural rewrite of a primary surface, started beside four other sessions,
  deserves the sentence "are you sure, today?".
- **Work that is not ready.** A task whose design decision is undecided, or that depends on a
  branch still in flight, is named as blocked rather than dressed up as parallel.
- **Cheap-check-first.** Where a reported defect has a known one-line cause, say so and put the
  check at the top of that prompt rather than opening an investigation.

If there is genuinely nothing to push back on, one line saying so. Do not invent a concern to
fill the section.

**Every pasted task gets a prompt.** Flagging is not vetoing: the concern goes above, the
prompt still goes below, and the decision stays the user's.

### 5. The prompts

One fenced block per session, in START order, each self-contained and pasteable into a fresh
session. Compact - target ~20 lines:

```
BRANCH claude/<name>   START now | after A   TOUCHES <files>
GOAL   One sentence: what is true when this is done.
READ   file, file, file.
DO     1. …  2. …  3. …
TRAPS  only what is written in no repo file
GATE   npm run build [+ suite]. Commit each verified step to the branch. Never land on main.
```

- **READ points, it never summarizes.** Name the files - the root and nested `AGENTS.md`, the
  binding doc, the source file. The child session reads them at current HEAD, which is more
  accurate than any paraphrase and costs this session nothing.
- **TRAPS carries only what exists nowhere but a chat.** A trap already written in a repo file
  gets a pointer instead. Reprinting `src/ai/AGENTS.md` into a prompt is the most common way
  these get fat.
- **DO is verifiable steps**, not a topic list. Reproduce-before-fixing for any bug.
- Every prompt ends on the gate and `Never land on main` - the standing rule, in every prompt,
  because the child session may never see this one.
- A task handed to Codex says so, and says the delegating session still verifies the result.

### 6. Open questions

Only decisions that change what the work IS and that the user alone can make. A question with
an obvious default is not a question - state the default and move on.

## How to ground it

This session must survive a whole day of "what do I merge next" questions, so its window is the
scarce resource. Reading is budgeted in three tiers.

**ALWAYS - the cheap set, first, before reading anything else.** It produces the wave table, so
if the window later runs short the routing already exists.

- `node scripts/worktree-activity.mjs` - every other worktree's uncommitted and unmerged files.
  This is the collision input, and it is also how a "finished" session is caught still holding
  work. Never trust a handoff's claim that nothing is in flight.
- `node scripts/merge-order.mjs` - the measured landing order.
- `git log --oneline -5`, `git branch --show-current`, `git status --porcelain=v1 --branch`.
- **The north star, two greps, nothing more.** `grep -n '^#' docs/GOALS.md` for the skeleton -
  which sections exist and which are parked - then the CURRENT PUSH section alone. That is
  enough to classify every pasted task for section 4: a task whose home is a parked section is
  parked, whatever its own handoff says about urgency. Never read the whole file, and never read
  `docs/GOALS_ARCHIVE.md`.

**ONLY WHEN IT CHANGES ROUTING** - each read needs a question it answers, and the answer has to
be able to move a session in the table:

- One source file, to confirm or kill a suspected collision between two sessions.
- The binding doc for one pasted task whose scope looks wrong, when section 4 would otherwise be
  a guess.
- One memory or round doc, when a pasted handoff names a trap that decides an order.

**Know what a source read actually costs.** Opening any file inside a directory that has its own
`AGENTS.md` loads that whole area contract too - measured: one 164-line component pulled ~400
lines of contract with it. So prefer `grep` with a line range over opening the file, and never
open a second file in an area whose contract is already loaded without a reason.

**NEVER, unprompted:** product source for a task nobody flagged, plan docs for work nobody
pasted, reference images (name the path in the prompt and let the session open it), a nested
`AGENTS.md` read for background, or an individual memory file browsed for context rather than
consulted for one fact.

The reading serves the wave table and section 4. Spend none of it into the prompts - those stay
pointers, so a longer read never produces a longer prompt.

## Rules

- **Read, don't write.** Plan the work; never start it. No commit, merge, push, build, test, or
  edit of product code. If a fix is a single obvious line, it still belongs in a prompt.
- **Never act on a collision.** Another worktree's in-flight work is reported and planned
  around - never touched, committed, or cleaned up.
- **Create or update no files.** The plan lives in the response. The user pastes prompts into
  sessions from there; a plan file would be one more thing to keep true.
- **Verify before you list.** A blocker, a collision or a merge order stated as fact came from a
  command in this session, not from a handoff's prose or from memory of yesterday.
- **Letters are stable, and so is scope.** Do not silently merge two pasted tasks into one
  session or split one into three; if the shape is wrong, say so in section 4 and offer it.
- **Stay usable all day.** The user returns to ask "what do I merge first" and "can B start
  now". Answer those from the table and a fresh `worktree-activity` run, not by re-planning.
