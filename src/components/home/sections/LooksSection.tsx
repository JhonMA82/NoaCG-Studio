import { useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { useTemplateStore } from '../../../store/templateStore';
import {
  addLook,
  applyLookToTemplate,
  captureLookFromTemplate,
  deleteLook,
  importLook,
  type SavedLook,
} from '../../../model/packets';
import { saveBrand } from '../../../model/brand';
import { slug } from '../../../export/common';
import { IconDownload, IconPalette, IconUpload } from '../../icons';

/** The Brand looks section — moved verbatim from HomePage (step 8's split), emoji → icons. */
export default function LooksSection({ looks, onChanged, onDone }: { looks: SavedLook[]; onChanged: () => void; onDone: () => void }) {
  const template = useTemplateStore((s) => s.template);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const setActiveTab = useTemplateStore((s) => s.setActiveTab);
  const [newLookName, setNewLookName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const onImportLook = async (file: File | undefined) => {
    if (!file) return;
    const { error } = importLook(await file.text());
    setNote(error ?? '✓ Look imported.');
    onChanged();
  };

  return (
    <>
      <h2><IconPalette size={18} /> Brand looks</h2>
      <p className="hint">
        A look = colors + typeface captured as a named brand. Apply it to the graphic open in the
        editor, or use it as the default for new graphics.
      </p>
      <div className="row">
        <input
          className="grow"
          placeholder="Look name, e.g. Channel A7 red"
          value={newLookName}
          onChange={(e) => setNewLookName(e.target.value)}
        />
        <button
          className="primary"
          onClick={() => {
            addLook(newLookName || 'My look', captureLookFromTemplate(template));
            setNewLookName('');
            setNote('✓ Look saved from the graphic open in the editor.');
            onChanged();
          }}
        >
          Save current look
        </button>
        <input
          ref={importInput}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => { void onImportLook(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button onClick={() => importInput.current?.click()} title="Import a shared .look.json file">
          <IconUpload /> Import…
        </button>
      </div>
      {looks.map((look) => (
        <div className="lib-row lib-row-flat" key={look.id}>
          <span className="pk-swatches lib-row-icon" aria-hidden>
            {[look.brand.palette.accent, look.brand.palette.panel, look.brand.palette.text].map((c, i) => (
              <i key={i} style={{ background: c }} />
            ))}
          </span>
          <div className="lib-info">
            <strong>{look.name}</strong>
            <span className="muted">{look.brand.customFont?.family ?? look.brand.fontId ?? ''}</span>
          </div>
          <div className="lib-actions">
          <button
            onClick={() => {
              applyTemplate(applyLookToTemplate(template, look.brand));
              setActiveTab('css'); // land on the retinted :root vars, highlighted like any patch
              setNote(`✓ Applied "${look.name}" to the open graphic — back in the editor now.`);
              onDone();
            }}
            title="Retint the graphic open in the editor"
          >
            Apply
          </button>
          <button
            onClick={() => { saveBrand(look.brand); setNote(`✓ "${look.name}" is now the brand for new graphics.`); }}
            title="New graphics from the wizard will match this look"
          >
            Use for new
          </button>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify({ name: look.name, brand: look.brand }, null, 2)], { type: 'application/json' });
              saveAs(blob, `${slug(look.name)}.look.json`);
            }}
            title="Download as a shareable .look.json"
            aria-label={`Download ${look.name}`}
          >
            <IconDownload />
          </button>
          </div>
          <button onClick={() => { deleteLook(look.id); onChanged(); }} title="Delete this look" aria-label={`Delete ${look.name}`}>✕</button>
        </div>
      ))}
      {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'}>{note}</p>}
    </>
  );
}
