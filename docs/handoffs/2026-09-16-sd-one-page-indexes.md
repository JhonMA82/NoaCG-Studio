# SD - the two one-page session indexes, and the drain of the 2026-09-16 handoffs

**Branch:** `claude/sd-one-page-indexes`, three commits on merge base `6150d0ba`. **Date:**
2026-09-16. **Model:** opus high.

Both indexes beat G2 asked for exist and are reachable: `/docs#session-student` and
`/docs#session-owner`. Section 7 rows 12 and 17 are closed, row 18 is opened in their place, and
the seven spent handoffs of the 2026-09-16 wave are gone with everything homeless in them moved
first.

## What I decided, and why

**The artefact is two anchored printable sections of `docs.html`**, not two PDFs and not a page of
their own. Reading the page did not change the row's suggestion, it strengthened it: the sheets
link into the guides above them by anchor, so there is ONE copy of every instruction and none of it
can drift, which is exactly what section 0 call 5 refuses to add to. A PDF is a second copy of the
same sentences with no gate over it. A new public URL is a scope edge back to the owner
(`docs/PROGRAMMES.md`), and this needed no permission.

**They are not in the left nav.** `src/docs/AGENTS.md` says the nav carries main topics only, and a
dated workshop index would be noise there for every other reader, permanently. Their address is
what the deck (slide 7) and `docs/DEMO_2026-09-25.md` print. Nothing else links to them, which is
deliberate.

**One sheet each is done with `:target`.** `body:has(.one-pager:target)` in the print block drops
every other section, so the ADDRESS is the print selection: open `/docs#session-student`, press
Ctrl+P, get that sheet. Printing any other part of the page is unchanged. Each sheet says this in
its own first paragraph, because the promise is false if the reader merely scrolled to it, and
clicking one of the sheet's own links moves `:target` off it.

**The print block also converts the whole page to ink on paper**, which nothing did before. The
docs are a dark page and a browser drops backgrounds by default, so `/docs` printed as near-white
text on white paper: a blank sheet. That is a general fix rather than a one-pager one, on purpose.

**R1.7, where a finished take-home goes:** export both pieces as SVG with the settings for the app,
email them to `contact.noacg@gmail.com` with the group's name in the subject, and send the
Illustrator files too if they want notes on the drawing. The sheet also tells them to import the
files themselves first, because import, editing and export need no account, so they can see what
their layer names became before sending anything. And it states what happens next: every file that
arrives is imported here, run in a production, and answered with what each layer became and which
names to change.

I picked that address because **the docs footer has carried it since the page shipped**, so the
answer needed no new intake surface, no account for the students, and nothing from the owner before
the day. The alternative, "hand it in through the channel your course already uses", would have
left the sheet depending on a channel nobody has named. The last line offers to add a group's board
to the practice library with their names on it, asking first; that is an offer and not a promise,
and it is there because it makes the homework worth doing.

**Row 12 closed and row 18 opened, rather than G2 being marked WORKS.** The legend's WORKS needs a
person to have driven it on the surface the beat uses, and that surface is paper. Nobody has
printed either sheet. UNSEEN (eyes) is what that is, and the file's own rule says an eyes beat has
exactly one section 7 row, so closing 12 had to open 18. The precedent is stated in the file: row 8
opened row 14.

## What is left

- **Row 18.** The owner prints both sheets and reads them:
  `docs/acceptance/owner-queue/2026-09-16-sd-two-one-page-session-indexes.md`, `because: taste`,
  `serves: now`. The one call in there worth overruling is the email address.
- **The student sheet is close to full.** 2959 characters of text at 9pt. If a step is added,
  something comes out; section 0 call 5 says one page each on purpose.
- **Nothing here needs the owner before the day** except that walk.

## Traps that are in no repo file

- **`:target` is what selects the sheet, and the address is the only thing that sets it.** A reader
  who scrolls to the sheet, or who clicks one of its links and comes back, prints the whole manual.
  Both sheets say so in their own words now. Anyone editing them should not "tidy away" that
  sentence.
- **Four of the docs page's backgrounds are literals, not variables** (`th`, `.callout`, `code`,
  `.doc-shot img`), so the print colour conversion does not reach them through `:root`. They are
  listed explicitly in the print block. A fifth added later will print dark-on-dark with the
  browser's background-graphics option on, and nothing will fail.
- **The two `::after` rules that print a link's address can cancel each other by source order.**
  `.plain-url` marks a link whose own text is already the address; it now wins on specificity
  rather than on coming second, and `e2e/docs.spec.ts` asserts all three printed forms.

## The drain, and what moved out of it

Seven handoffs deleted: `qa`, `qb`, `qc`, `qe`, `qg`, `qh`, `qi` of 2026-09-16. `qd`, `qf` and
`qj` are untouched.

**Nothing in the repository cited any of the seven by path or by filename.** What cites those rows
cites a branch, a row letter or a pull request, and all of those survive. Greped three ways, by
path, by bare filename and by prose.

Every open item in the seven was traced before anything was deleted, and four had no other home.
They were moved first:

| what | where it went now |
|---|---|
| Normalise line endings before hashing a function body; `length(prosrc)` counts characters, not bytes; `supabase_migrations.schema_migrations.statements` holds the applied SQL; the Supabase MCP `execute_sql` is read-only | `docs/backlog/machine-traps-that-belong-in-mistake-triggers.md`, which exists for exactly this class |
| Why `docs/GOALS.md` was condensed to 190 and not 199: seven lines are reserved for `codex/ograf-studio-architecture-research`, still in flight | `docs/backlog/instruction-files-need-a-shrinking-mechanism.md`, Trend |
| `FontsSection`'s `nearestWeight` duplicates `googleFonts.ts`'s `defaultWeight`, reported and not fixed because the fix reaches outside that row's diff | `docs/backlog/two-copies-of-nearest-google-weight.md`, new |

**One thing I did not move, and it is worth knowing.** QB's note that nothing offline can prove a
workflow file parses, because this repository has no YAML parser anywhere, now survives only in
`docs/handoffs/2026-09-16-qd-durations-refresh-opens-a-pr.md`. QD is itself a handoff. Whoever
drains QD should give that sentence a home in `scripts/check-workflows.mjs` rather than let it go.

## The merge-driver backlog file

`docs/backlog/contracts-merge-driver-registers-a-path-that-goes-stale.md` is re-pointed, not
deleted, and **the instruction in QJ's handoff to delete it once both branches were on `main` is
withdrawn there**, in that file, so the next reader does not follow it.

The row's premise turned out to be half right, and the half that is wrong matters: **the package
driver does NOT carry the absolute-path defect.** Its `DRIVER_COMMAND` (line 98) is already
relative and `check()` calls `install()` unconditionally on every build. What did not travel from
the contracts fix is three repairs, and one has teeth: `install()` writes with a plain
`git config <key> <value>`, which **exits 5 against a doubled key and leaves the stale command in
place**. I re-derived that in a throwaway repository rather than repeating it from QJ:

```
$ git config --add merge.probe.driver 'node "OLD-ABSOLUTE" %O %A %B %P'
$ git config --add merge.probe.driver 'node "OLDER-ABSOLUTE" %O %A %B %P'
$ git config merge.probe.driver 'node "scripts/x.mjs" %O %A %B %P'
error: cannot overwrite multiple values with a single value
$ git config --get merge.probe.driver
node "OLDER-ABSOLUTE" %O %A %B %P
```

git 2.55.0.windows.5, 2026-09-16. `--replace-all` collapses the key and exits 0.

**I kept the filename.** It reads stale now that the body is about the package driver, and I
weighed renaming it: QJ's handoff is the one citation and I was editing that file anyway. I kept it
because the row's prompt named that path and a row that moves a file it was told not to delete is a
surprise for whoever reads the plan. The first line of the file says the name is historic.

I did not touch `scripts/package-merge-driver.mjs`. It is its own row and it was not in my TOUCHES.
The repair list in the backlog file now also names the comment in that driver which `f1b90e55` made
false: it still says the contracts driver registers an absolute path.

## Verification

`npm run build`, three times, exit code read from the build itself
(`npm run build > log 2>&1; echo $?`): **EXIT=0** each time, the last at `f8c376f3` before the check
fixes and again after them. All gates green, including `check:copy` (the two sheets are public copy
with zero em-dashes and no personal handle) and `check:owner-queue`.

**check: ran.** `review: delegated` - 8 findings, 8 acted on. The pass reported merge base
`6150d0ba` and a file list I compared against
`git diff --name-only 6150d0ba..HEAD` plus `git status --porcelain=v1`: 10 changed files and 7
deletions, nothing uncommitted, an exact match. `simplify: inline` - the skill returned fan-out
instructions, which per `.agent-workflows/check.md` means the delegated pass did not run; the four
angles were worked here and produced two edits (a redundant `pre` in the print reset, and the road
counter left at screen size on paper). `verify: inline`. `taste: not applicable` - nothing here can
move what a graphic looks like.

**e2e: not run locally, and deliberately.** `node scripts/e2e-runs.mjs` reported a live
browser-driving job in `C:/claude/NoaCG-Studio` while this row was finishing, and one such job runs
per machine. The row's own traps say the same. CI runs `e2e/docs.spec.ts`, which is where the new
assertions are. What was checked without a browser instead: ids are unique across `docs.html` (76,
no duplicates), every in-page link on both sheets resolves to an id in the file (10 and 1), the
sections balance (16 open, 16 close), no hand-kept `start=` attribute is left, and `tsc --noEmit`
passes over the spec.

**The one thing nobody has seen** is either sheet rendered, on screen or on paper. That is row 18,
and it is why the owner-queue item exists.

## Pointers

- The sheets: `docs.html`, the two `<section class="one-pager">` blocks at the end of `.doc-body`.
- The print rules: `src/docs/docs.css`, the `@media print` block at the end.
- The spec: `e2e/docs.spec.ts`, "the session indexes carry their content, and each prints on its own".
- The script: `docs/DEMO_2026-09-25.md`, beats G2 and R1.7, and section 7 row 18.
