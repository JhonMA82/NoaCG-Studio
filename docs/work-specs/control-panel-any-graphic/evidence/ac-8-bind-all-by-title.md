# AC-8 - Bind all by title accepts every unambiguous suggestion in one press

**Verdict: pass.** Reviewed at `dfac5b9cf230532565f57d6988517bb25cdbf94d` on 2026-09-16, the
revision that carries pull request 281.

## What was run

Through the queue, `e2e/production-data.spec.ts` (job `j-1139`):

```
ok  Bind all by title binds every unambiguous title in one press, and leaves the ambiguous
    one bound-empty with a reason (6.4s)
```

That is the criterion's own scenario - two graphics with matching titles and one ambiguous field -
driven through the Data tab's bindings table in a real browser, asserting both halves: the
unambiguous suggestions are accepted in one press, and the ambiguous title stays unbound and says
why. 20 of the file's 21 tests passed on that run; the one failure was an unrelated workspace-open
timeout under load that passed alone on re-run (job `j-1144`, 3.2 s against a 7 s locator timeout).

## What was read

The button accepts the suggestions the table already computes rather than computing a second set,
which is what keeps the button and the per-row accept from ever disagreeing. There is one button
for a graphic and one for the whole production, as the criterion asks.

## Limitations

- **I did not press the button by hand.** The spec drives the real control in a real browser and
  asserts the ambiguous case, which is stronger evidence than a single hand press would be, but the
  distinction belongs in the record: nothing in this receipt comes from a human looking at that
  table on this revision.
- The ambiguity rule is "a title that matches more than one leaf stays unbound". What a operator
  does next with such a field is the table's ordinary per-row binding, unchanged by this row.
