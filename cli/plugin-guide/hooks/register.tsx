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
import type { EngineInterface, Register } from 'claude-code'

import type { NoacgPackage, Run } from '../types'
import { fitNames, summary } from './band'
import { findPackages, isObject, type Folders } from './packages'
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
  storeKey,
  terminalReports,
  withReport,
  type Reader,
  type Records,
  type Report,
} from './watch'

const packages = atom({ plugin: 'noacg-guide', key: 'packages' } as const, [] as NoacgPackage[])

const TITLE = 'NoaCG'
/** Cells between the title and the names. */
const GAP = 2

/** What one pass needs from the dispatch that asked for it; every path absolute. */
type Scan = Folders &
  Reader & {
  root: () => Promise<string>
  load: (key: string) => Promise<unknown>
  save: (key: string, value: unknown) => Promise<unknown>
  known: () => Promise<NoacgPackage[]>
  keep: (found: NoacgPackage[]) => Promise<unknown>
}

/** One scan at a time; a trigger during a scan asks for one more pass, with the newest access. */
let scanning: Promise<void> | undefined
let latest: Scan | undefined
/** Reports since the last pass, each with its run and the fingerprint the run left. */
const pending: { report: Report; run: Run }[] = []

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
  if (found.length === 0) {
    if ((await scan.known()).length > 0) await scan.keep([])
    return
  }

  // Read on every pass, so a new session, or a second one in the same folder, sees the same
  // records; a run is folded in and written straight after the read, so the two seldom cross.
  const runs = pending.splice(0)
  let all: Records
  try {
    all = recordsFrom(await scan.load(storeKey(root)))
    let recorded = false
    for (const { report, run } of runs) {
      const target = found.find(p => relativeTo(at(p.dir), report.target) === '.')
      if (!target) continue
      all[target.dir] = withReport(all[target.dir] ?? {}, report, run)
      recorded = true
    }
    if (recorded) await scan.save(storeKey(root), { packages: all })
  } catch (failed) {
    // Kept for the next pass rather than lost.
    pending.unshift(...runs)
    throw failed
  }

  const list: NoacgPackage[] = []
  for (const p of found) {
    const record = all[p.dir] ?? {}
    const current = record.check?.ok ? await fingerprint(scan, at(p.dir)) : null
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
    const command = (e.tool === 'Bash' || e.tool === 'PowerShell') && e.run_in_background !== true && /noacg/i.test(e.command) ? e.command : null
    const mcp = isNoacgTool(e.tool)
    const cwd = command !== null ? await $.session.cwd().catch(() => undefined) : undefined

    const ran = await next(e)
    if (ran.deny !== undefined) return ran

    const scan: Scan = {
      root: () => $.session.root(),
      list: dir => $.fs.list(dir),
      read: file => $.fs.read(file),
      bytes: async file => (await $.fs.read(file, { as: 'bytes' })).base64,
      load: key => $.store.get(key),
      save: (key, value) => $.store.set(key, value),
      known: () => read($, packages),
      keep: found => update($, packages, () => found),
    }
    let reports: Report[] = []
    if (command !== null || mcp) {
      try {
        const outcome = outcomeOf(ran)
        const root = normalize(await scan.root())
        const backgrounded = isObject(ran.result) && 'backgroundTaskId' in ran.result
        if (command !== null && !backgrounded) reports = terminalReports(command, cwd ?? root, e.tool === 'Bash', outcome)
        else if (mcp) reports = mcpReports(e as Record<string, unknown>, root, outcome)
        // Only a package can be the root or a folder directly below it; nothing else is read.
        reports = reports.filter(r => /^[^/]+$/.test(relativeTo(root, r.target) ?? '/'))
        // The fingerprint is taken now, as the run left the files, before anything else edits them.
        const at = await $.clock.now()
        const via = mcp ? 'mcp' : 'terminal'
        const prints = new Map<string, string>()
        for (const report of reports) {
          const sha256 = prints.get(report.target) ?? (await fingerprint(scan, report.target))
          prints.set(report.target, sha256)
          pending.push({ report, run: { at, via, sha256 } })
        }
      } catch {
        // A run the mod cannot read is a run it does not record.
      }
    }
    if (reports.length > 0 || ran.isReadOnly !== true) rescan(scan)
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
