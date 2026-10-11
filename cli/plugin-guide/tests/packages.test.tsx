// AC-3: a folder `noacg scaffold` wrote, in the working directory or one level below, is a
// package from the moment it exists; frames folders and node_modules are not; a package made
// during the session appears without a restart.
import { describe, expect, test } from 'claude-code/testing'

import { engineDraws, scaffolded, session, SURFACES, texts } from './world'

const names = async (ui: Parameters<typeof texts>[0]) => (await texts(ui))[1]

describe('finding packages', () => {
  for (const surface of SURFACES) {
    test(`packages here and one level below, and nothing else (${surface})`, async ($, on) => {
      const world = session($, on, {
        '.': { ...scaffolded('Here'), 'score-bug': null, ticker: null, deep: null, shots: null, node_modules: null },
        css: {},
        js: {},
        'score-bug': scaffolded('Score bug'),
        ticker: { 'ticker.ograf.json': JSON.stringify({ v_noacg: {} }), 'ticker.html': '' },
        deep: { inner: null },
        'deep/inner': scaffolded('Too deep'),
        shots: { '.noacg-frames': 'Screenshots written by the noacg CLI.', ...scaffolded('Frames') },
        node_modules: scaffolded('Dependency'),
      })
      await world.start()

      const ui = await world.mount(surface, 100)
      expect(await names(ui)).toBe('Here · Score bug · ticker')
      expect(world.lists).not.toContain('deep/inner')
      expect(world.lists).not.toContain('node_modules')
      expect(world.reads).not.toContain('shots/frames.ograf.json')
      expect(world.forbidden).toEqual([])
      await ui.unmount()
    })

    test(`a package made during the session appears, and one removed goes (${surface})`, async ($, on) => {
      const world = session($, on, { '.': { notes: null }, notes: { 'todo.md': '' } })
      await world.start()
      const ui = await world.mount(surface, 100)
      expect(await engineDraws(ui)).toBe(true)

      // The agent scaffolds one with a tool call.
      world.tree['.'] = { ...world.tree['.'], 'lower-third': null }
      world.tree['lower-third'] = scaffolded('Lower third')
      await world.tool('Bash')
      expect(await names(ui)).toBe('Lower third')

      // The person makes one outside the session, then sends a prompt.
      world.tree['.'] = { ...world.tree['.'], scoreboard: null }
      world.tree.scoreboard = scaffolded('Scoreboard')
      await world.submit()
      expect(await names(ui)).toBe('Lower third · Scoreboard')

      // Renamed in its manifest, then removed.
      world.tree.scoreboard = scaffolded('Final score')
      await world.tool('Bash')
      expect(await names(ui)).toBe('Final score · Lower third')
      world.tree['.'] = { notes: null, scoreboard: null }
      await world.tool('Bash')
      expect(await names(ui)).toBe('Final score')
      world.tree['.'] = { notes: null }
      await world.tool('Bash')
      expect(await engineDraws(ui)).toBe(true)
      await ui.unmount()
    })
  }

  test('a name is drawn as one line of plain text', async ($, on) => {
    const world = session($, on, { '.': { score: null }, score: scaffolded('Score\n\tbug\u001b]8;;x\u0007') })
    await world.start()
    const ui = await world.mount('terminal', 100)
    expect(await names(ui)).toBe('Score bug ]8;;x')
  })

  test('a manifest is read again only when it changes', async ($, on) => {
    const world = session($, on, { '.': { 'lower-third': null }, 'lower-third': scaffolded('Lower third') })
    await world.start()
    await world.tool('Bash')
    await world.submit()
    expect(world.reads).toEqual(['lower-third/lower-third.ograf.json'])
  })
})
