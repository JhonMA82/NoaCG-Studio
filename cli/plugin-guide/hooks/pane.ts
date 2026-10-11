// What the pane and the text answer of `/noacg-guide` say about each package
// (docs/work-specs/guided-mod/spec.md, AC-14 and AC-15): its state, when each record was made,
// where its frames and pack file are, its saved or sent link, and its next step.
import type { NoacgPackage, PackageRecord } from '../types'
import { SEPARATOR, STATUS } from './band'
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
  const text = inside ?? normalize(path)
  return isFolder ? `${text}/` : text
}

/** One character percent-encoded. */
const percent = (c: string) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`

/** A URL with the characters that would end a Markdown link (`(`, `)`, space) encoded. */
function inMarkdown(url: string): string {
  return url.replace(/[ ()]/g, percent)
}

/** A `file:` URL for an absolute path, which `Markdown` draws as a link the surface opens. */
export function fileUrl(path: string): string {
  const clean = normalize(path)
  return `file://${encodeURI(clean.startsWith('/') ? clean : `/${clean}`).replace(/[()#?]/g, percent)}`
}

/** Markdown's own characters in a label, escaped. */
function escaped(text: string): string {
  return text.replace(/[\\`*_[\]()<>#!|~]/g, c => `\\${c}`)
}

/**
 * The facts on one line, joined by ` · `: as Markdown for the pane, where folders and files open
 * and links open NoaCG, or as plain text for the text answer.
 */
function factsLine(facts: readonly Fact[], root: string, now: number, markdown: boolean): string {
  return facts
    .map(f => {
      const head = `${f.word} ${when(f.at, now)}`
      if (f.url) return markdown ? `${head} [Open in NoaCG](${inMarkdown(f.url)})` : `${head} ${f.url}`
      const path = f.folder ?? f.file
      if (!path) return head
      const label = shown(root, path, f.folder !== undefined)
      if (markdown) return `${head} [${escaped(label)}](${fileUrl(path)})`
      return `${head} ${f.folder ? 'in' : 'to'} ${label}`
    })
    .join(SEPARATOR)
}

/** The pane's line of records for a package. */
export function factsMarkdown(facts: readonly Fact[], root: string, now: number): string {
  return factsLine(facts, root, now, true)
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
    const facts = factsOf(p.record)
    if (facts.length > 0) lines.push(`  ${factsLine(facts, root, now, false)}`)
    if (p.next) lines.push(`  Next: ${p.next.label}${p.next.warning ? ` (${p.next.warning})` : ''}`)
  }
  return lines.join('\n')
}
