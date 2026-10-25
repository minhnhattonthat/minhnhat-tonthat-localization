// IGDB lookup: Twitch app token, then search a game and its cover.

const FIELDS = 'fields name,first_release_date,cover.image_id,alternative_names.name;';
const plats = (platformId) => [platformId].flat().join(',');

export function buildGameQuery(title, platformId) {
  const where = platformId ? ` where platforms = (${plats(platformId)});` : '';
  return `search "${title.replace(/[\\"]/g, '\\$&')}"; ${FIELDS}${where} limit 5;`;
}

// IGDB's search index misses some games (e.g. "Eithéa") that a slug lookup finds.
export function buildSlugQuery(slug, platformId) {
  const and = platformId ? ` & platforms = (${plats(platformId)})` : '';
  return `where slug = "${slug}"${and}; ${FIELDS} limit 5;`;
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const slugify = (s) => fold(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Words for matching; "Shou"/"Sho" and "Kakutou"/"Kakuto" are the same romanized word.
export const words = (s) => new Set(fold(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((w) => w.replace(/ou$/, 'o')));

// Titles to query: the full title, each "A / B" alternative, and each one's main title before ":" or " - ".
export function titleVariants(title) {
  const parts = title.split(' / ');
  return [...new Set([title, ...parts, ...parts.map((p) => p.split(/: | - /)[0])])];
}

// Word overlap (Dice, 0..1) between our title and the game's closest name or alternative name.
export function matchScore(title, game) {
  const t = words(title);
  return Math.max(...[game.name, ...(game.alternative_names ?? []).map((a) => a.name)].map((n) => {
    const g = words(n);
    const shared = [...g].filter((w) => t.has(w)).length;
    return (2 * shared) / (t.size + g.size);
  }));
}

// Below this a short variant has matched a different game (e.g. "Phoenix 2" for "Dino Device 2 - Dragon / Phoenix").
export const MIN_SCORE = 0.6;

export function coverUrl(imageId) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

export async function getToken(clientId, clientSecret, fetchFn = fetch) {
  const q = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' });
  const res = await fetchFn(`https://id.twitch.tv/oauth2/token?${q}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Twitch token ${res.status}`);
  return (await res.json()).access_token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// IGDB allows 4 requests/second: space requests out, and on 429 wait and retry (up to 3 tries).
async function query(body, { clientId, token }, fetchFn, wait) {
  let res;
  for (let tries = 0; tries < 3; tries++) {
    res = await fetchFn('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
      body,
    });
    if (res.status !== 429) break;
    await wait(1000);
  }
  if (!res.ok) throw new Error(`IGDB ${res.status}`);
  await wait(250);
  return res.json();
}

// Pools results for every title variant (search + slug), then keeps the best-matching game with a cover.
// Tries the project's platform first, then any platform (flagged loose).
export async function findGame(title, platformId, auth, fetchFn = fetch, wait = sleep) {
  for (const plat of platformId ? [platformId, null] : [null]) {
    const pool = new Map();
    for (const v of titleVariants(title)) {
      const bodies = [buildGameQuery(v, plat)];
      if (slugify(v)) bodies.push(buildSlugQuery(slugify(v), plat));
      for (const body of bodies) for (const g of await query(body, auth, fetchFn, wait)) if (g.cover?.image_id) pool.set(g.id, g);
    }
    const [game, score] = [...pool.values()].map((g) => [g, matchScore(title, g)]).reduce((a, b) => (b[1] > a[1] ? b : a), [null, MIN_SCORE - 1e-9]);
    if (!game) continue;
    const year = game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null;
    return { id: game.id, name: game.name, year, imageId: game.cover.image_id, score: Math.round(score * 100) / 100, loose: plat === platformId ? null : 'any platform' };
  }
  return null;
}
