// Writes dist/version.json - the deployed-commit marker.
//
// This is what ties a running deployment back to the exact commit it was built from:
// the deploy-verify workflow (.github/workflows/deploy-verify.yml) fetches
// https://<production>/version.json and compares `commit` against the git history, so a
// production deploy that silently stops updating becomes a red workflow run and a tracking
// issue instead of a discovery weeks later (docs/DEPLOYMENT.md).
//
// On Vercel the commit arrives in the build env (VERCEL_GIT_COMMIT_SHA/REF); a local build
// asks git. Runs at the end of `npm run build`, after prerender has finished shaping dist/.

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fromGit = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

const commit = process.env.VERCEL_GIT_COMMIT_SHA || fromGit('rev-parse HEAD') || 'unknown';
const ref = process.env.VERCEL_GIT_COMMIT_REF || fromGit('rev-parse --abbrev-ref HEAD') || 'unknown';

const dist = resolve(process.cwd(), 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(
  resolve(dist, 'version.json'),
  JSON.stringify({ commit, ref, builtAt: new Date().toISOString() }, null, 2) + '\n',
);
console.log(`[write-version] dist/version.json -> ${ref}@${commit.slice(0, 10)}`);
