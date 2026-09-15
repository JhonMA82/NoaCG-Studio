# The first walk - what 0.3.2 and two authored machines cost, and what they broke

AC-2 holds and AC-9's first half is measured. `@noacg/cli@0.3.2` is on npm with provenance, both
proof-case graphics were authored through the CLI against the shipped skill and driven on the
in-app production page. The walk found six things: the release script's own verification, an
on-air layout fault, a field id on an operator button and a trap in the skill's worked machine
are fixed here; three CLI-grammar findings are filed; and the bench's silence about the buttons
it skipped is left where it belongs, with AC-3.

## What is left, and why

- **The hosted control page and the exported controller were not driven.** A linked worktree has
  no `.env.local`, so nothing can be published from it; the in-app production page is the only
  surface a walk here can reach. AC-9's second half (the profile in use, driven from the hosted
  page) is row 8's, and it needs a checkout that carries the env.
- **`noacg save` was never exercised against a real library.** It refused in 0.3 s for want of a
  key, which is the same wall the 2026-09-09 walk hit and is recorded as such. The Import door
  carried the whole production instead, and `noacg pack` turned out to be the better route
  anyway: one file, both graphics, their layers, one import.
- **The bench's silence about the three buttons it skipped is AC-3's**, deliberately untouched
  per this row's prompt. It is worse than the number suggests: `validate` reported **0 errors and
  0 warnings** on the totals board, having pressed eight of its eleven controls, and said nothing
  about the other three. A clean report is not a walked graphic.
- **Nothing was cut.** Step 5's fixture and spec are in.

## Evidence and traps that exist in no repo file

- **`npm run release:cli` refused a release that had worked perfectly.** npm answers the publish
  PUT with **202 Accepted** and processes the package afterwards - `Your package is being
  processed and may take a few minutes to become available` - so the script's single immediate
  read answered 404 and printed `the run was green but @noacg/cli@0.3.2 is not on the registry`.
  Measured: PUT 202 at 12:33:34 UTC, still absent at 12:34:57, present by 12:35:41. The read now
  polls for six minutes, `--verify-only` re-runs the proof against a version already out, and
  `docs/AGENT_CLI.md` carries the whole story. **If a future release prints that refusal, check
  `npm view` before believing it.**
- **A `//` comment inside `NOACG_ANIM` costs the timeline, and the skill's worked machine invites
  one.** The block is strict JSON; §5c shows it in a ```jsonc fence with comment lines. Writing
  them inside the braces earns `anim-data` + `bench-editability` and a read-only timeline, with
  the graphic still playing so nothing looks wrong. §5c now says so in bold above the fence.
- **The bench's `onAir` check needs an element that OWNS TEXT.** The votes board's first validate
  failed `bench-entrance` AND `bench-replay` because every row hides itself when its field is
  empty, so with the scaffold's blank defaults nothing on the card owned any text - the panel was
  drawn and the bench correctly called it invisible. Giving the fields default values fixed both.
  Any graphic that hides empty rows needs defaults or it fails its own entrance check.
- **`adjust` in the emitted template is keyed by `fN`, not by the type's field name.** The skill
  does not say which, and `scoreboard.ts` shows `adjust: { scoreA: 1 }` while the scaffolded
  template shows `adjust: { "f1": 1 }`. Scaffold a type and read its block before authoring one.
- **A self-transition on the MAIN group replays that state's timeline** (`noacgFire` →
  `noacgEnterTimeline`), so `board -> board` on a +1 would re-run the whole entrance. The
  scoreboard's shape is the answer and the totals board copies it: a parallel `flash` group takes
  the presses and the main group never moves.
- **`noacgApplyPayload` writes fields directly and never calls `update()`**, so a graphic that
  repaints on data (a re-sort, a mark) must fire that work from the target state's `calls` as
  well as from `update()`, or an ⚡ press moves the number and nothing else.
- **A ref captured from `read_page` and clicked later can land on the wrong element.** It cost
  this walk a real minute of confusion: a click on » Next hit ■ Out. That turned out to be a
  genuine layout defect underneath (below), but the tooling hazard is real - re-`find` a control
  immediately before clicking it on a page that has scrolled.
- **The production page's own Import door is not on the dashboard.** `Home` lands on
  `section: null`, where `ProductionsSection` renders with `limit={5}` and the import card is
  behind `{!limit && …}`. The CLI's message says "Home > Productions > Import a package", which
  is correct and still sends you to a page that does not show it until you click Productions in
  the sidebar.

## Anything that needs the owner

Nothing blocking. Two things are his to look at rather than to answer:

- `docs/acceptance/owner-queue/2026-09-15-agent-made-proof-case.md` is the route and the numbers.
- **The verb column's floor changes frames he ratified.** 1366×768 is unchanged (206px was
  already its own number), and every wider size now matches it, which costs the monitors 20px at
  1920×1080 and 2560×1440. The reasoning is in the CSS comment; if he would rather have the
  20px back, the number is one constant.

## Pointers

- Commits: `229bf195` (the release verification), `77e54104` (the layout and wording fixes plus
  the walk's record), and the check commit on the same branch.
- Check stamp: `npm run stamp` on this branch - review `delegated` (4 findings, 4 fixed),
  simplify `inline`, verify `inline`, taste `not applicable`.
- The owner-queue item above; three findings under `docs/backlog/`
  (`cli-scaffold-fields-drops-the-declared-order`,
  `noacg-inspect-hides-what-a-button-actually-does`,
  `scaffold-cannot-declare-the-hidden-holder-the-contract-teaches`).
- The fixture and its provenance: `e2e/fixtures/agent-made/README.md`. The authored sources are
  in `C:\claude\noacg-hb-walk\` on this machine, outside the repository, as the walk required.
- Spec: `docs/work-specs/control-panel-any-graphic/spec.md` AC-2 (met) and AC-9 (first half).
  Plan: §3a, §3b, §3c, §5 row 3.
