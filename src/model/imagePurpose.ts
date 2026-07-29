// What an uploaded picture is FOR — the one definition every surface reads.
//
// WHY THIS EXISTS. A dropped image used to mean exactly one thing: bundle it and place it.
// But the same gesture carries at least four unrelated intents, and they want opposite
// treatment. A crest must survive untouched; a screenshot of a rival's strap must drive the
// composition and never appear; a mood board must give up its colours and nothing else; a
// frame of the actual studio must be READ but neither copied nor placed. Guessing from
// pixels alone gets this wrong often enough to ruin a result, so the user says which — and
// the vocabulary lives here so the SPX card, the video card, and both prompt builders can
// never drift apart.
//
// It sits in the MODEL layer for the same reason GenerationSpec does: VideoProject PERSISTS
// it (`assetUses`), and model imports nothing above layer 0 (docs/ARCHITECTURE.md §3).

import type { AssetFile } from './types';
import { probeAsset } from '../assets/assetInfo';

/**
 * The four purposes.
 *
 * `asset` is the only one that BUNDLES: it becomes a real file in the template and is
 * referenced by path. The other three are vision input only — never bundled, never placed,
 * never exported. That split is the dangling-reference contract, which is why `asset` stays
 * a separate array downstream rather than a tag on one flat list.
 */
export type ImagePurpose = 'asset' | 'layout' | 'mood' | 'plate';

/** The three vision-only purposes — the ones that ride `references`. */
export type ReferencePurpose = Exclude<ImagePurpose, 'asset'>;

export const IMAGE_PURPOSES: ImagePurpose[] = ['asset', 'layout', 'mood', 'plate'];

/** True for a purpose that only informs the design. Narrows, so callers can switch on it. */
export function isReferencePurpose(purpose: ImagePurpose): purpose is ReferencePurpose {
  return purpose !== 'asset';
}

/** What the user reads. Kept here so every surface offers the same words. */
export const PURPOSE_LABEL: Record<ImagePurpose, string> = {
  asset: 'Use it as it is',
  layout: 'Make one like this',
  mood: 'Take the look and feel',
  plate: 'Make it work over this',
};

/** The one-line explanation under each choice. */
export const PURPOSE_HINT: Record<ImagePurpose, string> = {
  asset: 'A logo, crest or picture that must appear in the graphic exactly as uploaded.',
  layout: 'Follow this design’s composition and hierarchy. Its artwork is never copied.',
  mood: 'Take its colours, mood and motion energy only — never its layout.',
  plate: 'The real background this will sit on. Read for legibility, never shown.',
};

/**
 * Does the operator get a control for this picture?
 *
 * Only meaningful for `asset`. A guest headshot MUST be swappable; a channel bug must not
 * be, or every graphic hands the operator another row they can break. Until now everything
 * became a field (a logo slot always emits its `filelist`), so "fixed" had no way to be said.
 * `swappable` is the default because it is the older behaviour and the safer mistake.
 */
export type AssetBinding = 'swappable' | 'fixed';

export const BINDING_LABEL: Record<AssetBinding, string> = {
  swappable: 'Operators can swap it',
  fixed: 'Always this picture',
};

/** One uploaded picture plus what it is for. The UI's unit, and the wizard's state. */
export interface PurposedImage {
  asset: AssetFile;
  purpose: ImagePurpose;
  /** Only read when `purpose` is 'asset'. */
  binding?: AssetBinding;
}

/** A vision-only reference as the providers receive it. */
export interface StyleReference {
  asset: AssetFile;
  use: ReferencePurpose;
}

/** Split the UI's one list into what each provider argument expects. */
export function splitByPurpose(images: PurposedImage[]): {
  assets: AssetFile[];
  references: StyleReference[];
  /** Paths the operator must NOT get a control for. */
  fixedPaths: string[];
} {
  const assets: AssetFile[] = [];
  const references: StyleReference[] = [];
  const fixedPaths: string[] = [];
  for (const item of images) {
    if (isReferencePurpose(item.purpose)) {
      references.push({ asset: item.asset, use: item.purpose });
    } else {
      assets.push(item.asset);
      if (item.binding === 'fixed') fixedPaths.push(item.asset.path);
    }
  }
  return { assets, references, fixedPaths };
}

/**
 * The preselect. Deterministic arithmetic over the image itself — no model call, no cost.
 *
 * Only `asset` and `mood` are ever guessed. `layout` and `plate` are INTENTS that nothing in
 * the pixels reveals: a screenshot of a lower third and a photo of a studio look alike to a
 * histogram, and both look like a mood board. Guessing them would be a coin flip presented
 * as a decision, so the user picks those explicitly and the guess stays honest about what it
 * can actually see — transparency plus a small footprint is a mark, everything else is not.
 */
export async function guessPurpose(asset: AssetFile): Promise<ImagePurpose> {
  try {
    const info = await probeAsset(asset);
    if (info.kind !== 'image') return 'asset';
    // Vector art is a mark by nature — nobody mood-boards with an SVG.
    if (info.hasAlpha === 'vector') return 'asset';
    if (!info.hasAlpha) return 'mood';
    // Transparent AND small against a 1080-line frame: a crest, a bug, a sponsor mark.
    const area = (info.width ?? 0) * (info.height ?? 0);
    return area > 0 && area <= 1920 * 1080 * 0.25 ? 'asset' : 'mood';
  } catch {
    // A probe failure must never block an upload. 'asset' is the older behaviour.
    return 'asset';
  }
}
