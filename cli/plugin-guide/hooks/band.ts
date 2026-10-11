// The band's one line of package names, fitted to the cells it has.

const SEPARATOR = ' · '

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
