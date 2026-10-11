# Keep pictures out of the repository

## Problem

The repository is public, and every fork and every new worktree downloads all of it. By
2026-10-11 nearly 1,500 screenshots, frames and clips (87 MB) were tracked under `docs/` and
`benchmarks/`, about 500 of them added in the ten days before. They were proof of work written by
scripts and checks: no pull request showed them, no reader opened them, and the words beside them
are what the next agent uses. The git history holds about 200 MB, most of it these pictures.

## Behaviour

- Pictures and clips under `docs/` and `benchmarks/` stay on the machine that made them. Scripts
  and specs keep writing where they write today; git ignores the files.
- The existing ones live in a local archive on the owner's machine,
  `C:\claude\noacg-archives\repo-pictures-2026-10-11\`, under their repository paths.
- A picture committed anyway, with `git add -f` or from a checkout whose ignore rules differ in
  case, fails `npm run check:tree-shape`, which runs in every build.
- A receipt or pull request describes what a screenshot showed in words.

## Preserved

- The pictures users or a script read: the README's two (`docs/images/browse.png`,
  `docs/images/playout.png`), the tutorial examples' previews (`docs/tutorials/**`), and the
  creative benchmark's references (`benchmarks/creative/v1/references/`).
- Pictures outside `docs/` and `benchmarks/`: the e2e baselines, `public/`, the brand kit.
- Every benchmark result and every text document. Their links and recorded paths to archived
  pictures no longer resolve (markdown, galleries, JSON records); no code reads them, and the text
  around them stands.

## Non-goals

- Rewriting git history. That waits for a quiet window (below).
- Changing the scripts that write pictures. They write into ignored paths, which is the intent.

### AC-1: No evidence picture is tracked under docs/ or benchmarks/

`git ls-files docs benchmarks` lists no `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.avif`,
`.webm`, `.mp4` or `.mov` outside the preserved list.

### AC-2: The archived pictures are kept, byte for byte

Each removed file exists under the archive root at its repository path with the same SHA-256.

### AC-3: A new picture never reaches main

A picture written under `docs/` or `benchmarks/` is ignored by git; a force-added one makes
`npm run check:tree-shape` fail and name the file.

### AC-4: The preserved pictures are untouched

The README, the tutorial packs, the e2e baselines and the creative benchmark still have every
picture they had.

## Later steps

1. **Private context out of public text.** Owner context belongs in `docs/private/`, which git
   never sees, yet some tracked docs carry it. The owner reviews what counts as private, then the
   tracked text is cleaned and a check with a private word list keeps it clean.
2. **History rewrite, in a quiet window.** With no session running and every branch landed or
   parked: remove the archived paths and the cleaned text from all history, force-push, recreate
   the worktrees. New clones and forks become small. Old commits stay reachable through
   pull-request pages and existing clones until GitHub Support purges them.

## Phase notes

- Step 1 landed with this spec: 1,474 files archived (1,337 PNG, 130 JPEG, 7 WebM), 17 of them
  committed to main while this branch was in review.
