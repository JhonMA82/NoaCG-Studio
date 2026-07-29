import { useMemo, useState } from 'react';
import { PACKS, resolvePack, type TemplatePack } from '../../../templates/packs';
import { typeById } from '../../../templates/types/registry';
import type { StyleTag } from '../../../model/fonts';
import ProjectFormatPicker from '../../ProjectFormatPicker';
import type { ProjectFormatSelection } from '../../../model/projectFormat';

interface Props {
  format: ProjectFormatSelection;
  onFormat: (selection: ProjectFormatSelection) => void;
  /** Build the kit: one package holding every graphic in it. */
  onCreate: (pack: TemplatePack, family: StyleTag) => void;
  busy: boolean;
  error: string | null;
}

/** Every style family in the catalog. Local to this step: fonts.ts exports the TYPE, not the
 *  value list. Which of these a given kit can actually be built in is computed per pack -
 *  see `familiesFor`. */
const FAMILIES: StyleTag[] = ['noacg', 'minimal', 'editorial', 'sport', 'glass', 'cinematic'];

/**
 * The looks a kit can genuinely be built in, by asking `resolvePack` rather than trusting a
 * declaration. The (type x family) matrix is NOT full in practice: measured 2026-07-29, no
 * pack resolves in all six families and `editorial`/`cinematic` resolve for none, because a
 * pack's types only ship designs in some families. Offering a look that throws on Create
 * would be offering a guaranteed failure, so the picker shows what works and nothing else.
 */
function familiesFor(pack: TemplatePack): StyleTag[] {
  return FAMILIES.filter((family) => {
    try {
      resolvePack({ ...pack, family });
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * The KIT step (docs/PACK_TAXONOMY.md, ratified in docs/TEMPLATE_TAXONOMY_PROPOSAL.md §18).
 *
 * Its own entry, deliberately NOT a third mode inside Browse: **Browse produces one graphic,
 * a kit produces several**, and a surface that promises a single pick while delivering a
 * package would be lying about the outcome. So the whole step is one decision - "which show
 * am I running?" - and the outcome is a saved package, not an open editor.
 *
 * A kit is pure config (`src/templates/packs.ts`): `resolvePack` looks each graphic TYPE up
 * in the (type x family) matrix and returns shipped, gate-checked designs - so re-resolving
 * a kit in another look costs no new template work. The looks on offer are MEASURED per pack
 * (`familiesFor`), not assumed: packs.ts still describes the matrix as full, and it is not.
 */
export default function KitStep({ format, onFormat, onCreate, busy, error }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [family, setFamily] = useState<StyleTag | null>(null);

  const selected = useMemo(() => PACKS.find((pack) => pack.id === selectedId) ?? null, [selectedId]);
  const available = useMemo(() => (selected ? familiesFor(selected) : []), [selected]);
  // The pack's own family is the taste default; an explicit pick overrides it. If a pack's
  // declared family somehow does not resolve, the first that does stands in rather than
  // leaving the step dead.
  const activeFamily: StyleTag | null =
    !selected ? null
    : family && available.includes(family) ? family
    : available.includes(selected.family) ? selected.family
    : available[0] ?? null;

  /** What the kit actually contains, named the way a producer would say it. Resolution can
   *  throw on a config error (an unfilled matrix cell) - that is a build-time bug, not a user
   *  error, so it degrades to the raw count here rather than taking the step down. */
  const contents = useMemo(() => {
    if (!selected || !activeFamily) return null;
    try {
      const cells = resolvePack({ ...selected, family: activeFamily });
      return cells.map((cell) => typeById(cell.typeId)?.name ?? cell.typeId);
    } catch {
      return null;
    }
  }, [selected, activeFamily]);

  return (
    <div className="wz-kit" data-testid="kit-step">
      <p className="wz-kit-lede">
        A kit is a curated set of graphics for one kind of show — created together into a
        package, ready to open one by one.
      </p>

      <div className="wz-kit-grid" role="list">
        {PACKS.map((pack) => {
          const active = pack.id === selectedId;
          return (
            <button
              key={pack.id}
              role="listitem"
              className={`wz-kit-card${active ? ' is-active' : ''}`}
              onClick={() => {
                setSelectedId(pack.id);
                setFamily(null); // a new kit brings its own default look
              }}
              data-kit={pack.id}
              aria-pressed={active}
            >
              <strong>{pack.name}</strong>
              <span className="hint">{pack.description}</span>
              <span className="wz-kit-count mono">
                {pack.types.length + (pack.extras?.length ?? 0)} graphics
              </span>
            </button>
          );
        })}
      </div>

      {selected && activeFamily && (
        <div className="wz-kit-detail" data-testid="kit-detail">
          <h3>{selected.name}</h3>

          <label className="wz-kit-family">
            <span>Look</span>
            <select
              value={activeFamily}
              onChange={(event) => setFamily(event.target.value as StyleTag)}
              data-testid="kit-family"
            >
              {available.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>

          {contents && (
            <>
              <p className="wz-kit-contents-label mono">In this kit</p>
              <ul className="wz-kit-contents">
                {contents.map((name, index) => (
                  <li key={`${name}-${index}`}>{name}</li>
                ))}
              </ul>
            </>
          )}

          <ProjectFormatPicker value={format} onChange={onFormat} />

          {error && <p className="status-bad" data-testid="kit-error">{error}</p>}

          <button
            className="btn primary"
            onClick={() => onCreate(selected, activeFamily)}
            disabled={busy}
            data-testid="kit-create"
          >
            {busy ? 'Creating…' : `Create the ${selected.name} kit`}
          </button>
          <p className="hint">
            Saves {contents?.length ?? selected.types.length} graphics into a new package and
            takes you to it. Nothing opens in the editor — open whichever one you need first.
          </p>
        </div>
      )}
    </div>
  );
}
