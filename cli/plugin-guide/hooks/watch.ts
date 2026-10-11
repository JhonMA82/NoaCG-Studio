// State by watching (docs/work-specs/guided-mod/spec.md, "Decisions and boundaries"). The CLI
// writes no receipts yet, so this module reads what `noacg` runs reported, fingerprints the
// package files itself and keeps the records. It is the one module to replace when the CLI
// answers a `status` read; register.tsx only calls what it exports.
//
// Three parts:
// - Reading runs: a terminal command (`noacg ...`, `npx @noacg/cli ...`) or a call of the `noacg`
//   MCP tool, and what it printed, become reports: checked or failed, frames, saved, packed.
//   The output shapes are the published CLI 0.10.1's (cli/src/commands/*.ts, cli/src/mcp.ts).
//   A check passes only on the CLI's own "OK - " verdict from a run that exited 0; a FAIL
//   verdict fails it; anything unknown records nothing.
// - Fingerprints: SHA-256 over a package's source and asset bytes, without the generated half
//   `noacg validate` rewrites (cli/src/workspace.ts, GENERATED) and without frames folders.
// - Records: per package, the newest run of each kind with the fingerprint it left, kept per
//   working folder in the mod's own `$.store` (a file under the Claude Code configuration
//   directory), never in a package or the repository.
import type { FsEntry } from 'claude-code'

import type { PackageRecord, PackageStatus, Run } from '../types'
import { FRAMES_MARKER, isObject } from './packages'

// ── Paths ──────────────────────────────────────────────────────────────────────────────────────

const WINDOWS_DRIVE = /^[A-Za-z]:\//

/** A path with forward slashes, `.` and `..` resolved and no trailing slash. */
export function normalize(path: string): string {
  const clean = path.replace(/\\/g, '/')
  const drive = WINDOWS_DRIVE.test(clean) ? clean.slice(0, 2) : ''
  const rest = drive ? clean.slice(2) : clean
  const absolute = rest.startsWith('/')
  const parts: string[] = []
  for (const part of rest.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop()
    else if (part !== '..' || !absolute) parts.push(part)
  }
  const joined = parts.join('/')
  if (absolute) return `${drive}/${joined}`
  return drive ? `${drive}${joined}` : joined || '.'
}

function isAbsolute(path: string): boolean {
  return /^([A-Za-z]:)?[\\/]/.test(path)
}

/** `path` resolved against the absolute `base`; against a Windows base, Git Bash's `/c/x` is `c:/x`. */
export function resolvePath(base: string, path: string): string {
  const gitBash = WINDOWS_DRIVE.test(normalize(base)) ? /^\/([A-Za-z])(\/|$)/.exec(path) : null
  if (gitBash) return normalize(`${gitBash[1]}:/${path.slice(3)}`)
  return normalize(isAbsolute(path) ? path : `${base}/${path}`)
}

/** How two paths compare: Windows paths ignore case. */
function pathKey(path: string): string {
  const clean = normalize(path)
  return WINDOWS_DRIVE.test(clean) ? clean.toLowerCase() : clean
}

/** `path` relative to `root` (`.` for the root itself), or null when it lies outside. */
export function relativeTo(root: string, path: string): string | null {
  const from = pathKey(root)
  const to = pathKey(path)
  if (to === from) return '.'
  const prefix = from.endsWith('/') ? from : `${from}/`
  return to.startsWith(prefix) ? normalize(path).slice(prefix.length) : null
}

function dirname(path: string): string {
  const clean = normalize(path)
  const cut = clean.lastIndexOf('/')
  return cut <= 0 ? clean.slice(0, cut + 1) || '.' : clean.slice(0, cut)
}

// ── Reading runs ───────────────────────────────────────────────────────────────────────────────

/** What a run reported about the package at `target` (an absolute path). */
export type Report =
  | { kind: 'new'; target: string }
  | { kind: 'check'; target: string; ok: boolean }
  | { kind: 'frames'; target: string; dir: string | null }
  | { kind: 'saved'; target: string; url: string }
  | { kind: 'pack'; target: string; name: string; url?: string; file?: string }

/** A tool call's outcome as the session saw it. */
export type Outcome = { text: string; isError: boolean; images: number }

const VERBS = ['scaffold', 'validate', 'screenshot', 'save', 'pack'] as const
type Verb = (typeof VERBS)[number]

type Args = { _: string[]; flags: Record<string, string | boolean | string[]> }

/** One `noacg` run in a command line: the verb, its arguments, and the folder it ran in (null when unknown). */
type Invocation = { verb: Verb; args: Args; cwd: string | null }

/** The CLI's own argument parser (cli/src/output.ts), so a command reads here as it reads there. */
function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} }
  let onlyPositional = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? ''
    if (onlyPositional || !a.startsWith('--')) {
      out._.push(a)
      continue
    }
    if (a === '--') {
      onlyPositional = true
      continue
    }
    const eq = a.indexOf('=')
    let key = eq >= 0 ? a.slice(2, eq) : a.slice(2)
    let value: string | boolean
    if (eq >= 0) value = a.slice(eq + 1)
    else if (key.startsWith('no-')) {
      key = key.slice(3)
      value = false
    } else if (i + 1 < argv.length && !(argv[i + 1] ?? '').startsWith('--')) value = argv[++i] ?? ''
    else value = true
    const prev = out.flags[key]
    if (prev === undefined) out.flags[key] = value
    else if (Array.isArray(prev)) prev.push(String(value))
    else out.flags[key] = [String(prev), String(value)]
  }
  return out
}

function flag(args: Args, key: string): string | undefined {
  const v = args.flags[key]
  if (v === undefined || typeof v === 'boolean') return undefined
  return Array.isArray(v) ? v[v.length - 1] : v
}

/** A command line cut into its simple commands, each a list of words, quotes and redirections undone. */
function commandsIn(line: string, escapes: boolean): string[][] {
  const out: string[][] = []
  let words: string[] = []
  let word = ''
  let has = false
  let quote: string | null = null
  let dropNext = false
  const endWord = () => {
    if (has) {
      if (dropNext) dropNext = false
      else words.push(word)
    }
    word = ''
    has = false
  }
  const endCommand = () => {
    endWord()
    dropNext = false
    if (words.length) out.push(words)
    words = []
  }
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? ''
    const next = line[i + 1] ?? ''
    if (quote) {
      if (c === quote) quote = null
      else if (escapes && quote === '"' && c === '\\' && i + 1 < line.length) word += line[++i]
      else word += c
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      has = true
    } else if (escapes && c === '\\') {
      if (next !== '\n') {
        word += next
        has = true
      }
      i++
    } else if (c === '`' && !escapes && (next === '\n' || next === '\r')) {
      i += next === '\r' && line[i + 2] === '\n' ? 2 : 1
    } else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      // A redirection: a file descriptor before it goes, and so does its target unless it is `&N`.
      if (/^\d+$/.test(word)) {
        word = ''
        has = false
      }
      endWord()
      while (line[i + 1] === '>' || line[i + 1] === '&' || line[i + 1] === '|') i++
      if (/\d/.test(line[i + 1] ?? '') && line[i] === '&') {
        while (/\d/.test(line[i + 1] ?? '')) i++
      } else dropNext = true
    } else if (c === '(' || c === ')') {
      // A subshell: marked, so a `cd` inside it ends with it.
      endCommand()
      out.push([c])
    } else if (c === ';' || c === '\n' || c === '&' || c === '|') {
      endCommand()
      if ((c === '&' || c === '|') && next === c) i++
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord()
    } else {
      word += c
      has = true
    }
  }
  endCommand()
  return out
}

/** Words that may stand before a command: shell keywords and plain wrappers. */
const PREFIXES = new Set(['do', 'then', 'else', '!', '{', 'env', 'time', 'command', 'exec', 'nohup'])
const RUNNERS: Record<string, string[]> = { npx: [], bunx: [], npm: ['exec'], pnpm: ['dlx', 'exec'], yarn: ['dlx'] }

/** Where the verb stands in a simple command that runs the noacg CLI, else null. */
function verbAt(words: string[]): number | null {
  let i = 0
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i] ?? '') || PREFIXES.has(words[i] ?? '')) i++
  const program = (words[i] ?? '').replace(/^.*[\\/]/, '').replace(/\.(cmd|exe|ps1)$/i, '').toLowerCase()
  if (program === 'noacg') return i + 1
  const sub = RUNNERS[program]
  if (!sub) return null
  i++
  if (sub.length) {
    if (!sub.includes(words[i] ?? '')) return null
    i++
  }
  while ((words[i] ?? '').startsWith('-')) {
    const option = words[i]
    i += option === '-p' || option === '--package' ? 2 : 1
    if (option === '--') break
  }
  const name = words[i] ?? ''
  if (!/^@noacg\/cli(@\S*)?$/.test(name) && name !== 'noacg') return null
  return words[i + 1] === '--' ? i + 2 : i + 1
}

/** Whether a command line runs the noacg CLI, any verb: what brings a hidden band back. */
export function runsNoacg(line: string, escapes: boolean): boolean {
  return /noacg/i.test(line) && commandsIn(line, escapes).some(words => verbAt(words) !== null)
}

/** A word naming a folder this mod can follow: no variable, glob or home shorthand in it. */
function plain(word: string | undefined): word is string {
  return word !== undefined && word !== '' && !/[$*?~`{}]/.test(word)
}

/** The noacg runs of interest in a command line, each with the folder a `cd` before it left. */
function invocationsIn(line: string, cwd: string, escapes: boolean): Invocation[] {
  const found: Invocation[] = []
  let here: string | null = cwd
  const saved: (string | null)[] = []
  for (const words of commandsIn(line, escapes)) {
    const program = (words[0] ?? '').toLowerCase()
    if (program === '(' || program === 'pushd' || program === 'push-location') saved.push(here)
    if (program === ')' || program === 'popd' || program === 'pop-location') {
      here = saved.length > 0 ? (saved.pop() ?? null) : null
      continue
    }
    if (['cd', 'pushd', 'chdir', 'set-location', 'sl', 'push-location'].includes(program)) {
      const to = words.slice(1).filter(w => !w.startsWith('-'))[0]
      here = here !== null && plain(to) ? resolvePath(here, to) : null
      continue
    }
    const at = verbAt(words)
    const verb = at === null ? undefined : words[at]
    if (at === null || !VERBS.includes(verb as Verb)) continue
    found.push({ verb: verb as Verb, args: parseArgs(words.slice(at)), cwd: here })
  }
  return found
}

const HEADER = /^(OK|FAIL) - \d+ error\(s\)/
const REGENERATED = /^Regenerated the package in (.+?)(?: \(the generated half was stale[^)]*\))?\.\s*$/
const SCREENSHOTS = /^Screenshots: (.+?)(?:, |$)/
const SHOT_FAILED = /^Screenshots stopped part way:/
const STATE_FRAME = /^(off|onair|stress):$/

/** One validate report in the output: the package it regenerated and its verdict. */
type Block = { dir: string; ok: boolean; shotFailed: boolean; frames: string | null; shown: boolean }

/** Every validate report that names the folder it regenerated, in order. */
function blocksIn(text: string): Block[] {
  const blocks: Block[] = []
  let ok: boolean | undefined
  let shotFailed = false
  let frames: string | null = null
  let shown = false
  for (const line of text.split(/\r?\n/)) {
    const header = HEADER.exec(line)
    if (header) {
      ok = header[1] === 'OK'
      shotFailed = false
      frames = null
      shown = false
      continue
    }
    if (SHOT_FAILED.test(line)) shotFailed = true
    if (STATE_FRAME.test(line)) shown = true
    const shots = SCREENSHOTS.exec(line)
    if (shots?.[1]) frames = dirname(shots[1])
    const done = REGENERATED.exec(line)
    if (done?.[1] && ok !== undefined) {
      blocks.push({ dir: normalize(done[1]), ok, shotFailed, frames, shown })
      ok = undefined
    }
  }
  return blocks
}

/** The verdict of a lone validate or save whose report names no folder: OK, FAIL, or unknown. */
function verdictIn(text: string): boolean | undefined {
  if (/^FAIL - \d+ error/m.test(text)) return false
  if (/^OK - \d+ error/m.test(text)) return true
  const json = /"ok":\s*(true|false)/.exec(text)
  return json ? json[1] === 'true' : undefined
}

const SCAFFOLDED = /^Scaffolded "[^"\n]*" \([^)\n]*\) into (.+?)\s*$/gm
const SAVED = /Saved "(?:[^"\n]*)" to (?:your|the) NoaCG library -> (\S+)/
const SENT = /Sent "([^"\n]*)" \(\d+ graphic\(s\)\) to your NoaCG Home -> (\S+)/
const WROTE_PACK = /^Wrote (.+?) with \d+ graphic\(s\)/m
const WROTE_FRAME = /^Wrote (.+?) \(/gm
const JSON_FILE = /"file": "((?:[^"\\]|\\.)*)"/g

/** A JSON string's text, from between its quotes. */
function jsonText(quoted: string | undefined): string | undefined {
  try {
    return quoted === undefined ? undefined : (JSON.parse(`"${quoted}"`) as string)
  } catch {
    return undefined
  }
}

/**
 * Reports from the validate blocks. A pass needs the OK verdict and every frame shot. `validate`
 * exits 0 exactly then, so where several ran in one command each block is its own evidence; a
 * lone one must also have ended a call that exited 0.
 */
function fromBlocks(blocks: Block[], isError: boolean, reports: Report[]): void {
  for (const b of blocks) {
    if (!b.ok) reports.push({ kind: 'check', target: b.dir, ok: false })
    else if (!b.shotFailed && !(isError && blocks.length === 1)) reports.push({ kind: 'check', target: b.dir, ok: true })
    if (b.frames !== null) reports.push({ kind: 'frames', target: b.dir, dir: b.frames })
    else if (b.shown) reports.push({ kind: 'frames', target: b.dir, dir: null })
  }
}

/** A scaffold's report: each folder it wrote starts afresh. */
function fromScaffold(text: string, isError: boolean, reports: Report[]): void {
  if (isError) return
  for (const made of text.matchAll(SCAFFOLDED)) if (made[1]) reports.push({ kind: 'new', target: normalize(made[1]) })
}

/** A save's reports: saved with its link and a passing check; or a failing check. */
function fromSave(target: string, text: string, isError: boolean, reports: Report[]): void {
  const saved = SAVED.exec(text)
  if (saved?.[1] && !isError) reports.push({ kind: 'check', target, ok: true }, { kind: 'saved', target, url: saved[1] })
  else if (verdictIn(text) === false) reports.push({ kind: 'check', target, ok: false })
}

/** A pack's reports, one per package in it: where it went. */
function fromPack(targets: string[], name: string | undefined, text: string, base: string, reports: Report[]): void {
  const sent = SENT.exec(text)
  const wrote = WROTE_PACK.exec(text)
  if (!sent && !wrote) return
  const file = wrote?.[1] ? resolvePath(base, wrote[1]) : undefined
  const named = sent?.[1] ?? name ?? ''
  for (const target of targets) {
    reports.push({ kind: 'pack', target, name: named, ...(sent?.[2] ? { url: sent[2] } : {}), ...(file ? { file } : {}) })
  }
}

/** A run that skipped part of the gate (`--no-bench`, `--no-house-contract`) passes nothing. */
function withoutPasses(reports: Report[], weak: boolean): Report[] {
  return weak ? reports.filter(r => !(r.kind === 'check' && r.ok)) : reports
}

/**
 * What a terminal command's noacg runs reported. `cwd` is the folder the command started in;
 * `escapes` is false for PowerShell, where a backslash is a path separator.
 */
export function terminalReports(command: string, cwd: string, escapes: boolean, outcome: Outcome): Report[] {
  if (!/noacg/i.test(command)) return []
  const runs = invocationsIn(command, cwd, escapes)
  if (runs.length === 0) return []
  const { text, isError } = outcome
  const reports: Report[] = []
  const count = (verb: Verb) => runs.filter(r => r.verb === verb).length
  // A scaffold writes only into an empty folder, so it comes before any other run on that folder
  // in the same command: `scaffold && validate` starts it afresh, then checks it.
  if (count('scaffold')) fromScaffold(text, isError, reports)
  const blocks = count('validate') ? blocksIn(text) : []
  fromBlocks(blocks, isError, reports)

  for (const run of runs) {
    const here = run.cwd
    if (here === null) continue
    const input = run.args._[1]
    const target = plain(input) ? resolvePath(here, input) : null
    if (run.verb === 'validate' && target && count('validate') === 1 && blocks.length === 0) {
      // A report cut short (`| tail`, `--json` with the log lines dropped): its verdict alone.
      const ok = verdictIn(text)
      const shotFailed = new RegExp(SHOT_FAILED.source, 'm').test(text)
      if (ok === false) reports.push({ kind: 'check', target, ok: false })
      else if (ok === true && !shotFailed && !isError) reports.push({ kind: 'check', target, ok: true })
      const shots = flag(run.args, 'screenshots')
      if (shots && plain(shots) && !isError) reports.push({ kind: 'frames', target, dir: resolvePath(here, shots) })
    }
    if (run.verb === 'screenshot' && target) {
      const out = flag(run.args, 'out')
      if (!out || !plain(out)) continue
      const file = resolvePath(here, out)
      // The file it names, in its line or its JSON: the exit code may be another command's.
      const named = [...text.matchAll(WROTE_FRAME), ...text.matchAll(JSON_FILE)].map(m => (m[0].startsWith('"') ? jsonText(m[1]) : m[1]))
      if (named.some(f => f !== undefined && pathKey(f) === pathKey(file))) reports.push({ kind: 'frames', target, dir: dirname(file) })
    }
    if (run.verb === 'save' && target && count('save') === 1) fromSave(target, text, isError, reports)
    if (run.verb === 'pack' && count('pack') === 1) {
      // `--save` and `--share` are switches that take the next word; the CLI gives it back.
      const inputs = run.args._.slice(1)
      for (const key of ['share', 'save']) {
        const taken = run.args.flags[key]
        if (typeof taken === 'string') inputs.unshift(taken)
      }
      fromPack(inputs.filter(plain).map(p => resolvePath(here, p)), flag(run.args, 'name'), text, here, reports)
    }
  }
  return withoutPasses(
    reports,
    runs.some(r => r.args.flags.bench === false || r.args.flags['house-contract'] === false),
  )
}

/** Whether a tool is the `noacg` MCP tool, under whatever name its server was added. */
export function isNoacgTool(tool: string): boolean {
  return /^mcp__.+__noacg$/.test(tool)
}

/**
 * What a call of the `noacg` MCP tool reported. `input` is the call's arguments; relative paths
 * are the server's, which runs in the session's folder, `root`.
 */
export function mcpReports(input: Record<string, unknown>, root: string, outcome: Outcome): Report[] {
  const { text, isError } = outcome
  const reports: Report[] = []
  const path = typeof input.path === 'string' && input.path ? resolvePath(root, input.path) : null
  switch (input.command) {
    case 'scaffold':
      fromScaffold(text, isError, reports)
      break
    case 'validate': {
      // The frames come back as images; a validate that showed some names no folder.
      const blocks = blocksIn(text)
      fromBlocks(blocks, isError, reports)
      const block = blocks[0]
      if (block && !block.shown && input.screenshots === true && outcome.images > 0) {
        reports.push({ kind: 'frames', target: block.dir, dir: null })
      }
      break
    }
    case 'screenshot':
      if (path && !isError) reports.push({ kind: 'frames', target: path, dir: null })
      break
    case 'save':
      if (path) fromSave(path, text, isError, reports)
      break
    case 'pack': {
      const paths = Array.isArray(input.paths) ? input.paths.filter((p): p is string => typeof p === 'string' && p !== '') : []
      fromPack(
        paths.map(p => resolvePath(root, p)),
        typeof input.name === 'string' ? input.name.trim() : undefined,
        text,
        root,
        reports,
      )
      break
    }
  }
  return withoutPasses(reports, input.bench === false || input.houseContract === false)
}

/** A tool result's text and image count: MCP content blocks, a plain string, or what the model read. */
export function outcomeOf(ran: { result?: unknown; text?: string; isError?: true }): Outcome {
  const texts: string[] = []
  let images = 0
  const blocks = Array.isArray(ran.result)
    ? ran.result
    : isObject(ran.result) && Array.isArray(ran.result.content)
      ? ran.result.content
      : null
  for (const block of blocks ?? []) {
    if (!isObject(block)) continue
    if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
    if (block.type === 'image') images++
  }
  if (texts.length === 0 && typeof ran.text === 'string') texts.push(ran.text)
  if (texts.length === 0 && isObject(ran.result)) {
    for (const key of ['stdout', 'stderr'] as const) {
      const value = ran.result[key]
      if (typeof value === 'string' && value) texts.push(value)
    }
  }
  if (texts.length === 0 && typeof ran.result === 'string') texts.push(ran.result)
  return { text: texts.join('\n'), isError: ran.isError === true, images }
}

// ── Fingerprints ───────────────────────────────────────────────────────────────────────────────

/** The two reads a fingerprint makes, on absolute paths. */
export type Reader = {
  list: (dir: string) => Promise<FsEntry[]>
  /** A file's bytes, base64. */
  bytes: (file: string) => Promise<string>
}

/** The generated half of a package, at its top level (cli/src/workspace.ts). */
const GENERATED = [/\.ograf\.json$/i, /^graphic\.mjs$/, /^FIELDS\.md$/, /^README\.md$/, /^GETTING-ON-AIR\.md$/, /^controlpanel\.html$/, /^thumbnail\.png$/]
/** `$.fs.read` refuses more; a larger file counts by its size and time. */
const MAX_READ = 4 * 1024 * 1024
const MAX_FILES = 2000
const MAX_DEPTH = 8

/** Each file's digest, by absolute path, kept while its size and time stay the same. */
const digests = new Map<string, { stamp: string; hex: string }>()

type FileEntry = { rel: string; abs: string; size: number; mtimeMs: number }

async function filesOf(fs: Reader, dir: string, rel: string, depth: number, into: FileEntry[]): Promise<void> {
  let entries: FsEntry[]
  try {
    entries = await fs.list(dir)
  } catch {
    into.push({ rel: `${rel}/`, abs: '', size: -1, mtimeMs: 0 })
    return
  }
  if (rel !== '' && entries.some(e => e.kind === 'file' && e.name === FRAMES_MARKER)) return
  for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (into.length >= MAX_FILES) return
    const path = rel === '' ? entry.name : `${rel}/${entry.name}`
    if (entry.kind === 'dir') {
      if (entry.name === 'node_modules' || entry.name === '.git' || depth >= MAX_DEPTH) continue
      await filesOf(fs, `${dir}/${entry.name}`, path, depth + 1, into)
    } else if (entry.kind === 'file') {
      if (rel === '' && GENERATED.some(re => re.test(entry.name))) continue
      into.push({ rel: path, abs: `${dir}/${entry.name}`, size: entry.size, mtimeMs: entry.mtimeMs })
    }
  }
}

async function digestOf(fs: Reader, file: FileEntry): Promise<string> {
  if (file.size < 0) return 'unlisted'
  const stamp = `${file.size}:${file.mtimeMs}`
  const known = digests.get(file.abs)
  if (known?.stamp === stamp) return known.hex
  let hex: string
  if (file.size > MAX_READ) hex = `large:${stamp}`
  else {
    try {
      hex = sha256(fromBase64(await fs.bytes(file.abs)))
    } catch {
      // A file held open a moment (an editor, a virus scan) is read again next time.
      return `unreadable:${stamp}`
    }
  }
  digests.set(file.abs, { stamp, hex })
  return hex
}

/**
 * SHA-256 over a package's source and asset bytes: each file's path and SHA-256, in path order.
 * The generated files at its top, frames folders, `node_modules` and `.git` are left out, as
 * the CLI leaves them out of what it reads. `dir` is the package's absolute folder.
 */
export async function fingerprint(fs: Reader, dir: string): Promise<string> {
  const files: FileEntry[] = []
  await filesOf(fs, dir, '', 0, files)
  let manifest = ''
  for (const file of files) manifest += `${file.rel}\u0000${await digestOf(fs, file)}\n`
  return sha256(new TextEncoder().encode(manifest))
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/**
 * SHA-256 (FIPS 180-4), computed in place rather than with `crypto.subtle`: the engine's digest
 * resolves off the event loop, so a scan's end could not be awaited, and under load the band and
 * its tests saw a scan half done.
 */
export function sha256(bytes: Uint8Array): string {
  const length = bytes.length
  const padded = new Uint8Array((((length + 8) >> 6) + 1) << 6)
  padded.set(bytes)
  padded[length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000))
  view.setUint32(padded.length - 4, (length << 3) >>> 0)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let at = 0; at < padded.length; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(at + i * 4)
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] ?? 0
      const b = w[i - 2] ?? 0
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)
      w[i] = (w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1
    }
    let a = h[0]!
    let b = h[1]!
    let c = h[2]!
    let d = h[3]!
    let e = h[4]!
    let f = h[5]!
    let g = h[6]!
    let hh = h[7]!
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) | 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      hh = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    h[0]! += a
    h[1]! += b
    h[2]! += c
    h[3]! += d
    h[4]! += e
    h[5]! += f
    h[6]! += g
    h[7]! += hh
  }
  let hex = ''
  for (const word of h) hex += word.toString(16).padStart(8, '0')
  return hex
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ── Records ────────────────────────────────────────────────────────────────────────────────────

/** Every package's record in one working folder, by its folder relative to it. */
export type Records = Record<string, PackageRecord>

/** The store key for a working folder: one entry per folder on this machine. */
export function storeKey(root: string): string {
  return `records:${pathKey(root)}`
}

/** Records as the store held them; anything else is no records. */
export function recordsFrom(stored: unknown): Records {
  if (!isObject(stored) || !isObject(stored.packages)) return {}
  const records: Records = {}
  for (const [dir, record] of Object.entries(stored.packages)) if (isObject(record)) records[dir] = record as PackageRecord
  return records
}

/** A record with one report folded in, at the run's time and fingerprint. */
export function withReport(record: PackageRecord, report: Report, run: Run): PackageRecord {
  switch (report.kind) {
    case 'new':
      return {}
    case 'check':
      return { ...record, check: { ...run, ok: report.ok } }
    case 'frames':
      return { ...record, frames: { ...run, dir: report.dir } }
    case 'saved':
      return { ...record, saved: { ...run, url: report.url } }
    case 'pack': {
      const { kind, target, ...pack } = report
      return { ...record, pack: { ...run, ...pack } }
    }
  }
}

/** Checked while its files are those the passing check saw; edited since check after that. */
export function statusOf(record: PackageRecord, current: string | null): PackageStatus {
  if (!record.check?.ok) return 'unchecked'
  return record.check.sha256 === current ? 'checked' : 'edited'
}
