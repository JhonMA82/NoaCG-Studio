---
v: 2
kind: handoff
date: 2026-09-17
branch: claude/tk-doctor-names-a-stale-skill
row: TK
---
# TK - `noacg doctor` says when the door is serving last month's instructions

**Done and queued.** All four steps of the recipe, including the tail (step 3, the shared npm-
`latest` check) - it did not get hard. `noacg doctor` names an installed `noacg-graphic` skill that
is older than what is installable, with the update command for the harness holding it; the CLI's own
npm-`latest` comparison now lives in one file that both entrances run; `cli/README.md` says a plugin
does not update itself. No version bump - see "Not done, on purpose" below.

Proven on this laptop, both states in one run: Claude Code's install is 0.2.0 and prints, Codex's is
0.3.3 and prints nothing. The route is
`docs/acceptance/owner-queue/2026-09-17-tk-doctor-names-a-stale-skill.md`.

## The decision the row existed to make: how doctor learns the skill version

The backlog named two routes. **I took the manifest on disk** (`cli/src/skillVersion.ts`), and the
argument against the other one is decisive rather than aesthetic: if the skill's own command lines
pass the version they were loaded from, the skill TEXT has to carry that version, so the check can
only ever fire for people who already updated to a version that carries it. The 0.2.0 copy on this
laptop has no such line and never will, and it is exactly the copy worth warning about. (It is also
a version number retyped by a model reading a document, which is not a measurement.)

Both harnesses turn out to cache plugins the same way -
`<config>/plugins/cache/<marketplace>/<plugin>/<version>/` - and Claude Code additionally keeps
`plugins/installed_plugins.json` naming the ACTIVE install path. So the finder prefers that record
and falls back to the cache scan for a harness that keeps none (Codex, today). Three refusals keep
it from ever guessing: no manifest beside the skill is no claim, a cache directory's NAME is never
read as a version, and a plugin with two versions cached and no record of the active one is
ambiguous and therefore silent.

**It reports what is INSTALLED rather than working out who called it**, and names the harness on the
line. A subprocess cannot tell reliably - every session on this laptop carries both `CLAUDECODE` and
`CODEX_*` in the same environment - and a wrong attribution prints the wrong update command, which
is worse than printing two right ones.

## Evidence and traps not in any repo file

- **`claude plugin update <plugin>` exists and is separate from `claude plugin marketplace update
  <marketplace>`**; Codex has no `update` verb at all, so its pair is `codex plugin marketplace
  upgrade <marketplace>` then `codex plugin add <plugin@marketplace>`. Read off `--help` on this
  machine on 2026-09-17, which is why the two harnesses get different lines rather than one generic
  "update your plugin".
- **A fresh worktree has no `node_modules` anywhere**, including `cli/`. Both `npm ci` at the root
  and `npm --prefix cli ci` are needed before anything builds; the root one took several minutes.
  (`docs/backlog/a-fresh-worktree-fails-the-build-for-a-missing-install.md` is the same ground.)
- **`tsc` needed `allowJs`** to emit `cli/src/npmLatest.mjs` into `dist/`. That file is plain ESM on
  node builtins because it is copied verbatim into `cli/plugin-mcp/`, which has no build step and no
  `node_modules`. It types fine from its JSDoc; `cli/tsconfig.json` carries a `"// allowJs"` note
  saying it is for that one file.
- **I did not touch `~/.claude/plugins` or run any marketplace update**, per the row's trap. This
  laptop is still on 0.2.0 - which is what made it possible to prove the stale state for real.

## Not done, on purpose

- **No `cli/package.json` version bump.** Nothing in the shipped skill text or the plugin manifests
  changed, so no generated stamp needs a new number, and a bump that is not published makes every
  dev machine's MCP launcher warn that it is "behind" a version older than itself (the launcher
  compares with `!==`). The release recipe in `docs/AGENT_CLI.md` bumps as its FIRST step anyway, so
  the publishing commit is where it belongs. `npm --prefix cli run build` was run regardless,
  because the new generated copy needs writing.
- **The MCP launcher still compares with `!==` rather than the `isBehind` it now imports.** The code
  review flagged it, and it is a real if small defect: a maintainer between a bump and its publish
  is told to run `npm i -g @noacg/cli@latest`, which would downgrade them. I left it because the row
  said the launcher's behaviour must not change, and this is a behaviour change. One identifier
  fixes it whenever somebody is allowed to make it.
- **Nothing was published.** `npm run release:cli` reads the version from `origin/main`, and
  publishing is the owner's.

## Still open

- `docs/backlog/nothing-tells-a-user-their-installed-noacg-plugin-is-stale.md` kept its slug (three
  files point at it for the measurement) but now holds only what remains: **this laptop's
  marketplace entry still names the pre-rename `miwco/NoaCG-Studio`**, working on a GitHub redirect
  nobody controls. Re-pointing it swaps the skill text under every session using that checkout, so
  it is a MORNING item on a quiet machine, with `noacg doctor` as its own confirmation afterwards.
- `doctor` still does not separately name what `resolveCli()` would pick, i.e. which copy the MCP
  launcher would import. That half of the older backlog file was left undecided before this row and
  still is; `docs/AGENT_CLI.md` says so where it says the rest is closed.

## Nothing needs the owner

No account, money, identity or harness question came up. The one thing he might WANT is the release
that puts this on npm, which is his call and not a landing.

## Pointers

- `cli/src/skillVersion.ts` - the finder and every refusal, with the rejected route argued in the
  header.
- `cli/src/npmLatest.mjs` - the shared registry read; `cli/plugin-mcp/npm-latest.mjs` is its
  generated copy, written by `cli/scripts/build-skill.mjs` (now 12 generated files, was 11).
- `cli/src/commands/doctor.ts` - the two rows and the `UNKNOWN_VERSION` guard.
- `cli/test/skill-version.test.mjs` - six tests, all offline, against fake config directories.
- `docs/AGENT_CLI.md` - "The installed skill can be older than everything else".

## The check

`review: delegated` (1 medium, 4 low; scope confirmed against `git diff --name-only
d4c20a4f76a4d5b131805dbccc81278dc0a6e47e..HEAD` - 13 files, exact match, nothing uncommitted; 4
findings fixed, 1 deliberately declined and recorded above). `simplify: inline` - the skill returned
fan-out instructions, so the four angles were covered here; it removed a per-harness manifest-folder
field that could never matter, because one generator stamps both manifests from one number.
`verify: inline` - `npm run build` exit 0 read from its own status, `npm --prefix cli run build`
exit 0, `npm --prefix cli test` 75 passed / 5 skipped (the skipped ones need a live bridge), and
`node scripts/e2e-affected.mjs --json` answered `mode: none`, so no spec covers this branch.
`taste: not applicable` - nothing here can move what a graphic looks like.
