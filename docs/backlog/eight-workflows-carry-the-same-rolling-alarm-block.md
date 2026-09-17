# Eight workflows carry the same rolling-alarm shell block by copy

**Filed:** 2026-09-16. **Source:** the simplify pass on `claude/qd-durations-refresh-opens-a-pr`,
which added the eighth copy.

## Why

Every rolling alarm in `.github/workflows/` is the same twenty lines of shell, pasted: a `TITLE=`,
a `gh issue list --state open --search "\"$TITLE\" in:title" --json number --jq '.[0].number'`, a
comment-if-open / create-if-not branch, and a mirrored close step. Eight files carry it now -
`ci.yml`, `configured-suite.yml`, `deploy-verify.yml`, `hosted-latency.yml`, `nightly.yml`,
`nightly-drift.yml`, `weekly-audit.yml` and `e2e-durations-refresh.yml` - and ten alarms between
them (`docs/DEPLOYMENT.md`, "Alerting").

The copies have already drifted once, in the way that costs something: the branch guard
(`github.event_name == 'schedule' || github.ref == 'refs/heads/main'`) reached `ci.yml` and
`configured-suite.yml` first, then two more on 2026-08-30, and `weekly-audit.yml` only on
2026-09-08 - after a green dispatch from a feature branch closed a `main` alarm that was still
true. `docs/VERIFICATION.md` still described that file as deliberately unguarded a week later.
A rule that has to be applied eight times is a rule that is true seven times.

## What it would take

A composite action under `.github/actions/` - the repo already has `node-modules` and
`playwright-chromium` - taking the title, the body and the run URL, with the branch guard inside
it rather than restated at each call site. Both halves belong to it: `file-or-update` and `close`,
so a workflow cannot get one and forget the other. `scripts/alarm-issues.mjs` reads the titles back
and `scripts/alarm-issues.test.mjs` reads them out of the workflow files, so whatever shape this
takes has to keep the title a literal string a regex can find - that test is what stops a new alarm
going unreported, and it is cheaper to keep than to replace.

Prove it by dispatching two of the converted workflows and watching one issue open and close; a
workflow edit no run has executed is not verified. Its own row, because it edits eight files on the
alarm path.

## Evidence

`.github/workflows/weekly-audit.yml` "File / update the failure issue" against the same step in
`e2e-durations-refresh.yml`, `nightly.yml` and `hosted-latency.yml` - four transcriptions of one
block. `docs/CI_STABILITY.md` class 6 and `docs/VERIFICATION.md` carry the drift this already cost.
`docs/backlog/two-workflows-copy-one-dev-server-boot-block.md` is the same finding at two files.
