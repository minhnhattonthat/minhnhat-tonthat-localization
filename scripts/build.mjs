// Builds site/projects.json from GitHub, and adds missing covers from IGDB.
// Dry run unless COMMIT_COVERS=true: matches are only written to the job summary.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { OWNER, BOT_NAME, isProject, parseTitle, platformOf, statusOf, scanTree, lastHumanCommitDate, listAllPages } from './lib.mjs';
import { getToken, findGame, coverUrl } from './igdb.mjs';

const API = 'https://api.github.com';

async function attempt(fn, fallback, label) {
  try {
    return await fn();
  } catch (e) {
    console.warn(`${label}: ${e.message}`);
    return fallback;
  }
}

export async function buildProject(repo, api) {
  const paths = await attempt(() => api.tree(repo), null, `${repo.name} tree`);
  const releases = await attempt(() => api.releases(repo), [], `${repo.name} releases`);
  const commits = await attempt(() => api.commits(repo), [], `${repo.name} commits`);
  const tree = scanTree(paths ?? []);
  const platform = platformOf(repo.topics);
  const raw = (p) => `https://raw.githubusercontent.com/${OWNER}/${repo.name}/${repo.default_branch}/${encodeURI(p)}`;
  const repoUrl = `https://github.com/${OWNER}/${repo.name}`;
  return {
    repo: repo.name,
    title: parseTitle(repo.description, repo.name),
    description: repo.description ?? '',
    platform: platform.name,
    ...statusOf(releases),
    createdAt: repo.created_at,
    updatedAt: lastHumanCommitDate(commits) ?? repo.pushed_at,
    cover: tree.hasCover ? raw('docs/cover.jpg') : null,
    screenshots: tree.screenshots.map(raw),
    repoUrl,
    issueUrl: `${repoUrl}/issues/new${tree.hasBugForm ? '?template=bug.yml' : ''}`,
    needsCover: paths !== null && !tree.hasCover,
    igdbPlatform: platform.igdbId,
    coverRaw: raw('docs/cover.jpg'),
  };
}

function summary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
  console.log(line); // also in the log: job summaries can't be read back via the API
}

export async function addCovers(projects, gh, commit) {
  const { TWITCH_CLIENT_ID: clientId, TWITCH_CLIENT_SECRET: secret } = process.env;
  const missing = projects.filter((p) => p.needsCover);
  if (!missing.length) return;
  if (!clientId || !secret) return console.warn('IGDB secrets not set; skipping covers');
  const token = await attempt(() => getToken(clientId, secret), null, 'IGDB token');
  if (!token) return;
  summary(`### IGDB covers (${commit ? 'committing' : 'dry run'})\n\n| repo | title | match | cover |\n|---|---|---|---|`);
  for (const p of missing) {
    await attempt(async () => {
      const game = await findGame(p.title, p.igdbPlatform, { clientId, token });
      if (!game) return summary(`| ${p.repo} | ${p.title} | no match | |`);
      const url = coverUrl(game.imageId);
      summary(`| ${p.repo} | ${p.title} | ${game.name} (${game.year ?? '?'}) igdb ${game.id} | [cover](${url}) |`);
      if (!commit) return;
      const img = await fetch(url);
      if (!img.ok) throw new Error(`cover download ${img.status}`);
      const bot = { name: BOT_NAME, email: 'cover-bot@users.noreply.github.com' };
      await gh(`/repos/${OWNER}/${p.repo}/contents/docs/cover.jpg`, {
        method: 'PUT',
        body: JSON.stringify({
          message: 'Add cover art from IGDB [skip ci]',
          content: Buffer.from(await img.arrayBuffer()).toString('base64'),
          author: bot,
          committer: bot,
        }),
      });
      p.cover = p.coverRaw;
    }, null, `${p.repo} cover`);
  }
}

export async function main() {
  const token = process.env.REPO_WRITE_TOKEN || process.env.GITHUB_TOKEN;
  const gh = async (path, opts = {}) => {
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`${opts.method ?? 'GET'} ${path} → ${res.status}`);
    return res.json();
  };
  const repos = (await listAllPages(gh, `${API}/users/${OWNER}/repos?per_page=100&type=owner`)).filter(isProject);
  const api = {
    tree: async (r) => (await gh(`/repos/${OWNER}/${r.name}/git/trees/${r.default_branch}?recursive=1`)).tree.map((t) => t.path),
    releases: (r) => gh(`/repos/${OWNER}/${r.name}/releases?per_page=30`),
    commits: (r) => gh(`/repos/${OWNER}/${r.name}/commits?per_page=20`),
  };
  const projects = await Promise.all(repos.map((r) => buildProject(r, api)));
  await addCovers(projects, gh, process.env.COMMIT_COVERS === 'true');
  const out = projects
    .map(({ needsCover, igdbPlatform, coverRaw, ...p }) => p)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  mkdirSync('site', { recursive: true });
  writeFileSync('site/projects.json', JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} projects`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
