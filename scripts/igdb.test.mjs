import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGameQuery, coverUrl, findGame } from './igdb.mjs';

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
