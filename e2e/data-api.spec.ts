import { expect, test } from '@playwright/test';

// The Production Data API is served in development exactly as deployed (dataDevPlugin
// mounts the real api/data/[...path].ts), so its refusal shapes are pinned here without a
// backend - the suite runs offline, and every answer below is what a misconfigured or
// unauthenticated integrator meets in production too (docs/DATA_API.md, "Errors").
//
// The claim under test is REACHED THE HANDLER and REFUSED HONESTLY - the live write path
// (real key, real log row, the score changing on /output) needs a real Supabase and lives in
// docs/CLOUD_PLAYOUT.md §8 step 9.

test('a request with no key is the handler\'s own 401, not a routing 404', async ({ request }) => {
  const response = await request.post('/api/data/update', { data: { values: { 'Score A': 1 } } });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body?.error?.code).toBe('unauthorized');
});

test('offline (no backend configured) answers 503, after the key was presented', async ({ request }) => {
  const response = await request.post('/api/data/update', {
    headers: { authorization: 'Bearer not-a-real-key' },
    data: { values: { 'Score A': 1 } },
  });
  expect(response.status()).toBe(503);
  expect((await response.json())?.error?.code).toBe('unavailable');
});

test('the endpoint is POST-only and the dispatch table is closed', async ({ request }) => {
  const get = await request.get('/api/data/update');
  expect(get.status()).toBe(405);
  const unknown = await request.post('/api/data/nonsense', { data: {} });
  expect(unknown.status()).toBe(404);
  expect((await unknown.json())?.error?.code).toBe('not_found');
});
