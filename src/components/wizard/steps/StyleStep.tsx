import { useState } from 'react';
import { FONTS, registerAppFont } from '../../../model/fonts';
import { PALETTES, paletteById, type Palette, type TemplateVariant, type Zone9 } from '../../../model/wizard';
import { contrastRatio, listCssVariables, parseCssColor } from '../../../blocks/cssVars';
import FontPicker from '../FontPicker';
import StyleControls from '../../style/StyleControls';
import ColorField from '../../style/ColorField';
import { PALETTE_VARS, SIZE_STEPS, TYPE_SIZE_STEPS } from '../../../model/styleVocabulary';
import type { DraftPatch, WizardDraft } from '../draft';

interface Props {
  variant: TemplateVariant;
  draft: WizardDraft;
  onDraft: (patch: DraftPatch) => void;
  /** The BUILT preview template's CSS - the source the "Fine-tune this design" rows
   *  enumerate (every `:root` variable the design declares, beyond the palette's four). */
  builtCss: string | null;
}


/** #rrggbb for the native color input; rgba()/other values fall back to a neutral swatch.
 *  Shared with the AI step's brand-colour rows (steps/ai/MoreControlPanel) — one conversion,
 *  so a colour swatch means the same thing wherever the user picks one. */
export function pickerHex(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const m = value.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return '#888888';
  const h = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

const CUSTOM_KEYS: { key: 'accent' | 'text' | 'textDim' | 'panel'; label: string; hint: string }[] = [
  { key: 'accent', label: 'Accent', hint: 'the one highlight color' },
  { key: 'text', label: 'Text', hint: 'primary text' },
  { key: 'textDim', label: 'Text dim', hint: 'secondary line' },
  { key: 'panel', label: 'Panel', hint: 'box background — rgba() works' },
];

const ZONES: Zone9[] = [
  'top-left', 'top-center', 'top-right',
  'mid-left', 'mid-center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

// Both ladders come from the ONE declaration in model/styleVocabulary.ts - the wizard and
// the editor used to state them separately and disagree, so a graphic sized L here read as
// something else the moment the Style panel was opened.
const SIZES = SIZE_STEPS.map((s) => ({ label: s.l, scale: s.s }));
const TYPE_SIZES = TYPE_SIZE_STEPS.map((s) => ({ label: s.l, scale: s.s }));

/** What the collapsed "Size & position" disclosure says it is holding. Empty while everything
 *  sits at the design's own defaults — a summary that reads "Default" on a first visit is
 *  noise, and the one that matters is the one naming a choice you can no longer see. */
function placementSummaryOf(draft: WizardDraft): string {
  const parts: string[] = [];
  const size = SIZES.find((s) => s.scale === draft.sizeScale);
  if (draft.sizeScale !== 1 && size) parts.push(`size ${size.label}`);
  const type = TYPE_SIZES.find((s) => s.scale === draft.typeScale);
  if (draft.typeScale !== 1 && type) parts.push(`text ${type.label}`);
  if (draft.zone) parts.push(draft.zone.replace('-', ' '));
  if (draft.nudge.x !== 0 || draft.nudge.y !== 0) parts.push('nudged');
  return parts.join(' · ');
}

/** Step 4 — colors, font, size, and position. */
export default function StyleStep({ variant, draft, onDraft, builtCss }: Props) {
  // Everything ELSE the design declares in its :root - its other colours, and its shape
  // (radius, blur, accent weight, tracking, weights, the kicker typeface) - editable right
  // here, so nothing about a design's look needs the editor (docs/GOALS.md "Student release"
  // step 5). Read from the BUILT css, which already carries the draft's overrides, so the rows
  // always show what the preview shows. The size knobs and the heading typeface have their own
  // sections below and are filtered out by StyleControls.
  // The FULL list goes to StyleControls, not a pre-filtered one: it hides the palette four
  // via `exclude`, but it still has to SEE them to resolve a token that FOLLOWS one. Three
  // families set `--accent-ink: var(--panel-bg)`, and a row reading "var(--panel-bg)" tells a
  // designer nothing about what colour that actually is.
  const allVars = builtCss ? listCssVariables(builtCss) : [];
  const designVars = allVars.filter((v) => !PALETTE_VARS.has(v.name));
  const overrideVar = (name: string, value: string) =>
    onDraft({ cssVarOverrides: { ...draft.cssVarOverrides, [name]: value } });
  const clearOverride = (name: string) => {
    const next = { ...draft.cssVarOverrides };
    delete next[name];
    onDraft({ cssVarOverrides: next });
  };
  const placementSummary = placementSummaryOf(draft);
  // Open on arrival only if something in there is already off-default — which is how Back
  // returns a user to the nudge they set. Controlled with onToggle rather than a bare `open`
  // prop: this component re-renders on every draft change, so an uncontrolled `open` would
  // spring the disclosure back open under a user who had just shut it.
  const [placementTouched, setPlacementTouched] = useState(() => placementSummaryOf(draft) !== '');
  // The variant's own style family first, then the rest.
  const palettes = [...PALETTES].sort(
    (a, b) => Number(b.styleTags.includes(variant.styleTag)) - Number(a.styleTags.includes(variant.styleTag)),
  );
  const custom = draft.customPalette;
  const activePalette = custom ? 'custom' : draft.paletteId ?? variant.defaultPalette.id;
  const activeFont = draft.fontId ?? variant.defaultFontId;
  const activeZone = draft.zone ?? variant.defaultZone;

  /** Rename the imported font (updates the generated @font-face family). */
  const renameCustomFont = (family: string) => {
    if (!draft.customFont) return;
    if (typeof draft.customFont.asset.data === 'string') registerAppFont(family, draft.customFont.asset.data);
    onDraft({ customFont: { ...draft.customFont, family } });
  };

  /** Start customizing from whatever palette is currently active. */
  const startCustom = () => {
    const base = draft.paletteId ? paletteById(draft.paletteId) : variant.defaultPalette;
    onDraft({ customPalette: { ...base, id: 'custom', name: 'Custom' }, paletteId: null });
  };

  const setCustom = (key: (typeof CUSTOM_KEYS)[number]['key'], value: string) => {
    if (!custom) return;
    onDraft({ customPalette: { ...custom, [key]: value } as Palette });
  };

  /** The advisory contrast line for a text role against the panel behind it. A NUMBER, never
   *  a verdict: transparency, the video underneath, type size and key-and-fill output all
   *  decide readability, and none of them is visible to this arithmetic. */
  const customAdvisory = (
    key: (typeof CUSTOM_KEYS)[number]['key'],
  ): { text: string; title: string } | undefined => {
    if (!custom || (key !== 'text' && key !== 'textDim')) return undefined;
    const fg = parseCssColor(custom[key]);
    const bg = parseCssColor(custom.panel);
    if (!fg || !bg) return undefined;
    return {
      text: `${contrastRatio(fg, bg)}:1`,
      title:
        'Estimated contrast against the panel. A guide, not a readability verdict — ' +
        'transparency, the moving video behind the graphic, text shadows, type size and ' +
        'key-and-fill output all change what a viewer can actually read.',
    };
  };

  return (
    <div>
      <div className="panel-section">
        <h3>Palette <span className="muted">(one accent + neutrals — retint anytime via the CSS variables)</span></h3>
        <div className="wz-palettes">
          {palettes.map((p) => (
            <button
              key={p.id}
              className={`wz-palette ${activePalette === p.id ? 'selected' : ''}`}
              onClick={() => onDraft({ paletteId: p.id, customPalette: null })}
              title={p.name}
            >
              <span className="wz-swatch" style={{ background: p.panel }}>
                <span className="wz-swatch-accent" style={{ background: p.accent }} />
              </span>
              <span className="wz-palette-name">{p.name}</span>
            </button>
          ))}
          <button
            className={`wz-palette ${activePalette === 'custom' ? 'selected' : ''}`}
            onClick={startCustom}
            title="Your own colors"
            data-palette="custom"
          >
            <span className="wz-swatch wz-swatch-custom">
              <span className="wz-swatch-accent" style={{ background: custom?.accent ?? '#e8c547' }} />
            </span>
            <span className="wz-palette-name">Custom</span>
          </button>
        </div>

        {custom && (
          <div className="wz-custom-colors">
            {/* The shared control, so a panel keeps its transparency: a native colour input
                has no alpha, and `--panel-bg` is an rgba() in nearly every design we ship. */}
            {CUSTOM_KEYS.map(({ key, label, hint }) => (
              <ColorField
                key={key}
                label={label}
                hint={hint}
                value={custom[key]}
                advisory={customAdvisory(key)}
                onChange={(next) => setCustom(key, next)}
              />
            ))}
          </div>
        )}

        {/* Everything else the design declares - its other colours AND its shape: corner
            radius, backdrop blur, accent thickness, the trackings, the kicker typeface. The
            same controls the editor's Style panel renders, so nothing about a design's look
            needs the editor. Collapsed, because the palette answers the common case and this
            is the full control for someone who wants it. */}
        {designVars.length > 0 && (
          <details className="wz-style-more" data-testid="wz-design-colors">
            <summary>
              Fine-tune this design <span className="muted">({designVars.length} more)</span>
            </summary>
            <StyleControls
              vars={allVars}
              onSet={overrideVar}
              isOverridden={(name) => name in draft.cssVarOverrides}
              onReset={clearOverride}
              exclude={PALETTE_VARS}
            />
          </details>
        )}
      </div>

      <div className="panel-section">
        <h3>Typeface <span className="muted">(every typeface — bundled or imported — ships inside the export)</span></h3>
        {/* The ONE typeface picker (shared with the import flow, the AI setup and the editor's
            Style panel): searchable, each family rendered in its own face, upload + this
            computer's installed faces. The card grid it replaced could never scale past a
            handful of them. */}
        <FontPicker
          value={draft.fontId}
          customFont={draft.customFont}
          onPick={(fontId) => onDraft({ fontId })}
          onCustomFont={(customFont) => onDraft({ customFont, fontId: 'custom' })}
          defaultLabel={`Design typeface (${FONTS.find((f) => f.id === variant.defaultFontId)?.family ?? 'default'})`}
        />
        {draft.customFont && activeFont === 'custom' && (
          <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
            <input
              className="grow"
              value={draft.customFont.family}
              onChange={(e) => renameCustomFont(e.target.value)}
              title="Typeface name used in the generated CSS"
            />
          </div>
        )}
      </div>

      {/* Size and placement under progressive disclosure (the Browse step's `More filters`
          idiom). Palette and font are the two choices a user came here to make; size, type
          scale, zone and nudge are TUNING, and every one of them is tuned per design already
          — the variant's defaultZone, its own type scale. Open, they made this the heaviest
          step in the wizard: five decision groups against the Fields step's one or two.
          `open` when anything inside has been touched, so a moved graphic never hides the
          control that moved it. */}
      <details
        className="wz-style-more"
        open={placementTouched}
        onToggle={(e) => setPlacementTouched(e.currentTarget.open)}
      >
        <summary>Size &amp; position{placementSummary && <span className="muted"> — {placementSummary}</span>}</summary>
        <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
          <div className="panel-section">
            <h3>Graphic size <span className="muted">(everything, together)</span></h3>
            <div className="row" style={{ gap: 6 }}>
              {SIZES.map((s) => (
                <button
                  key={s.label}
                  className={draft.sizeScale === s.scale ? 'active' : ''}
                  onClick={() => onDraft({ sizeScale: s.scale })}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {/* Two identical S/M/L triplets under two near-identical labels read as a
                duplicated control. They are not: this one scales the whole graphic. */}
            <p className="hint" style={{ marginTop: 6 }}>
              Scales the panel, the bars and the type as one — the design keeps its proportions.
            </p>
          </div>

          <div className="panel-section">
            <h3>Text size <span className="muted">(type inside it)</span></h3>
            <div className="row" style={{ gap: 6 }}>
              {TYPE_SIZES.map((s) => (
                <button
                  key={s.label}
                  className={draft.typeScale === s.scale ? 'active' : ''}
                  onClick={() => onDraft({ typeScale: s.scale })}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              Type only, on top of the size above — for longer names, or a heavier look at the
              same footprint.
            </p>
          </div>

          <div className="panel-section">
            <h3>Position <span className="muted">(zones snap to safe areas)</span></h3>
            <div className="wz-zones">
              {ZONES.map((z) => (
                <button
                  key={z}
                  className={`wz-zone ${activeZone === z ? 'selected' : ''}`}
                  onClick={() => onDraft({ zone: z })}
                  title={z}
                />
              ))}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <label className="wz-nudge">
                Nudge X
                <input
                  type="number"
                  value={draft.nudge.x}
                  onChange={(e) => onDraft({ nudge: { x: Number(e.target.value) || 0 } })}
                />
              </label>
              <label className="wz-nudge">
                Nudge Y
                <input
                  type="number"
                  value={draft.nudge.y}
                  onChange={(e) => onDraft({ nudge: { y: Number(e.target.value) || 0 } })}
                />
              </label>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
