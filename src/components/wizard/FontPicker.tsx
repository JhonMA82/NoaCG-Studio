import { useEffect, useRef, useState } from 'react';
import {
  FONTS,
  familyFromFileName,
  fontAssetPath,
  fontFormatForExt,
  registerAndMeasureFont,
  type BundledFont,
  type CustomFont,
} from '../../model/fonts';
import { extOf, fileToDataUrl } from '../../assets/assetUtils';

/**
 * The dependable font sources, in order (docs/SAVED_CONTENT_MODEL companion — the import
 * flow's typography): 1) NoaCG's bundled OFL library, 2) an uploaded font file, 3) a font
 * installed on this computer (Chromium's Local Font Access, permission-gated). Sources 2
 * and 3 both become a `CustomFont` whose bytes ride `template.assets` — embedded in every
 * export, never dependent on the playback machine's installed fonts.
 */
interface Props {
  /** The selected bundled id, 'custom' (the uploaded font), or null = the design default. */
  value: string | null;
  customFont: CustomFont | null;
  /** null clears back to the design default; 'custom' selects the uploaded font. */
  onPick: (fontId: string | null) => void;
  /** A new uploaded/local font (also selects it). */
  onCustomFont: (font: CustomFont) => void;
  /** What "null" means where this picker sits (e.g. "Design typeface"). */
  defaultLabel?: string;
}

/** Load a bundled face into the BUILDER document so the picker and the placement canvas
 *  render true previews (templates load their own copy from fonts/<file>). */
const loaded = new Set<string>();
export function ensureAppFontFace(font: BundledFont): void {
  if (loaded.has(font.id) || typeof FontFace === 'undefined') return;
  loaded.add(font.id);
  const face = new FontFace(font.family, `url(/fonts/${font.file})`, {
    weight: `${font.weights[0]} ${font.weights[1]}`,
  });
  face
    .load()
    .then((f) => (document.fonts as unknown as { add(f: FontFace): void }).add(f))
    .catch(() => loaded.delete(font.id));
}

/** Chromium's Local Font Access API (feature-detected; absent everywhere else). */
interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  blob(): Promise<Blob>;
}
type QueryLocalFonts = () => Promise<LocalFontData[]>;

export default function FontPicker({ value, customFont, onPick, onCustomFont, defaultLabel = 'Design typeface' }: Props) {
  const [localFonts, setLocalFonts] = useState<LocalFontData[] | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busyLocal, setBusyLocal] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Pre-load the fonts for previewing in the dropdown and UI
  useEffect(() => {
    for (const f of FONTS) ensureAppFontFace(f);
  }, []);

  const canQueryLocal = typeof window !== 'undefined' && 'queryLocalFonts' in window;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const ext = extOf(file.name);
    if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) return;
    const data = await fileToDataUrl(file);
    const family = familyFromFileName(file.name);
    const tabularFigures = await registerAndMeasureFont(family, data);
    const font: CustomFont = {
      family,
      format: fontFormatForExt(ext),
      asset: { path: fontAssetPath(file.name), data },
      tabularFigures,
    };
    onCustomFont(font);
  };

  const listLocal = async () => {
    setLocalError(null);
    try {
      const list = await (window as unknown as { queryLocalFonts: QueryLocalFonts }).queryLocalFonts();
      const byFamily = new Map<string, LocalFontData>();
      for (const f of list) {
        const cur = byFamily.get(f.family);
        if (!cur || /regular/i.test(f.fullName)) byFamily.set(f.family, cur && !/regular/i.test(f.fullName) ? cur : f);
      }
      setLocalFonts([...byFamily.values()].sort((a, b) => a.family.localeCompare(b.family)));
    } catch {
      setLocalError('Local fonts are unavailable — permission was declined or this browser does not support it. Uploading the font file works everywhere.');
    }
  };

  const embedLocalFont = async (f: LocalFontData) => {
    setBusyLocal(f.family);
    try {
      const blob = await f.blob();
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
      const tabularFigures = await registerAndMeasureFont(f.family, data);
      const font: CustomFont = {
        family: f.family,
        format: 'truetype',
        asset: { path: fontAssetPath(`${f.postscriptName || f.family}.ttf`), data },
        tabularFigures,
      };
      onCustomFont(font);
    } catch {
      setLocalError(`Could not read "${f.family}" — try uploading its file instead.`);
    } finally {
      setBusyLocal(null);
    }
  };

  const currentSelection = value === null ? 'default' : value;

  return (
    <div className="font-picker" data-testid="font-picker">
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <select
          className="grow"
          value={currentSelection}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'default') onPick(null);
            else if (v === 'custom') onPick('custom');
            else if (v.startsWith('local-')) {
              const f = localFonts?.find(lf => lf.family === v.substring(6));
              if (f) void embedLocalFont(f);
            }
            else onPick(v);
          }}
          aria-label="Typeface"
          data-testid="font-select"
        >
          <option value="default">{defaultLabel}</option>
          {customFont && (
            <option value="custom">
              {customFont.family} (Your typeface)
            </option>
          )}
          <optgroup label="Bundled Typefaces">
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.family}
              </option>
            ))}
          </optgroup>
          {localFonts && localFonts.length > 0 && (
            <optgroup label="Installed on this computer">
              {localFonts.map((f) => (
                <option key={f.postscriptName} value={`local-${f.family}`} disabled={busyLocal !== null}>
                  {busyLocal === f.family ? 'Embedding…' : f.family}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        
        <input
          ref={fileInput}
          type="file"
          accept=".woff2,.woff,.ttf,.otf"
          style={{ display: 'none' }}
          onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }}
          data-testid="font-upload-input"
        />
        <button onClick={() => fileInput.current?.click()} title="Upload a font file to embed it" data-testid="font-upload">
          ⬆ Upload…
        </button>
        {canQueryLocal && !localFonts && (
          <button onClick={() => void listLocal()} title="List installed fonts">
            💻 Installed…
          </button>
        )}
      </div>

      {localError && <p className="hint" style={{ marginTop: 8 }}>{localError}</p>}
    </div>
  );
}
