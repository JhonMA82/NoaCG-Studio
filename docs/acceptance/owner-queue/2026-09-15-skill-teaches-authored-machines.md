---
kind: agent
date: 2026-09-15
---
# The skill tells an agent it may author a machine

## Route, under a minute

From this feature worktree:

```sh
npm --prefix cli run build
node cli/dist/index.js docs contract
```

Scroll to `## 5. Operator actions`. That is the text every coding agent reads before it builds a
graphic for you, in the npm package, the Claude Code plugin and the Codex skill alike.

## What to look at

- §5 still puts a TYPE first. That has not changed and should not: a type's machine is proven on
  air. Authoring is what happens when no type fits.
- §5a names the three gates you set on 2026-08-27, and the loop in `SKILL.md` makes them steps
  rather than a reference an agent may never open. Gate 2 is the one with you in it: the agent
  must run `noacg inspect` and SHOW you the buttons before saving.
- §5c is a machine that actually passes. It was authored, validated and inspected while this was
  written, not sketched: `noacg validate` reported 0 errors and 0 warnings, and `noacg inspect`
  printed one button, `Reveal winner`, in section `Award`, carrying `f4`.
- The sentence that used to close §5 - "Authoring your own machine is a later capability" - is
  gone, and a unit test fails if it or any of the three gates comes back.

## What this does not do

It teaches; it does not prove. An agent authoring a machine from a cold prompt end to end is
AC-2 of `docs/work-specs/control-panel-any-graphic/spec.md`, and the bench still stops after
eight operator events (AC-3). Nothing here is published to npm - 0.3.2 is minted, not released.

## One thing worth knowing

The SPX definition's `steps` is the author's to keep right, and I found nothing recomputes it for
a package edited on disk. Add a waypoint by hand and leave `steps` at `1` and validate stays
green while the OGraf manifest reports `stepCount: 1` - a third-party renderer is then told there
is no Continue to press, so the reveal never happens there. §5d says so in the skill, and the
missing check is filed rather than fixed here.
