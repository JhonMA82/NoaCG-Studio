// noacg-guide: a trial mod that shows the NoaCG packages a session works on, where each stands
// and what to ask for next, above the prompt, and every package in a pane on `/noacg-guide`.
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
import { fitNames, STATUS, summary } from './band'
import { factsMarkdown, factsOf, textAnswer } from './pane'
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
const pane = atom({ plugin: 'noacg-guide', key: 'pane' } as const, false)

/** How long a request shown as a toast stays, where the prompt box could not take it. */
const TOAST_MS = 12_000

const TITLE = 'NoaCG'
/** Cells between the title and the names. */
const GAP = 2
/** The package pane's id. */
const PANE = 'noacg-guide'

/** Whether a pane `$.ui.panes()` lists is this mod's, drawn and in front. */
const onScreen = (open: { id: string; isShown: boolean; isPlaced: boolean }) => open.id === PANE && open.isShown && open.isPlaced

/** The prompt box as one dispatch reaches it: `$` cannot be passed on, so closures over it. */
type PromptBox = {
  read: () => Promise<string>
  fill: (text: string, mode: 'replace' | 'append') => Promise<boolean>
  toast: (text: string) => void
}

/**
 * A Fill button's press: the request goes into the prompt box for the person to send, on a line
 * after a draft they typed, never over it, and not twice; where no box takes it, a toast.
 */
const filler = (box: PromptBox) => (text: string) => async () => {
  const draft = await box.read()
  if (draft.includes(text)) return
  const filled = await (draft.trim() ? box.fill(`\n${text}`, 'append') : box.fill(text, 'replace')).catch(() => false)
  if (!filled) box.toast(text)
}

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

  // Opens the package pane, or closes it when open; brings a hidden band back, and with no
  // package here offers to start one. Where no surface draws a pane (`claude -p`, the VS Code
  // panel), it answers with the same list as text, which the engine also hands the model.
  on('command.run', { command: 'noacg-guide' }, async $ => {
    // A scan under way (the session's start) settles first, so a package is not missed.
    await scanning
    const list = await read($, packages)
    await update($, hidden, () => false)
    await update($, offer, () => list.length === 0)

    // The engine's record, not the module's: it outlives a reload. A pane open as a tab behind
    // another is opened again, which brings it forward, rather than closed.
    if ((await $.ui.panes()).some(onScreen)) {
      await $.ui.close({ id: PANE })
      return {}
    }
    const surfaces = await $.session.surfaces()
    if (surfaces.includes('terminal') || surfaces.includes('desktop')) {
      // Asked by the person, a pane is placed at any width; one that waits undrawn is on a
      // surface that places none, so it goes and the text answers instead, as it does when
      // another plugin refuses the open.
      const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true }).catch(() => null)
      if (opened?.isPlaced) {
        await update($, pane, () => true)
        return {}
      }
      if (opened) await $.ui.close({ id: PANE })
    }
    const [root, now] = await Promise.all([$.session.root(), $.clock.now()])
    return { text: textAnswer(list, normalize(root), now) }
  })

  // However the pane closes (Esc, its close mark, the command), the band comes back.
  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) await update($, pane, () => false).catch(() => undefined)
    return closed
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
    const [isHidden, list, offered, isPaneOpen] = await Promise.all([read($, hidden), read($, packages), read($, offer), read($, pane)])
    if (isHidden || (list.length === 0 && !offered)) return next(e)
    // The pane says all the band would while it is on screen. `pane` redraws the band when it
    // opens and closes; the engine's record decides, since a pane can go without a close this
    // module hears (an unload), or (seen at the band's next redraw) sit behind another tab.
    if (isPaneOpen && (await $.ui.panes().catch(() => [])).some(onScreen)) return next(e)

    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const fill = filler({
      read: async () => (await $.prompt.read()).text,
      fill: async (text, mode) => (await $.prompt.fill({ text, mode })).isFilled,
      toast: text => $.ui.toast(text, { timeoutMs: TOAST_MS }),
    })
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
                  <Text wrap="truncate-end">{step.label}</Text>
                </Box>
              )}
              {step && <Button key="fill" label="Fill prompt" variant="primary" onPress={fill(step.request)} />}
              {link && <Link href={link}>Open in NoaCG</Link>}
              {hide}
            </Box>
            {/* A line of its own: beside the buttons it was cut at ordinary widths. */}
            {step?.warning && (
              <Text wrap="truncate-end" color="warning">
                {step.warning}
              </Text>
            )}
          </Box>
        )}
      </Box>
    )
  })

  // The package pane: every package with its state, when each record was made, its frames
  // folder and pack file, its saved or sent link, and its next step with a Fill button. It
  // reads the same state as the band, so it follows every scan.
  on('ui.render', { component: 'Pane', requestId: 'noacg-guide' }, async ($, e) => {
    const [list, root, now] = await Promise.all([read($, packages), $.session.root().then(normalize), $.clock.now()])
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const fill = filler({
      read: async () => (await $.prompt.read()).text,
      fill: async (text, mode) => (await $.prompt.fill({ text, mode })).isFilled,
      toast: text => $.ui.toast(text, { timeoutMs: TOAST_MS }),
    })
    if (list.length === 0) {
      return (
        <Box flexDirection="column">
          <Button key="start" label="Start a package" variant="primary" onPress={fill(START)} />
        </Box>
      )
    }
    const first = firstStep(list)
    return (
      <Box flexDirection="column" gap={1}>
        {list.map(p => {
          const facts = factsOf(p.record)
          return (
            <Box key={`package:${p.dir}`} flexDirection="column">
              <Box flexDirection="row" gap={2}>
                <Box flexShrink={1}>
                  <Text bold wrap="truncate-end">
                    {p.name}
                  </Text>
                </Box>
                <Text dimColor>{STATUS[p.status]}</Text>
              </Box>
              {facts.length > 0 && <Markdown text={factsMarkdown(facts, root, now)} dimColor />}
              {p.next && (
                <Box flexDirection="row" gap={1}>
                  <Box flexShrink={1}>
                    <Text>{p.next.label}</Text>
                  </Box>
                  <Button key={`fill:${p.dir}`} label="Fill" {...(p === first ? { variant: 'primary' as const } : {})} onPress={fill(p.next.request)} />
                </Box>
              )}
              {p.next?.warning && <Text color="warning">{p.next.warning}</Text>}
            </Box>
          )
        })}
      </Box>
    )
  })
}
