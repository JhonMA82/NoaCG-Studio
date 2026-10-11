// AC-2: where there is no NoaCG package and no noacg activity, the mod draws nothing, adds
// nothing to the model's context and registers nothing, and makes no network request, process
// run or model call, on the terminal and the Desktop surface alike.
import { describe, expect, test } from 'claude-code/testing'

import { band, engineDraws, scaffolded, session, SURFACES } from './world'

/** A folder with no package in it, and the near misses that must not count as one. */
const NO_PACKAGE = {
  '.': { 'README.md': '# notes', src: null, node_modules: null, shots: null, '.cache': null, 'plain-ograf': null },
  src: { 'index.ts': '' },
  node_modules: { lib: null },
  shots: { '.noacg-frames': 'Screenshots written by the noacg CLI.', ...scaffolded('Frames') },
  '.cache': scaffolded('Hidden'),
  'plain-ograf': scaffolded('Plain OGraf', { v_noacg: undefined }),
}

describe('quiet outside graphics work', () => {
  for (const surface of SURFACES) {
    test(`an empty folder draws nothing and adds nothing (${surface})`, async ($, on) => {
      const world = session($, on, { '.': {} })
      await world.start()
      await world.submit('fix the failing test')
      await world.tool('Bash')
      await world.tool('Read')
      await world.submit('thanks')

      const ui = await $.ui.mount({ plugin: 'noacg-guide', surface, component: 'AbovePrompt', props: band(100) })
      expect(await engineDraws(ui)).toBe(true)
      expect(world.context).toEqual([])
      expect(world.appended()).toBe(0)
      expect(world.forbidden).toEqual([])
      expect(world.reads).toEqual([])
      await ui.unmount()
    })

    test(`near misses are not packages (${surface})`, async ($, on) => {
      const world = session($, on, NO_PACKAGE)
      await world.start()
      await world.submit()
      await world.tool('Bash')

      const ui = await $.ui.mount({ plugin: 'noacg-guide', surface, component: 'AbovePrompt', props: band(100) })
      expect(await engineDraws(ui)).toBe(true)
      expect(world.lists).not.toContain('node_modules')
      expect(world.lists).not.toContain('.cache')
      expect(world.context).toEqual([])
      expect(world.appended()).toBe(0)
      expect(world.forbidden).toEqual([])
      await ui.unmount()
    })
  }

  test('the system prompt is left as the engine composed it, packages or not', async ($, on) => {
    const sections = [{ id: 'engine', text: 'The engine own section.', scope: 'shared' as const }]
    on('prompt.compose', () => ({ sections }))
    const world = session($, on, { '.': { 'lower-third': null }, 'lower-third': scaffolded('Lower third') })
    await world.start()
    const composed = await $.prompt.compose({
      model: 'claude-opus-4-1',
      promptModel: 'claude-opus-4-1',
      surfaces: ['terminal'],
      tools: ['Bash'],
      outputStyle: null,
      traits: [],
    })
    expect(composed).toEqual({ sections })
  })

  test('a tool call that only reads starts no scan', async ($, on) => {
    const world = session($, on, { '.': {} })
    await world.start()
    const before = world.lists.length
    await world.tool('Read')
    expect(world.lists.length).toBe(before)
    await world.tool('Bash')
    expect(world.lists.length).toBeGreaterThan(before)
  })
})
