// One next step per package, from what its records say (docs/work-specs/guided-mod/spec.md,
// AC-10), and which package the band names first. A step is a plain-language request the
// person sends themselves: "Fill prompt" only puts it in the prompt box.
import type { NextStep, NoacgPackage, PackageRecord } from '../types'
import { statusOf } from './watch'

/** What "Start a package" puts in the prompt box. */
export const START = 'Make broadcast graphics with NoaCG.'

const WARNING = 'saving again adds a second library copy'

/**
 * The step for a package from its records and the fingerprint of its files now (null when the
 * scan took none: it has no passing check). Lowest rank first: 0 its last check failed,
 * 1 edited since check, 2 not checked, 3 no frames of these files, 4 ready to save or send,
 * 5 saved and edited since. Null once these files are saved, sent or packed, frames or not.
 */
export function stepOf(p: { dir: string; name: string; record: PackageRecord }, current: string | null): NextStep | null {
  const { check, frames, saved, pack } = p.record
  const status = statusOf(p.record, current)
  const n = named(p.dir, p.name)
  // A save records a passing check on the same files, so a later check's files differ from the
  // save's exactly when the package changed since; without a fingerprint, the check's tell.
  const files = current ?? check?.sha256
  const warning = saved && files !== undefined && saved.sha256 !== files ? { warning: WARNING } : {}
  const step = (rank: number, label: string, request: string): NextStep => ({ rank, label, request, ...warning })

  // The check comes before the save: a save refused for errors keeps the old `saved` record.
  if (check?.ok === false) return step(0, `Fix ${p.name} and check it again`, `Fix what the last check found in ${n}, then check it again.`)
  // Files back to what was saved or packed were checked then: nothing to ask.
  if (saved?.sha256 === current || pack?.sha256 === current) return null
  if (status === 'edited') return step(1, `Check ${p.name} again`, `Check ${n} again; it changed since its last check.`)
  if (status === 'unchecked') return step(2, `Check ${p.name}`, `Check ${n}.`)
  if (frames?.sha256 !== current) return step(3, `See how ${p.name} looks`, `Show me how ${n} looks.`)
  const send = 'or send all the graphics here to a production on NoaCG Home.'
  if (!saved) return step(4, `Save ${p.name}, or send all graphics to a production`, `Save ${n} to my NoaCG library, ${send}`)
  return step(5, `Save ${p.name} again, or send all graphics to a production`, `Save ${n} to my NoaCG library again, as a second copy, ${send}`)
}

/**
 * The package as a request names it: with its folder, unless the folder only repeats the name
 * ("Scores", not "Scores in scores/").
 */
function named(dir: string, name: string): string {
  if (dir === '.') return `${name} (this folder)`
  const slug = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  return slug(dir) === slug(name) ? name : `${name} (${dir}/)`
}

/** The package that needs attention first: the lowest rank, then the band's order (by name). */
export function firstStep(packages: readonly NoacgPackage[]): NoacgPackage | undefined {
  let first: NoacgPackage | undefined
  for (const p of packages) if (p.next && (!first?.next || p.next.rank < first.next.rank)) first = p
  return first
}

/**
 * The link "Open in NoaCG" opens: the newer of the saved graphic and the sent pack. Only a web
 * address: the links come from command output, which another command could have printed.
 */
export function linkOf(record: PackageRecord): string | undefined {
  const { saved, pack } = record
  const url = pack?.url && (!saved || pack.at >= saved.at) ? pack.url : saved?.url
  return url ? webLink(url) : undefined
}

/**
 * A link a `Link` element draws, spelled as the engine wants it (`new URL(href).href`), or
 * undefined: only `https:` and `http://localhost` (a local stand-in for NoaCG), with no
 * `user@host` part; anything else would refuse the whole tree it is in.
 */
export function webLink(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    const isWeb = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && parsed.hostname === 'localhost')
    return isWeb && !parsed.username && !parsed.password && !parsed.href.includes('@') ? parsed.href : undefined
  } catch {
    return undefined
  }
}
