import test from 'node:test';
import assert from 'node:assert/strict';
import { isProject, parseTitle, platformOf, statusOf, scanTree, lastHumanCommitDate, listAllPages } from './lib.mjs';

test('isProject', () => {
  const r = (o) => ({ name: 'x', topics: ['fan-translation'], fork: false, private: false, ...o });
  assert.equal(isProject(r()), true);
  assert.equal(isProject(r({ topics: ['snes'] })), false);
  assert.equal(isProject(r({ fork: true })), false);
  assert.equal(isProject(r({ private: true })), true); // cover bot scans private repos too
  assert.equal(isProject(r({ name: 'translate-retro-game' })), false);
  assert.equal(isProject(r({ name: 'fan-translation-template' })), false);
});

test('parseTitle from real descriptions', () => {
  const cases = [
    ['English translation patch for Little Master: Nijiiro no Maseki (SNES)', 'Little Master: Nijiiro no Maseki'],
    ['English fan translation of Rokudenashi Blues: Taiketsu! Tokyo Shitennou (SNES, Bandai 1994)', 'Rokudenashi Blues: Taiketsu! Tokyo Shitennou'],
    ['Unofficial English fan translation of Sora no Otoshimono Forte: Dreamy Season (Nintendo DS): source text, build tools and patch releases. No ROM included.', 'Sora no Otoshimono Forte: Dreamy Season'],
    ['Unofficial English translation patch for Black/Matrix 00 (PlayStation), with the tools that built it', 'Black/Matrix 00'],
    ['English fan translation of Hanjuku Hero: Ah, Sekai yo Hanjuku Nare...!! (SNES, 1992, Square)', 'Hanjuku Hero: Ah, Sekai yo Hanjuku Nare...!!'],
    ['English fan translation of Velldeselba Senki - Tsubasa no Kunshou (PSX)', 'Velldeselba Senki - Tsubasa no Kunshou'],
    ['English translation of Foo (Remix) (SNES)', 'Foo (Remix)'],
  ];
  for (const [d, t] of cases) assert.equal(parseTitle(d, 'x'), t);
});

test('parseTitle falls back to humanized name', () => {
  assert.equal(parseTitle(null, 'dragon-knight-4-en'), 'Dragon Knight 4');
  assert.equal(parseTitle('', 'yu-yu-hakusho-2-english'), 'Yu Yu Hakusho 2');
  assert.equal(parseTitle('Some unrelated text', 'granbo'), 'Granbo');
  assert.equal(parseTitle('English fan translation of farland-story-2-en (SNES)', 'farland-story-2-en'), 'Farland Story 2');
});

test('platformOf', () => {
  assert.deepEqual(platformOf(['fan-translation', 'snes']), { name: 'SNES', igdbId: [19, 58] });
  assert.deepEqual(platformOf(['gba']), { name: 'GBA', igdbId: 24 });
  assert.deepEqual(platformOf(['nds']), { name: 'NDS', igdbId: 20 });
  assert.deepEqual(platformOf(['psx']), { name: 'PS1', igdbId: 7 });
  assert.deepEqual(platformOf(['ps1']), { name: 'PS1', igdbId: 7 });
  assert.deepEqual(platformOf(['psp']), { name: 'PSP', igdbId: 38 });
  assert.deepEqual(platformOf(['rom-hack']), { name: 'Other', igdbId: null });
});

test('statusOf', () => {
  const rel = (tag, date, prerelease = false, draft = false) => ({ tag_name: tag, html_url: 'u/' + tag, published_at: date, prerelease, draft });
  assert.deepEqual(statusOf([]), { status: 'progress', release: null, testBuild: null, firstReleaseAt: null });
  assert.deepEqual(statusOf([rel('v0.1', '2026-01-01', true)]),
    { status: 'test', release: null, testBuild: { tag: 'v0.1', url: 'u/v0.1', date: '2026-01-01' }, firstReleaseAt: '2026-01-01' });
  // released with a newer pre-release → both
  const s = statusOf([rel('v1.1-test2', '2026-10-24', true), rel('v1.0', '2026-10-10')]);
  assert.equal(s.status, 'released');
  assert.equal(s.release.tag, 'v1.0');
  assert.equal(s.testBuild.tag, 'v1.1-test2');
  assert.equal(s.firstReleaseAt, '2026-10-10');
  // pre-release older than release → no testBuild; drafts ignored
  const o = statusOf([rel('v2', '2026-05-01'), rel('v2-rc', '2026-04-01', true), rel('v3', '2026-06-01', false, true)]);
  assert.equal(o.release.tag, 'v2');
  assert.equal(o.testBuild, null);
});

test('scanTree', () => {
  const t = scanTree(['docs/cover.jpg', 'docs/screenshots/b.png', 'docs/screenshots/a.jpg', 'docs/screenshots/c.webp',
    'docs/screenshots/d.gif', 'docs/screenshots/e.png', 'docs/screenshots/notes.md', '.github/ISSUE_TEMPLATE/bug.yml', 'src/gfx/title.png']);
  assert.equal(t.hasCover, true);
  assert.deepEqual(t.screenshots, ['docs/screenshots/a.jpg', 'docs/screenshots/b.png', 'docs/screenshots/c.webp', 'docs/screenshots/d.gif']);
  assert.equal(t.hasBugForm, true);
  assert.deepEqual(scanTree([]), { hasCover: false, screenshots: [], hasBugForm: false });
});

test('lastHumanCommitDate skips cover-bot', () => {
  const c = (name, date) => ({ commit: { author: { name, date } } });
  assert.equal(lastHumanCommitDate([c('cover-bot', '2026-10-25'), c('minhnhattonthat', '2026-10-20')]), '2026-10-20');
  assert.equal(lastHumanCommitDate([]), null);
});

test('listAllPages follows pages until a short page', async () => {
  const pages = { 1: Array(100).fill(1), 2: Array(100).fill(2), 3: [3] };
  const seen = [];
  const all = await listAllPages(async (u) => { seen.push(u); return pages[new URL(u).searchParams.get('page')]; },
    'https://api.github.com/users/minhnhattonthat/repos?per_page=100');
  assert.equal(all.length, 201);
  assert.equal(seen.length, 3);
});
