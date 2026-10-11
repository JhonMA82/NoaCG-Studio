// AC-14 and AC-15: `/noacg-guide` opens a pane listing every package with its state, the time of
// each record, the frames folder as a link, the saved or sent link and its next step with a Fill
// button; it follows the records and closes with Esc or the command. Where nothing draws a pane,
// the command answers with the same list as text. On the terminal and the Desktop surface alike.
import { describe, expect, test } from 'claude-code/testing'

import { factsMarkdown, fileUrl, shown, textAnswer, when } from '../hooks/pane'
import { START } from '../hooks/steps'
import * as cli from './cli'
import { engineDraws, ESCAPE, ROOT, scaffoldedAt, session, SURFACES, texts, type Tree } from './world'

const SAVED = 'https://noacg.studio/#/graphic/6f1c2b'
const SECOND = 'saving again adds a second library copy'
/** The test clock's now: 2026-10-11 12:00 UTC. */
const NOW = Date.UTC(2026, 9, 11, 12)

/** A time as the person's clock reads it, worked out apart from the mod's `when`. */
const hhmm = (at: number) => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function twoPackages(): Tree {
  return {
    '.': { evening: null, scores: null, shots: null },
    ...scaffoldedAt('evening', 'Evening news'),
    ...scaffoldedAt('scores', 'Scores'),
    shots: {},
  }
}

describe('the package pane', () => {
  for (const surface of SURFACES) {
    test(`lists every package, follows the records and closes with the command (${surface})`, async ($, on) => {
      const world = session($, on, twoPackages())
      world.surfaces = [surface]
      await world.start()
      await world.run('noacg validate evening --screenshots ./shots', { output: cli.validate(`${ROOT}/evening`, true, `${ROOT}/shots`) })
      await world.run('noacg save evening', { output: cli.saved('Evening news', SAVED) })
      const band = await world.mount(surface, 120)

      // Opened as the person asked: with the keys, and Esc closes it. The command says nothing
      // to the conversation, and the band steps aside while the pane says all it would.
      const answer = await world.command()
      expect(answer.text).toBeUndefined()
      expect(world.opened).toEqual([{ id: 'noacg-guide', title: 'NoaCG', focus: true, closeOnEscape: true }])
      expect(await engineDraws(band)).toBe(true)

      const pane = await world.mountPane(surface, 40)
      const at = hhmm(NOW)
      expect(await texts(pane)).toEqual(['Evening news', 'checked', 'Scores', 'not checked', 'Check Scores'])
      expect((await pane.findAll({ type: 'Markdown' })).map(found => found.props.text)).toEqual([
        `Checked ${at} · Frames ${at} [shots/](file:///work/shots) · Saved ${at} [Open in NoaCG](${SAVED})`,
      ])
      expect((await pane.findAll({ type: 'Button' })).map(found => found.key)).toEqual(['fill:scores'])
      await pane.press({ key: 'fill:scores' })
      expect(world.fills).toEqual(['Check Scores.'])

      // It follows the records: a check, then an edit after the save.
      await world.run('noacg validate scores', { output: cli.validate(`${ROOT}/scores`, true) })
      world.tree['evening/css'] = { 'template.css': '.box { color: blue }' }
      await world.submit()
      expect(await texts(pane)).toEqual([
        'Evening news',
        'edited since check',
        'Check Evening news again',
        SECOND,
        'Scores',
        'checked',
        'See how Scores looks',
      ])
      expect((await pane.findAll({ type: 'Markdown' })).map(found => found.props.text)[1]).toBe(`Checked ${at}`)
      // The package that needs attention first has the main Fill.
      expect((await pane.find({ key: 'fill:evening' }))?.props.variant).toBe('primary')
      expect((await pane.find({ key: 'fill:scores' }))?.props.variant).toBeUndefined()
      await pane.press({ key: 'fill:evening' })
      expect(world.draft).toBe('Check Scores.\nCheck Evening news (evening/) again; it changed since its last check.')

      // The command again closes it, and the band is back.
      expect(await world.command()).toEqual({})
      expect(world.panes).toEqual([])
      expect(await texts(band)).toContain('Check Evening news again')
      expect(world.forbidden).toEqual([])
      expect(world.context).toEqual([])
      await pane.unmount()
      await band.unmount()
    })
  }

  test('where nothing draws a pane, the same list as text', async ($, on) => {
    const world = session($, on, twoPackages())
    await world.start()
    await world.run('noacg validate evening --screenshots ./shots', { output: cli.validate(`${ROOT}/evening`, true, `${ROOT}/shots`) })
    await world.run('noacg save evening', { output: cli.saved('Evening news', SAVED) })
    world.tree['evening/css'] = { 'template.css': '.box { color: blue }' }
    await world.submit()
    const at = hhmm(NOW)
    const expected = [
      'NoaCG packages here:',
      '',
      'Evening news: edited since check',
      `  Checked ${at} · Frames ${at} in shots/ · Saved ${at} ${SAVED}`,
      `  Next: Check Evening news again (${SECOND})`,
      '',
      'Scores: not checked',
      '  Next: Check Scores',
    ].join('\n')

    // `claude -p` and the SDK draw nowhere; the VS Code panel draws no pane.
    for (const surfaces of [[], ['vscode']] as const) {
      world.surfaces = [...surfaces]
      expect((await world.command()).text).toBe(expected)
      expect(world.opened).toEqual([])
    }
    // A surface that places no pane: the pane waits undrawn, so it goes and the text answers.
    world.surfaces = ['desktop']
    world.opens = 'waits'
    expect((await world.command()).text).toBe(expected)
    expect(world.opened).toHaveLength(1)
    expect(world.panes).toEqual([])
    // An open another plugin refuses: still the text.
    world.opens = 'refused'
    expect((await world.command()).text).toBe(expected)
    expect(world.opened).toHaveLength(2)
    expect(world.forbidden).toEqual([])
  })

  test('the band is back whenever the pane is not on screen', async ($, on) => {
    const world = session($, on, twoPackages())
    await world.start()
    const band = await world.mount('terminal', 120)
    await world.command()
    expect(await engineDraws(band)).toBe(true)

    // A tab behind another plugin's pane: the band shows, and the command brings the pane
    // forward rather than closing it.
    world.paneShown = false
    await band.redraw()
    expect(await texts(band)).toContain('Check Evening news')
    expect(await world.command()).toEqual({})
    expect(world.opened).toHaveLength(2)
    expect(world.panes).toEqual(['noacg-guide'])

    // Gone without a close this module heard (an unload): the band shows.
    world.paneShown = true
    world.panes.splice(0)
    await band.redraw()
    expect(await texts(band)).toContain('Check Evening news')
    await band.unmount()
  })

  for (const surface of SURFACES) {
    test(`Esc closing the pane brings the band back at once (${surface})`, { plugins: [ESCAPE] }, async ($, on) => {
      const world = session($, on, twoPackages())
      world.surfaces = [surface]
      await world.start()
      const band = await world.mount(surface, 120)
      await world.command()
      expect(await engineDraws(band)).toBe(true)

      // Only the close happens: no `/noacg-guide`, no state write of the person's, no redraw asked.
      await world.escape()
      expect(world.panes).toEqual([])
      expect(await texts(band)).toContain('Check Evening news')
      expect(world.forbidden).toEqual([])
      await band.unmount()
    })

    // The kit raises no take of the keyboard, so this holds the prop the engine reads (`MAIN`).
    test(`the ring starts on the main button, so Enter acts on it (${surface})`, async ($, on) => {
      const world = session($, on, twoPackages())
      world.surfaces = [surface]
      await world.start()
      await world.run('noacg validate evening', { output: cli.validate(`${ROOT}/evening`, true) })
      await world.command()
      const pane = await world.mountPane(surface, 40)
      // Scores needs attention first (not checked), though Evening news is drawn first.
      const focused = (await pane.findAll({ type: 'Button' })).filter(found => found.props.autoFocus)
      expect(focused.map(found => found.key)).toEqual(['fill:scores'])
      expect(focused[0]?.props.variant).toBe('primary')
      await pane.unmount()

      world.tree = { '.': { 'notes.md': '' } }
      await world.submit()
      const empty = await world.mountPane(surface, 40)
      expect((await empty.findAll({ type: 'Button' })).map(found => [found.props.label, found.props.autoFocus])).toEqual([['Start a package', true]])
      await empty.unmount()
    })
  }

  test('with no package, the pane and the text offer to start one', async ($, on) => {
    const world = session($, on, { '.': { 'notes.md': '' } })
    await world.start()
    world.surfaces = []
    expect((await world.command()).text).toBe(`No NoaCG package here. To start one, ask: ${START}`)
    world.surfaces = ['terminal']
    expect(await world.command()).toEqual({})
    const pane = await world.mountPane('terminal', 40)
    expect((await pane.findAll({ type: 'Button' })).map(found => found.props.label)).toEqual(['Start a package'])
    await pane.unmount()
  })

  test('times, paths and links as the pane writes them', () => {
    const at = Date.UTC(2026, 9, 11, 9, 5)
    expect(when(at, NOW)).toBe(hhmm(at))
    const d = new Date(Date.UTC(2026, 9, 2, 9, 5))
    expect(when(d.getTime(), NOW)).toBe(`${d.getDate()} Oct ${hhmm(d.getTime())}`)
    expect(when(Date.UTC(2025, 5, 20, 12), NOW)).toMatch(/^\d{1,2} Jun 2025$/)

    expect(shown('/work', '/work/shots', true)).toBe('shots/')
    expect(shown('C:/Shows/Evening', 'c:/shows/evening/night.noacgpack.json', false)).toBe('night.noacgpack.json')
    expect(shown('/work', '/tmp/shots', true)).toBe('/tmp/shots/')
    expect(fileUrl('C:/My Shows/shots #2')).toBe('file:///C:/My%20Shows/shots%20%232')
    expect(fileUrl('/work/a(b)')).toBe('file:///work/a%28b%29')

    // A folder name with Markdown's own characters stays plain text in the link.
    expect(factsMarkdown([{ word: 'Frames', at, folder: '/work/[draft]_shots' }], '/work', NOW)).toBe(
      `Frames ${hhmm(at)} [\\[draft\\]\\_shots/](file:///work/%5Bdraft%5D_shots)`,
    )
    // A link's parentheses would end the Markdown link early.
    expect(factsMarkdown([{ word: 'Saved', at, url: 'https://noacg.studio/#/graphic/a)b' }], '/work', NOW)).toBe(
      `Saved ${hhmm(at)} [Open in NoaCG](https://noacg.studio/#/graphic/a%29b)`,
    )
    expect(textAnswer([], '/work', NOW)).toBe(`No NoaCG package here. To start one, ask: ${START}`)
  })
})
