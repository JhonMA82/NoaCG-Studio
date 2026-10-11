// AC-4: where packages exist, the band above the prompt shows "NoaCG" and the packages by name,
// sized to the band's width, on the terminal and the Desktop surface.
import { describe, expect, test } from 'claude-code/testing'

import { fitNames } from '../hooks/band'
import { band, engineDraws, scaffolded, session, SURFACES, texts } from './world'

const THREE = {
  '.': { 'lower-third': null, scoreboard: null, ticker: null },
  'lower-third': scaffolded('Lower third'),
  scoreboard: scaffolded('Scoreboard'),
  ticker: scaffolded('Ticker'),
}

describe('the band', () => {
  for (const surface of SURFACES) {
    test(`shows NoaCG and the packages, fitted to the width (${surface})`, async ($, on) => {
      const world = session($, on, THREE)
      await world.start()

      const wide = await $.ui.mount({ plugin: 'noacg-guide', surface, component: 'AbovePrompt', props: band(100) })
      expect(await texts(wide)).toEqual(['NoaCG', 'Lower third · Scoreboard · Ticker'])
      await wide.unmount()

      // 30 cells: the title and its gap take 7, leaving 23 for names; 16 leave 9.
      const narrow = await $.ui.mount({ plugin: 'noacg-guide', surface, component: 'AbovePrompt', props: band(30) })
      expect(await texts(narrow)).toEqual(['NoaCG', 'Lower third · +2 more'])
      await narrow.redraw(band(100))
      expect(await texts(narrow)).toEqual(['NoaCG', 'Lower third · Scoreboard · Ticker'])
      await narrow.unmount()

      const tiny = await $.ui.mount({ plugin: 'noacg-guide', surface, component: 'AbovePrompt', props: band(16) })
      expect(await texts(tiny)).toEqual(['NoaCG', '3 packag…'])
      await tiny.unmount()
    })

    test(`gives way to a survey (${surface})`, async ($, on) => {
      const world = session($, on, THREE)
      await world.start()
      const ui = await $.ui.mount({ plugin: 'noacg-guide', surface, component: 'AbovePrompt', props: band(100, true) })
      expect(await engineDraws(ui)).toBe(true)
      await ui.unmount()
    })
  }

  test('fitting names to a width', () => {
    const names = ['Lower third', 'Scoreboard', 'Ticker']
    expect(fitNames(names, 80)).toBe('Lower third · Scoreboard · Ticker')
    expect(fitNames(names, 33)).toBe('Lower third · Scoreboard · Ticker')
    expect(fitNames(names, 32)).toBe('Lower third · +2 more')
    expect(fitNames(names, 21)).toBe('Lower third · +2 more')
    expect(fitNames(names, 20)).toBe('3 packages')
    expect(fitNames(names, 5)).toBe('3 pa…')
    const longLast = ['Lower third', 'Scoreboard', 'Election results']
    expect(fitNames(longLast, 43)).toBe('Lower third · Scoreboard · Election results')
    expect(fitNames(longLast, 42)).toBe('Lower third · Scoreboard · +1 more')
    expect(fitNames(['A very long package name'], 10)).toBe('A very lo…')
    expect(fitNames([], 10)).toBe('')
  })
})
