/** A NoaCG package found in the working directory or one level below it. */
export type NoacgPackage = {
  /** Its folder relative to the working directory: `.` for the working directory itself. */
  dir: string
  /** The graphic's name from its manifest, or the folder's name when the manifest has none. */
  name: string
}

declare module 'claude-code' {
  interface PluginState {
    'noacg-guide': { packages: NoacgPackage[] }
  }
}
