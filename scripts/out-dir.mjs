// One answer to "where does this script write its output", for every script that takes the
// directory as a POSITIONAL argument.
//
// Twelve scripts here share the shape `const OUT = process.argv[2] || './something'` followed by
// a mkdir. That is fine until someone types a flag - `--category lower-third`, `--out shots` -
// which reads as a named argument to anyone who has used a CLI before. The script then creates a
// directory literally called `--category`, fills it, and says nothing. On 2026-08-09 that put 90
// screenshots at the repo root and a `git add -A` carried them onto `main`
// (`scripts/check-tree-shape.mjs` is the gate that now catches the landing).
//
// A flag-shaped output directory is a mistake, never a request: no path anybody wants begins with
// a dash. Refusing costs one string comparison and turns a silent mess into a usage message.

/**
 * Resolve a positional out-dir argument, refusing anything flag-shaped.
 *
 * @param {string|undefined} value    the raw argument (process.argv[2] and friends)
 * @param {string} fallback           what to use when the argument is absent
 * @param {string} usage              the one-line usage to print when refusing
 * @returns {string}                  the directory to write into
 */
export function outDir(value, fallback, usage) {
  const chosen = value || fallback;
  if (chosen.startsWith('-')) {
    console.error(`Refusing to write into "${chosen}" - it looks like a flag, and this argument is positional.`);
    if (usage) console.error(usage);
    process.exit(2);
  }
  return chosen;
}
