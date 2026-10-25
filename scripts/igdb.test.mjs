import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGameQuery, buildSlugQuery, coverUrl, findGame, matchScore, slugify, titleVariants, MIN_SCORE } from './igdb.mjs';

const F = 'fields name,first_release_date,cover.image_id,alternative_names.name;';

test('buildGameQuery escapes quotes and backslashes, filters platform', () => {
  assert.equal(buildGameQuery('Say "Hi"', 19), `search "Say \\"Hi\\""; ${F} where platforms = (19); limit 5;`);
  assert.equal(buildGameQuery('Granbo', null), `search "Granbo"; ${F} limit 5;`);
  assert.equal(buildGameQuery('A\\B', null), `search "A\\\\B"; ${F} limit 5;`);
  assert.equal(buildGameQuery('Kabuki Rocks', [19, 58]), `search "Kabuki Rocks"; ${F} where platforms = (19,58); limit 5;`);
});

test('buildSlugQuery and slugify (accents folded)', () => {
  assert.equal(slugify('Eithéa'), 'eithea');
  assert.equal(slugify('Yu Yu Hakusho 2'), 'yu-yu-hakusho-2');
  assert.equal(buildSlugQuery('eithea', 7), `where slug = "eithea" & platforms = (7); ${F} limit 5;`);
  assert.equal(buildSlugQuery('eithea', null), `where slug = "eithea"; ${F} limit 5;`);
});

test('titleVariants: full, each " / " part, and main titles', () => {
  assert.deepEqual(titleVariants('Shin Megami Tensei: Devil Children 2 Honoo no Sho / DemiKids Book of Fire'), [
    'Shin Megami Tensei: Devil Children 2 Honoo no Sho / DemiKids Book of Fire',
    'Shin Megami Tensei: Devil Children 2 Honoo no Sho',
    'DemiKids Book of Fire',
    'Shin Megami Tensei',
  ]);
  assert.deepEqual(titleVariants('Gachasute! Dino Device 2 - Dragon / Phoenix'),
    ['Gachasute! Dino Device 2 - Dragon / Phoenix', 'Gachasute! Dino Device 2 - Dragon', 'Phoenix', 'Gachasute! Dino Device 2']);
  assert.deepEqual(titleVariants('Granbo'), ['Granbo']);
});

// Real IGDB entries returned for our titles.
const fire = { name: 'Shin Megami Tensei: Devil Children - Honoo no Sho', alternative_names: [{ name: 'Shin Megami Tensei: Devil Children - Book of Fire' }] };
const ice = { name: 'Shin Megami Tensei: Devil Children - Koori no Sho', alternative_names: [{ name: 'Shin Megami Tensei: Devil Children - Book of Ice' }] };
const smt = { name: 'Shin Megami Tensei' };

test('matchScore prefers the right game and rejects other games in the series', () => {
  const t = 'Shin Megami Tensei: Devil Children 2 Honoo no Sho / DemiKids Book of Fire';
  assert.ok(matchScore(t, fire) > matchScore(t, ice));
  assert.ok(matchScore(t, smt) < MIN_SCORE);
  assert.equal(matchScore('Yu Yu Hakusho 2: Kakutou no Shou',
    { name: 'YuYu Hakusho 2: Kakutou no Sho', alternative_names: [{ name: 'Yu Yu Hakusho 2: Kakutou no Sho' }] }), 1);
  assert.equal(matchScore('Eithéa', { name: 'Eithéa' }), 1);
  assert.ok(matchScore('Hanjuku Hero: Ah, Sekai yo Hanjuku Nare...!!',
    { name: 'Hanjuku Hero: Aa Sekai yo Hanjuku Nare', alternative_names: [{ name: 'Hanjuku Hero: Aa Sekai yo Hanjuku Nare...!!' }] }) >= MIN_SCORE);
  assert.ok(matchScore('Erementar Gerad: Tozasareshi Uta', { name: 'Erementar Gerad: Matoe, Suifu no Ken' }) < MIN_SCORE);
});

const auth = { clientId: 'cid', token: 'tok' };
const noWait = async () => {};
const reply = (games) => ({ ok: true, json: async () => games });

test('findGame pools all queries and returns the best match with a cover', async () => {
  const bodies = [];
  const fake = async (url, opts) => {
    assert.equal(url, 'https://api.igdb.com/v4/games');
    assert.equal(opts.headers.Authorization, 'Bearer tok');
    bodies.push(opts.body);
    if (opts.body.startsWith('search "Shin Megami Tensei";')) return reply([{ id: 2, ...ice, cover: { image_id: 'ice' } }, { id: 3, ...fire, cover: { image_id: 'fire' }, first_release_date: 1027468800 }]);
    if (opts.body.startsWith('search "DemiKids')) return reply([{ id: 4, name: 'DemiKids: Dark Version', cover: { image_id: 'dark' } }, { id: 5, ...fire }]);
    return reply([]);
  };
  const game = await findGame('Shin Megami Tensei: Devil Children 2 Honoo no Sho / DemiKids Book of Fire', 24, auth, fake, noWait);
  assert.deepEqual({ ...game, score: undefined }, { id: 3, name: fire.name, year: 2002, imageId: 'fire', score: undefined, loose: null });
  assert.equal(bodies.length, 8); // 4 variants × (search + slug), platform pass only
});

test('findGame finds by slug when search misses, then any platform (loose)', async () => {
  const fake = async (url, { body }) =>
    reply(body.startsWith('where slug = "eithea";') ? [{ id: 128195, name: 'Eithéa', cover: { image_id: 'co6881' } }] : []);
  const game = await findGame('Eithéa', 7, auth, fake, noWait);
  assert.equal(game.id, 128195);
  assert.equal(game.loose, 'any platform');
  assert.equal(await findGame('x', 19, auth, async () => reply([]), noWait), null);
});

test('findGame waits and retries when IGDB rate-limits', async () => {
  const replies = [{ ok: false, status: 429 }, reply([{ id: 3, name: 'Granbo', cover: { image_id: 'co3' } }])];
  const waits = [];
  const game = await findGame('Granbo', 24, auth, async () => replies.shift() ?? reply([]), async (ms) => waits.push(ms));
  assert.equal(game.name, 'Granbo');
  assert.equal(waits[0], 1000);
});

test('coverUrl', () => {
  assert.equal(coverUrl('co1abc'), 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg');
});
