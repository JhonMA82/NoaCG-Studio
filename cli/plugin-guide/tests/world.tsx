// The engine beneath the mod, for its tests: a project folder in memory at ROOT that `$.fs.list`
// and `$.fs.read` answer and a test can change while it runs, the mod's store, the band the
// engine draws when the mod passes, the surfaces the session draws on and the panes they place,
// the session's events as a session raises them, `noacg` runs with the output the published CLI
// 0.10.1 prints, and a record of every call a quiet mod never makes.
import type { CommandRunResult, Elements, FsEntry, On, RenderPropsOf, RenderSurface } from 'claude-code'
import type { Engine, Mounted, Plugin } from 'claude-code/testing'
import { mock } from 'claude-code/testing'

/** Each key a folder relative to the project root (`.` itself): a string a file, null a folder. */
export type Tree = Record<string, Record<string, string | null>>

export const SURFACES = ['terminal', 'desktop'] as const

/** The session's project root, as `$.session.root()` answers it. */
export const ROOT = '/work'

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

/** A whole package at `dir`: the folder `scaffolded` describes and its two source folders. */
export function scaffoldedAt(dir: string, name: string): Tree {
  return {
    [dir]: { ...scaffolded(name), 'README.md': `# ${name}`, 'controlpanel.html': '<form></form>' },
    [`${dir}/css`]: { 'template.css': '.box { color: red }' },
    [`${dir}/js`]: { 'template.js': 'export {}' },
  }
}

/** The band's props as the engine hands them, `bodyColumns` cells wide. */
export function band(bodyColumns: number, hasSurvey = false): RenderPropsOf['AbovePrompt'] {
  return { hasSurvey, isWorking: false, maxRows: 8, bodyColumns, scroll: { offset: 0, bodyRows: 7 }, view: {} }
}

/** The pane's props as the engine hands them, docked `bodyColumns` cells wide. */
export function paneProps(bodyColumns: number): RenderPropsOf['Pane'] {
  return { title: 'NoaCG', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
}

/** The band's texts as drawn: the title, the names, then where they stand. */
export async function texts(ui: { findAll: (q: { type: string }) => Promise<{ text: string }[]> }): Promise<string[]> {
  return (await ui.findAll({ type: 'Text' })).map(found => found.text)
}

/** The key of what the engine draws in the band when no plugin draws there. */
const ENGINE = 'engine-band'

/** Whether the band shows the engine's own drawing: the mod passed. */
export async function engineDraws(ui: { find: (q: { key: string }) => Promise<unknown> }): Promise<boolean> {
  return (await ui.find({ key: ENGINE })) !== undefined
}

/** A run's end as the session saw it: what it printed and how it exited. */
export type Ending = { output: string; exit?: number }

/**
 * A run in the background: `asked` with `run_in_background`; `moved` there by its timeout while
 * it ran, as a real one was (a task ID and `timedOutAfterMs`, nothing else set), here with the
 * output it had printed kept in the result.
 */
export type Background = 'asked' | 'moved'

/** An MCP answer: its content blocks, images as `{ image: true }`, and whether the server called it an error. */
export type McpAnswer = { blocks: (string | { image: true })[]; isError?: boolean }

export type Session = {
  /** The folders and files, changeable while the test runs. */
  tree: Tree
  /** The mod's store, by key. */
  store: Map<string, unknown>
  /** The folder the shell is in, absolute; ROOT unless a test moves it. */
  cwd: string
  /** Every path listed and read, relative to the project root. */
  lists: string[]
  reads: string[]
  /** Every store call, as `get key` or `set key`. */
  storeCalls: string[]
  /** How many store writes to refuse, as a locked file would. */
  storeFails: number
  /** Called as the store is read: work landing while a scan is under way. */
  onStoreRead?: () => void
  /** Every call made that a quiet mod never makes, by event. */
  forbidden: string[]
  /** What the prompts carried down to the engine beside their text. */
  context: string[]
  /** The slash commands the mod declared. */
  commands: string[]
  /** Where the session draws (`$.session.surfaces()`): the terminal unless a test says. */
  surfaces: RenderSurface[]
  /** How an open goes: placed; waiting undrawn, as on a surface that places none; refused by a hook. */
  opens: 'placed' | 'waits' | 'refused'
  /** Whether an open pane is the one shown, or a tab behind another plugin's pane. */
  paneShown: boolean
  /** Every pane the mod asked to open, as it asked, and the ids open now. */
  opened: Record<string, unknown>[]
  panes: string[]
  /** What the mod put in the prompt box, and what it showed as toasts. */
  fills: string[]
  toasts: string[]
  /** How the prompt box answers a fill: taken, or refused for a reason (`no_composer` where none is bound). */
  box: 'takes' | 'no_composer' | 'dialog'
  /** What the prompt box holds: the person's draft and what fills put there. */
  draft: string
  /** The rows the mod appended to the conversation. */
  appended: () => number
  start: () => Promise<void>
  submit: (text?: string) => Promise<void>
  /** A tool call: Bash writes, Read only reads. */
  tool: (name: 'Bash' | 'Read') => Promise<void>
  /** A shell command, by Bash or PowerShell, ending as given; `background` a run in the background. */
  run: (command: string, ending: Ending, options?: { tool?: 'Bash' | 'PowerShell'; background?: Background }) => Promise<void>
  /** A call of the `noacg` MCP tool, answered as given; `tool` its name, the plugin server's by default. */
  mcp: (args: Record<string, unknown>, answer: McpAnswer, tool?: `mcp__${string}__noacg`) => Promise<void>
  /** `/noacg-guide`, typed by the person; what the command answered. */
  command: () => Promise<CommandRunResult>
  /** The pane closes: `/noacg-guide` again. */
  closePane: () => Promise<void>
  /** The person closes the pane (Esc, its close mark); the test loads `ESCAPE`. */
  escape: () => Promise<void>
  /** The band, drawn through the mod on a surface, `columns` cells wide. */
  mount: (surface: Surface, columns: number, hasSurvey?: boolean) => Promise<Mounted<Surface, 'AbovePrompt'>>
  /** The package pane, drawn through the mod on a surface, `columns` cells wide. */
  mountPane: (surface: Surface, columns: number) => Promise<Mounted<Surface, 'Pane'>>
}

type Surface = (typeof SURFACES)[number]

/** The package pane's id, as the mod opens it. */
const PANE = 'noacg-guide'

/**
 * Stands in for the person's Esc on the pane, loaded with `test(name, { plugins: [ESCAPE] }, ...)`:
 * a `ui.close` of the pane through every plugin's hook, and nothing else run or written. The kit's
 * `$` has no `ui.close`, and the test's own hooks may make no call, so an inline plugin makes it.
 */
export const ESCAPE: Plugin = {
  name: 'escape',
  register: on => {
    on('command.run', { command: 'escape' }, async $ => {
      // A literal: an inline plugin runs in an environment of its own and sees no module value.
      await $.ui.close({ id: 'noacg-guide' })
      return {}
    })
  },
}

/** The tool name a plugin-installed `noacg` MCP server gets. */
export const MCP_TOOL = 'mcp__plugin_noacg-mcp_noacg__noacg'

export function session($: Engine, on: On, tree: Tree): Session {
  const lists: string[] = []
  const reads: string[] = []
  const storeCalls: string[] = []
  const forbidden: string[] = []
  const context: string[] = []
  const commands: string[] = []
  const fills: string[] = []
  const toasts: string[] = []
  const opened: Record<string, unknown>[] = []
  const panes: string[] = []
  const store = new Map<string, unknown>()
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 11, 12) })
  let appended = 0
  let ending: Ending & { background?: Background } = { output: '' }
  let answer: McpAnswer = { blocks: [] }

  // The engine hands the hooks absolute paths, on Windows with a drive letter; a path outside
  // the root is recorded as forbidden.
  const relative = (path: string) => {
    const clean = path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/$/, '')
    if (clean === ROOT) return '.'
    if (!clean.startsWith(`${ROOT}/`)) {
      forbidden.push(`outside the project root: ${path}`)
      throw new Error(`outside the project root: ${path}`)
    }
    return clean.slice(ROOT.length + 1)
  }

  on('session.root', () => ({ value: ROOT }))
  on('session.cwd', () => ({ value: world.cwd }))
  on('fs.list', ($, e) => {
    const path = relative(e.path)
    lists.push(path)
    const folder = world.tree[path]
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
    const text = world.tree[cut < 0 ? '.' : path.slice(0, cut)]?.[path.slice(cut + 1)]
    if (typeof text !== 'string') throw new Error(`ENOENT: ${path}`)
    return { value: e.as === 'bytes' ? { base64: base64(text) } : text }
  })
  on('store.get', ($, e) => {
    storeCalls.push(`get ${e.key}`)
    const value = structuredClone(store.get(e.key))
    world.onStoreRead?.()
    return { value }
  })
  on('store.set', ($, e) => {
    storeCalls.push(`set ${e.key}`)
    if (world.storeFails > 0) {
      world.storeFails -= 1
      throw new Error('EBUSY: the store file is locked')
    }
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined }
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
  on('tool.call', ($, e) => {
    if (e.tool === 'Read') {
      return { result: { type: 'text', file: { filePath: 'a.txt', content: '', numLines: 0, startLine: 1, totalLines: 0 } }, isReadOnly: true }
    }
    if (e.tool === 'Bash' || e.tool === 'PowerShell') {
      // As a session reports a shell command: stdout and the model's text, or "Exit code N" as an error.
      if (ending.exit) {
        const text = `Exit code ${ending.exit}\n${ending.output}`
        return { isError: true, result: text, text }
      }
      return { result: shellResult(e.tool, ending.output, ending.background), text: ending.output }
    }
    // The MCP tool: its content blocks as the result, the text blocks joined as the model's text.
    const content = answer.blocks.map(b => (typeof b === 'string' ? { type: 'text', text: b } : { type: 'image', data: 'iVBORw0K', mimeType: 'image/png' }))
    const text = answer.blocks.filter((b): b is string => typeof b === 'string').join('\n')
    return answer.isError ? { isError: true, result: content, text } : { result: content, text }
  })
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
  on('command.register', ($, e) => {
    commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('prompt.read', () => ({ value: { text: world.box === 'takes' ? world.draft : '', cursor: world.draft.length } }))
  on('prompt.fill', ($, e) => {
    if (e.origin.kind !== 'plugin') forbidden.push(`prompt.fill from ${e.origin.kind}`)
    if (world.box !== 'takes') return { isFilled: false, refusal: world.box }
    fills.push(e.text)
    world.draft = e.mode === 'replace' ? e.text : world.draft + e.text
    return { isFilled: true }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('session.surfaces', () => ({ value: world.surfaces }))
  on('ui.open', ($, e) => {
    opened.push({ ...e })
    if (world.opens === 'refused') return { deny: 'another plugin keeps panes closed' }
    if (!panes.includes(e.id)) panes.push(e.id)
    if (world.opens === 'placed') return { value: { isPlaced: true } }
    return { value: { isPlaced: false, reason: 'the attached surfaces place no panes' } }
  })
  on('ui.panes', () => ({
    value: panes.map(id => ({ id, title: 'NoaCG', isShown: world.paneShown, isFocused: false, isPlaced: world.opens === 'placed' })),
  }))
  on('ui.close', ($, e) => {
    if (panes.includes(e.id)) panes.splice(panes.indexOf(e.id), 1)
    return { value: undefined }
  })
  on('ui.status', () => refuse('ui.status'))
  on('ui.log', () => refuse('ui.log'))

  const paneOpen = () => {
    if (!panes.includes(PANE)) throw new Error('the pane is not open')
  }

  /** A slash command the person typed, settled. */
  const typed = async (command: string) => {
    const answered = await $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 140 } })
    await clock.settle()
    return answered
  }

  const world: Session = {
    tree,
    store,
    cwd: ROOT,
    lists,
    reads,
    storeCalls,
    storeFails: 0,
    forbidden,
    context,
    commands,
    surfaces: ['terminal'],
    opens: 'placed',
    paneShown: true,
    opened,
    panes,
    fills,
    toasts,
    box: 'takes',
    draft: '',
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
      ending = { output: '' }
      if (name === 'Read') await $.tool.call({ tool: 'Read', file_path: 'a.txt' })
      else await $.tool.call({ tool: 'Bash', command: 'npx @noacg/cli scaffold --type lower-third --out new' })
      await clock.settle()
    },
    run: async (command, end, { tool = 'Bash', background } = {}) => {
      ending = { ...end, background }
      await $.tool.call({ tool, command, ...(background === 'asked' ? { run_in_background: true } : {}) })
      await clock.settle()
    },
    mcp: async (args, given, tool = MCP_TOOL) => {
      answer = given
      await $.tool.call({ tool, ...args })
      await clock.settle()
    },
    command: () => typed('noacg-guide'),
    closePane: async () => {
      paneOpen()
      await world.command()
    },
    escape: async () => {
      paneOpen()
      await typed('escape')
    },
    mount: (surface, columns, hasSurvey = false) =>
      $.ui.mount({ plugin: 'noacg-guide', surface, component: 'AbovePrompt', props: band(columns, hasSurvey) }),
    mountPane: (surface, columns) =>
      $.ui.mount({ plugin: 'noacg-guide', surface, component: 'Pane', requestId: PANE, props: paneProps(columns) }),
  }
  return world
}

/**
 * A shell run's result as the engine hands it to a `tool.call` hook. Every optional key of the
 * tool's record is present, undefined where it does not apply: Bash's twenty keys as a hook saw
 * them on 2.1.287 and 2.1.295 through `claude -p`; PowerShell's as declared (none seen).
 * So `'backgroundTaskId' in result` holds for every run; only a run in the background names its
 * task.
 */
function shellResult(tool: 'Bash' | 'PowerShell', stdout: string, background: Background | undefined): Record<string, unknown> {
  const unset = (keys: string[]) => Object.fromEntries(keys.map(key => [key, undefined]))
  const both = {
    stdout,
    stderr: '',
    interrupted: false,
    ...unset(['returnCodeInterpretation', 'isImage', 'persistedOutputPath', 'persistedOutputSize', 'gitOperation']),
    ...unset(['backgroundedByUser', 'backgroundedByTurnAbort', 'backgroundedToDeliverMessage', 'backgroundEndsWithFinalResponse']),
    backgroundTaskId: background ? 'b7k2m9x4q' : undefined,
    timedOutAfterMs: background === 'moved' ? 1500 : undefined,
  }
  if (tool === 'PowerShell') return both
  return {
    ...both,
    isImage: false,
    noOutputExpected: false,
    ...unset(['backgroundCwdHint', 'dangerouslyDisableSandbox', 'staleReadFileStateHint', 'ghRateLimitHint', 'bashEditDiff']),
  }
}

/** A file's time, standing in for its last write: it changes whenever the text does. */
function stamp(text: string): number {
  let hash = 7
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000_007
  return hash
}

function base64(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}
