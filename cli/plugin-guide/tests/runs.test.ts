// AC-6 and AC-7, the reading half: what a `noacg` run reported, from the command line and the
// output of the published CLI 0.10.1, in a terminal (`noacg ...`, `npx @noacg/cli ...`, Bash or
// PowerShell) and through the `noacg` MCP tool. A failed validation, a run that exited non-zero
// or a screenshot alone never reads as a pass.
import { describe, expect, test } from 'claude-code/testing'

import { mcpReports, normalize, outcomeOf, relativeTo, terminalReports, type Outcome } from '../hooks/watch'
import * as cli from './cli'

const ROOT = 'C:/Users/me/shows'
const EVENING = 'C:\\Users\\me\\shows\\evening'
const at = (dir: string) => `${ROOT}/${dir}`

const ok = (text: string): Outcome => ({ text, isError: false, images: 0 })
/** As a session reports a shell command that exited non-zero. */
const exited = (code: number, text: string): Outcome => ({ text: `Exit code ${code}\n${text}`, isError: true, images: 0 })
const bash = (command: string, outcome: Outcome, cwd = ROOT) => terminalReports(command, cwd, true, outcome)

describe('terminal runs', () => {
  test('a passing validate checks the package it regenerated', () => {
    expect(bash('noacg validate evening', ok(cli.validate(EVENING, true)))).toEqual([{ kind: 'check', target: at('evening'), ok: true }])
    expect(bash('npx -y @noacg/cli@0.10.1 validate ./evening', ok(cli.validateStale(EVENING, true)))).toEqual([
      { kind: 'check', target: at('evening'), ok: true },
    ])
  })

  test('a failing validate fails the check, whatever the exit code says', () => {
    const failing = [{ kind: 'check', target: at('evening'), ok: false }]
    expect(bash('noacg validate evening', exited(1, cli.validate(EVENING, false)))).toEqual(failing)
    // Piped, the exit code is tail's: the FAIL verdict still counts.
    expect(bash('noacg validate evening 2>&1 | tail -40', ok(cli.validate(EVENING, false)))).toEqual(failing)
  })

  test('frames with their folder, and a pass only when every frame was shot', () => {
    const shots = 'C:\\Users\\me\\shows\\shots'
    expect(bash('noacg validate evening --screenshots ./shots', ok(cli.validate(EVENING, true, shots)))).toEqual([
      { kind: 'check', target: at('evening'), ok: true },
      { kind: 'frames', target: at('evening'), dir: at('shots') },
    ])
    // Frames that stopped part way exit 2: the validation passed, the run did not.
    expect(bash('noacg validate evening --screenshots ./shots', exited(2, cli.shotsStopped(EVENING, shots)))).toEqual([
      { kind: 'frames', target: at('evening'), dir: at('shots') },
    ])
    // The same piped, exit code hidden: the stopped frames still keep it from passing.
    expect(bash('noacg validate evening --screenshots ./shots | head -50', ok(cli.shotsStopped(EVENING, shots)))).toEqual([
      { kind: 'frames', target: at('evening'), dir: at('shots') },
    ])
  })

  test('a run that exited non-zero with no verdict records nothing', () => {
    expect(bash('noacg validate evening --screenshots', exited(2, 'noacg: --screenshots needs a value.'))).toEqual([])
    expect(bash('noacg validate nowhere', exited(2, 'noacg: nowhere: no such file or directory.'))).toEqual([])
    // Cut short with no verdict left: unknown, so nothing.
    expect(bash('noacg validate evening 2>&1 | tail -1', ok(`Regenerated the package in ${EVENING}.`))).toEqual([])
    // An interrupted or failed run that printed a pass is still no pass.
    expect(bash('noacg validate evening && false', exited(1, cli.validate(EVENING, true)))).toEqual([])
  })

  test('a report with no folder in it: its verdict alone, for the one package named', () => {
    expect(bash('noacg validate . --json 2>/dev/null', ok(cli.validateJson(true)), at('evening'))).toEqual([
      { kind: 'check', target: at('evening'), ok: true },
    ])
    expect(bash('noacg validate evening --json 2>/dev/null', exited(1, cli.validateJson(false)))).toEqual([
      { kind: 'check', target: at('evening'), ok: false },
    ])
    // A passing verdict from a run that exited non-zero, or whose frames stopped, is no pass.
    expect(bash('noacg validate evening --json --screenshots shots 2>/dev/null', exited(2, cli.validateJson(true)))).toEqual([])
    const stopped = cli.shotsStopped(EVENING, 'C:\\Users\\me\\shows\\shots').split('\n').slice(0, -1).join('\n')
    expect(bash('noacg validate evening --screenshots shots 2>&1 | head -12', ok(stopped))).toEqual([
      { kind: 'frames', target: at('evening'), dir: at('shots') },
    ])
  })

  test('the folder a cd left, and every package a loop validated', () => {
    expect(bash('cd evening && npx @noacg/cli validate . --json > report.json', ok(''))).toEqual([])
    expect(bash('cd evening && noacg validate . 2>/dev/null | tail -20', ok(cli.passed().join('\n')))).toEqual([
      { kind: 'check', target: at('evening'), ok: true },
    ])
    const two = `${cli.validate(EVENING, true)}\n${cli.validate('C:\\Users\\me\\shows\\scores', false)}`
    expect(bash('for d in evening scores; do noacg validate "$d"; done', ok(two))).toEqual([
      { kind: 'check', target: at('evening'), ok: true },
      { kind: 'check', target: at('scores'), ok: false },
    ])
  })

  test('PowerShell keeps its backslashes', () => {
    const run = terminalReports('noacg validate .\\evening 2>&1 | Select-Object -Last 40', ROOT, false, ok(cli.passed().join('\n')))
    expect(run).toEqual([{ kind: 'check', target: at('evening'), ok: true }])
  })

  test('a screenshot alone gives frames, never a check', () => {
    const file = 'C:\\Users\\me\\shows\\evening\\shots\\take.png'
    expect(bash('noacg screenshot evening --state onair --out evening/shots/take.png', ok(cli.screenshot(file)))).toEqual([
      { kind: 'frames', target: at('evening'), dir: at('evening/shots') },
    ])
    expect(bash('noacg screenshot evening --out take.png', exited(2, 'noacg: screenshot needs --out <file.png>.'))).toEqual([])
  })

  test('a save: saved with its link and checked, refused, or not logged in', () => {
    const url = 'https://noacg.studio/#/graphic/6f1c2b'
    expect(bash('noacg save evening --name "Evening news"', ok(cli.saved('Evening news', url)))).toEqual([
      { kind: 'check', target: at('evening'), ok: true },
      { kind: 'saved', target: at('evening'), url },
    ])
    expect(bash('noacg save evening', exited(1, cli.saveRefused()))).toEqual([{ kind: 'check', target: at('evening'), ok: false }])
    expect(bash('noacg save evening', exited(1, cli.NOT_LOGGED_IN))).toEqual([])
  })

  test('a pack: each package in it, sent with its link or written to its file', () => {
    const file = 'C:\\Users\\me\\shows\\night.noacgpack.json'
    expect(bash('noacg pack evening scores --name Night --out night.noacgpack.json', ok(cli.packWritten(file, 2)))).toEqual([
      { kind: 'pack', target: at('evening'), name: 'Night', file: at('night.noacgpack.json') },
      { kind: 'pack', target: at('scores'), name: 'Night', file: at('night.noacgpack.json') },
    ])
    // `--save` takes the next word as its value; the CLI gives it back to the packages.
    const url = 'https://noacg.studio/#/home/packs/9a'
    expect(bash('npx @noacg/cli pack --save evening --name "Friday Night"', ok(cli.packSent('Friday Night', 1, url)))).toEqual([
      { kind: 'pack', target: at('evening'), name: 'Friday Night', url },
    ])
    expect(bash('noacg pack evening --name Night --save', exited(1, cli.NOT_LOGGED_IN))).toEqual([])
  })

  test('only noacg runs count', () => {
    const pass = ok(cli.validate(EVENING, true))
    expect(bash('echo noacg validate evening', pass)).toEqual([])
    expect(bash('git commit -m "noacg validate evening"', pass)).toEqual([])
    expect(bash('noacg scaffold --type lower-third --out evening', pass)).toEqual([])
    expect(bash('npx some-other-cli validate evening', pass)).toEqual([])
    expect(bash('NOACG_URL=http://localhost:5173 noacg validate evening', pass)).toEqual([{ kind: 'check', target: at('evening'), ok: true }])
  })
})

describe('MCP runs', () => {
  const answered = (blocks: (string | { image: true })[], isError = false) =>
    outcomeOf({
      result: blocks.map(b => (typeof b === 'string' ? { type: 'text', text: b } : { type: 'image', data: '', mimeType: 'image/png' })),
      ...(isError ? { isError: true as const } : {}),
    })

  test('validate passes, fails, and shows frames with no folder', () => {
    expect(mcpReports({ command: 'validate', path: 'evening' }, ROOT, answered(cli.mcpValidate(EVENING, true)))).toEqual([
      { kind: 'check', target: at('evening'), ok: true },
    ])
    expect(mcpReports({ command: 'validate', path: 'evening' }, ROOT, answered(cli.mcpValidate(EVENING, false), true))).toEqual([
      { kind: 'check', target: at('evening'), ok: false },
    ])
    expect(mcpReports({ command: 'validate', path: 'evening', screenshots: true }, ROOT, answered(cli.mcpValidate(EVENING, true, true)))).toEqual([
      { kind: 'check', target: at('evening'), ok: true },
      { kind: 'frames', target: at('evening'), dir: null },
    ])
    expect(mcpReports({ command: 'validate', path: 'nowhere' }, ROOT, answered(['nowhere: no such file or directory.'], true))).toEqual([])
  })

  test('screenshot, save and pack', () => {
    expect(mcpReports({ command: 'screenshot', path: 'evening' }, ROOT, answered([{ image: true }]))).toEqual([
      { kind: 'frames', target: at('evening'), dir: null },
    ])
    const url = 'https://noacg.studio/#/graphic/6f1c2b'
    expect(mcpReports({ command: 'save', path: './evening' }, ROOT, answered(cli.mcpSaved('Evening news', url)))).toEqual([
      { kind: 'check', target: at('evening'), ok: true },
      { kind: 'saved', target: at('evening'), url },
    ])
    const file = 'C:\\Users\\me\\shows\\night.noacgpack.json'
    expect(mcpReports({ command: 'pack', paths: ['evening'], name: 'Night', out: 'night.noacgpack.json' }, ROOT, answered([cli.packWritten(file, 1)]))).toEqual([
      { kind: 'pack', target: at('evening'), name: 'Night', file: at('night.noacgpack.json') },
    ])
    expect(mcpReports({ command: 'inspect', path: 'evening' }, ROOT, answered(['Fields: 2']))).toEqual([])
  })
})

describe('paths', () => {
  test('normalized, compared without case on Windows, and kept inside the root', () => {
    expect(normalize('C:\\Users\\me\\shows\\.\\evening\\')).toBe('C:/Users/me/shows/evening')
    expect(normalize('/c/Users/me/shows/evening')).toBe('c:/Users/me/shows/evening')
    expect(normalize('/work/a/../b')).toBe('/work/b')
    expect(relativeTo(ROOT, 'c:\\users\\ME\\shows\\Evening')).toBe('Evening')
    expect(relativeTo(ROOT, ROOT)).toBe('.')
    expect(relativeTo(ROOT, 'C:/Users/me/showsandtell')).toBe(null)
    expect(relativeTo('/work', '/Work/evening')).toBe(null)
  })
})
