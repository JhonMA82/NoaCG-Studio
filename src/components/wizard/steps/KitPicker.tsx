import { useMemo } from 'react';
import { PACKS, resolvePack, type TemplatePack } from '../../../templates/packs';
import { kitChoices, kitSize } from '../../../templates/kit';
import type { StyleTag } from '../../../model/fonts';

/** Every style family in the catalog. Local to this surface: fonts.ts exports the TYPE, not
 *  the value list. Which of these a given kit can actually be built in is computed per pack -
 *  see `familiesFor`. */
const FAMILIES: StyleTag[] = ['noacg', 'minimal', 'editorial', 'sport', 'glass', 'cinematic'];

/**
 * The looks a kit can genuinely be built in, by asking `resolvePack` rather than trusting a
 * declaration. The (type x family) matrix is NOT full in practice: measured 2026-07-29, no
 * pack resolves in all six families and `editorial`/`cinematic` resolve for none, because a
 * pack's types only ship designs in some families. Offering a look that throws on Create
 * would be offering a guaranteed failure, so the picker shows what works and nothing else.
 */
export function familiesFor(pack: TemplatePack): StyleTag[] {
  return FAMILIES.filter((family) => {
    try {
      resolvePack({ ...pack, family });
      return true;
    } catch {
      return false;
    }
  });
}

/** The pack a kit picker starts on, and the look it starts in. */
export function defaultFamilyFor(pack: TemplatePack, wanted: StyleTag | null): StyleTag | null {
  const available = familiesFor(pack);
  if (wanted && available.includes(wanted)) return wanted;
  if (available.includes(pack.family)) return pack.family;
  return available[0] ?? null;
}

/** Every graphic of a pack, ticked - what "start from a genre preset" means. */
export function defaultSelectionFor(pack: TemplatePack, family: StyleTag): string[] {
  return kitChoices(pack, family).filter((c) => c.inPack).map((c) => c.key);
}

interface Props {
  /** The chosen genre preset, or null while the user is still picking one. */
  pack: TemplatePack | null;
  family: StyleTag | null;
  /** The ticked contents, by `KitChoice.key`. */
  selected: string[];
  onPack: (pack: TemplatePack) => void;
  onFamily: (family: StyleTag) => void;
  onSelected: (keys: string[]) => void;
}

/**
 * THE KIT CONTENTS PICKER — the second half of the Browse step once its mode switch says "a
 * whole kit" (docs/PACK_TAXONOMY.md, and the reversal of TEMPLATE_TAXONOMY_PROPOSAL.md §18's
 * separate-entry-card decision recorded there).
 *
 * Two moves, in this order because the second is an edit of the first: pick the GENRE PRESET
 * (the pack — "which show am I running?"), then EDIT THE SET with checkboxes. Everything on
 * offer resolves in the chosen look, asked through `resolvePack` (src/templates/kit.ts
 * `kitChoices`) — a row that would throw on Create is never drawn.
 *
 * THE COUNT ON SCREEN IS THE COUNT THAT GETS BUILT. `kitSize` counts the pack (types AND
 * extras) and is only ever shown on an unpicked card; from the moment a pack is chosen the
 * number comes from the SELECTION, because the whole point of the picker is that the user can
 * move it in either direction.
 */
export default function KitPicker({ pack, family, selected, onPack, onFamily, onSelected }: Props) {
  const available = useMemo(() => (pack ? familiesFor(pack) : []), [pack]);
  /** What this pack can contain in this look. Resolution can throw on a config error (an
   *  unfilled matrix cell) - that is a build-time bug, not a user error, so it degrades to an
   *  empty offer rather than taking the step down. */
  const choices = useMemo(() => {
    if (!pack || !family) return [];
    try {
      return kitChoices(pack, family);
    } catch {
      return [];
    }
  }, [pack, family]);

  const ticked = new Set(selected);
  const toggle = (key: string) =>
    onSelected(ticked.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  const inPack = choices.filter((c) => c.inPack);
  const extra = choices.filter((c) => !c.inPack);
  const chosenCount = choices.filter((c) => ticked.has(c.key)).length;

  return (
    <div className="wz-kit" data-testid="kit-picker">
      <p className="wz-kit-lede">
        A kit is a whole set of graphics for one kind of show, made together in one look and
        landing in one production. Start from the show you are running, then add or drop
        anything you like.
      </p>

      <div className="wz-kit-grid" role="list">
        {PACKS.map((p) => {
          const active = p.id === pack?.id;
          return (
            <button
              key={p.id}
              role="listitem"
              className={`wz-kit-card${active ? ' is-active' : ''}`}
              onClick={() => onPack(p)}
              data-kit={p.id}
              aria-pressed={active}
            >
              <strong>{p.name}</strong>
              <span className="hint">{p.description}</span>
              <span className="wz-kit-count mono">{kitSize(p)} graphics</span>
            </button>
          );
        })}
      </div>

      {pack && family && (
        <div className="wz-kit-detail" data-testid="kit-detail">
          <div className="wz-kit-detail-head">
            <h3>{pack.name}</h3>
            <label className="wz-kit-family">
              <span>Look</span>
              <select
                value={family}
                onChange={(event) => onFamily(event.target.value as StyleTag)}
                data-testid="kit-family"
              >
                {available.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            {/* The promise, live: this is the number of graphics the wizard will build. */}
            <span className="wz-kit-total mono" data-testid="kit-total">
              {chosenCount} graphic{chosenCount === 1 ? '' : 's'}
            </span>
          </div>

          <p className="wz-kit-contents-label mono">In this kit</p>
          <ul className="wz-kit-contents" data-testid="kit-contents">
            {inPack.map((choice) => (
              <li key={choice.key}>
                <label className="wz-kit-check">
                  <input
                    type="checkbox"
                    checked={ticked.has(choice.key)}
                    onChange={() => toggle(choice.key)}
                    data-kit-item={choice.key}
                  />
                  <span>{choice.variant.name}</span>
                </label>
              </li>
            ))}
          </ul>

          {extra.length > 0 && (
            <>
              <p className="wz-kit-contents-label mono">
                Add more — everything else this look can build
              </p>
              <ul className="wz-kit-contents wz-kit-contents--extra" data-testid="kit-extras">
                {extra.map((choice) => (
                  <li key={choice.key}>
                    <label className="wz-kit-check">
                      <input
                        type="checkbox"
                        checked={ticked.has(choice.key)}
                        onChange={() => toggle(choice.key)}
                        data-kit-item={choice.key}
                      />
                      <span>{choice.variant.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
