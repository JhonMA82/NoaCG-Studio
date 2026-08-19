// MOVED to src/ai/pro/custom/neutralSkeleton.ts (2026-08-19): the custom-lane iterate
// protocol was measured on the neutral skeleton, so when that lane became product code the
// skeleton had to live where the product may import it - `creative/` is RETIRED and nothing
// in the product may reach it. This shim keeps the retired pilot and the bench runners
// compiling; it re-exports and adds nothing.
export { neutralSkeletonTemplate, NEUTRAL_SKELETON_PREFIX } from '../pro/custom/neutralSkeleton';
