---
v: 2
kind: handoff
date: 2026-09-16
branch: claude/sj-stop-wait-reaches-the-row
row: SJ
---
# SJ - the stop-wait guard reaches the row

**Done and queued.** Two rows ended their turns waiting on something that could not wake them
today, SC at 13:31:30Z and SE at 15:32:46Z, and the guard caught neither. The two misses had
DIFFERENT causes and both are fixed: SC's phrasing matched no pattern, and the guard was a one-shot
that had already spent itself on SE ninety-five seconds earlier. Delivery to a row was measured and
needed no change. Build green, 14 unit tests green inside the build gate, and the widened pattern
confirmed firing in a live subagent session rather than only in a test.

## The two causes, and which measurement separated them

**The cheap check first, and it paid.** `declaresWait` is a pure function, so both rows' real last
messages went straight into it before anything else was read. SC returned `false`, SE returned
`true`. That one command split the work in two and meant nothing downstream had to be guessed.

**Cause 1, SC - a phrasing the patterns could not see.** SC's last words were "The waiter will wake
me when the exit line lands." Every pattern the file had read the session as the SUBJECT: it waits,
it checks back, it sets a watcher up. SC wrote the sentence the other way round and handed the
subject to the machine. Its transcript carries no hook feedback at all between the stop and the
coordinator's rescue message a minute later, which confirms the hook ran and said nothing rather
than firing somewhere else. Fixed with a fifth pattern reading the observer-as-subject shape, plus
`waiter` in the observer nouns.

**Cause 2, SE - the guard was a one-shot.** SE's message DID match, so the detector was never SE's
problem. Its transcript shows the hook firing correctly at 15:31:11Z on an earlier wait ("Stop hook
feedback:" at line 273), SE working for another thirty records, and then a second wait at 15:32:46Z
with no feedback at all. The reason is `stop_hook_active`: the harness sets it while a session is
continuing BECAUSE a stop hook blocked it, and it does not clear when the session goes back to
work. The hook bailed on that flag at its first line. Reproduced deliberately with a throwaway
subagent - first stop `false` and blocked, second stop `true` and silent, both payloads captured.
Fixed by replacing the flag with a count of refusals per session, budget three, in a rolling
30-minute window. The flag is still the fallback for when the count cannot be written.

## What was RULED OUT, and what ruled it out

**Delivery. The hook does reach a row, and nothing about it needed changing.** This was the
prompt's second hypothesis and it is wrong, measured rather than reasoned:

- A wave row is a SUBAGENT (`agent_type: wave-row`, spawnDepth 1, its own worktree), so `SubagentStop`
  is the event that fires, and `.claude/settings.json` registers the hook on it.
- The event carries `last_assistant_message` set to the SUBAGENT's own text, not the orchestrator's.
  Captured from a real event by instrumenting the hook to dump its payload.
- Exit 2 blocks that subagent's stop and the subagent is handed another turn with the hook's stderr
  in it. A probe subagent, told to end a turn on a genuine background task, came back with
  `GOT-FEEDBACK-YES` and the message verbatim.
- SE's own transcript is the field evidence for the same thing at 15:31:11Z.

So a future session must not re-measure this. The instrumentation was four lines at the top of
`scripts/hooks/stop-wait.mjs` appending `JSON.stringify(input)` to a scratch file; it was removed
before the commit, and the same measurement takes about four minutes to redo if ever needed.

## What is in no repo file

- **A real `SubagentStop` payload on this harness carries more than the docs suggest**:
  `session_id` (the TOP-LEVEL session, not the row), `agent_id`, `agent_type`, `cwd` (the row's own
  worktree), `scratchpad_dir`, `transcript_path` (the top-level transcript) AND
  `agent_transcript_path` (the row's own), `last_assistant_message`, `stop_hook_active`, and
  `background_tasks` listing every live subagent and shell job. The refusal count uses
  `scratchpad_dir` because of that measurement; a code reviewer this afternoon asserted the field
  does not exist, from a synthesised payload, and was wrong.
- **Row transcripts are readable and are the best evidence there is**, at
  `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`, with a `.meta.json` beside
  each naming the row. Grepping a row's own last message and reading the two records after it
  answers "did the hook fire" in one command. SC is `aad4120a64be97d37`, SE is `a00c96f6c03f46940`.
- **`stop_hook_active` stays true across an entire continuation**, not just the immediate next stop:
  SE kept it for ninety-five seconds and thirty records including real tool calls. Any future hook
  that bails on that flag has the same one-shot hole.
- **The review of this change tripped the hook it was reviewing**, because it quoted example
  sentences in plain prose and `withoutQuotedSpans` strips only backticks, fences and blockquotes.
  Anything written ABOUT this hook should put its examples in backticks.

## The trap this change is built around

A guard that sits between every row and finishing its work is dangerous in the direction nobody
watches. Widening it made that worse, not better, and the review found it: three sentences of the
shape "that monitor should alert me, but it cannot reach a stopped session, so I read the log
myself" all fired. That is a row doing exactly what the hook's own message tells it to do, and with
the budget now three it would have been refused three times for complying. The fix is a lookahead
that suppresses a promise the same sentence takes back, applied to the new pattern and to the
pre-existing background-task pattern that had the same hole. Every widening in this change carries
a test for the shapes it must NOT match, and the three new positives were proved red against the
pre-change file first (one of the four was already green, and the handoff says so rather than
claiming four).

## What is left

- **Nothing blocking.** The guard now fires on both of today's shapes and keeps firing.
- The budget of three and the 30-minute window are judgement, not measurement. If a row is ever
  seen burning all three refusals, the answer is probably a better message rather than a bigger
  budget.
- SC's message had a second waiting shape the patterns still do not read: "Nothing else can start
  before the build answers". It was left alone deliberately - it is a general sentence shape, the
  row's actual declaration was the waiter sentence, and widening past the measurement is how this
  guard grows false positives.

## Check

`review: delegated` (6 findings, 5 fixed, 1 half-rejected on measured evidence), scope-checked:
the pass reported merge base `6575ff28753cb0d7379ee73c99a276045682c653` and the same four files
`git diff --name-only` reports, with a clean `git status --porcelain=v1`.
`simplify: inline` - the skill returned fan-out instructions, which under the workflow's
four-branch rule means the pass did not run, so its four angles were covered here: reuse (checked
`session-start.mjs`'s marker convention and recorded why the scratchpad was chosen over the job
store), simplification (the count read folded into one `refusalState()` returning `{ file,
refusals }`), efficiency (the directory is now created only on the write path, and everything
expensive stays behind `declaresWait`), altitude (the counter replaces the harness flag at the
right depth; there is no deeper fix, the flag is not ours).
`verify: inline` - `npm run build` exit 0 read from the build's own exit code, and
`node --test scripts/stop-wait.test.mjs` 14/14, which the build gate also runs.
`taste: not applicable` - nothing here can move what a graphic looks like.

## Pointers

- `scripts/stop-wait.mjs` - the patterns, `MAX_REFUSALS`, `REFUSAL_WINDOW_MS`, and `decide`.
- `scripts/hooks/stop-wait.mjs` - `refusalState()` and the fail-open rule for when nothing can count.
- `scripts/stop-wait.test.mjs` - every widening's must-not-match twin.
- `docs/MISTAKE_TRIGGERS.md` - the dated trigger, "A fourth thing", with both causes.
