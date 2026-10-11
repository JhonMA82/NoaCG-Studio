// What the published CLI 0.10.1 prints, copied from real runs on 2026-10-11 (a scaffolded lower
// third in a scratch folder: `validate` passing and failing, with and without `--screenshots`,
// `--json`, `screenshot`, `pack --out`, `save` without a key, and the same verbs through the
// `noacg mcp` tool). Only the folder names change; `save`'s success line and `pack --save`'s are
// cli/src/commands/save.ts's and pack.ts's, which this machine could not send without writing to
// a real library.

/** A file in a folder, with the folder's own separator. */
function inside(dir: string, file: string): string {
  return `${dir}${dir.includes('\\') ? '\\' : '/'}${file}`
}

const READINESS = [
  '',
  'Readiness: Operator fields reach the graphic PASS · Plays, comes off air, and replays cleanly PASS · Nothing collides or escapes the frame PASS · Reads where it will be watched WARN · Survives text twice as long PASS · Motion is editable on the timeline PASS · Exports plug-and-play PASS',
  'Engines:   Needs a browser engine of Chromium 111 or newer — CasparCG 2.3.x, OBS Studio 30.x, vMix 27+ will not render it as designed.',
]

/** `validate`'s report on a package that passes. */
export function passed(): string[] {
  return [
    'OK - 0 error(s), 1 warning(s)',
    '- WARN legibility-secondary-size: Supporting text ("Anchor · Evening News") is 22px - a little under the ~24px we prefer for TV viewing distance. Readable, but 24px+ reads more comfortably.',
    ...READINESS,
  ]
}

/** `validate`'s report on a package with errors. */
export function failed(): string[] {
  return [
    'FAIL - 2 error(s), 1 warning(s)',
    "- ERROR syntax: JavaScript syntax error: Unexpected token '}'",
    '- ERROR bench-runtime: Runtime error during load: Uncaught SyntaxError: Unexpected end of input',
    '- WARN field-mapping: Field "f0" (Name) has no matching element id in the HTML.',
    ...READINESS,
  ]
}

/** `noacg validate <dir>` in a terminal, passing or failing, with frames written to `shots` when given. */
export function validate(dir: string, ok: boolean, shots?: string): string {
  const frames = shots ? [`Screenshots: ${['off', 'onair', 'stress'].map(f => inside(shots, `${f}.png`)).join(', ')}`] : []
  return [...(ok ? passed() : failed()), ...frames, `Regenerated the package in ${dir}.`].join('\n')
}

/** The same report when the package's generated half was stale. */
export function validateStale(dir: string, ok: boolean): string {
  return [...(ok ? passed() : failed()), `Regenerated the package in ${dir} (the generated half was stale - written from other sources than the ones on disk).`].join('\n')
}

/** `validate --screenshots` whose frames stopped part way: the validation passed, the run exits 2. */
export function shotsStopped(dir: string, shots: string): string {
  return [...passed(), `Screenshots: ${inside(shots, 'off.png')}`, 'Screenshots stopped part way: the page crashed. Not shot: onair, stress', `Regenerated the package in ${dir}.`].join('\n')
}

/** `validate --json` with the log lines on stderr dropped: the one JSON object alone. */
export function validateJson(ok: boolean): string {
  return JSON.stringify({ kind: 'noacg', ok, validation: { ok, merged: { errors: [], warnings: [] } }, normalize: {}, stale: false, regenerated: true, sourceChanges: [] }, null, 2)
}

/** `noacg screenshot <dir> --out <file>`. */
export function screenshot(file: string): string {
  return `Wrote ${file} (onair, 1920x1080, transparent).`
}

/** `noacg save <dir>` that went through. */
export function saved(name: string, url: string): string {
  return [...passed(), `Saved "${name}" to your NoaCG library -> ${url}`, 'It is in Home → Graphics the next time the studio opens (or at once on that link); add it to a production from there.'].join('\n')
}

/** `noacg save` refused for errors. */
export function saveRefused(): string {
  return [...failed(), 'Not saved - the graphic has 2 error(s). Fix them (`noacg validate`) and save again.'].join('\n')
}

export const NOT_LOGGED_IN =
  'Not logged in to https://noacg.studio - run `noacg login` first (or set NOACG_AGENT_KEY). No account? Zip the package and use the studio\'s Import door.'

/** `noacg pack ... --out <file>`. */
export function packWritten(file: string, graphics: number): string {
  return `Wrote ${file} with ${graphics} graphic(s) - import it on the studio's Home → Productions → Import a package.`
}

/** `noacg pack ... --save`. */
export function packSent(name: string, graphics: number, url: string): string {
  return `Sent "${name}" (${graphics} graphic(s)) to your NoaCG Home -> ${url}\nIt is waiting on Home → Productions: press Install and the production opens with its rundown.`
}

/** The MCP tool's answer to `validate`: the report, frames as labelled images, then the regeneration. */
export function mcpValidate(dir: string, ok: boolean, frames = false): (string | { image: true })[] {
  const shots = frames ? ['off:', { image: true as const }, 'onair:', { image: true as const }, 'stress:', { image: true as const }] : []
  return [(ok ? passed() : failed()).join('\n'), ...shots, `Regenerated the package in ${dir}.`]
}

/** The MCP tool's answer to `save` that went through. */
export function mcpSaved(name: string, url: string): string[] {
  return [`${passed().join('\n')}\n\nSaved "${name}" to the NoaCG library -> ${url}`]
}
