// Finding the NoaCG packages a session works on. Kept apart from the drawing so that, if the
// CLI later answers a `status` read, this file is what gets replaced.
//
// A package is what `noacg scaffold` writes: a folder holding `<slug>.ograf.json` whose manifest
// carries the `v_noacg` block (docs/AGENT_CLI.md, "The graphic package"). It is looked for in the
// working directory and in each folder directly below it, never deeper. Frames folders (marked
// by `.noacg-frames`, cli/src/workspace.ts), `node_modules` and dot folders are skipped. The
// hooks hand in `$.fs.list` and `$.fs.read`, called on relative paths only, so nothing outside
// the working directory is read.
import type { FsEntry } from 'claude-code'

import type { NoacgPackage } from '../types'

/** The two reads a scan makes, relative to the working directory. */
export type Folders = {
  list: (dir: string) => Promise<FsEntry[]>
  read: (file: string) => Promise<unknown>
}

const MANIFEST = /\.ograf\.json$/i
const FRAMES_MARKER = '.noacg-frames'
/** A bound on the folders looked into, so a session started in a huge folder stays cheap. */
const MAX_FOLDERS = 500

/** Manifests already read, by path, size and time: a rescan reads only what changed. */
const seen = new Map<string, { stamp: string; name: string | null }>()

async function listed(fs: Folders, dir: string): Promise<FsEntry[] | null> {
  try {
    return await fs.list(dir)
  } catch {
    return null
  }
}

/** The graphic's name when `file` is a NoaCG manifest, else null. */
async function manifestName(fs: Folders, file: string, entry: FsEntry): Promise<string | null> {
  const stamp = `${entry.size}:${entry.mtimeMs}`
  const known = seen.get(file)
  if (known?.stamp === stamp) return known.name
  let name: string | null = null
  try {
    const manifest: unknown = JSON.parse(String(await fs.read(file)))
    if (isObject(manifest) && isObject(manifest.v_noacg)) {
      name = typeof manifest.name === 'string' ? manifest.name.trim() : ''
    }
  } catch {
    name = null
  }
  seen.set(file, { stamp, name })
  return name
}

async function packageIn(fs: Folders, dir: string, entries: FsEntry[]): Promise<NoacgPackage | null> {
  if (entries.some(e => e.kind === 'file' && e.name === FRAMES_MARKER)) return null
  for (const entry of entries) {
    if (entry.kind !== 'file' || !MANIFEST.test(entry.name)) continue
    const file = dir === '.' ? entry.name : `${dir}/${entry.name}`
    const name = await manifestName(fs, file, entry)
    if (name !== null) return { dir, name: name || folderName(dir) }
  }
  return null
}

/** Every package in the working directory and one level below, sorted by name. */
export async function findPackages(fs: Folders): Promise<NoacgPackage[]> {
  const top = await listed(fs, '.')
  if (top === null) return []
  const found: NoacgPackage[] = []
  const here = await packageIn(fs, '.', top)
  if (here) found.push(here)
  const folders = top
    .filter(e => e.kind === 'dir' && e.name !== 'node_modules' && !e.name.startsWith('.'))
    .slice(0, MAX_FOLDERS)
  for (const folder of folders) {
    const entries = await listed(fs, folder.name)
    const one = entries && (await packageIn(fs, folder.name, entries))
    if (one) found.push(one)
  }
  return found.sort((a, b) => a.name.localeCompare(b.name) || a.dir.localeCompare(b.dir))
}

export function samePackages(a: readonly NoacgPackage[], b: readonly NoacgPackage[]): boolean {
  return a.length === b.length && a.every((p, i) => p.dir === b[i]?.dir && p.name === b[i]?.name)
}

function folderName(dir: string): string {
  return dir === '.' ? 'This folder' : dir
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
