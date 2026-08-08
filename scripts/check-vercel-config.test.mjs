// The gate is only worth its build second if it still says no. These are deliberate mutations of
// our own vercel.json, including the exact one that stopped production on 2026-08-07.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getTransformedRoutes } from '@vercel/routing-utils';

import { configPath, validateVercelConfig } from './check-vercel-config.mjs';

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const clone = () => JSON.parse(JSON.stringify(config));

test('the committed vercel.json is one Vercel accepts', () => {
  assert.deepEqual(validateVercelConfig(config), []);
});

test('rejects the header source that stopped production', () => {
  const mutated = clone();
  mutated.headers[0].source = '/join(/(.*))?';
  const problems = validateVercelConfig(mutated);
  assert.equal(problems.length > 0, true);
  assert.match(problems.join('\n'), /invalid `source` pattern/);
});

test('rejects an unbalanced group in a rewrite source', () => {
  const mutated = clone();
  mutated.rewrites = [{ source: '/join/(:name', destination: '/join.html' }];
  assert.equal(validateVercelConfig(mutated).length > 0, true);
});

test('rejects a redirect with no destination', () => {
  const mutated = clone();
  mutated.redirects = [{ source: '/old' }];
  assert.equal(validateVercelConfig(mutated).length > 0, true);
});

test('rejects a destination naming a segment its source never captures', () => {
  const mutated = clone();
  mutated.rewrites = [{ source: '/join/:name', destination: '/join.html?p=:missing' }];
  assert.equal(validateVercelConfig(mutated).length > 0, true);
});

test('/join and every name under it still carry the noindex header', () => {
  // Valid is not the same as correct: the pattern that replaced the broken one has to still cover
  // both shapes the audience page is served under - the bare /join?p=<slug> and the vanity
  // /join/<name>. Asserted against the regex Vercel will compile, not a second reading of the glob.
  const joinRule = config.headers.find((rule) => rule.source.startsWith('/join'));
  assert.ok(joinRule, 'vercel.json no longer has a /join header rule');

  const { routes } = getTransformedRoutes({ headers: [joinRule] });
  const matches = (url) => routes.some((route) => new RegExp(route.src).test(url));
  assert.equal(matches('/join'), true);
  assert.equal(matches('/join/friday-night-live'), true);
  assert.equal(matches('/joinx'), false);

  assert.ok(
    joinRule.headers.some((header) => header.key === 'X-Robots-Tag'),
    'the /join rule no longer sets X-Robots-Tag',
  );
});
