// Pure helpers for turning GitHub API data into project entries.

export const OWNER = 'minhnhattonthat';
export const EXCLUDE = ['translate-retro-game', 'fan-translation-template'];
export const BOT_NAME = 'cover-bot';

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
  return !repo.fork && !repo.private && (repo.topics ?? []).includes('fan-translation') && !EXCLUDE.includes(repo.name);
}

export function parseTitle(description, name) {
  const m = description?.match(/translation(?: patch)? (?:of|for) (.+?) \([^)]*\)/);
  if (m) return m[1];
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
