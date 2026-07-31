// The KNOWN PLATE every Creative Mode hold frame is composited over.
//
// A broadcast graphic is transparent by contract (templates/shared/base.ts resetCanvasCss), so
// a capture on black tells you nothing about what the graphic covers - black graphic, black
// plate, one black picture. The pilot rig therefore mounts the template in a transparent iframe
// over this gradient, which stands in for the video underneath.
//
// It lives in its own module because TWO tools have to agree on it byte-for-byte: the rig that
// captures the frames (scripts/creative-pilot-bench.mjs) and the measurement that asks how much
// of the plate each frame left visible (scripts/creative-plate-visibility.mjs). A second copy is
// how the reference plate and the captured plate come to differ by one stop and every
// measurement reads as full coverage.
export const PLATE_CSS = 'radial-gradient(circle at 35% 20%,#334155,#111827 58%,#05070a)';

/** The capture viewport - the plate is a gradient, so its pixels depend on the frame size. */
export const PLATE_SIZE = { width: 1920, height: 1080 };
