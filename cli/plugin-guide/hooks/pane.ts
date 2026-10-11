// What the pane and the text answer of `/noacg-guide` say about each package
// (docs/work-specs/guided-mod/spec.md, AC-14 and AC-15): its state, when each record was made,
// where its frames and pack file are, its saved or sent link, and its next step.
import type { NoacgPackage, PackageRecord } from '../types'
import { STATUS } from './band'
import { START, webLink } from './steps'
import { normalize, relativeTo } from './watch'

/** One record of a package: what happened, when, and where it left something. */
export type Fact = { word: string; at: number; folder?: string; file?: string; url?: string }

/** A package's records in a fixed order: check, frames, save, pack. Paths absolute. */
export function factsOf(record: PackageRecord): Fact[] {
  const { check, frames, saved, pack } = record
  const facts: Fact[] = []
  if (check) facts.push({ word: check.ok ? 'Checked' : 'Check failed', at: check.at })
  if (frames) facts.push({ word: 'Frames', at: frames.at, ...(frames.dir ? { folder: frames.dir } : {}) })
  if (saved) facts.push({ word: 'Saved', at: saved.at, ...link(saved.url) })
  if (pack?.url) facts.push({ word: 'Sent', at: pack.at, ...link(pack.url) })
  else if (pack?.file) facts.push({ word: 'Pack written', at: pack.at, file: pack.file })
  return facts
}

function link(url: string): { url?: string } {
  const href = webLink(url)
  return href ? { url: href } : {}
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** When a record was made, in local time: `14:02` today, `10 Oct 14:02` this year, else `10 Oct 2025`. */
export function when(at: number, now: number): string {
  const then = new Date(at)
  const today = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(then.getHours())}:${pad(then.getMinutes())}`
  if (then.toDateString() === today.toDateString()) return time
  const day = `${then.getDate()} ${MONTHS[then.getMonth()] ?? ''}`
  return then.getFullYear() === today.getFullYear() ? `${day} ${time}` : `${day} ${then.getFullYear()}`
}

/** A path as the person reads it: relative to the project root when inside it, a folder with `/`. */
export function shown(root: string, path: string, isFolder: boolean): string {
  const inside = relativeTo(root, path)
  const text = inside === null ? normalize(path) : inside === '.' ? '.' : inside
  return isFolder ? `${text}/` : text
}

/** A `file:` URL for an absolute path, which `Markdown` draws as a link the surface opens. */
export function fileUrl(path: string): string {
  const clean = normalize(path)
  const encoded = encodeURI(clean.startsWith('/') ? clean : `/${clean}`).replace(/[#?()]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `file://${encoded}`
}

/** Markdown's own characters in a label, escaped. */
function escaped(text: string): string {
  return text.replace(/[\\`*_[\]()<>#!|~]/g, c => `\\${c}`)
}

/** The facts as one line of Markdown for the pane: folders and files open, links open NoaCG. */
export function factsMarkdown(facts: readonly Fact[], root: string, now: number): string {
  return facts
    .map(f => {
      const head = `${f.word} ${when(f.at, now)}`
      if (f.url) return `${head} [Open in NoaCG](${f.url})`
      const path = f.folder ?? f.file
      if (path) return `${head} [${escaped(shown(root, path, f.folder !== undefined))}](${fileUrl(path)})`
      return head
    })
    .join(' · ')
}

/**
 * `/noacg-guide`'s answer where nothing draws a pane: the same list and next steps as plain text.
 * The engine records it in the conversation, so a later turn's model reads it: kept short.
 */
export function textAnswer(packages: readonly NoacgPackage[], root: string, now: number): string {
  if (packages.length === 0) return `No NoaCG package here. To start one, ask: ${START}`
  const lines = ['NoaCG packages here:']
  for (const p of packages) {
    lines.push('', `${p.name}: ${STATUS[p.status]}`)
    const facts = factsOf(p.record).map(f => {
      const head = `${f.word} ${when(f.at, now)}`
      const path = f.folder ?? f.file
      if (f.url) return `${head} ${f.url}`
      if (f.folder) return `${head} in ${shown(root, f.folder, true)}`
      return path ? `${head} to ${shown(root, path, false)}` : head
    })
    if (facts.length > 0) lines.push(`  ${facts.join(' · ')}`)
    if (p.next) lines.push(`  Next: ${p.next.label}${p.next.warning ? ` (${p.next.warning})` : ''}`)
  }
  return lines.join('\n')
}
