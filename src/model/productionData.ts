// PRODUCTION DATA - the production-scoped tree of live values its graphics read from
// (docs/PRODUCTION_DATA_PLAN.md). This module is the whole semantic contract, and it is PURE:
// it imports nothing, touches no DOM and no storage, so `scripts/production-data.test.mjs` can
// transpile this one file and assert the merge/resolve/diff rules directly - and so a future
// server-side ingress can compile the same source rather than growing a second opinion.
//
// The three rules that matter, all enforced here rather than remembered by callers:
//
// 1. A WRITE IS ABSOLUTE STATE, never intent. `mergePatch` is RFC 7386 JSON Merge Patch:
//    objects merge, `null` deletes a key, arrays replace wholesale. Nothing in this file can
//    express "+1", so a retried write cannot corrupt a value - an operator's +1 button reads
//    the current value and writes the result.
// 2. A BINDING RESOLVES TO ORDINARY FIELD VALUES. `resolveBindings` turns paths into the same
//    `{ fN: "4" }` shape every operator surface already sends, so the template stays a plain
//    field-driven SPX graphic and an export keeps working with no feed at all.
// 3. A MISSING PATH WRITES NOTHING. Blanking a live scorebug because a feed dropped a key is
//    worse than showing the last good value - freeze is not-writing (docs/CLOUD_PLAYOUT.md §7).

/** JSON, the whole value space. No schema, no declared types - see the plan's §2.2. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** graphic name -> field id (`f1`) -> production-data path (`match.home.score`). */
export type ProductionBindings = Record<string, Record<string, string>>;

/** What one graphic should be showing: field id -> the string its field takes. */
export type ResolvedValues = Record<string, Record<string, string>>;

/** A bindable leaf of the tree - what the binding picker offers. */
export interface DataLeaf {
  path: string;
  value: JsonValue;
  /** The string this leaf would write into a field (never null - unformattable leaves are
   *  not leaves; see `isLeafValue`). */
  text: string;
}

// ── Paths ───────────────────────────────────────────────────────────────────
// One grammar: dot segments, numeric segments indexing arrays. `match.home.score`,
// `drivers.0.gap`. Deliberately no bracket alternative - two spellings of one path is two
// things to keep in step in the UI, the tests and (later) the SQL.

/** Split a path, or null when it is malformed (empty, or carrying an empty segment). */
export function parsePath(path: string): string[] | null {
  if (typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (trimmed === '') return null;
  const parts = trimmed.split('.');
  if (parts.some((p) => p.trim() === '')) return null;
  return parts.map((p) => p.trim());
}

const isIndex = (segment: string): boolean => /^\d+$/.test(segment);

const isPlainObject = (v: unknown): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The value at a path, or undefined when any step of the walk is missing. */
export function getPath(data: JsonValue | undefined, path: string): JsonValue | undefined {
  const parts = parsePath(path);
  if (!parts) return undefined;
  let cursor: JsonValue | undefined = data;
  for (const part of parts) {
    if (Array.isArray(cursor)) {
      if (!isIndex(part)) return undefined;
      cursor = cursor[Number(part)];
    } else if (isPlainObject(cursor)) {
      cursor = cursor[part];
    } else {
      return undefined;
    }
    if (cursor === undefined) return undefined;
  }
  return cursor;
}

/**
 * Set a path IMMUTABLY, creating the missing objects on the way down.
 *
 * This is the surface an editor uses (typing into one row of the playground). It exists beside
 * `mergePatch` rather than being expressed through it because merge-patch cannot address an
 * ARRAY ELEMENT at all - `{"drivers":{"0":...}}` would replace the array with an object. A
 * numeric segment against an existing array therefore edits that array in place here, which is
 * the behaviour a row editor has to have. On the wire the same edit costs a whole-array patch;
 * that limit is inherent to RFC 7386 and is recorded in the plan rather than worked around.
 */
export function setPath(data: JsonObject, path: string, value: JsonValue): JsonObject {
  const parts = parsePath(path);
  if (!parts) return data;

  const write = (node: JsonValue | undefined, depth: number): JsonValue => {
    const part = parts[depth];
    const last = depth === parts.length - 1;
    if (Array.isArray(node) && isIndex(part)) {
      const next = node.slice();
      next[Number(part)] = last ? value : write(next[Number(part)], depth + 1);
      return next;
    }
    const base: JsonObject = isPlainObject(node) ? { ...node } : {};
    base[part] = last ? value : write(base[part], depth + 1);
    return base;
  };

  const result = write(data, 0);
  return isPlainObject(result) ? result : data;
}

/** Remove a path IMMUTABLY. A path that is not there leaves the tree untouched. */
export function deletePath(data: JsonObject, path: string): JsonObject {
  const parts = parsePath(path);
  if (!parts) return data;

  const drop = (node: JsonValue | undefined, depth: number): JsonValue | undefined => {
    const part = parts[depth];
    const last = depth === parts.length - 1;
    if (Array.isArray(node) && isIndex(part)) {
      const index = Number(part);
      if (index >= node.length) return node;
      const next = node.slice();
      if (last) next.splice(index, 1);
      else {
        const child = drop(next[index], depth + 1);
        if (child === undefined) return node;
        next[index] = child;
      }
      return next;
    }
    if (!isPlainObject(node) || !(part in node)) return node;
    const next: JsonObject = { ...node };
    if (last) {
      delete next[part];
      return next;
    }
    const child = drop(next[part], depth + 1);
    if (child === undefined) return node;
    next[part] = child;
    return next;
  };

  const result = drop(data, 0);
  return isPlainObject(result) ? result : data;
}

/** The merge patch that writes one path - what a path edit becomes ON THE WIRE.
 *  Returns null for a path carrying an array index, which merge-patch cannot express. */
export function patchForPath(path: string, value: JsonValue): JsonObject | null {
  const parts = parsePath(path);
  if (!parts || parts.some(isIndex)) return null;
  let node: JsonValue = value;
  for (let i = parts.length - 1; i >= 0; i -= 1) node = { [parts[i]]: node };
  return node as JsonObject;
}

// ── The write model ─────────────────────────────────────────────────────────

/**
 * RFC 7386 JSON Merge Patch, applied immutably.
 *
 * - a patch that is not an object REPLACES the target (that is what makes arrays replace
 *   wholesale, which is the RFC's own answer and the one this project wants: no invented
 *   array-element semantics)
 * - a `null` VALUE deletes its key
 * - everything else merges recursively
 *
 * The plpgsql twin planned for the hosted path (docs/PRODUCTION_DATA_PLAN.md §4) must satisfy
 * the same cases; `scripts/production-data.test.mjs` holds the shared conformance table so the
 * two cannot drift silently.
 */
export function mergePatch(target: JsonValue | undefined, patch: JsonValue): JsonValue {
  if (!isPlainObject(patch)) return patch;
  const base: JsonObject = isPlainObject(target) ? { ...target } : {};
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value === null) delete base[key];
    else base[key] = mergePatch(base[key], value);
  }
  return base;
}

/** `mergePatch` at the tree's root, where the result is always an object. */
export function applyPatch(data: JsonObject, patch: JsonObject): JsonObject {
  const merged = mergePatch(data, patch);
  return isPlainObject(merged) ? merged : {};
}

// ── The binding boundary ────────────────────────────────────────────────────

/** True for the values a field can actually take: a scalar, or an array of scalars. */
function isLeafValue(v: JsonValue | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0 && v.every((e) => typeof e === 'string' || typeof e === 'number' || typeof e === 'boolean');
  return typeof v !== 'object';
}

/**
 * The string a value writes into an SPX field, or null when it writes NOTHING.
 *
 * Numbers and booleans stringify plainly - thousands separators, decimals and numerals are the
 * template's business, where that formatting already lives, and a second opinion here would
 * fight it. An array of scalars joins with newlines, which is exactly what a `lines`/textarea
 * field is (a ticker binds to `headlines`). Objects and arrays of objects are not values a
 * field can hold: bind a deeper path.
 */
export function formatValue(v: JsonValue | undefined): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (Array.isArray(v)) return isLeafValue(v) ? v.map((e) => String(e)).join('\n') : null;
  return null;
}

/** Every bindable leaf, depth-first, in tree order - the binding picker's list. */
export function flattenLeaves(data: JsonValue | undefined, prefix = ''): DataLeaf[] {
  const out: DataLeaf[] = [];
  const walk = (node: JsonValue | undefined, path: string): void => {
    if (isLeafValue(node)) {
      const text = formatValue(node);
      if (text !== null && path !== '') out.push({ path, value: node as JsonValue, text });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, path === '' ? String(i) : `${path}.${i}`));
      return;
    }
    if (isPlainObject(node)) {
      for (const key of Object.keys(node)) walk(node[key], path === '' ? key : `${path}.${key}`);
    }
  };
  walk(data, prefix);
  return out;
}

/**
 * Resolve every binding against the current tree.
 *
 * A path that is missing, or holds something a field cannot take, contributes NOTHING - the
 * field keeps whatever it last had. That is rule 3 at the top of this file, and it is why the
 * return type carries no "cleared" notion at all: there is nowhere to express one.
 */
export function resolveBindings(data: JsonObject, bindings: ProductionBindings | undefined): ResolvedValues {
  const out: ResolvedValues = {};
  if (!bindings) return out;
  for (const graphic of Object.keys(bindings)) {
    const fields = bindings[graphic];
    if (!fields) continue;
    const values: Record<string, string> = {};
    for (const fieldId of Object.keys(fields)) {
      const text = formatValue(getPath(data, fields[fieldId]));
      if (text !== null) values[fieldId] = text;
    }
    if (Object.keys(values).length > 0) out[graphic] = values;
  }
  return out;
}

/**
 * What actually has to go on the wire: only the fields whose STRING changed, only on the
 * graphics that carry them.
 *
 * This is not an optimisation. The command log caps a production at 50 commands per 5 seconds
 * (migration 0008), and every row is also a Realtime fan-out to the renderer and every open
 * operator page - so a tree with one moving value must cost one row, not one per bound graphic
 * per tick. A value that DISAPPEARED is absent from the result for the same reason it is absent
 * from `resolveBindings`: nothing is written, so nothing goes blank.
 */
export function diffResolved(previous: ResolvedValues, next: ResolvedValues): ResolvedValues {
  const out: ResolvedValues = {};
  for (const graphic of Object.keys(next)) {
    const before = previous[graphic] ?? {};
    const after = next[graphic];
    const changed: Record<string, string> = {};
    for (const fieldId of Object.keys(after)) {
      if (before[fieldId] !== after[fieldId]) changed[fieldId] = after[fieldId];
    }
    if (Object.keys(changed).length > 0) out[graphic] = changed;
  }
  return out;
}

// ── Authoring helpers ───────────────────────────────────────────────────────

/** Compare like an operator reads: case, spaces and punctuation are not the difference. */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The path a field TITLE probably means, or null.
 *
 * Matches the last segment of a leaf path, or the whole path with its dots ignored, so
 * "Score A" finds `match.home.scoreA` and "match.clock" finds itself. TWO matches return null
 * and bind nothing: this is the API's `ambiguous` doctrine (docs/DATA_API.md) - a guess that is
 * wrong half the time is worse than an empty row the operator fills in once.
 */
export function suggestPath(title: string, leaves: DataLeaf[]): string | null {
  const want = normalize(title);
  if (want === '') return null;
  const hits: string[] = [];
  for (const leaf of leaves) {
    const parts = leaf.path.split('.');
    const last = normalize(parts[parts.length - 1]);
    if (last === want || normalize(leaf.path) === want) hits.push(leaf.path);
  }
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Read one typed literal the way the playground's value box means it: `4` is a number, `true`
 * a boolean, `[1,2]` / `{"a":1}` real JSON, and anything else the text itself. A quoted string
 * is how an operator says "the TEXT four", which is why `"4"` survives as a string.
 */
export function parseLiteral(text: string): JsonValue {
  const t = text.trim();
  if (t === '') return '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return Number(t);
  if (t.startsWith('[') || t.startsWith('{') || (t.startsWith('"') && t.endsWith('"'))) {
    try {
      return JSON.parse(t) as JsonValue;
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * Read an edited value back IN THE TYPE IT ALREADY HAD.
 *
 * `parseLiteral` alone is not enough for a LIST: an array of scalars renders as newline-joined
 * text (that is what a `lines` field takes), so typing in that box would otherwise turn
 * `["a","b"]` into the single string `"a\nb"` — the graphic would look identical while the type
 * changed underneath every future consumer. A value that WAS a list stays a list, split back on
 * its newlines, each element read the same way any other value is.
 */
export function reparseLeaf(previous: JsonValue | undefined, text: string): JsonValue {
  if (Array.isArray(previous) && isLeafValue(previous)) {
    return text === '' ? [] : text.split('\n').map((line) => parseLiteral(line));
  }
  return parseLiteral(text);
}

/** Parse a whole tree from the raw JSON view. Anything that is not an object is refused. */
export function parseDataTree(text: string): { data: JsonObject | null; error: string | null } {
  const t = text.trim();
  if (t === '') return { data: {}, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
  if (!isPlainObject(parsed)) return { data: null, error: 'Production data must be a JSON object at the top level.' };
  return { data: parsed, error: null };
}
