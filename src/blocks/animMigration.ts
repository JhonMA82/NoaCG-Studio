import { losslessAnimData } from './animData';
import { writeOutData } from '../templates/shared/animRuntime';

/**
 * The raster stretch runtime's edge walk as a design imported before #924 carries it, and as it is
 * now. The old walk summed offsets past the canvas into the renderer's page, so on an OGraf
 * renderer that does not put its stage at the page origin the design stretched short, or too far
 * when it grows leftward (issue #925). The runtime is written into a design's own code at import,
 * so a saved design keeps the line until it is upgraded here.
 */
const OLD_STRETCH_EDGE_WALK = 'for (var el = box; el; el = el.offsetParent) x += el.offsetLeft;';
const STRETCH_EDGE_WALK = 'for (var el = box; el && el !== document.body; el = el.offsetParent) x += el.offsetLeft;';

/** Use the same known runtime for preview, save and export; preserve foreign source. */
export function prepareOutRuntime(js: string): string {
  js = js.split(OLD_STRETCH_EDGE_WALK).join(STRETCH_EDGE_WALK);
  const data = losslessAnimData(js);
  if (!data) return js;
  if (data.steps.length === 1) {
    if (data.machine) return js;
    data.steps.push({ name: 'Out', duration: 0, ease: 'none', layers: {} });
  }
  return writeOutData(js, data) ?? js;
}
