#!/usr/bin/env node
// Read-only projection of existing authorities. No transcript, new database, or launch action.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobsDir, readJobs, readLandings, declaredCommitOf } from './jobs-store.mjs';
import { readLaunches, readProgress, progressFor, joinDurations } from './wave-launch.mjs';
import { inStore, wavePlanFiles, wavePlansDir } from './wave-plan-store.mjs';
import { parseWaveTable, parsePromptBlocks } from './wave-plan-check.mjs';
import { parseWindowStart, parseWindowEnd } from './wave-horizon.mjs';
import { git, samePath, worktreeEntries } from './worktree-cleanup-lib.mjs';
import { planAcceptance, checkWorkFile } from './work-spec.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const newest = (rows) => [...rows].sort((a, b) => b.enqueuedAt - a.enqueuedAt)[0];

/** A recorded job is evidence of that job only. Neither exit zero nor a quiet branch proves
 * product completion. Current-SHA containment requires a matching landing receipt as well. */
export function recoverRows({ text, plan, launches, jobs, landings, progress = [], branches = {} }) {
  const blocks = parsePromptBlocks(text);
  const scoped = launches.filter((entry) => entry.plan && samePath(entry.plan, plan));
  const durations = joinDurations(scoped, jobs, landings);
  return parseWaveTable(text).rows.map((row) => {
    const attempts = scoped.filter((entry) => entry.letter === row.letter).sort((a, b) => a.at - b.at);
    const launch = attempts.at(-1);
    const branch = launch?.branch ?? /^BRANCH\s+(\S+)/m.exec(blocks.get(row.letter)?.text ?? '')?.[1] ?? null;
    const fact = branches[branch] ?? {};
    const mine = jobs.filter((job) => branch && job.branch === branch && launch && job.enqueuedAt >= launch.at);
    const merge = newest(mine.filter((job) => job.kind === 'merge'));
    const gate = newest(mine.filter((job) => job.kind === 'gate'));
    const pin = declaredCommitOf(merge);
    const matchingPin = Boolean(fact.sha && pin === fact.sha);
    const landed = fact.inMain === true && landings.some((entry) =>
      entry.branch === branch && launch && entry.at >= launch.at);
    const reported = progressFor(launch, progress);
    let state = launch ? 'unknown' : 'planned';
    let nextAction = launch ? 'reconcile owner through recorded harness; do not relaunch' : 'check collision, capacity and horizon before dispatch';
    if (reported && reported.sha === fact.sha && fact.source !== 'landing-pin') {
      state = reported.state;
      nextAction = reported.nextAction;
    }
    if (landed) {
      state = 'landed'; nextAction = 'check main CI and eligible refill';
    } else if (merge && matchingPin) {
      state = ['waiting', 'running'].includes(merge.state) ? 'landing' : merge.state === 'done' ? 'unknown' : 'failed';
      nextAction = state === 'landing' ? 'observe serialized landing queue' : 'inspect pinned landing result with branch owner';
    } else if (gate && ['waiting', 'running'].includes(gate.state)) {
      state = 'verifying'; nextAction = 'observe gate job; worker retains ownership';
    }
    const duration = durations.find((entry) => entry.branch === branch);
    return {
      letter: row.letter, goal: row.goal, pool: row.pool, start: row.start,
      touches: row.touches, mints: row.mints, branch, sha: fact.sha ?? null, shaSource: fact.source ?? 'branch-ref',
      owner: { host: launch?.host ?? null, workerId: launch?.workerId ?? null, liveness: 'unqueried' },
      worktree: fact.worktree ?? launch?.worktree ?? null, resultPath: launch?.resultPath ?? null,
      state, nextAction, attempts: attempts.length,
      workerReport: reported ? { ...reported, currentSha: reported.sha === fact.sha, evidence: 'worker claim; independently verify before completion' } : null,
      verification: gate ? { jobId: gate.id, state: gate.state, exitCode: gate.exitCode ?? null,
        log: gate.logPath ?? null, scope: 'job result only; inspect SHA and required checks' } : null,
      landing: merge ? { jobId: merge.id, state: merge.state, sha: pin, matchesCurrentSha: matchingPin } : null,
      toQueueMin: duration?.toQueueMin ?? null, toLandMin: duration?.toLandMin ?? null,
    };
  });
}

/** Only refs and the shared worktree registry are read, never another worker's files. */
export function branchFacts(root = ROOT, jobs = []) {
  const refs = git(['for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads'], root);
  if (!refs.ok) throw new Error('cannot read branch refs');
  const trees = worktreeEntries(root);
  const facts = Object.fromEntries(refs.stdout.trim().split('\n').filter(Boolean).map((line) => {
    const [branch, sha] = line.trim().split(/\s+/);
    const contained = git(['merge-base', '--is-ancestor', sha, 'origin/main'], root);
    return [branch, { sha, inMain: contained.ok ? true : null,
      worktree: trees.find((tree) => tree.branch === branch)?.root ?? null }];
  }));
  // Cleanup may remove the branch immediately after landing. Recover its last declared SHA,
  // but still require Git containment and a landing receipt before calling it landed.
  const merges = new Map([...jobs].filter((job) => job.kind === 'merge').sort((a, b) => a.enqueuedAt - b.enqueuedAt).map((job) => [job.branch, job]));
  for (const job of merges.values()) {
    if (facts[job.branch]) continue;
    const sha = declaredCommitOf(job);
    if (sha) facts[job.branch] = { sha, source: 'landing-pin', inMain: git(['merge-base', '--is-ancestor', sha, 'origin/main'], root).ok ? true : null };
  }
  return facts;
}

export function recoverWave({ dir, plan, branches, root = ROOT, now = Date.now() }) {
  if (!inStore(plan, dir)) throw new Error('plan must be in the shared wave-plan store');
  const text = readFileSync(plan, 'utf8');
  const parsed = parseWaveTable(text);
  if (parsed.problems.length) throw new Error(parsed.problems.join('; '));
  const rows = recoverRows({ text, plan, branches, launches: readLaunches(dir), progress: readProgress(dir), jobs: readJobs(dir), landings: readLandings(dir) });
  // Branch execution and parent acceptance have different authorities. Reuse the tick's
  // acceptance reader so recovery never silently closes a parent whose slice landed.
  const features = planAcceptance(text, { check: (record) => checkWorkFile(record, { root }) });
  const end = parseWindowEnd(text);
  const eventPath = path.join(dir, 'wave-tick-events.log');
  const snapshotPath = path.join(dir, 'wave-tick-state.json');
  let observation = null;
  try {
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    if (snapshot.v === 2) observation = { at: snapshot.at, tick: snapshot.tick, queueStalled: snapshot.queueStalled };
  } catch { /* Missing/corrupt observation is explicitly unknown; it cannot authorize dispatch. */ }
  return {
    plan, readOnly: true, window: { startsAt: parseWindowStart(text), endsAt: end, expired: end === null ? null : now >= end },
    observation, rows, features,
    context: { planBytes: Buffer.byteLength(text), promptBytes: [...parsePromptBlocks(text).values()].reduce((sum, block) => sum + Buffer.byteLength(block.text), 0) },
    // This bounded tail is for diagnosis, not a replay cursor or a completion counter.
    recentEvents: existsSync(eventPath) ? readFileSync(eventPath, 'utf8').trim().split('\n').slice(-12) : [],
    nextAction: 'reconcile the existing coordinator and worker IDs; refresh tick/CI before acting; never infer an idle slot from unknown'
      + (features.length ? '; inspect parent acceptance and preserve open criteria in bounded gap work before claiming parent completion' : ''),
  };
}

export function main(argv = process.argv.slice(2)) {
  try {
    if (argv.includes('--help')) {
      process.stdout.write('Usage: node scripts/wave-recover.mjs [--plan <stored-plan>] [--json]\n'); return 0;
    }
    if (argv.some((arg, index) => !['--plan', '--json'].includes(arg) && argv[index - 1] !== '--plan')) throw new Error('unknown argument');
    const dir = jobsDir();
    if (!dir) throw new Error('not in a git repository');
    const index = argv.indexOf('--plan');
    const plan = index >= 0 ? argv[index + 1] : path.join(wavePlansDir(dir), wavePlanFiles(dir)[0] ?? 'missing');
    const result = recoverWave({ dir, plan, branches: branchFacts(ROOT, readJobs(dir)) });
    if (argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      process.stdout.write(`${result.plan}\nWindow expired: ${result.window.expired ?? 'unknown'}; observation: ${result.observation?.at ?? 'unknown'}; plan ${result.context.planBytes} bytes\n`);
      for (const row of result.rows) process.stdout.write(`${row.letter} ${row.state} ${row.branch ?? '?'} ${row.sha ?? '?'} - ${row.goal}\n  owner ${row.owner.host ?? '?'}/${row.owner.workerId ?? '?'}; ${row.nextAction}\n`);
      for (const feature of result.features) process.stdout.write(`Parent ${feature.record}: ${feature.status}; open ${feature.openCriteria.join(', ') || '-'}; ${feature.problems} problem(s), ${feature.gaps} gap(s)\n`);
      process.stdout.write(`${result.nextAction}\n`);
    }
    return 0;
  } catch (error) { process.stderr.write(`wave-recover: ${error.message}\n`); return 2; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
