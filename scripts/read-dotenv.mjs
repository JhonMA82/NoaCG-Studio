// ONE definition of "read the checkout's .env", shared by the freshness checks and the paid
// bench runners so they can never disagree about where a key lives, or about how one parses.
//
// The freshness checks are run by hand, from a shell that has never exported anything - the
// keys they need live in `.env`, because that is where every other part of this repo keeps
// them. A check that reads only `process.env` therefore reports NOT CHECKED on a machine that
// is fully configured, which is the most misleading answer it can give: it looks like a
// missing key rather than a missing `export`.
//
// Precedence matches vite.config.ts and the bench runners: a real environment variable WINS
// over the file, so `KEY=x node scripts/…` still overrides a checkout's `.env`.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Parse an env file. Returns `{ env, path, found }` - `found` is false when the file is absent
 * or unreadable, which lets a caller warn about it without a second existence check that could
 * disagree with what was actually read.
 *
 * `file` names a DIFFERENT environment file (a staging config, or a fixture reproducing a past
 * failure); it is resolved against `root`, so an absolute path works too.
 */
export function loadEnvFile(root, file = '.env') {
  const path = resolve(root, file);
  const env = {};
  let found = true;
  try {
    // A BOM belongs to the encoding, not to the first key's name. Windows editors and
    // `Out-File -Encoding utf8` both write one, and without stripping it the FIRST line of the
    // file - and only that line - silently fails to parse, which reads as a missing key.
    const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      // A value may be quoted the way dotenv allows; the quotes are not part of the secret.
      if (match) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // Absent is a normal state, never an error: a keyed check reports its provider as
    // unchecked, and a bench runner falls back to a hand-supplied token.
    found = false;
  }
  return { env, path, found };
}

/** Just the values from `<root>/<file>`. A missing or unreadable file is simply empty. */
export function readEnvFile(root, file = '.env') {
  return loadEnvFile(root, file).env;
}

/** The ambient environment as the checks should see it: the file first, real environment last. */
export function ambientEnv(root, file = '.env') {
  return { ...readEnvFile(root, file), ...process.env };
}
