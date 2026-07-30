// Vercel's ignoreCommand (vercel.json): exit 0 SKIPS the build, exit 1 BUILDS.
//
// Why this exists: many worktree branches are active at once, and every push used to spend
// a Vercel build on a preview nobody asked for - burning Hobby build minutes, emitting
// failure emails, and drowning the one deployment that matters (production from main) in
// noise. CI already builds and tests every branch, so previews are opt-in:
//
//   - main ALWAYS builds - production must never be skippable from here.
//   - any other branch builds only when its head commit message contains "[preview]".
//   - outside Vercel (env absent) or on any error: build. Failing open can only cost a
//     build; failing closed could silently stop production.
//
// Behavior documented in docs/DEPLOYMENT.md.

const ref = process.env.VERCEL_GIT_COMMIT_REF;
const message = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '';

if (!ref || ref === 'main' || message.includes('[preview]')) {
  console.log(`[ignore-build] building: ${ref ?? 'no VERCEL_GIT_COMMIT_REF (not Vercel?)'}`);
  process.exit(1);
}
console.log(`[ignore-build] skipping preview for branch "${ref}" (no [preview] in the commit message)`);
process.exit(0);
