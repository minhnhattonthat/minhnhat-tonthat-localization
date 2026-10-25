import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGameQuery, coverUrl, findGame, searchAttempts } from './igdb.mjs';

test('buildGameQuery escapes quotes and filters platform', () => {
  assert.equal(buildGameQuery('Say "Hi"', 19),
    'search "Say \\"Hi\\""; fields name,first_release_date,cover.image_id; where platforms = (19); limit 5;');
  assert.equal(buildGameQuery('Granbo', null),
    'search "Granbo"; fields name,first_release_date,cover.image_id; limit 5;');
});

test('coverUrl', () => {
  assert.equal(coverUrl('co1abc'), 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg');
});

test('findGame picks first result with cover', async () => {
  const fake = async (url, opts) => {
    assert.equal(url, 'https://api.igdb.com/v4/games');
    assert.equal(opts.headers['Client-ID'], 'cid');
    assert.equal(opts.headers.Authorization, 'Bearer tok');
    return { ok: true, json: async () => [{ id: 1, name: 'No cover' }, { id: 2, name: 'Kabuki Rocks', first_release_date: 757382400, cover: { image_id: 'co9' } }] };
  };
  assert.deepEqual(await findGame('Kabuki Rocks', 19, { clientId: 'cid', token: 'tok' }, fake),
    { id: 2, name: 'Kabuki Rocks', year: 1994, imageId: 'co9' });
  assert.equal(await findGame('x', 19, { clientId: 'cid', token: 'tok' }, async () => ({ ok: true, json: async () => [] })), null);
});

test('findGame waits and retries when IGDB rate-limits', async () => {
  const replies = [{ ok: false, status: 429 }, { ok: true, json: async () => [{ id: 3, name: 'Granbo', cover: { image_id: 'co3' } }] }];
  const waits = [];
  const game = await findGame('Granbo', 24, { clientId: 'c', token: 't' }, async () => replies.shift(), async (ms) => waits.push(ms));
  assert.equal(game.name, 'Granbo');
  assert.deepEqual(waits, [1000]);
});

test('searchAttempts: exact, then any platform, then short title', () => {
  assert.deepEqual(searchAttempts('Gachasute! Dino Device 2 - Dragon / Phoenix', 24), [
    { title: 'Gachasute! Dino Device 2 - Dragon / Phoenix', platformId: 24, loose: null },
    { title: 'Gachasute! Dino Device 2 - Dragon / Phoenix', platformId: null, loose: 'any platform' },
    { title: 'Gachasute! Dino Device 2', platformId: 24, loose: 'short title' },
  ]);
  assert.deepEqual(searchAttempts('Kabuki Rocks', 19), [
    { title: 'Kabuki Rocks', platformId: 19, loose: null },
    { title: 'Kabuki Rocks', platformId: null, loose: 'any platform' },
  ]);
  assert.deepEqual(searchAttempts('Granbo', null), [{ title: 'Granbo', platformId: null, loose: null }]);
});
