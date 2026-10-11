// The band's two lines, fitted to the cells they have: the package names, then where they stand.
import type { NoacgPackage, PackageStatus } from '../types'

export const SEPARATOR = ' · '

export const STATUS: Record<PackageStatus, string> = { checked: 'checked', edited: 'edited since check', unchecked: 'not checked' }

/**
 * The names joined, or as many as fit followed by `+n more`, measured in terminal cells. With no
 * room for even one name beside the count, a lone name or a count of them; the band's `Text`
 * cuts what is still too long.
 */
export function fitNames(names: readonly string[], room: number): string {
  const all = names.join(SEPARATOR)
  if (cells(all) <= room) return all
  for (let shown = names.length - 1; shown >= 1; shown--) {
    const text = `${names.slice(0, shown).join(SEPARATOR)}${SEPARATOR}+${names.length - shown} more`
    if (cells(text) <= room) return text
  }
  return names.length === 1 ? (names[0] ?? '') : `${names.length} packages`
}

/**
 * How many packages are checked, edited since check and not checked, and which are saved: for one
 * package its state alone ("checked · saved"), for several the counts and the saved names, as many
 * as fit, else how many.
 */
export function summary(packages: readonly NoacgPackage[], room: number): string {
  const saved = packages.filter(p => p.record.saved).map(p => p.name)
  if (packages.length === 1) {
    const only = packages[0]
    return only ? STATUS[only.status] + (saved.length ? `${SEPARATOR}saved` : '') : ''
  }
  const counts = (['checked', 'edited', 'unchecked'] as const)
    .map(status => [packages.filter(p => p.status === status).length, STATUS[status]] as const)
    .filter(([count]) => count > 0)
    .map(([count, word]) => `${count} ${word}`)
    .join(SEPARATOR)
  if (saved.length === 0) return counts
  for (let shown = saved.length; shown >= 1; shown--) {
    const more = shown < saved.length ? ` +${saved.length - shown} more` : ''
    const text = `${counts}${SEPARATOR}saved: ${saved.slice(0, shown).join(', ')}${more}`
    if (cells(text) <= room) return text
  }
  return `${counts}${SEPARATOR}${saved.length} saved`
}

/** Cells a text takes in a terminal: two for East Asian wide characters and most emoji. */
function cells(text: string): number {
  let width = 0
  for (const char of text) width += isWide(char.codePointAt(0) ?? 0) ? 2 : 1
  return width
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}
