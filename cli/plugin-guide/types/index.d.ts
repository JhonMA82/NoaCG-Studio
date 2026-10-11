/** Where a package stands: its last passing check against its files as they are now. */
export type PackageStatus = 'checked' | 'edited' | 'unchecked'

/** One run the mod saw, tied to the package's files as the run left them. */
export type Run = {
  /** When the run finished, milliseconds since the epoch. */
  at: number
  /** SHA-256 over the package's source and asset bytes after the run (hooks/watch.ts). */
  sha256: string
  /** `terminal` for `noacg ...` or `npx @noacg/cli ...`, `mcp` for the `noacg` MCP tool. */
  via: 'terminal' | 'mcp'
}

/** What `noacg` runs reported for one package, the newest of each kind. */
export type PackageRecord = {
  /** The last `validate` or `save` whose outcome was known: `ok` only when validation passed and the run exited 0. */
  check?: Run & { ok: boolean }
  /** The last frames written or shown: `dir` the absolute folder, null when they came back as images in the conversation. */
  frames?: Run & { dir: string | null }
  /** The last `save` to the NoaCG library, with the link it returned. */
  saved?: Run & { url: string }
  /** The last `pack` this package went into: sent to NoaCG Home (`url`) or written to a file (`file`). */
  pack?: Run & { name: string; url?: string; file?: string }
}

/** A NoaCG package found in the working directory or one level below it. */
export type NoacgPackage = {
  /** Its folder relative to the working directory: `.` for the working directory itself. */
  dir: string
  /** The graphic's name from its manifest, or the folder's name when the manifest has none. */
  name: string
  /** Checked, edited since check, or not checked. */
  status: PackageStatus
  /** What the runs reported; empty when no run touched it. */
  record: PackageRecord
  /** What to ask for next (hooks/steps.ts), or null once its files as they are now are saved, sent or packed. */
  next: NextStep | null
}

/** One next step for a package, in plain words. */
export type NextStep = {
  /** How soon it needs attention, lowest first: a failed check, edited since check, not checked, no frames, ready, saved and edited since. */
  rank: number
  /** What the band shows. */
  label: string
  /** What "Fill prompt" puts in the prompt box for the person to send. */
  request: string
  /** Set when the package was saved and its files changed since: saving again adds a second library copy. */
  warning?: string
}

declare module 'claude-code' {
  interface PluginState {
    'noacg-guide': {
      packages: NoacgPackage[]
      /** The band is hidden until `/noacg-guide` or the next `noacg` run. */
      hidden: boolean
      /** `/noacg-guide` ran: with no package here, the band offers to start one. */
      offer: boolean
    }
  }
}
