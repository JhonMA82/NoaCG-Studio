// The engine beneath the mod, for its tests: a working directory in memory that `$.fs.list` and
// `$.fs.read` answer and a test can change while it runs, the band the engine draws when the mod
// passes, the session's events as a session raises them, and a record of every call a quiet mod
// never makes.
import type { Elements, FsEntry, On, RenderPropsOf } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { mock } from 'claude-code/testing'

/** Each key a folder relative to the working directory (`.` itself): a string a file, null a folder. */
export type Tree = Record<string, Record<string, string | null>>

export const SURFACES = ['terminal', 'desktop'] as const

/** What `noacg scaffold` writes: a manifest with the `v_noacg` block, and the sources. */
export function scaffolded(name: string, manifest: object = { v_noacg: { type: 'lower-third' } }): Record<string, string | null> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return {
    [`${slug}.ograf.json`]: JSON.stringify({ name, main: 'graphic.mjs', ...manifest }),
    [`${slug}.html`]: '<div></div>',
    'graphic.mjs': '',
    css: null,
    js: null,
  }
}

/** The band's props as the engine hands them, `bodyColumns` cells wide. */
export function band(bodyColumns: number, hasSurvey = false): RenderPropsOf['AbovePrompt'] {
  return { hasSurvey, isWorking: false, maxRows: 8, bodyColumns, scroll: { offset: 0, bodyRows: 7 }, view: {} }
}

/** The band's texts as drawn: the title, then the names. */
export async function texts(ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }): Promise<string[]> {
  return (await ui.findAll({ type: 'Text' })).map(found => found.text)
}

/** The key of what the engine draws in the band when no plugin draws there. */
const ENGINE = 'engine-band'

/** Whether the band shows the engine's own drawing: the mod passed. */
export async function engineDraws(ui: { find: (q: { key: string }) => Promise<unknown> }): Promise<boolean> {
  return (await ui.find({ key: ENGINE })) !== undefined
}

export type Session = {
  /** The folders and files, changeable while the test runs. */
  tree: Tree
  /** Every path listed and read, relative to the working directory. */
  lists: string[]
  reads: string[]
  /** Every call made that a quiet mod never makes, by event. */
  forbidden: string[]
  /** What the prompts carried down to the engine beside their text. */
  context: string[]
  /** The rows the mod appended to the conversation. */
  appended: () => number
  start: () => Promise<void>
  submit: (text?: string) => Promise<void>
  /** A tool call: Bash writes, Read only reads. */
  tool: (name: 'Bash' | 'Read') => Promise<void>
  /** Lets the work the mod left running finish. */
  settle: () => Promise<void>
}

export function session($: Engine, on: On, tree: Tree): Session {
  const lists: string[] = []
  const reads: string[] = []
  const forbidden: string[] = []
  const context: string[] = []
  const clock = mock.clock(on)
  let appended = 0

  // The engine hands the hooks absolute paths. The mod's first call of every scan lists the
  // working directory, so that first path is the root the tree's keys are relative to.
  let root: string | undefined
  const relative = (path: string) => {
    const clean = path.replace(/\\/g, '/').replace(/\/$/, '')
    root ??= clean
    if (clean === root) return '.'
    if (!clean.startsWith(`${root}/`)) throw new Error(`outside the working directory: ${path}`)
    return clean.slice(root.length + 1)
  }

  on('fs.list', ($, e) => {
    const path = relative(e.path)
    lists.push(path)
    const folder = tree[path]
    if (!folder) throw new Error(`ENOENT: ${path}`)
    const value = Object.entries(folder).map(
      ([name, text]): FsEntry => ({
        name,
        kind: text === null ? 'dir' : 'file',
        size: text?.length ?? 0,
        mtimeMs: text === null ? 0 : stamp(text),
        isLink: false,
      }),
    )
    return { value }
  })
  on('fs.read', ($, e) => {
    const path = relative(e.path)
    reads.push(path)
    const cut = path.lastIndexOf('/')
    const text = tree[cut < 0 ? '.' : path.slice(0, cut)]?.[path.slice(cut + 1)]
    if (typeof text !== 'string') throw new Error(`ENOENT: ${path}`)
    return { value: text }
  })

  on('session.append', ($, e, next) => {
    if (e.origin.kind === 'plugin') appended += 1
    return next(e)
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => {
    if (e.origin.kind !== 'composer') forbidden.push(`prompt.submit from ${e.origin.kind}`)
    context.push(...(e.context ?? []))
    return { text: e.text, context: e.context, origin: e.origin }
  })
  on('tool.call', ($, e) =>
    e.tool === 'Read'
      ? { result: { type: 'text', file: { filePath: 'a.txt', content: '', numLines: 0, startLine: 1, totalLines: 0 } }, isReadOnly: true }
      : { result: { stdout: '', stderr: '', interrupted: false } },
  )
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e) as Elements['terminal']
    return <Box key={ENGINE} />
  })

  const refuse = (event: string) => {
    forbidden.push(event)
    throw new Error(`${event}: a quiet mod never makes this call`)
  }
  on('process.run', () => refuse('process.run'))
  on('process.spawn', async function* () {
    refuse('process.spawn')
  })
  on('http.fetch', () => refuse('http.fetch'))
  on('model.complete', () => refuse('model.complete'))
  on('model.fork', () => refuse('model.fork'))
  on('agent.spawn', () => refuse('agent.spawn'))
  on('agent.register', () => refuse('agent.register'))
  on('mcp.call', () => refuse('mcp.call'))
  on('tool.register', () => refuse('tool.register'))
  on('command.register', () => refuse('command.register'))
  on('ui.open', () => refuse('ui.open'))
  on('ui.toast', () => refuse('ui.toast'))
  on('ui.status', () => refuse('ui.status'))
  on('ui.log', () => refuse('ui.log'))

  return {
    tree,
    lists,
    reads,
    forbidden,
    context,
    appended: () => appended,
    start: async () => {
      await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true })
      await clock.settle()
    },
    submit: async (text = 'make a lower third') => {
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
      await clock.settle()
    },
    tool: async name => {
      if (name === 'Read') await $.tool.call({ tool: 'Read', file_path: 'a.txt' })
      else await $.tool.call({ tool: 'Bash', command: 'npx @noacg/cli scaffold --type lower-third --out new' })
      await clock.settle()
    },
    settle: () => clock.settle(),
  }
}

/** A file's time, standing in for its last write: it changes whenever the text does. */
function stamp(text: string): number {
  let hash = 7
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000_007
  return hash
}
