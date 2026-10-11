// Finding the NoaCG packages a session works on. Kept apart from the drawing; what the runs
// reported about them is hooks/watch.ts's.
//
// A package is what `noacg scaffold` writes: a folder holding `<slug>.ograf.json` whose manifest
// carries the `v_noacg` block (docs/AGENT_CLI.md, "The graphic package"). It is looked for in the
// working directory and in each folder directly below it, never deeper. Frames folders (marked
// by `.noacg-frames`, cli/src/workspace.ts), `node_modules` and dot folders are skipped. The
// hooks hand in `$.fs.list` and `$.fs.read` on paths relative to the session's project root,
// which they anchor there, so nothing outside it is read.
import type { FsEntry } from 'claude-code'

/** A package as found: its folder relative to the working directory and its name. */
export type Found = { dir: string; name: string }

/** The two reads a scan makes, relative to the working directory. */
export type Folders = {
  list: (dir: string) => Promise<FsEntry[]>
  read: (file: string) => Promise<unknown>
}

const MANIFEST = /\.ograf\.json$/i
/** The file that marks a folder as frames the CLI wrote (cli/src/workspace.ts). */
export const FRAMES_MARKER = '.noacg-frames'
/** A bound on the folders looked into, by name, so a session started in a huge folder stays cheap. */
const MAX_FOLDERS = 500
/** Folders listed at once. */
const BATCH = 16

type Manifests = Map<string, { stamp: string; name: string | null }>

/** The manifests the last scan met, by path, size and time: a rescan reads only what changed. */
let seen: Manifests = new Map()

async function listed(fs: Folders, dir: string): Promise<FsEntry[] | null> {
  try {
    return await fs.list(dir)
  } catch {
    return null
  }
}

/** The graphic's name when `file` is a NoaCG manifest ('' when it names none), else null. */
async function manifestName(fs: Folders, file: string, entry: FsEntry, met: Manifests): Promise<string | null> {
  const stamp = `${entry.size}:${entry.mtimeMs}`
  const known = seen.get(file)
  const name = known?.stamp === stamp ? known.name : await readName(fs, file)
  met.set(file, { stamp, name })
  return name
}

async function readName(fs: Folders, file: string): Promise<string | null> {
  try {
    const manifest: unknown = JSON.parse(String(await fs.read(file)))
    if (!isObject(manifest) || !isObject(manifest.v_noacg)) return null
    return typeof manifest.name === 'string' ? oneLine(manifest.name) : ''
  } catch {
    return null
  }
}

async function packageIn(fs: Folders, dir: string, entries: FsEntry[], met: Manifests): Promise<Found | null> {
  if (entries.some(e => e.kind === 'file' && e.name === FRAMES_MARKER)) return null
  for (const entry of entries) {
    if (entry.kind !== 'file' || !MANIFEST.test(entry.name)) continue
    const file = dir === '.' ? entry.name : `${dir}/${entry.name}`
    const name = await manifestName(fs, file, entry, met)
    if (name !== null) return { dir, name: name || (dir === '.' ? 'This folder' : dir) }
  }
  return null
}

/** Every package in the working directory and one level below, sorted by name. */
export async function findPackages(fs: Folders): Promise<Found[]> {
  const top = await listed(fs, '.')
  if (top === null) return []
  const met: Manifests = new Map()
  const here = await packageIn(fs, '.', top, met)
  const found: Found[] = here ? [here] : []
  const folders = top
    .filter(e => e.kind === 'dir' && e.name !== 'node_modules' && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort()
    .slice(0, MAX_FOLDERS)
  for (let at = 0; at < folders.length; at += BATCH) {
    const batch = await Promise.all(
      folders.slice(at, at + BATCH).map(async dir => {
        const entries = await listed(fs, dir)
        return entries && packageIn(fs, dir, entries, met)
      }),
    )
    for (const one of batch) if (one) found.push(one)
  }
  seen = met
  return found.sort((a, b) => a.name.localeCompare(b.name) || a.dir.localeCompare(b.dir))
}

/** A name as one line of plain text: control characters and runs of white space become a space. */
function oneLine(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim()
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
