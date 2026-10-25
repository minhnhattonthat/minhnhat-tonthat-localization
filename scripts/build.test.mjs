import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProject } from './build.mjs';

const repo = { name: 'kabuki-rocks', description: 'English translation patch for Kabuki Rocks (SNES)', topics: ['fan-translation', 'snes'],
  default_branch: 'main', created_at: '2026-09-01T00:00:00Z', pushed_at: '2026-10-25T00:00:00Z', html_url: 'https://github.com/minhnhattonthat/kabuki-rocks' };
const raw = 'https://raw.githubusercontent.com/minhnhattonthat/kabuki-rocks/main/';

test('buildProject assembles a full project', async () => {
  const p = await buildProject(repo, {
    tree: async () => ['docs/cover.jpg', 'docs/screenshots/1.png', '.github/ISSUE_TEMPLATE/bug.yml'],
    releases: async () => [{ tag_name: 'v1.0', html_url: 'r', published_at: '2026-10-01T00:00:00Z', prerelease: false, draft: false,
      assets: [{ download_count: 7 }, { download_count: 5 }] }, { tag_name: 'v0.9', html_url: 'r0', published_at: '2026-09-01T00:00:00Z', prerelease: true, draft: false, assets: [{ download_count: 3 }] }],
    commits: async () => [{ commit: { author: { name: 'cover-bot', date: '2026-10-25T00:00:00Z' } } }, { commit: { author: { name: 'me', date: '2026-10-21T00:00:00Z' } } }],
  });
  assert.equal(p.title, 'Kabuki Rocks');
  assert.equal(p.platform, 'SNES');
  assert.equal(p.status, 'released');
  assert.equal(p.downloads, 15); // all assets of all releases
  assert.equal(p.cover, raw + 'docs/cover.jpg');
  assert.deepEqual(p.screenshots, [raw + 'docs/screenshots/1.png']);
  assert.equal(p.updatedAt, '2026-10-21T00:00:00Z');
  assert.equal(p.issueUrl, 'https://github.com/minhnhattonthat/kabuki-rocks/issues/new?template=bug.yml');
  assert.equal(p.needsCover, false);
});

test('buildProject encodes # and ? in screenshot names', async () => {
  const none = async () => [];
  const p = await buildProject(repo, { tree: async () => ['docs/screenshots/a#1?.png'], releases: none, commits: none });
  assert.deepEqual(p.screenshots, [raw + 'docs/screenshots/a%231%3F.png']);
});

test('buildProject survives failing sub-calls', async () => {
  const boom = async () => { throw new Error('404'); };
  const p = await buildProject(repo, { tree: boom, releases: boom, commits: boom });
  assert.equal(p.status, 'progress');
  assert.equal(p.downloads, 0);
  assert.equal(p.cover, raw + 'docs/cover.jpg'); // kept; the page falls back if it 404s
  assert.deepEqual(p.screenshots, []);
  assert.equal(p.issueUrl, 'https://github.com/minhnhattonthat/kabuki-rocks/issues/new');
  assert.equal(p.updatedAt, '2026-10-25T00:00:00Z'); // falls back to pushed_at
  assert.equal(p.needsCover, false); // tree unknown → don't try to commit
});

test('addCovers skips covers when the IGDB login fails', async () => {
  const { addCovers } = await import('./build.mjs');
  const realFetch = globalThis.fetch;
  process.env.TWITCH_CLIENT_ID = 'cid';
  process.env.TWITCH_CLIENT_SECRET = 'bad';
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  try {
    await addCovers([{ repo: 'x', title: 'X', needsCover: true, igdbPlatform: 19 }], async () => {}, false);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;
  }
});
