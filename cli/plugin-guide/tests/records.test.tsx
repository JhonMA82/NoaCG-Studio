// AC-6 to AC-9 in a session: a `noacg` run's report is recorded for its package, tied to a
// SHA-256 of the package's sources and assets; editing them afterwards shows "edited since
// check"; the records live in the mod's own store, per folder, and a new session shows the same
// states; the band summarises them, on the terminal and the Desktop surface.
import { describe, expect, test } from 'claude-code/testing'

import type { PackageRecord } from '../types'
import * as cli from './cli'
import { band, MCP_TOOL, ROOT, scaffoldedAt, session, SURFACES, texts, type Tree } from './world'

const KEY = `records:${ROOT}`

function twoPackages(): Tree {
  return {
    '.': { evening: null, scores: null, shots: null, 'notes.md': '' },
    ...scaffoldedAt('evening', 'Evening news'),
    ...scaffoldedAt('scores', 'Scores'),
    shots: {},
  }
}

const summaryOf = async (ui: Parameters<typeof texts>[0]) => (await texts(ui))[2]

function recordOf(store: Map<string, unknown>, dir: string): PackageRecord | undefined {
  const stored = store.get(KEY) as { packages: Record<string, PackageRecord> } | undefined
  return stored?.packages[dir]
}

describe('recorded results', () => {
  for (const surface of SURFACES) {
    test(`pass, fail and the summary (${surface})`, async ($, on) => {
      const world = session($, on, twoPackages())
      await world.start()
      const ui = await world.mount(surface, 120)
      expect(await texts(ui)).toEqual(['NoaCG', 'Evening news · Scores', '2 not checked'])

      await world.run('noacg validate evening', { output: cli.validate(`${ROOT}/evening`, true) })
      expect(await summaryOf(ui)).toBe('1 checked · 1 not checked')

      await world.run('npx -y @noacg/cli validate scores', { output: cli.validate(`${ROOT}/scores`, false), exit: 1 })
      expect(await summaryOf(ui)).toBe('1 checked · 1 not checked')
      expect(recordOf(world.store, 'scores')?.check?.ok).toBe(false)

      // A failure after a pass takes the pass back.
      await world.run('noacg validate evening', { output: cli.validate(`${ROOT}/evening`, false), exit: 1 })
      expect(await summaryOf(ui)).toBe('2 not checked')
      expect(world.forbidden).toEqual([])
      await ui.unmount()
    })

    test(`edited since check, and back (${surface})`, async ($, on) => {
      const world = session($, on, twoPackages())
      await world.start()
      await world.run('noacg validate evening --screenshots ./shots', { output: cli.validate(`${ROOT}/evening`, true, `${ROOT}/shots`) })
      const ui = await world.mount(surface, 120)
      expect(await summaryOf(ui)).toBe('1 checked · 1 not checked')

      // What validate rewrites, and frames inside the package, are not the package's sources.
      world.tree.evening = { ...world.tree.evening, 'README.md': '# regenerated', 'graphic.mjs': 'rebuilt', 'controlpanel.html': '<form>2</form>' }
      world.tree.evening = { ...world.tree.evening, frames: null }
      world.tree['evening/frames'] = { '.noacg-frames': 'Screenshots written by the noacg CLI.', 'onair.png': 'png' }
      await world.tool('Bash')
      expect(await summaryOf(ui)).toBe('1 checked · 1 not checked')

      // An edit to a source or an asset is.
      const css = world.tree['evening/css']?.['template.css']
      world.tree['evening/css'] = { 'template.css': '.box { color: blue }' }
      await world.tool('Bash')
      expect(await summaryOf(ui)).toBe('1 edited since check · 1 not checked')
      world.tree['evening/css'] = { 'template.css': css ?? '' }
      await world.submit()
      expect(await summaryOf(ui)).toBe('1 checked · 1 not checked')
      world.tree['evening/js'] = { ...world.tree['evening/js'], 'logo.svg': '<svg/>' }
      await world.submit()
      expect(await summaryOf(ui)).toBe('1 edited since check · 1 not checked')
      await ui.unmount()
    })

    test(`a screenshot alone, or a run that exited non-zero, is no check (${surface})`, async ($, on) => {
      const world = session($, on, twoPackages())
      await world.start()
      await world.run('noacg screenshot evening --out shots/take.png', { output: cli.screenshot(`${ROOT}/shots/take.png`) })
      await world.run('noacg validate scores --screenshots ./shots', { output: cli.shotsStopped(`${ROOT}/scores`, `${ROOT}/shots`), exit: 2 })
      const ui = await world.mount(surface, 120)
      expect(await summaryOf(ui)).toBe('2 not checked')
      expect(recordOf(world.store, 'evening')?.frames?.dir).toBe(`${ROOT}/shots`)
      expect(recordOf(world.store, 'evening')?.check).toBeUndefined()
      expect(recordOf(world.store, 'scores')?.check).toBeUndefined()
      await ui.unmount()
    })

    test(`the MCP tool's runs count the same (${surface})`, async ($, on) => {
      const world = session($, on, twoPackages())
      await world.start()
      await world.mcp({ command: 'validate', path: 'evening', screenshots: true }, { blocks: cli.mcpValidate(`${ROOT}/evening`, true, true) })
      await world.mcp({ command: 'validate', path: 'scores' }, { blocks: cli.mcpValidate(`${ROOT}/scores`, false), isError: true })
      const ui = await world.mount(surface, 120)
      expect(await summaryOf(ui)).toBe('1 checked · 1 not checked')
      const evening = recordOf(world.store, 'evening')
      expect(evening?.check?.via).toBe('mcp')
      expect(evening?.frames?.dir).toBe(null)

      await world.mcp({ command: 'save', path: 'evening' }, { blocks: cli.mcpSaved('Evening news', 'https://noacg.studio/#/graphic/6f1c2b') })
      expect(await summaryOf(ui)).toBe('1 checked · 1 not checked · saved: Evening news')
      await ui.unmount()
    })
  }

  test('a record carries the time, the way it ran and a SHA-256 of what it saw', async ($, on) => {
    const world = session($, on, twoPackages())
    await world.start()
    await world.run('noacg save evening --name "Evening news"', { output: cli.saved('Evening news', 'https://noacg.studio/#/graphic/6f1c2b') })
    await world.run('noacg pack evening scores --name Night --out night.noacgpack.json', { output: cli.packWritten(`${ROOT}/night.noacgpack.json`, 2) })
    const evening = recordOf(world.store, 'evening')
    expect(evening?.check).toMatchObject({ ok: true, via: 'terminal', at: Date.UTC(2026, 9, 11, 12) })
    expect(evening?.check?.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(evening?.saved).toMatchObject({ url: 'https://noacg.studio/#/graphic/6f1c2b' })
    expect(evening?.saved?.sha256).toBe(evening?.check?.sha256)
    expect(recordOf(world.store, 'scores')?.pack).toMatchObject({ name: 'Night', file: `${ROOT}/night.noacgpack.json` })
    // Two packages with different files never share a fingerprint.
    expect(recordOf(world.store, 'scores')?.pack?.sha256).not.toBe(evening?.check?.sha256)
  })

  test('the summary for one package, and saved names fitted to the width', async ($, on) => {
    const world = session($, on, { '.': { evening: null }, ...scaffoldedAt('evening', 'Evening news') })
    await world.start()
    const ui = await world.mount('terminal', 100)
    expect(await texts(ui)).toEqual(['NoaCG', 'Evening news', 'not checked'])
    await world.run('noacg save evening', { output: cli.saved('Evening news', 'https://noacg.studio/#/graphic/1') })
    expect(await summaryOf(ui)).toBe('checked · saved')

    world.tree['.'] = { ...world.tree['.'], scores: null, ticker: null }
    Object.assign(world.tree, scaffoldedAt('scores', 'Football scores'), scaffoldedAt('ticker', 'Ticker'))
    await world.run('noacg save scores', { output: cli.saved('Football scores', 'https://noacg.studio/#/graphic/2') })
    expect(await summaryOf(ui)).toBe('2 checked · 1 not checked · saved: Evening news, Football scores')
    // The title and its gap take 7 cells: 62 leave 55, 30 leave 23 and the Text cuts the rest.
    await ui.redraw(band(62))
    expect(await summaryOf(ui)).toBe('2 checked · 1 not checked · saved: Evening news +1 more')
    await ui.redraw(band(30))
    expect(await summaryOf(ui)).toBe('2 checked · 1 not checked · 2 saved')
  })

  test('a new session shows the same states, read from the store', async ($, on) => {
    const world = session($, on, twoPackages())
    await world.start()
    await world.run('noacg validate evening', { output: cli.validate(`${ROOT}/evening`, true) })
    const ui = await world.mount('terminal', 120)
    expect(await summaryOf(ui)).toBe('1 checked · 1 not checked')
    const kept = structuredClone(world.store.get(KEY))

    // Another machine, or the store wiped: nothing recorded.
    world.store.clear()
    await world.start()
    expect(await summaryOf(ui)).toBe('2 not checked')

    // The store as the last session left it: the same states, edits since included.
    world.store.set(KEY, kept)
    await world.start()
    expect(await summaryOf(ui)).toBe('1 checked · 1 not checked')
    world.tree['evening/js'] = { 'template.js': 'export const x = 1' }
    await world.start()
    expect(await summaryOf(ui)).toBe('1 edited since check · 1 not checked')
  })

  test('records stay out of packages and the repository: the store alone, one key per folder', async ($, on) => {
    on('fs.write', () => {
      throw new Error('the mod never writes a file')
    })
    const world = session($, on, twoPackages())
    await world.start()
    await world.run('noacg validate evening', { output: cli.validate(`${ROOT}/evening`, true) })
    await world.mcp({ command: 'save', path: 'scores' }, { blocks: cli.mcpSaved('Scores', 'https://noacg.studio/#/graphic/2') })
    expect([...world.store.keys()]).toEqual([KEY])
    expect(Object.keys((world.store.get(KEY) as { packages: object }).packages).sort()).toEqual(['evening', 'scores'])
    expect(world.forbidden).toEqual([])
  })

  test('the shell folder a cd left, and runs that name no package here', async ($, on) => {
    const world = session($, on, twoPackages())
    await world.start()
    world.cwd = `${ROOT}/evening`
    await world.run('noacg validate . 2>&1 | tail -20', { output: cli.passed().join('\n') })
    world.cwd = ROOT
    await world.run('noacg validate ../elsewhere', { output: cli.validate('/elsewhere', true) })
    await world.run('noacg validate evening.zip', { output: cli.passed().join('\n') })
    await world.run('noacg validate evening', { output: cli.validate(`${ROOT}/evening`, true) }, { tool: 'PowerShell' })
    await world.run('noacg validate scores', { output: '' })
    expect(Object.keys((world.store.get(KEY) as { packages: object }).packages)).toEqual(['evening'])
    expect(recordOf(world.store, 'evening')?.check?.ok).toBe(true)
  })

  test('a run in the background is not read', async ($, on) => {
    const world = session($, on, twoPackages())
    await world.start()
    await world.run('noacg validate evening', { output: cli.validate(`${ROOT}/evening`, true) }, { background: true })
    await world.submit()
    expect(world.store.get(KEY)).toBeUndefined()
    expect(world.storeCalls.every(call => call.startsWith('get '))).toBe(true)
  })

  test('the MCP tool under the name a user-added server gets', async ($, on) => {
    const world = session($, on, twoPackages())
    await world.start()
    await world.mcp({ command: 'validate', path: 'scores' }, { blocks: cli.mcpValidate(`${ROOT}/scores`, true) }, 'mcp__noacg__noacg')
    expect(recordOf(world.store, 'scores')?.check).toMatchObject({ ok: true, via: 'mcp' })
    expect(MCP_TOOL).not.toBe('mcp__noacg__noacg')
  })
})
