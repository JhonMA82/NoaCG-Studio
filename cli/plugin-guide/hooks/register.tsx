// noacg-guide: a trial mod that shows the NoaCG packages a session works on, above the prompt.
//
// Quiet outside graphics work (docs/work-specs/guided-mod/spec.md, AC-2): with no package in the
// working directory it draws nothing, adds nothing to the model's context and registers no tool
// or command. It never submits prompts, calls tools, runs processes, fetches or calls a model.
// The only work it does is listing folders: at session start, when a prompt is submitted and
// after a tool call that may have written files.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { NoacgPackage } from '../types'
import { fitNames } from './band'
import { findPackages, samePackages, type Folders } from './packages'

const packages = atom({ plugin: 'noacg-guide', key: 'packages' } as const, [] as NoacgPackage[])

const TITLE = 'NoaCG'
/** Cells between the title and the names. */
const GAP = 2

type Scan = Folders & {
  known: () => Promise<NoacgPackage[]>
  keep: (found: NoacgPackage[]) => Promise<unknown>
}

/** One scan at a time; a trigger during a scan asks for one more pass, with the newest access. */
let scanning: Promise<void> | undefined
let latest: Scan | undefined

function rescan(scan: Scan): Promise<void> {
  latest = scan
  scanning ??= (async () => {
    while (latest) {
      const now = latest
      latest = undefined
      const found = await findPackages(now)
      if (!samePackages(await now.known(), found)) await now.keep(found)
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      scanning = undefined
    })
  return scanning
}

export const register: Register = on => {
  on('session.start', ($, e, next) => {
    void rescan({
      list: dir => $.fs.list(dir),
      read: file => $.fs.read(file),
      known: () => read($, packages),
      keep: found => update($, packages, () => found),
    })
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    void rescan({
      list: dir => $.fs.list(dir),
      read: file => $.fs.read(file),
      known: () => read($, packages),
      keep: found => update($, packages, () => found),
    })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isReadOnly !== true) {
      void rescan({
        list: dir => $.fs.list(dir),
        read: file => $.fs.read(file),
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
        <Text wrap="truncate-end">{names}</Text>
      </Box>
    )
  })
}
