// AC-10 to AC-13: each package has one next step from its records, and the band shows the step
// of the package that needs attention first. "Fill prompt" puts its request in the prompt box and
// runs nothing, or shows it as a toast where no box takes it; "Open in NoaCG" appears only with a
// saved or sent link; "Hide" hides the band until `/noacg-guide` or the next `noacg` run;
// `/noacg-guide` in a folder with no package offers to start one. Every read stays under the
// project root. On the terminal and the Desktop surface alike.
import { describe, expect, test } from 'claude-code/testing'

import { linkOf, START, stepOf } from '../hooks/steps'
import type { PackageRecord, Run } from '../types'
import * as cli from './cli'
import { engineDraws, ROOT, scaffoldedAt, session, SURFACES, texts, type Tree } from './world'

const SAVED = 'https://noacg.studio/#/graphic/6f1c2b'
const SENT = 'https://noacg.studio/#/home/productions/night'
const SECOND = 'saving again adds a second library copy'

function onePackage(): Tree {
  return { '.': { evening: null, shots: null }, ...scaffoldedAt('evening', 'Evening news'), shots: {} }
}

function threePackages(): Tree {
  return {
    '.': { alpha: null, beta: null, gamma: null, shots: null },
    ...scaffoldedAt('alpha', 'Alpha'),
    ...scaffoldedAt('beta', 'Beta'),
    ...scaffoldedAt('gamma', 'Gamma'),
    shots: {},
  }
}

/** The step line of the band: the fourth text, after the title, the names and the counts. */
const stepText = async (ui: Parameters<typeof texts>[0]) => (await texts(ui))[3]

/** The keys of the band's buttons and the targets of its links, in order. */
async function controls(ui: { findAll: (q: { type: string }) => Promise<{ key: string | undefined; props: Record<string, unknown> }[]> }): Promise<string[]> {
  const buttons = (await ui.findAll({ type: 'Button' })).map(found => found.key ?? '')
  const links = (await ui.findAll({ type: 'Link' })).map(found => `link ${String(found.props.href)}`)
  return [...buttons, ...links]
}

describe('the next step', () => {
  test('from each state, in plain words', () => {
    const run = (sha256: string): Run => ({ at: 1, sha256, via: 'terminal' })
    const at = (record: PackageRecord, current: string | null) =>
      stepOf({ dir: 'evening', name: 'Evening news', record }, current)

    expect(at({}, null)).toEqual({ rank: 2, label: 'Check Evening news', request: 'Check Evening news in evening/.' })
    expect(at({ check: { ...run('a'), ok: false } }, null)).toEqual({
      rank: 0,
      label: 'Fix Evening news and check it again',
      request: 'Fix what the last check found in Evening news in evening/, then check it again.',
    })
    expect(at({ check: { ...run('a'), ok: true } }, 'b')).toMatchObject({ rank: 1, label: 'Check Evening news again' })
    expect(at({ check: { ...run('a'), ok: true } }, 'a')).toMatchObject({ rank: 3, request: 'Show me the frames of Evening news in evening/.' })
    // Frames of other files are no frames of these.
    expect(at({ check: { ...run('a'), ok: true }, frames: { ...run('z'), dir: null } }, 'a')).toMatchObject({ rank: 3 })
    const ready = { check: { ...run('a'), ok: true }, frames: { ...run('a'), dir: null } }
    expect(at(ready, 'a')).toEqual({
      rank: 4,
      label: 'Save Evening news, or send all graphics to a production',
      request: 'Save Evening news in evening/ to my NoaCG library, or send all the graphics here to a production on NoaCG Home.',
    })
    // Saved or sent as it is: nothing to ask.
    expect(at({ ...ready, saved: { ...run('a'), url: SAVED } }, 'a')).toBeNull()
    expect(at({ ...ready, pack: { ...run('a'), name: 'Night', file: '/work/night.json' } }, 'a')).toBeNull()
    expect(at({ check: { ...run('a'), ok: true }, saved: { ...run('a'), url: SAVED } }, 'a')).toBeNull()
    // Saved and edited since: each step warns, whatever it asks.
    const savedThen = { saved: { ...run('a'), url: SAVED } }
    expect(at({ ...ready, ...savedThen, check: { ...run('a'), ok: true } }, 'b')).toMatchObject({ rank: 1, warning: SECOND })
    expect(at({ ...savedThen, check: { ...run('b'), ok: false } }, null)).toMatchObject({ rank: 0, warning: SECOND })
    expect(at({ ...savedThen, check: { ...run('b'), ok: true }, frames: { ...run('b'), dir: null } }, 'b')).toEqual({
      rank: 5,
      label: 'Save Evening news again, or send all graphics to a production',
      request: 'Save Evening news in evening/ to my NoaCG library again, as a second copy, or send all the graphics here to a production on NoaCG Home.',
      warning: SECOND,
    })
    // Edited back to the files it saved: those were checked then.
    expect(at({ ...savedThen, check: { ...run('b'), ok: true } }, 'a')).toBeNull()
    // Only a web address is a link.
    expect(linkOf(savedThen)).toBe(SAVED)
    expect(linkOf({ saved: { ...run('a'), url: 'file:///C:/evil.exe' } })).toBeUndefined()
    // The working directory itself.
    expect(stepOf({ dir: '.', name: 'Here', record: {} }, null)?.request).toBe('Check Here in this folder.')
  })

  for (const surface of SURFACES) {
    test(`a package walked from new to saved and edited again (${surface})`, async ($, on) => {
      const world = session($, on, onePackage())
      await world.start()
      const ui = await world.mount(surface, 140)
      expect(await stepText(ui)).toBe('Check Evening news')
      expect(await controls(ui)).toEqual(['fill', 'hide'])

      await world.run('noacg validate evening', { output: cli.validate(`${ROOT}/evening`, true) })
      expect(await stepText(ui)).toBe('Show the frames of Evening news')
      await world.run('noacg validate evening --screenshots ./shots', { output: cli.validate(`${ROOT}/evening`, true, `${ROOT}/shots`) })
      expect(await stepText(ui)).toBe('Save Evening news, or send all graphics to a production')

      // Saved as it is: no step, and the link to it.
      await world.run('noacg save evening', { output: cli.saved('Evening news', SAVED) })
      expect(await texts(ui)).toEqual(['NoaCG', 'Evening news', 'checked · saved'])
      expect(await controls(ui)).toEqual(['hide', `link ${SAVED}`])
      expect((await ui.find({ type: 'Link' }))?.children).toEqual(['Open in NoaCG'])

      world.tree['evening/css'] = { 'template.css': '.box { color: blue }' }
      await world.submit()
      expect(await stepText(ui)).toBe(`Check Evening news again · ${SECOND}`)
      await world.run('noacg validate evening --screenshots ./shots', { output: cli.validate(`${ROOT}/evening`, true, `${ROOT}/shots`) })
      expect(await stepText(ui)).toBe(`Save Evening news again, or send all graphics to a production · ${SECOND}`)
      // A save refused for errors keeps the old link; the failed check comes first.
      await world.run('noacg save evening', { output: cli.saveRefused(), exit: 1 })
      expect(await stepText(ui)).toBe(`Fix Evening news and check it again · ${SECOND}`)
      expect(await controls(ui)).toEqual(['fill', 'hide', `link ${SAVED}`])
      await ui.unmount()
    })

    test(`the step of the package that needs attention first (${surface})`, async ($, on) => {
      const world = session($, on, threePackages())
      await world.start()
      await world.run('noacg validate alpha --screenshots ./shots', { output: cli.validate(`${ROOT}/alpha`, true, `${ROOT}/shots`) })
      await world.run('noacg validate gamma', { output: cli.validate(`${ROOT}/gamma`, true) })
      const ui = await world.mount(surface, 140)
      // Alpha ready (4), Beta not checked (2), Gamma without frames (3).
      expect(await stepText(ui)).toBe('Check Beta')

      world.tree['gamma/js'] = { 'template.js': 'export const edited = true' }
      await world.submit()
      expect(await stepText(ui)).toBe('Check Gamma again')

      await world.run('noacg validate beta', { output: cli.validate(`${ROOT}/beta`, false), exit: 1 })
      expect(await stepText(ui)).toBe('Fix Beta and check it again')

      // Equal ranks go by the band's order, by name.
      await world.run('noacg validate beta gamma', { output: [cli.validate(`${ROOT}/beta`, true), cli.validate(`${ROOT}/gamma`, true)].join('\n') })
      expect(await stepText(ui)).toBe('Show the frames of Beta')
      await ui.unmount()
    })

    test(`"Fill prompt" fills the box and runs nothing, or shows a toast (${surface})`, async ($, on) => {
      const world = session($, on, onePackage())
      await world.start()
      const ui = await world.mount(surface, 140)
      await ui.press({ key: 'fill' })
      expect(world.fills).toEqual(['Check Evening news in evening/.'])
      expect(world.toasts).toEqual([])

      world.box = 'no_composer'
      await ui.press({ key: 'fill' })
      world.box = 'dialog'
      await ui.press({ key: 'fill' })
      expect(world.fills).toEqual(['Check Evening news in evening/.'])
      expect(world.toasts).toEqual(['Check Evening news in evening/.', 'Check Evening news in evening/.'])

      // A draft the person typed stays: the request goes on a line after it, once.
      world.box = 'takes'
      world.draft = 'Make the strap blue.'
      await ui.press({ key: 'fill' })
      await ui.press({ key: 'fill' })
      expect(world.draft).toBe('Make the strap blue.\nCheck Evening news in evening/.')

      // Nothing was sent, run or added to the model's context.
      expect(world.forbidden).toEqual([])
      expect(world.context).toEqual([])
      expect(world.appended()).toBe(0)
      expect(world.storeCalls.filter(call => call.startsWith('set '))).toEqual([])
      await ui.unmount()
    })

    test(`"Open in NoaCG" only with a saved or sent link (${surface})`, async ($, on) => {
      const world = session($, on, threePackages())
      await world.start()
      const ui = await world.mount(surface, 140)
      await world.run('noacg pack alpha beta --name Night --out night.noacgpack.json', { output: cli.packWritten(`${ROOT}/night.noacgpack.json`, 2) })
      await world.run('noacg validate alpha', { output: cli.validate(`${ROOT}/alpha`, false), exit: 1 })
      // A written pack is a file, not a link.
      expect(await stepText(ui)).toBe('Fix Alpha and check it again')
      expect(await controls(ui)).toEqual(['fill', 'hide'])

      await world.run('noacg save alpha', { output: cli.saved('Alpha', SAVED) })
      await world.run('noacg pack alpha --name Night --save', { output: cli.packSent('Night', 1, SENT) })
      // Alpha is sent as it is; the band names Beta's step, with no link of Beta's.
      expect(await stepText(ui)).toBe('Check Beta')
      expect(await controls(ui)).toEqual(['fill', 'hide'])

      await world.run('noacg save beta', { output: cli.saved('Beta', SAVED) })
      await world.run('noacg save gamma', { output: cli.saved('Gamma', SAVED) })
      // Nothing left to ask: the first package with a link, its newest one.
      expect(await controls(ui)).toEqual(['hide', `link ${SENT}`])
      await ui.unmount()
    })

    test(`"Hide" until /noacg-guide or the next noacg run (${surface})`, async ($, on) => {
      const world = session($, on, onePackage())
      await world.start()
      const ui = await world.mount(surface, 140)
      await ui.press({ key: 'hide' })
      expect(await engineDraws(ui)).toBe(true)

      await world.command()
      expect(await stepText(ui)).toBe('Check Evening news')

      await ui.press({ key: 'hide' })
      await world.run('ls evening', { output: 'css\njs' })
      await world.submit()
      await world.tool('Read')
      expect(await engineDraws(ui)).toBe(true)
      await world.run('npx @noacg/cli inspect evening', { output: 'FIELDS\n  f0  Name' })
      expect(await stepText(ui)).toBe('Check Evening news')

      await ui.press({ key: 'hide' })
      await world.mcp({ command: 'inspect', path: 'evening' }, { blocks: ['FIELDS\n  f0  Name'] })
      expect(await stepText(ui)).toBe('Check Evening news')

      // A run in the background is activity too, though it records nothing.
      await ui.press({ key: 'hide' })
      await world.run('noacg validate evening', { output: '' }, { background: 'asked' })
      expect(await stepText(ui)).toBe('Check Evening news')
      expect(world.forbidden).toEqual([])
      await ui.unmount()
    })

    test(`/noacg-guide with no package offers to start one (${surface})`, async ($, on) => {
      const world = session($, on, { '.': { 'notes.md': '' } })
      await world.start()
      const ui = await world.mount(surface, 100)
      expect(await engineDraws(ui)).toBe(true)

      await world.command()
      expect(await texts(ui)).toEqual(['NoaCG'])
      expect(await controls(ui)).toEqual(['start', 'hide'])
      expect((await ui.find({ key: 'start' }))?.props.label).toBe('Start a package')
      await ui.press({ key: 'start' })
      expect(world.fills).toEqual([START])
      world.box = 'no_composer'
      await ui.press({ key: 'start' })
      expect(world.toasts).toEqual([START])

      await ui.press({ key: 'hide' })
      expect(await engineDraws(ui)).toBe(true)
      await world.command()
      expect(await controls(ui)).toEqual(['start', 'hide'])

      // The package it asked for appears in its place.
      Object.assign(world.tree, scaffoldedAt('opener', 'Opener'))
      world.tree['.'] = { ...world.tree['.'], opener: null }
      await world.run('npx @noacg/cli scaffold --type full-screen --name Opener --out opener', { output: `Scaffolded "Opener" (full-screen) into ${ROOT}/opener` })
      expect(await texts(ui)).toEqual(['NoaCG', 'Opener', 'not checked', 'Check Opener'])

      // Run where a package exists, the command offers nothing that outlives it.
      await world.command()
      world.tree['.'] = { 'notes.md': '' }
      await world.submit()
      expect(await engineDraws(ui)).toBe(true)
      expect(world.forbidden).toEqual([])
      expect(world.context).toEqual([])
      await ui.unmount()
    })

    test(`its reach: reads under the project root, and no call it must not make (${surface})`, async ($, on) => {
      const world = session($, on, onePackage())
      await world.start()
      // A shell that wandered off, and runs that name folders outside the root.
      world.cwd = '/elsewhere'
      await world.run('noacg validate other', { output: cli.validate('/elsewhere/other', true) })
      await world.run('cd .. && noacg validate ../etc --screenshots /tmp/shots', { output: cli.validate('/etc', true, '/tmp/shots') })
      world.cwd = ROOT
      await world.run('noacg validate /outside/pkg', { output: cli.validate('/outside/pkg', true) })
      await world.run('noacg screenshot evening --out /tmp/onair.png', { output: cli.screenshot('/tmp/onair.png') })
      await world.mcp({ command: 'validate', path: '/outside/pkg' }, { blocks: cli.mcpValidate('/outside/pkg', true) })
      await world.run('noacg save evening', { output: cli.saved('Evening news', SAVED) })
      world.tree['evening/css'] = { 'template.css': '.box { color: blue }' }
      await world.submit()

      // Every button the band draws, pressed; then the command and its offer.
      const ui = await world.mount(surface, 140)
      await ui.press({ key: 'fill' })
      await ui.press({ key: 'hide' })
      await world.command()
      expect(world.fills).toEqual(['Check Evening news in evening/ again; it changed since its last check.'])

      expect(world.forbidden).toEqual([])
      for (const path of [...world.lists, ...world.reads]) expect(path.startsWith('..') || path.startsWith('/')).toBe(false)
      expect(world.lists.length).toBeGreaterThan(0)
      expect(world.context).toEqual([])
      await ui.unmount()
    })
  }
})
