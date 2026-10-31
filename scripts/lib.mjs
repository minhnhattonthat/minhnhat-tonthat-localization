// Pure helpers for turning GitHub API data into project entries.

export const OWNER = 'minhnhattonthat';
export const EXCLUDE = ['translate-retro-game', 'fan-translation-template'];
export const BOT_NAME = 'cover-bot';
// repo → IGDB game id, for titles the search can't match (e.g. "Gaiamaster" vs "Gaia Master")
export const IGDB_IDS = { 'gaiamaster-kamigami-no-board-game-en': 59153 };

export const PLATFORMS = {
  snes: { name: 'SNES', igdbId: [19, 58] }, // IGDB files Japan-only releases under Super Famicom (58)
  gba: { name: 'GBA', igdbId: 24 },
  nds: { name: 'NDS', igdbId: 20 },
  psx: { name: 'PS1', igdbId: 7 },
  ps1: { name: 'PS1', igdbId: 7 },
  psp: { name: 'PSP', igdbId: 38 },
};

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

export function isProject(repo) {
  return !repo.fork && (repo.topics ?? []).includes('fan-translation') && !EXCLUDE.includes(repo.name);
}

export function parseTitle(description, name) {
  const m = description?.match(/translation(?: patch)? (?:of|for) (.+) \([^)]*\)/); // to the last bracket
  if (m && m[1] !== name) return m[1]; // repo name = unfilled template placeholder
  return name
    .replace(/-(en|english)$/i, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function platformOf(topics) {
  for (const t of topics ?? []) if (PLATFORMS[t]) return { ...PLATFORMS[t] };
  return { name: 'Other', igdbId: null };
}

const pick = (r) => r && { tag: r.tag_name, url: r.html_url, date: r.published_at };

export function statusOf(releases) {
  const list = releases.filter((r) => !r.draft).sort((a, b) => (a.published_at < b.published_at ? 1 : -1));
  const release = list.find((r) => !r.prerelease);
  let pre = list.find((r) => r.prerelease);
  if (release && pre && pre.published_at <= release.published_at) pre = undefined;
  return {
    status: release ? 'released' : pre ? 'test' : 'progress',
    release: pick(release) ?? null,
    testBuild: pick(pre) ?? null,
    firstReleaseAt: list.at(-1)?.published_at ?? null, // test builds count
  };
}

export function scanTree(paths) {
  return {
    hasCover: paths.includes('docs/cover.jpg'),
    screenshots: paths.filter((p) => /^docs\/screenshots\/[^/]+$/.test(p) && IMAGE.test(p)).sort().slice(0, 4),
    hasBugForm: paths.includes('.github/ISSUE_TEMPLATE/bug.yml'),
  };
}

export function lastHumanCommitDate(commits) {
  return commits.find((c) => c.commit.author.name !== BOT_NAME)?.commit.author.date ?? null;
}

export async function listAllPages(getJson, url) {
  const all = [];
  for (let page = 1; ; page++) {
    const items = await getJson(`${url}&page=${page}`);
    all.push(...items);
    if (items.length < 100) return all;
  }
}

const unescapeHtml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
  e[0] === '#' ? String.fromCodePoint(Number(e[1] === 'x' || e[1] === 'X' ? '0' + e.slice(1) : e.slice(1)))
    : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]);

// Ko-fi feed HTML → unique supporters, newest first. Each feed item has one avatar img then one <name>.
export function parseSupporters(html) {
  const seen = new Map();
  for (const item of html.split('feeditem-unit').slice(1)) {
    const name = item.match(/<name[^>]*>([^<]*)<\/name>/)?.[1].trim();
    const src = item.match(/<img[^>]*src="([^"]+)"[^>]*feeditem-profile-img/)?.[1];
    if (!name || seen.has(name)) continue;
    seen.set(name, { name: unescapeHtml(name), avatar: src ? new URL(unescapeHtml(src), 'https://ko-fi.com').href : null });
  }
  return [...seen.values()];
}
