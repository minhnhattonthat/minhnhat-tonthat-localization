// IGDB lookup: Twitch app token, then search a game and its cover.

export function buildGameQuery(title, platformId) {
  const where = platformId ? ` where platforms = (${platformId});` : '';
  return `search "${title.replace(/"/g, '\\"')}"; fields name,first_release_date,cover.image_id;${where} limit 5;`;
}

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

// IGDB allows 4 requests/second; on 429 wait and retry (up to 3 tries).
export async function findGame(title, platformId, { clientId, token }, fetchFn = fetch, wait = sleep) {
  let res;
  for (let tries = 0; tries < 3; tries++) {
    res = await fetchFn('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}` },
      body: buildGameQuery(title, platformId),
    });
    if (res.status !== 429) break;
    await wait(1000);
  }
  if (!res.ok) throw new Error(`IGDB ${res.status}`);
  const game = (await res.json()).find((g) => g.cover?.image_id);
  if (!game) return null;
  const year = game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null;
  return { id: game.id, name: game.name, year, imageId: game.cover.image_id };
}
