# Supabase native local runtime, 2026-10-12

Should Supabase's native local runtime (no Docker) replace or sit beside the Docker stack that
`configured-suite.yml` and cloud agent sessions use? Research plus a measured trial on GitHub
Actions. Nothing ran on the Windows machine.

## Recommendation

**Wait for beta. Do not adopt it in CI or for cloud sessions yet.** Land one guard now, whatever
happens to the native runtime.

1. **It would blind the grant check.** The native runtime gives every new table in `public` to
   `anon`, `authenticated` and `service_role` through default privileges, as hosted Supabase does.
   `supabase/AGENTS.md` relies on the local stack NOT doing that. A job can take the default
   privileges back before the migrations apply, and the trial shows that works, but the default
   is wrong for this repository.
2. **It fails five realtime tests every time.** `panel-relay.spec.ts` gets no answer to its private
   joins on native, on 2.120.0 and on the newest beta (2.121.0-beta.20). Docker passes all eight.
3. **The gain is small.** Native is healthy in 37 s against 143 s for main's Docker stack (104 s
   on CLI 2.120.0), so under two minutes off a job of about 26 minutes, and it removes the
   Docker-pull failure mode. That is worth having once it works. It is not worth a red suite or a
   blind grant check.
4. **Cloud sessions do not need it today.** Claude Code cloud VMs ship Docker. Codex cloud has no
   Docker, and native works there in principle (proven below as root, one stack per worktree), but
   nothing in this repo runs the configured suite or database checks in a cloud session.

**The finding that matters now is not about native.** The CLI's Postgres 15 image picked up the
same default privileges in 2.119.0, on the ordinary Docker path too. Today's pin (2.111.0) is the
only thing keeping the grant check honest, and `supabase/AGENTS.md` already steers local resets
towards 2.113.0 or later (2.113 to 2.118 are still safe). This branch adds a step to `configured-suite.yml` that fails when the stack hands
public tables to the client roles, and a note in `supabase/AGENTS.md` with the fix, so a pin bump
fails loudly instead of quietly retiring the check.

Revisit native when `panel-relay.spec.ts` passes on it and the experimental label is gone. The
exact change for that day is in "If adopting" below.

## Facts checked

| Claim | Verdict | Source |
| --- | --- | --- |
| Announced 2026-10-02, "in alpha today, off by default"; enabled by `[experimental] stack = true` or `SUPABASE_EXPERIMENTAL_STACK=1` | True | [Select 2026 post](https://supabase.com/blog/select-2026-build-anything) |
| One instance per directory or worktree | True. Identity is project root + git branch + optional `--stack` name | [Multiple local projects](https://supabase.com/docs/guides/local-development/running-multiple-local-projects) |
| Linux glibc 2.35+ and macOS 14+ on Apple silicon; Windows and Intel Macs "Use Docker" | True | [Docker and native runtimes](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes) |
| Flags and output may change between releases | True: outside the CLI compatibility promise | same |
| A project keeps the runtime it was created with | True. A different `--runtime` on an existing project fails | same |
| Arrived in CLI 2.119; flag is `supabase start --runtime native` | True. The multi-project guide requires v2.119.0+. `--runtime docker`, `podman`, `native`; an explicit flag never falls back | same, and the trial |
| Native Postgres refuses to run as root | True: `PostgreSQL cannot be run as root`, fix with `SUPABASE_NATIVE_POSTGRES_USER` | trial |

Newest stable CLI on 2026-10-12: 2.120.0 (2026-10-06). 2.121.0 is in beta (20 builds), and a
3.0.0-next line has started.

## The trial

Branch `claude/supabase-native-trial` (kept, never landed) runs `configured-suite.yml`'s job step
for step, minus the issue and quarantine writes, on three arms:

- **docker-2.111**: main today. CLI 2.111.0, `supabase start -x studio,edge-runtime`.
- **docker-2.120**: CLI 2.120.0 on the same legacy Docker path. This is the fallback if native is
  adopted, since the pin has to move to 2.120.0 either way.
- **native-2.120**: CLI 2.120.0, `SUPABASE_EXPERIMENTAL_STACK=1`,
  `supabase start --runtime native --eager --exclude studio,functions`. `--eager` starts every
  service before returning and turns off idle stops, so realtime cannot stop mid-suite. psql runs
  from the runner (16.15) against `DB_URL` instead of `docker exec` into the db container.

Every job also proves auth, PostgREST, storage (the buckets 0001 creates) and a realtime broadcast
round trip before the suite. It dumps the database shape: version, extensions, settings, default
privileges, every `public` grant, and a probe table created as `postgres` with no grants. A
`max-parallel: 3` matrix keeps the trial to 3 of the org's 20 concurrent jobs.

Three side branches answered narrower questions:
`claude/supabase-native-trial-grants` (the guard query and the revoke-first fix),
`claude/supabase-native-trial-cloud` (root, no Docker, two worktrees) and
`claude/supabase-native-trial-realtime` (the panel relay failure on its own).

### Time and pass rate, 5 runs per arm

Runs [38261818562](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38261818562) (attempt 1 of
each arm) and [38265996213](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38265996213)
(attempts 2 to 5), ubuntu-24.04 runners. Seconds, median with the range in brackets.

| | docker-2.111 (main today) | docker-2.120 (fallback) | native-2.120 |
| --- | --- | --- | --- |
| `supabase start` | 126 (121-149) | 87 (79-91) | 16 (14-28) |
| Job start to healthy | 143 (142-176) | 104 (98-111) | 37 (35-50) |
| Configured suite | 1445 (1352-1461) | 1489 (1256-1490) | 1771 (1749-1813) |
| Whole job | 1594 (1535-1610) | 1599 (1366-1606) | 1818 (1790-1868) |
| Runs with a hard failure | 0 of 5 | 0 of 5 | **5 of 5** (the same 5 panel-relay tests) |
| Runs with only a flake | 1 of 5 | 3 of 5 | 0 of 5 |
| Clean runs | 4 of 5 | 2 of 5 | 0 of 5 |

Native's 28 s start is the one run with a cold archive cache, downloads included; the others read
the cache wave 1 saved. Its suite is about 5 minutes longer only because the five failing tests
each wait out 30 s twice (the config retries once); without them it is in Docker's range. The
flakes (`late-send-abandoned`, `rundown-timing-recovery`, `production-data-key`, `live-prepare`)
are fail-then-pass on specs the quarantine already handles on main, and appear on every arm. On
a fresh runner, memory in use after the start was about the same on both runtimes (2.7 to 3.0 GB
of 16 GB).

The first native run reported green although its verdict was red: the trial had left out
configured-suite.yml's final "fail the run" step, which reads the verdict's output. It was added
before attempts 2 to 5; the table counts attempt 1 by its verdict.

"Start" is the `supabase start` step. "Healthy" is from job start to the end of the probe step
(auth, rest, storage and realtime all answering). "Green" is the verdict off main, where every
flake stays red. On main a fail-then-pass is quarantined instead.

### Q1: services and what works

Native runs database, REST, auth, realtime, storage, analytics, mail, pooler and functions as host
processes. Studio and functions were excluded, matching main's `-x studio,edge-runtime`. With CLI
2.120.0 the repository's `config.toml` loads unchanged, including the `before_user_created` hook,
the Google provider read through `env()`, and `major_version = 15`. All 86 migrations and
`seed.sql` apply. Both realtime publications hold, `authenticated` reads `documents`,
`control_shows` and `control_events`, storage lists the buckets, both accounts sign in, and a
public realtime broadcast makes its round trip.

What differs from main's Docker stack:

| | docker 2.111.0 | docker 2.120.0 | native 2.120.0 |
| --- | --- | --- | --- |
| Postgres | 15.8 (image 15.8.1.085) | 15.19 (image 15.19.0.004) | 15.19 |
| Default privileges on tables, `postgres` in `public` | `anon`, `authenticated`, `service_role`: TRUNCATE, REFERENCES, TRIGGER only | all privileges | all privileges |
| Probe table (no grants) readable by `anon` | no | **yes** | **yes** |
| `pg_graphql`, `pg_net`, `pgjwt` installed | yes | no | no |
| `supabase_functions` schema | yes | yes | no ([cli#7007](https://github.com/supabase/cli/issues/7007), closed 2026-10-07 after 2.120.0) |
| pg_cron jobs run | not measured | yes, per cli#6977 | no: `cron.use_background_workers = off` and Postgres listens only on a socket ([cli#6977](https://github.com/supabase/cli/issues/6977), closed 2026-10-07 after 2.120.0) |
| `panel-relay.spec.ts` | 8/8 | 8/8 | 3/8, every run |

None of the migrations need `pg_graphql`, `pg_net` or `supabase_functions`. 0037, 0039 and 0061
schedule pg_cron jobs, and no spec waits for a cron run, so the cron gap is invisible to the
suite. It would hide a broken retention sweep.

Grants on the repository's own tables are identical across all three arms for `anon` and
`authenticated`, because every table from 0010 on gets `revoke all ... from public, anon,
authenticated` before its grants. They differ for `service_role`, which no migration revokes: on 2.120.0 it
holds every privilege on every table, where on 2.111.0 it holds what was granted plus TRUNCATE, REFERENCES and TRIGGER.
`control_cue_arms` shows the stakes: no migration grants `service_role` anything on it, so on
2.111.0 it cannot read the table, while on 2.120.0 (and on hosted Supabase) it can. The default
privilege only bites on a table a migration forgets to grant, which is exactly the case the
configured suite exists to catch.

**The default privileges came with the image, not the runtime.** The CLI pinned Postgres 15 at
`15.8.1.085` up to 2.118.0 and moved to `15.19.0.002` in 2.119.0 (`pkg/config/constants.go` and
the `pg15` stage of the CLI's Dockerfile at each tag). The 2.119 boundary is read from the CLI
source; only 2.111.0 and 2.120.0 were run.

**The fix works on native and needs care on any stack.** Start with `supabase/migrations` and
`seed.sql` held back, revoke the default privileges for `postgres` in `public`, put the files back,
then `supabase migration up` and apply `seed.sql` with psql. Afterwards a probe table gets no
grants, all 86 migrations are applied, `authenticated` reads `documents` and `anon` does not, and
the guard query reads 0. `supabase db reset` restores the default privileges, so the fix has to
wrap the start every time.

**The panel relay failure.** On native the five tests that join a private `pnp-` or `pfb-` topic
from Node fail with `NO ANSWER`. The other three pass. With realtime client logging on, the client
sends `phx_join` and the WebSocket transport never opens; the realtime service logs no join. The
same private topics joined from a standalone Node script answer `SUBSCRIBED` on native, with or
without an HTTP call first, after a 6-second idle, or from a fresh client. The browser-side
realtime specs (the hosted output walks) pass. Root cause not isolated. It reproduces on 2.120.0
and 2.121.0-beta.20, and not on Docker. It is a candidate upstream report; the closest open one is
[cli#6975](https://github.com/supabase/cli/issues/6975), the gateway closing keep-alive
connections after 5 s.

### Q3: cloud agent sessions

- **Claude Code cloud VMs** run Ubuntu 24.04 on x86_64 as root, with 4 vCPUs and 16 GB, and ship
  `docker`, `dockerd` and `docker compose`. The Trusted network list includes `public.ecr.aws`,
  `ghcr.io` and Docker Hub, where the CLI pulls its images, and `release-assets.githubusercontent.com`,
  where native downloads its archives ([cloud environments](https://code.claude.com/docs/en/cloud-environments)).
  So the Docker stack is available there. Native would be lighter, but is not needed.
- **Codex cloud** starts from `codex-universal` (Ubuntu 24.04, root, no Docker in the image's
  Dockerfile). Agent-phase internet is off by default, so native's first-start download has to
  happen in the setup script (`supabase stack prepare --runtime native`).
- **Root works with one variable.** In an `ubuntu:24.04` container as root with no Docker daemon,
  a bare start is refused (`PostgreSQL cannot be run as root`). With
  `SUPABASE_NATIVE_POSTGRES_USER=supabase-postgres` (a system user) and `HOME` at `/root` it
  starts. The CLI refuses a group-writable home, which the Actions container hands root; a cloud VM
  does not.
- **One stack per worktree works.** Two worktrees of the same commit, with the fixed ports removed
  from their `config.toml`, started side by side in 22 s and 14 s. They got their own ports (24474
  and 25580), both applied 86 migrations, and a row written in one was absent from the other. Fixed
  ports are exact requests, so this needs `port` and `shadow_port` removed. That changes the local
  default for everyone: Studio and the API would no longer be at 54321-54323.

Nothing in the repository runs `e2e/configured/` or a local database in a cloud session today:
`docs/VERIFICATION.md` leaves full suites to GitHub Actions. So "adopt for cloud sessions only"
has no consumer yet.

### Q4: risk and fallback

- **Experimental surface.** The `stack` commands, flags and output are outside the CLI's
  compatibility promise. One output change already bites this workflow: `-o json` became
  `--output-format json`, with the keys under `.env`. Pin the CLI exactly, as `configured-suite.yml` and `post-land.yml` both already do
  (`supabase/setup-cli@v1` with `version: 2.111.0`). Never `latest`.
- **Release cadence.** 2.119.0 and 2.120.0 landed six days apart, with twenty 2.121 betas and a
  3.0 line in the week after. A pin needs a deliberate bump with this trial re-run.
- **Persistence.** A project keeps its runtime and its ports. Neither matters on a fresh runner. In
  a cloud environment whose filesystem is snapshotted, `~/.supabase` persists, so a switch means
  `supabase stack destroy`.
- **Fallback.** With the variable unset, the same pinned CLI runs the legacy Docker path. The
  trial ran that arm (docker-2.120) as the fallback. It carries the same default privileges as
  native, so the revoke-first start is needed on both.

## If adopting

When the gates clear (panel relay green on native, the stack commands out of experimental), change
`configured-suite.yml`:

1. `supabase/setup-cli@v1` to the version that cleared, pinned exactly.
2. A job-level `SUPABASE_RUNTIME: native`, with `docker` as the fallback, switched by editing that
   one line. Set `SUPABASE_EXPERIMENTAL_STACK: '1'` only when it is `native`. Do not put
   `[experimental] stack = true` in `config.toml`: it would switch every developer's local stack,
   and the owner's Windows machine cannot run native.
3. Cache `~/.supabase/cache/stack` with `actions/cache`, keyed on the CLI version.
4. The start, revoke-first on both runtimes. The trial ran this sequence on native only; run it
   once on the Docker fallback before relying on it there.

   ```bash
   mv supabase/migrations "$RUNNER_TEMP/migrations"; mkdir supabase/migrations
   mv supabase/seed.sql "$RUNNER_TEMP/seed.sql"
   if [ "$SUPABASE_RUNTIME" = native ]; then
     supabase start --runtime native --eager --exclude studio,functions
   else
     supabase start -x studio,edge-runtime
   fi
   psql "$DB_URL" -c "alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role"
   rmdir supabase/migrations; mv "$RUNNER_TEMP/migrations" supabase/migrations
   mv "$RUNNER_TEMP/seed.sql" supabase/seed.sql
   supabase migration up
   psql "$DB_URL" -f supabase/seed.sql
   ```

5. Read status with `supabase status --output-format json` and `.env.API_URL // .API_URL` (and the
   same for the three keys) on native; the existing `-o json` on Docker.
6. Replace `docker exec "$db_container" psql` with `psql "$SUPABASE_DB_URL"`. The runner's psql is
   16.15 against a 15.x server, which is fine for these queries, and it works on both runtimes, so
   the container discovery can go.
7. On failure, `supabase stack logs --tail 200` instead of `docker logs`.
8. Rename the rolling issue's "Docker image pull" wording to name both runtimes.

The guard this branch adds stays, and must still read 0.

## Not checked

- Podman, macOS, and native on arm64.
- A real Claude Code or Codex cloud session. The cloud facts come from their docs plus the root
  container on Actions.
- CLI 2.119.0 itself, and every version between 2.111.0 and 2.120.0.
- The panel relay failure's root cause.
- Whether `pg_cron` jobs run on 2.121 betas, where cli#6977 is closed.
