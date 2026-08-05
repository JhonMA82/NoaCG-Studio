// FIELDS.md — the DATA CONTRACT of an exported graphic, written down for the person at the
// playout desk (student-release acceptance, 2026-08-05).
//
// A playout client drives a template by FIELD ID: a CasparCG client sends {"f0": "…"} or the
// XML componentData form, and NOTHING on that screen says f0 is the title and f1 the name.
// The app is the only place that knows, so every package carries the table. This is also why
// it is its own file rather than a paragraph in a README: it is the page an operator keeps
// open beside the client while the show runs.
//
// One generator, every target (and the whole production package), so the ids a package
// documents can never disagree with the ids it ships.

import { DATA_FTYPES, type SpxField, type SpxTemplate } from '../model/types';
import { slug } from './slug';

/** Plain words for the SPX ftypes an operator actually fills in. The raw ftype rides along in
 *  the table because a client's own docs speak it. */
const TYPE_WORD: Record<string, string> = {
  textfield: 'text',
  textarea: 'text (multi-line)',
  dropdown: 'choice',
  filelist: 'image file',
  number: 'number',
  checkbox: 'on / off',
  color: 'colour',
  hidden: 'text (hidden in the operator UI)',
};

/** Markdown table cells cannot carry a pipe or a line break. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function xmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The fields an operator can actually send values to — the definition's data ftypes, in the
 *  order the template declares them (which is the order the operator page shows them in). */
export function dataFields(template: SpxTemplate): SpxField[] {
  return template.fields.filter((f) => DATA_FTYPES.includes(f.ftype));
}

/** The ID/label/type/default table. The heart of the file: everything else is context. */
export function fieldTableMd(template: SpxTemplate): string {
  const fields = dataFields(template);
  if (fields.length === 0) return '_This graphic has no data fields — it plays as it is._\n';
  const rows = fields.map((f) => {
    const type = TYPE_WORD[f.ftype] ?? f.ftype;
    const value = f.value ? `\`${cell(f.value)}\`` : '_(empty)_';
    return `| \`${f.field}\` | ${cell(f.title) || '_(untitled)_'} | ${type} | ${value} |`;
  });
  const table = ['| ID | Field | Type | Default value |', '|---|---|---|---|', ...rows].join('\n');

  // A choice field is unusable without its accepted values, and an image field's value is a
  // FILE NAME inside the package rather than free text — both are the kind of thing that costs
  // an operator a take to discover.
  const notes: string[] = [];
  for (const f of fields) {
    if (f.ftype === 'dropdown' && f.items?.length) {
      const values = f.items.map((i) => `\`${cell(i.value)}\`${i.text && i.text !== i.value ? ` (${cell(i.text)})` : ''}`);
      notes.push(`- \`${f.field}\` accepts: ${values.join(', ')}`);
    }
    if (f.ftype === 'filelist') {
      notes.push(`- \`${f.field}\` takes a file name from this package's \`images/\` folder (e.g. \`logo.png\`).`);
    }
    if (f.ftype === 'checkbox') {
      notes.push(`- \`${f.field}\` is on/off — send \`true\` or \`false\`.`);
    }
    if (f.ftype === 'hidden') {
      notes.push(`- \`${f.field}\` is hidden on the operator page but still carries a value (a duration, a setting).`);
    }
  }
  return notes.length ? `${table}\n\n${notes.join('\n')}\n` : `${table}\n`;
}

/** The two payload shapes every playout client sends, spelled out with THIS graphic's own ids
 *  and defaults — so the example can be pasted rather than adapted. */
function payloadExamplesMd(template: SpxTemplate): string {
  const fields = dataFields(template).filter((f) => f.ftype !== 'filelist').slice(0, 4);
  if (fields.length === 0) return '';
  const json = `{${fields.map((f) => `"${f.field}": "${cell(f.value) || '…'}"`).join(', ')}}`;
  const xml = [
    '<templateData>',
    ...fields.map(
      (f) => `  <componentData id="${f.field}"><data id="text" value="${xmlAttr(f.value) || '…'}" /></componentData>`,
    ),
    '</templateData>',
  ].join('\n');
  return `
## Sending values

JSON (SPX, most CasparCG clients, the bundled control panel):

    ${json}

CasparCG classic XML (\`componentData\`) — the same fields, same ids:

${xml
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n')}
`;
}

/** How many operator steps the graphic walks (SPX Continue / CasparCG `CG … NEXT`). */
function stepsLine(template: SpxTemplate): string {
  const steps = Number(template.settings.steps);
  if (!Number.isFinite(steps) || steps <= 1) return '';
  return `\nThis graphic has **${steps} steps**: after Play, each Continue (SPX) / \`CG … NEXT\` (CasparCG) reveals the next one.\n`;
}

/** Operator BUTTONS (`ftype: 'button'`) call a function in the template rather than carrying a
 *  value, so they belong beside the table, never in it. */
function buttonsMd(template: SpxTemplate): string {
  const buttons = template.fields.filter((f) => f.ftype === 'button' && f.fcall);
  if (buttons.length === 0) return '';
  return `\n## Buttons\n\nThese call the template directly instead of carrying a value:\n\n${buttons
    .map((b) => `- **${cell(b.title) || cell(b.fcall ?? '')}** — calls \`${cell(b.fcall ?? '')}()\``)
    .join('\n')}\n`;
}

/** FIELDS.md for ONE graphic. `usage` is the packaging flavour's own line about where these
 *  values get typed (a CasparCG client, an SPX rundown, the bundled panel …). */
export function fieldReferenceMd(template: SpxTemplate, usage?: string): string {
  return `# ${template.name} — data fields

Generated by NoaCG Studio. Every value this graphic can be given, with the **ID** a playout
client sends it under. \`f0\`, \`f1\`, … are those ids: they are what travels on the wire, and
the Field column is what each one means.

${fieldTableMd(template)}${stepsLine(template)}${usage ? `\n${usage}\n` : ''}${payloadExamplesMd(template)}${buttonsMd(template)}
Values are set with the template's \`update()\`; \`play()\`, \`next()\` and \`stop()\` run it.
Sending a field again while the graphic is on air updates it in place.
`;
}

/** One graphic's place in a production package. */
export interface ProductionFieldGraphic {
  template: SpxTemplate;
  /** The playout layer the package assigned it (production packages give each its own). */
  layer: number;
  /** Its file inside the package, as extracted (`hairline/hairline.html`). */
  file: string;
}

/** FIELDS.md for a WHOLE production package: the index first (which graphic is on which layer,
 *  in which file), then one table per graphic. The acceptance-round ask — "a markdown file that
 *  clearly shows all graphics and the fields and IDs they contain". */
export function showFieldReferenceMd(showName: string, graphics: ProductionFieldGraphic[], usage?: string): string {
  const index = graphics
    .map((g) => `| ${g.layer} | ${cell(g.template.name)} | \`${g.file}\` | ${dataFields(g.template).length} |`)
    .join('\n');
  const sections = graphics
    .map((g) => {
      const anchor = slug(g.template.name);
      return `## ${g.template.name}  <a id="${anchor}"></a>

Layer ${g.layer} · \`${g.file}\`

${fieldTableMd(g.template)}${stepsLine(g.template)}${payloadExamplesMd(g.template)}${buttonsMd(g.template)}`;
    })
    .join('\n---\n\n');

  return `# ${showName} — data fields

Generated by NoaCG Studio. Every graphic in this production, with the **ID** each of its values
travels under. \`f0\`, \`f1\`, … are those ids: a playout client sends \`{"f0": "…"}\` and nothing
on its screen says what \`f0\` means — this file does.

| Layer | Graphic | File | Fields |
|---|---|---|---|
${index}

Each graphic sits on its **own playout layer**, so several can be on air at once without
evicting each other.
${usage ? `\n${usage}\n` : ''}
---

${sections}`;
}
