// The band's one line of package names, fitted to the cells it has.

const SEPARATOR = ' · '

/**
 * The names joined, or as many as fit followed by `+n more`; a lone name too long is cut with an
 * ellipsis, and many names with no room for even one become a count.
 */
export function fitNames(names: readonly string[], room: number): string {
  const all = names.join(SEPARATOR)
  if (all.length <= room) return all
  for (let shown = names.length - 1; shown >= 1; shown--) {
    const text = `${names.slice(0, shown).join(SEPARATOR)}${SEPARATOR}+${names.length - shown} more`
    if (text.length <= room) return text
  }
  return clip(names.length === 1 ? (names[0] ?? '') : `${names.length} packages`, room)
}

function clip(text: string, room: number): string {
  if (text.length <= room) return text
  return room <= 1 ? text.slice(0, Math.max(0, room)) : `${text.slice(0, room - 1)}…`
}
