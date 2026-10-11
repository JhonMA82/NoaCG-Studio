// noacg-guide: a trial mod that shows the NoaCG packages a session works on, where each stands
// and what to ask for next, above the prompt.
//
// Quiet outside graphics work (docs/work-specs/guided-mod/spec.md, AC-2): with no package in the
// working directory it draws nothing, adds nothing to the model's context and registers no tool.
// Its one registration is the `/noacg-guide` command, which the model never sees. It never
// submits prompts, calls tools, runs processes, fetches or calls a model: its buttons fill the
// prompt box for the person to send, open a link through the surface, or hide the band.
// It lists folders and reads package files under the project root: at session start, when a
// prompt is submitted and after a tool call that may have written files. After a `noacg` run it
// records what the run reported (hooks/watch.ts) in the mod's own store.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { NoacgPackage, Run } from '../types'
import { fitNames, SEPARATOR, summary } from './band'
import { findPackages, isObject, type Folders } from './packages'
import { firstStep, linkOf, START, stepOf } from './steps'
import {
  fingerprint,
  isNoacgTool,
  mcpReports,
  normalize,
  outcomeOf,
  recordsFrom,
  relativeTo,
  resolvePath,
  runsNoacg,
  statusOf,
  storeKey,
  terminalReports,
  withReport,
  type Reader,
  type Records,
  type Report,
} from './watch'

const packages = atom({ plugin: 'noacg-guide', key: 'packages' } as const, [] as NoacgPackage[])
const hidden = atom({ plugin: 'noacg-guide', key: 'hidden' } as const, false)
const offer = atom({ plugin: 'noacg-guide', key: 'offer' } as const, false)

/** How long a request shown as a toast stays, where the prompt box could not take it. */
const TOAST_MS = 12_000

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
    const status = statusOf(record, current)
    list.push({ ...p, status, record, next: stepOf({ ...p, record }, current) })
  }
  if (JSON.stringify(await scan.known()) !== JSON.stringify(list)) await scan.keep(list)
}

/** Whether this load of the module has declared `/noacg-guide`; a reload declares it again. */
let declared = false

/**
 * Starts a scan with this dispatch's access and passes the event on unchanged. `$` cannot be
 * passed on as a value, so the scan gets closures over it; the tool call hook builds the same.
 *
 * The first dispatch of a load, the session's start, also declares `/noacg-guide`. It is
 * declared in every session, packages or not, since AC-13 has it start a package in a folder
 * with none; a command is the person's alone, and the model is not told of it.
 */
async function scanThenPass<E, R>($: EngineInterface, e: E, next: (e: E) => R): Promise<Awaited<R>> {
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
  // After the scan has started; a registration that failed is tried again at the next prompt.
  if (!declared) {
    declared = await $.command.register({ name: 'noacg-guide', description: 'Show NoaCG packages and what to ask next', immediate: true }).then(
      () => true,
      () => false,
    )
  }
  return await next(e)
}

export const register: Register = on => {
  on('session.start', scanThenPass)
  on('prompt.submit', scanThenPass)

  // Brings the band back; with no package here, it offers to start one.
  on('command.run', { command: 'noacg-guide' }, async $ => {
    // A scan under way (the session's start) settles first, so a package is not missed.
    await scanning
    const none = (await read($, packages)).length === 0
    await update($, hidden, () => false)
    await update($, offer, () => none)
    return {}
  })

  on('tool.call', async ($, e, next) => {
    const shell = e.tool === 'Bash' || e.tool === 'PowerShell' ? e : null
    const escapes = e.tool === 'Bash'
    const command = shell && shell.run_in_background !== true && /noacg/i.test(shell.command) ? shell.command : null
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
        // The engine's Bash and PowerShell results carry every optional key, `backgroundTaskId`
        // undefined on a run that finished; only a run moved to the background (a timeout,
        // Ctrl+B) names its task.
        const backgrounded = isObject(ran.result) && typeof ran.result.backgroundTaskId === 'string'
        if (command !== null && !backgrounded) reports = terminalReports(command, cwd ?? root, escapes, outcome)
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
    // Any noacg run, read or not, in the background or not, brings a hidden band back.
    if (mcp || (shell && runsNoacg(shell.command, escapes))) {
      try {
        if (await read($, hidden)) await update($, hidden, () => false)
      } catch {
        // The band stays as it was.
      }
    }
    if (reports.length > 0 || ran.isReadOnly !== true) rescan(scan)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [isHidden, list, offered] = await Promise.all([read($, hidden), read($, packages), read($, offer)])
    if (isHidden || (list.length === 0 && !offered)) return next(e)

    const { Box, Button, Link, Text } = $.ui.resolve(e)
    // A request goes into the prompt box for the person to send, on a line after a draft they
    // typed, never over it; where no box takes it, a toast.
    const fill = (text: string) => async () => {
      const draft = (await $.prompt.read()).text
      if (draft.includes(text)) return
      const filled = await $.prompt.fill(draft.trim() ? { text: `\n${text}`, mode: 'append' } : { text }).catch(() => ({ isFilled: false }))
      if (!filled.isFilled) $.ui.toast(text, { timeoutMs: TOAST_MS })
    }
    const hide = <Button key="hide" label="Hide" dimColor role="dismiss" onPress={() => update($, hidden, () => true)} />

    const focus = firstStep(list) ?? list.find(p => linkOf(p.record))
    const step = focus?.next
    const link = focus && linkOf(focus.record)
    const room = Math.max(1, e.props.bodyColumns - TITLE.length - GAP)
    return (
      <Box key="band" flexDirection="row" gap={GAP}>
        <Text bold>{TITLE}</Text>
        {list.length === 0 ? (
          <Box flexDirection="row" gap={1}>
            <Button key="start" label="Start a package" variant="primary" onPress={fill(START)} />
            {hide}
          </Box>
        ) : (
          <Box flexDirection="column" flexShrink={1}>
            <Text wrap="truncate-end">{fitNames(list.map(p => p.name), room)}</Text>
            <Text wrap="truncate-end" dimColor>
              {summary(list, room)}
            </Text>
            <Box flexDirection="row" gap={1}>
              {step && (
                <Box flexShrink={1}>
                  <Text wrap="truncate-end">{step.warning ? `${step.label}${SEPARATOR}${step.warning}` : step.label}</Text>
                </Box>
              )}
              {step && <Button key="fill" label="Fill prompt" variant="primary" onPress={fill(step.request)} />}
              {link && <Link href={link}>Open in NoaCG</Link>}
              {hide}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
