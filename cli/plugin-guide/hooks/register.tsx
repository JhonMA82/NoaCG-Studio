// noacg-guide: a trial mod that shows the NoaCG packages a session works on, and where each
// stands, above the prompt.
//
// Quiet outside graphics work (docs/work-specs/guided-mod/spec.md, AC-2): with no package in the
// working directory it draws nothing, adds nothing to the model's context and registers no tool
// or command. It never submits prompts, calls tools, runs processes, fetches or calls a model.
// It lists folders and reads package files under the project root: at session start, when a
// prompt is submitted and after a tool call that may have written files. After a `noacg` run it
// records what the run reported (hooks/watch.ts) in the mod's own store.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, FsEntry, Register } from 'claude-code'

import type { NoacgPackage, Run } from '../types'
import { fitNames, summary } from './band'
import { findPackages } from './packages'
import {
  fingerprint,
  isNoacgTool,
  mcpReports,
  normalize,
  outcomeOf,
  recordsFrom,
  relativeTo,
  resolvePath,
  statusOf,
  storedFrom,
  storeKey,
  terminalReports,
  withReport,
  type Report,
} from './watch'

const packages = atom({ plugin: 'noacg-guide', key: 'packages' } as const, [] as NoacgPackage[])

const TITLE = 'NoaCG'
/** Cells between the title and the names. */
const GAP = 2

/** What one pass needs from the dispatch that asked for it; every path absolute. */
type Scan = {
  root: () => Promise<string>
  list: (dir: string) => Promise<FsEntry[]>
  read: (file: string) => Promise<unknown>
  bytes: (file: string) => Promise<string>
  load: (key: string) => Promise<unknown>
  save: (key: string, value: unknown) => Promise<unknown>
  known: () => Promise<NoacgPackage[]>
  keep: (found: NoacgPackage[]) => Promise<unknown>
}

/** One scan at a time; a trigger during a scan asks for one more pass, with the newest access. */
let scanning: Promise<void> | undefined
let latest: Scan | undefined
/** Runs reported since the last pass, waiting to be tied to their package's files. */
const pending: { reports: Report[]; at: number; via: Run['via'] }[] = []

function rescan(scan: Scan): void {
  latest = scan
  scanning ??= drain()
}

async function drain(): Promise<void> {
  while (latest) {
    const now = latest
    latest = undefined
    try {
      await pass(now)
    } catch {
      // The next trigger scans again.
    }
  }
  // Cleared in the same step the loop ends, so no trigger can land between the two.
  scanning = undefined
}

async function pass(scan: Scan): Promise<void> {
  const root = normalize(await scan.root())
  const at = (dir: string) => resolvePath(root, dir)
  const found = await findPackages({ list: dir => scan.list(at(dir)), read: file => scan.read(at(file)) })
  const runs = pending.splice(0)
  if (found.length === 0) {
    if ((await scan.known()).length > 0) await scan.keep([])
    return
  }

  // Read on every pass, so a new session, or a second one in the same folder, sees the same records.
  const all = recordsFrom(await scan.load(storeKey(root)))
  const prints = new Map<string, string>()
  const print = async (dir: string) => {
    const known = prints.get(dir)
    if (known !== undefined) return known
    const made = await fingerprint(scan, at(dir))
    prints.set(dir, made)
    return made
  }

  let recorded = false
  for (const run of runs) {
    for (const report of run.reports) {
      const target = found.find(p => relativeTo(at(p.dir), report.target) === '.')
      if (!target) continue
      all[target.dir] = withReport(all[target.dir] ?? {}, report, { at: run.at, via: run.via, sha256: await print(target.dir) })
      recorded = true
    }
  }
  if (recorded) await scan.save(storeKey(root), storedFrom(all))

  const list: NoacgPackage[] = []
  for (const p of found) {
    const record = all[p.dir] ?? {}
    const current = record.check?.ok ? await print(p.dir) : null
    list.push({ ...p, status: statusOf(record, current), record })
  }
  if (JSON.stringify(await scan.known()) !== JSON.stringify(list)) await scan.keep(list)
}

/**
 * Starts a scan with this dispatch's access and passes the event on unchanged. `$` cannot be
 * passed on as a value, so the scan gets closures over it; the tool call hook builds the same.
 */
function scanThenPass<E, R>($: EngineInterface, e: E, next: (e: E) => R): R {
  rescan({
    root: () => $.session.root(),
    list: dir => $.fs.list(dir),
    read: file => $.fs.read(file),
    bytes: async file => (await $.fs.read(file, { as: 'bytes' })).base64,
    load: key => $.store.get(key),
    save: (key, value) => $.store.set(key, value),
    known: () => read($, packages),
    keep: found => update($, packages, () => found),
  })
  return next(e)
}

export const register: Register = on => {
  on('session.start', scanThenPass)
  on('prompt.submit', scanThenPass)

  on('tool.call', async ($, e, next) => {
    const terminal = (e.tool === 'Bash' || e.tool === 'PowerShell') && /noacg/i.test(e.command) && e.run_in_background !== true
    const mcp = isNoacgTool(e.tool)
    const cwd = terminal ? await $.session.cwd().catch(() => undefined) : undefined

    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    let reports: Report[] = []
    try {
      const outcome = outcomeOf(ran)
      if (terminal && 'command' in e && typeof e.command === 'string') {
        const backgrounded = typeof ran.result === 'object' && ran.result !== null && 'backgroundTaskId' in ran.result
        if (!backgrounded) reports = terminalReports(e.command, cwd ?? (await $.session.root()), e.tool === 'Bash', outcome)
      } else if (mcp) {
        reports = mcpReports(e as Record<string, unknown>, await $.session.root(), outcome)
      }
      if (reports.length > 0) pending.push({ reports, at: await $.clock.now(), via: mcp ? 'mcp' : 'terminal' })
    } catch {
      // A run the mod cannot read is a run it does not record.
    }
    if (reports.length > 0 || ran.isReadOnly !== true) {
      rescan({
        root: () => $.session.root(),
        list: dir => $.fs.list(dir),
        read: file => $.fs.read(file),
        bytes: async file => (await $.fs.read(file, { as: 'bytes' })).base64,
        load: key => $.store.get(key),
        save: (key, value) => $.store.set(key, value),
        known: () => read($, packages),
        keep: found => update($, packages, () => found),
      })
    }
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, packages)
    if (list.length === 0 || e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const room = Math.max(1, e.props.bodyColumns - TITLE.length - GAP)
    const names = fitNames(
      list.map(p => p.name),
      room,
    )

    return (
      <Box key="band" flexDirection="row" gap={GAP}>
        <Text bold>{TITLE}</Text>
        <Box flexDirection="column">
          <Text wrap="truncate-end">{names}</Text>
          <Text wrap="truncate-end" dimColor>
            {summary(list, room)}
          </Text>
        </Box>
      </Box>
    )
  })
}
