// CSV and JSON, read into TABLES — the import half of the Data Hub
// (docs/INTERACTIVE_PLAYOUT_PLAN.md, Phase 7).
//
// It is a PARSER, not a `split(',')`, and that is the whole reason it is a file. Real exports
// from a spreadsheet carry quoted fields with commas inside them, quoted fields with NEWLINES
// inside them, and doubled quotes standing for a literal quote. A split gets every one of those
// wrong, and gets them wrong QUIETLY: a quiz bank whose questions contain commas imports as a
// table with the right number of rows and the wrong number of columns, which reads as working
// until it is on air.
//
// No dependency. RFC 4180 with the two tolerances every real file needs (CRLF or LF, and a
// trailing newline), plus separator detection, because a European spreadsheet writes semicolons
// and a user who exported one is not going to be told their file is malformed.

/** A parsed table: the header row's cells, then one array of cells per data row. */
export interface ParsedTable {
  header: string[];
  rows: string[][];
}

/** The separators worth guessing between. Tab is included because "export as TSV" is common and
 *  because a pasted spreadsheet selection is tab-separated. */
const SEPARATORS = [',', ';', '\t'] as const;

/**
 * Which separator this text uses, decided by which one yields the most CONSISTENT row width
 * over the first few lines — never by counting characters, since a comma-quoted file is full of
 * commas that are not separators. Falls back to a comma when nothing is conclusive.
 */
export function detectSeparator(text: string): string {
  let best = ',';
  let bestScore = -1;
  for (const sep of SEPARATORS) {
    const rows = parseDelimited(text, sep).slice(0, 20);
    if (rows.length === 0) continue;
    const width = rows[0].length;
    if (width < 2) continue; // one column means this separator found nothing
    const consistent = rows.filter((r) => r.length === width).length;
    // Prefer agreement first, then the wider table — a semicolon file "parses" under a comma as
    // one fat column, which agrees perfectly and must not win.
    const score = consistent * 100 + width;
    if (score > bestScore) {
      bestScore = score;
      best = sep;
    }
  }
  return best;
}

/**
 * The RFC 4180 state machine. One pass, character by character, because quoting is not a thing
 * a regex can be trusted with once a quoted field may contain the separator, the quote itself
 * and a line break.
 *
 * Tolerances, each deliberate:
 *  - CRLF and LF both end a row; a lone CR inside a quoted field is kept.
 *  - A trailing newline does not produce a phantom empty row.
 *  - An unclosed quote at end of input closes itself rather than throwing: a truncated file
 *    should import what it has and let the operator see the gap, not refuse entirely.
 */
export function parseDelimited(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  // A BOM is what a spreadsheet writes in front of a UTF-8 export; left in place it becomes
  // part of the first column's LABEL and then matches no field title.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'; // a doubled quote is one literal quote
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      // Only a field STARTING with a quote is a quoted field; a stray quote mid-value is data.
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === separator) {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRow();
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Whatever is in hand at the end is a final row — unless the file ended on its last newline,
  // in which case there is nothing in hand and a phantom row would be invented.
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * Read a CSV/TSV file into a header and rows. The first non-empty row is the header, because a
 * data table without column names cannot bind to fields — the binding is BY NAME
 * (docs/INTERACTIVE_PLAYOUT_PLAN.md D3), so an unnamed column can match nothing.
 *
 * Rows are padded and trimmed to the header's width: a short row is a legitimately empty cell,
 * and a long one carries a cell no column can hold, which is reported rather than kept.
 */
export function parseCsv(text: string, separator?: string): ParsedTable & { extraCells: number } {
  const sep = separator ?? detectSeparator(text);
  const all = parseDelimited(text, sep).filter((r) => r.some((c) => c.trim() !== ''));
  if (all.length === 0) return { header: [], rows: [], extraCells: 0 };
  const header = all[0].map((c) => c.trim());
  let extraCells = 0;
  const rows = all.slice(1).map((r) => {
    if (r.length > header.length) extraCells += r.length - header.length;
    return header.map((_, i) => (r[i] ?? '').trim());
  });
  return { header, rows, extraCells };
}

/**
 * Read JSON into the same shape. Two forms are accepted because both are what people actually
 * have: an ARRAY OF OBJECTS (the union of their keys, in first-seen order, is the header) and
 * an array of arrays (the first is the header). Anything else is refused with a reason rather
 * than coerced — a silently wrong table is worse than a rejected file.
 */
export function parseJsonTable(text: string): ParsedTable & { error: string | null } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { header: [], rows: [], error: `That is not valid JSON: ${(e as Error).message}` };
  }
  // A top-level object with exactly one array property is the common "wrapped" export shape.
  if (data && !Array.isArray(data) && typeof data === 'object') {
    const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray);
    if (arrays.length === 1) data = arrays[0];
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { header: [], rows: [], error: 'Expected a list of rows — an array of objects, or an array of arrays.' };
  }
  if (Array.isArray(data[0])) {
    const all = (data as unknown[][]).map((r) => r.map((c) => cellText(c)));
    const header = all[0].map((c) => c.trim());
    return { header, rows: all.slice(1).map((r) => header.map((_, i) => (r[i] ?? '').trim())), error: null };
  }
  if (typeof data[0] !== 'object' || data[0] === null) {
    return { header: [], rows: [], error: 'Expected a list of rows — an array of objects, or an array of arrays.' };
  }
  const header: string[] = [];
  for (const item of data as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') continue;
    for (const key of Object.keys(item)) if (!header.includes(key)) header.push(key);
  }
  const rows = (data as Record<string, unknown>[]).map((item) =>
    header.map((key) => cellText(item?.[key]).trim()),
  );
  return { header, rows, error: null };
}

/** Everything in a dataset is a STRING (the same currency as cue values and SPX fields), so a
 *  JSON number, boolean or null has to become one here rather than at every read site. A nested
 *  object keeps its JSON form: dropping it would hide data the file really contained. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

/** Read a file by its NAME, not by trusting a MIME type the browser may not have set. */
export function parseTableFile(name: string, text: string): ParsedTable & { error: string | null } {
  if (/\.json$/i.test(name)) return parseJsonTable(text);
  const parsed = parseCsv(text);
  if (parsed.header.length === 0) return { header: [], rows: [], error: 'That file has no rows.' };
  return { header: parsed.header, rows: parsed.rows, error: null };
}

/**
 * The WRITER, here beside the reader so the two cannot drift: what this emits is what
 * `parseCsv` reads back, and scripts/csv.test.mjs proves the round trip rather than trusting it.
 *
 * RFC 4180 quoting, applied only where it is needed - a cell holding the separator, a quote, or
 * a newline. Comma is the separator and CRLF the line ending, which is the pair every
 * spreadsheet on every platform opens without being asked what the file is.
 */
export function serializeCsv(header: string[], rows: string[][] = []): string {
  const cell = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const line = (cells: string[]) => cells.map(cell).join(',');
  // A trailing newline, so appending a row in a plain text editor starts on its own line.
  return [line(header), ...rows.map(line)].join('\r\n') + '\r\n';
}
