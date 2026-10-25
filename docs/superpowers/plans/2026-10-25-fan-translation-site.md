# Fan-Translation Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GitHub Pages site, "Minh-Nhat Ton-That Localization", that lists all of minhnhattonthat's fan-translation repos. A scheduled Action rebuilds the list, covers come automatically from IGDB, and the page has filter and sort.

**Architecture:** A Node script (`scripts/build.mjs`, no dependencies) calls the GitHub REST API and writes `site/projects.json`. If a repo has no `docs/cover.jpg`, the script looks up IGDB and either logs the match (dry run) or commits the cover into that repo (`commit=true`). The static page (`site/`) fetches `projects.json` and renders a card grid. Pure logic lives in small modules tested with `node --test`.

**Tech Stack:** Node 20+ (built-in `fetch`, `node:test`), plain HTML/CSS/ES modules, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-10-25-fan-translation-site-design.md`

## Global Constraints

- No npm dependencies. `package.json` exists only for `"type": "module"` and `"test": "node --test"`.
- No client-side calls to GitHub or IGDB. The page reads only `projects.json` plus image URLs.
- Owner `minhnhattonthat`. Topic `fan-translation`. Exclude `translate-retro-game` and `fan-translation-template`. Public, non-fork repos only.
- Site title is exactly `Minh-Nhat Ton-That Localization`. The intro line is `English fan translations of Japanese retro games`.
- Ko-fi URL: `https://ko-fi.com/minhnhattonthat`. Button image: `https://ko-fi.com/img/githubbutton_sm.svg`.
- Cover path in project repos: `docs/cover.jpg`. Screenshots: `docs/screenshots/*.{png,jpg,jpeg,gif,webp}`, the first 4 by filename.
- Cover-bot commit author is `cover-bot <cover-bot@users.noreply.github.com>`. The message is `Add cover art from IGDB [skip ci]`.
- Secrets: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `REPO_WRITE_TOKEN`. Without the IGDB secrets the cover step is skipped and the site still builds.
- Covers are committed only when `COMMIT_COVERS=true` (manual dispatch input `commit`). All other runs are a dry run that writes the matches to the job summary.
- Style A: dark background, monospace accents, neon highlights, compact cards. Keep it simple.

## Review Focus

1. **More than 100 repos.** The account has 80 public repos today, and the listing must paginate (`listAllPages` test in Task 1).
2. **Missing or odd description.** If the description is null or doesn't match the pattern, the title falls back to the humanized repo name, and the IGDB query escapes `"` in titles (tests in Tasks 1 and 2).
3. **One repo's API call fails.** Examples: an empty repo whose tree 404s, or a releases error. The project is still listed with defaults and the build continues (`buildProject` test in Task 3).
4. **Repo text is untrusted.** Descriptions and titles come from GitHub and render as text, never HTML. `app.js` uses no `innerHTML` with data (grep check in Task 4).
5. **A filter matches nothing.** The page shows "No projects match." rather than a blank grid (view test plus manual check in Task 4).

---

## File Structure

```
package.json                 type:module, test script
.gitignore                   + site/projects.json
scripts/lib.mjs              pure helpers: repo filter, title, platform, status, tree scan, commits, paging
scripts/lib.test.mjs
scripts/igdb.mjs             IGDB token + game/cover search (fetch injected)
scripts/igdb.test.mjs
scripts/build.mjs            buildProject() + main(): list → gather → cover step → write site/projects.json
scripts/build.test.mjs
site/index.html              shell, header, controls, grid, footer
site/style.css               style A
site/view.mjs                pure filterProjects / sortProjects
site/view.test.mjs
site/app.js                  fetch projects.json, render cards, wire controls
.github/workflows/pages.yml  cron 6h + dispatch(commit) + push → build → deploy Pages
README.md                    what it is, local preview, secrets setup
```

### `projects.json` item shape (shared contract)

```js
{
  repo: "little-master-en",
  title: "Little Master: Nijiiro no Maseki",
  description: "…",               // raw GitHub description or ""
  platform: "SNES",                // SNES|GBA|NDS|PS1|PSP|Other
  status: "released",              // released|test|progress
  release: { tag, url, date } | null,     // latest non-prerelease
  testBuild: { tag, url, date } | null,   // latest prerelease, only if newer than release
  createdAt: "ISO", updatedAt: "ISO",     // updatedAt = last non-cover-bot commit date
  cover: "https://raw.githubusercontent.com/…/docs/cover.jpg" | null,
  screenshots: ["https://raw.githubusercontent.com/…"],  // ≤4
  repoUrl: "https://github.com/minhnhattonthat/<repo>",
  issueUrl: "…/issues/new?template=bug.yml" | "…/issues/new"
}
```

---

### Task 1: Pure build helpers

**Files:**
- Create: `package.json`, `scripts/lib.mjs`, `scripts/lib.test.mjs`

**Interfaces:**
- Produces:
  - `isProject(repo: GhRepo): boolean`
  - `parseTitle(description: string|null, name: string): string`
  - `platformOf(topics: string[]): {name: string, igdbId: number|null}`
  - `statusOf(releases: GhRelease[]): {status, release, testBuild}`
  - `scanTree(paths: string[]): {hasCover: boolean, screenshots: string[], hasBugForm: boolean}`
  - `lastHumanCommitDate(commits: GhCommit[]): string|null`
  - `listAllPages(getJson: (url) => Promise<any[]>, url: string): Promise<any[]>`
  - `PLATFORMS`, `EXCLUDE`, `BOT_NAME = "cover-bot"`

- [ ] **Step 1: Write `package.json`** `{"name":"minhnhat-tonthat-localization","private":true,"type":"module","scripts":{"test":"node --test"}}`

- [ ] **Step 2: Write the failing tests in `scripts/lib.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isProject, parseTitle, platformOf, statusOf, scanTree, lastHumanCommitDate, listAllPages } from './lib.mjs';

test('isProject', () => {
  const r = (o) => ({ name: 'x', topics: ['fan-translation'], fork: false, private: false, ...o });
  assert.equal(isProject(r()), true);
  assert.equal(isProject(r({ topics: ['snes'] })), false);
  assert.equal(isProject(r({ fork: true })), false);
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
  ];
  for (const [d, t] of cases) assert.equal(parseTitle(d, 'x'), t);
});

test('parseTitle falls back to humanized name', () => {
  assert.equal(parseTitle(null, 'dragon-knight-4-en'), 'Dragon Knight 4');
  assert.equal(parseTitle('', 'yu-yu-hakusho-2-english'), 'Yu Yu Hakusho 2');
  assert.equal(parseTitle('Some unrelated text', 'granbo'), 'Granbo');
});

test('platformOf', () => {
  assert.deepEqual(platformOf(['fan-translation', 'snes']), { name: 'SNES', igdbId: 19 });
  assert.deepEqual(platformOf(['gba']), { name: 'GBA', igdbId: 24 });
  assert.deepEqual(platformOf(['nds']), { name: 'NDS', igdbId: 20 });
  assert.deepEqual(platformOf(['psx']), { name: 'PS1', igdbId: 7 });
  assert.deepEqual(platformOf(['ps1']), { name: 'PS1', igdbId: 7 });
  assert.deepEqual(platformOf(['psp']), { name: 'PSP', igdbId: 38 });
  assert.deepEqual(platformOf(['rom-hack']), { name: 'Other', igdbId: null });
});

test('statusOf', () => {
  const rel = (tag, date, prerelease = false, draft = false) => ({ tag_name: tag, html_url: 'u/' + tag, published_at: date, prerelease, draft });
  assert.deepEqual(statusOf([]), { status: 'progress', release: null, testBuild: null });
  assert.deepEqual(statusOf([rel('v0.1', '2026-01-01', true)]),
    { status: 'test', release: null, testBuild: { tag: 'v0.1', url: 'u/v0.1', date: '2026-01-01' } });
  // released with a newer pre-release → both
  const s = statusOf([rel('v1.1-test2', '2026-10-24', true), rel('v1.0', '2026-10-10')]);
  assert.equal(s.status, 'released');
  assert.equal(s.release.tag, 'v1.0');
  assert.equal(s.testBuild.tag, 'v1.1-test2');
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module './lib.mjs'` (or missing exports)

- [ ] **Step 4: Implement `scripts/lib.mjs`**

- `parseTitle`: match `/translation(?: patch)? (?:of|for) (.+?) \([^)]*\)/`. With no match, humanize the name: strip a trailing `-en`/`-english`, swap `-` for a space, and title-case each word.
- `listAllPages`: append `&page=N` starting at 1, and stop when a page returns fewer than 100 items.
- `statusOf`: drop drafts and sort by `published_at` descending. `release` is the first non-prerelease. `testBuild` is the first prerelease, kept only when there's no release or the prerelease date is after the release date.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all `lib` tests pass

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/lib.mjs scripts/lib.test.mjs
git commit -m "feat: pure helpers for project data"
```

---

### Task 2: IGDB lookup

**Files:**
- Create: `scripts/igdb.mjs`, `scripts/igdb.test.mjs`

**Interfaces:**
- Consumes: `platformOf().igdbId` (Task 1)
- Produces:
  - `buildGameQuery(title: string, platformId: number|null): string`
  - `coverUrl(imageId: string): string` → `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`
  - `getToken(clientId, clientSecret, fetchFn = fetch): Promise<string>` POSTs `https://id.twitch.tv/oauth2/token?client_id=…&client_secret=…&grant_type=client_credentials` and returns `access_token`
  - `findGame(title, platformId, {clientId, token}, fetchFn = fetch): Promise<{id, name, year, imageId}|null>` POSTs `https://api.igdb.com/v4/games` with headers `Client-ID`, `Authorization: Bearer <token>`, and the body `buildGameQuery(...)`. It returns the first result that has `cover.image_id`; `year` comes from `first_release_date` (unix seconds) or is null.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run** `npm test`. Expected: the igdb tests FAIL (module missing).
- [ ] **Step 3: Implement `scripts/igdb.mjs`** to the Interfaces above. A non-ok response throws `Error("IGDB <status>")`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `git add scripts/igdb.* && git commit -m "feat: IGDB game and cover lookup"`

---

### Task 3: Build script

**Files:**
- Create: `scripts/build.mjs`, `scripts/build.test.mjs`
- Modify: `.gitignore` (add `site/projects.json`)

**Interfaces:**
- Consumes: everything from Task 1, and `getToken`, `findGame`, `coverUrl` from Task 2
- Produces:
  - `buildProject(repo: GhRepo, api: {tree(repo), releases(repo), commits(repo)}): Promise<Project>` where `Project` is the `projects.json` shape plus an internal `needsCover: boolean`, `igdbPlatform: number|null` (both stripped before writing)
  - `main()`. It runs only when the file is executed directly (`import.meta.url === pathToFileURL(process.argv[1]).href`)

Behavior of `main()`:
1. Token is `REPO_WRITE_TOKEN || GITHUB_TOKEN`. `getJson(url)` sends `Authorization: Bearer`, `Accept: application/vnd.github+json`, and throws on a non-ok response.
2. List repos with `listAllPages(getJson, 'https://api.github.com/users/minhnhattonthat/repos?per_page=100&type=owner')`, then `.filter(isProject)`. If the listing fails, exit 1.
3. `api.tree` calls `GET /repos/{o}/{r}/git/trees/{default_branch}?recursive=1` and returns paths. `api.releases` calls `GET …/releases?per_page=30`. `api.commits` calls `GET …/commits?per_page=20`.
4. If `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` are set, get one token. Then for each `needsCover` project, `findGame(title, igdbPlatform)`.
   - **Dry run** (default): append a line to `$GITHUB_STEP_SUMMARY` (stdout if unset): `| repo | title | match name (year) igdb id | cover link |`, or `no match`.
   - **`COMMIT_COVERS === 'true'`**: download the cover image, then `PUT /repos/{o}/{r}/contents/docs/cover.jpg` with base64 `content`, `message: 'Add cover art from IGDB [skip ci]'`, and `author`/`committer` both `{name:'cover-bot', email:'cover-bot@users.noreply.github.com'}`. On success, set `project.cover`.
   - Per-repo IGDB/commit errors are logged, and the loop continues.
5. Write `site/projects.json` (pretty, without internal fields), sorted by `updatedAt` descending.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProject } from './build.mjs';

const repo = { name: 'kabuki-rocks', description: 'English translation patch for Kabuki Rocks (SNES)', topics: ['fan-translation', 'snes'],
  default_branch: 'main', created_at: '2026-09-01T00:00:00Z', pushed_at: '2026-10-25T00:00:00Z', html_url: 'https://github.com/minhnhattonthat/kabuki-rocks' };
const raw = 'https://raw.githubusercontent.com/minhnhattonthat/kabuki-rocks/main/';

test('buildProject assembles a full project', async () => {
  const p = await buildProject(repo, {
    tree: async () => ['docs/cover.jpg', 'docs/screenshots/1.png', '.github/ISSUE_TEMPLATE/bug.yml'],
    releases: async () => [{ tag_name: 'v1.0', html_url: 'r', published_at: '2026-10-01T00:00:00Z', prerelease: false, draft: false }],
    commits: async () => [{ commit: { author: { name: 'cover-bot', date: '2026-10-25T00:00:00Z' } } }, { commit: { author: { name: 'me', date: '2026-10-21T00:00:00Z' } } }],
  });
  assert.equal(p.title, 'Kabuki Rocks');
  assert.equal(p.platform, 'SNES');
  assert.equal(p.status, 'released');
  assert.equal(p.cover, raw + 'docs/cover.jpg');
  assert.deepEqual(p.screenshots, [raw + 'docs/screenshots/1.png']);
  assert.equal(p.updatedAt, '2026-10-21T00:00:00Z');
  assert.equal(p.issueUrl, 'https://github.com/minhnhattonthat/kabuki-rocks/issues/new?template=bug.yml');
  assert.equal(p.needsCover, false);
});

test('buildProject survives failing sub-calls', async () => {
  const boom = async () => { throw new Error('404'); };
  const p = await buildProject(repo, { tree: boom, releases: boom, commits: boom });
  assert.equal(p.status, 'progress');
  assert.equal(p.cover, null);
  assert.deepEqual(p.screenshots, []);
  assert.equal(p.issueUrl, 'https://github.com/minhnhattonthat/kabuki-rocks/issues/new');
  assert.equal(p.updatedAt, '2026-10-25T00:00:00Z'); // falls back to pushed_at
  assert.equal(p.needsCover, false); // tree unknown → don't try to commit
});
```

- [ ] **Step 2: Run** `npm test`. Expected: the build tests FAIL.
- [ ] **Step 3: Implement `scripts/build.mjs`** per the Interfaces and the behavior above. Wrap each `api.*` call in its own try/catch with defaults (`[]`). `needsCover` is true only when the tree call succeeded and `!hasCover`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Smoke test against real GitHub (dry run, no IGDB)**

Run: `GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs && node -e "const p=require('./site/projects.json');console.log(p.length, p[0])"`
Expected: about 31 projects, first item shaped like the contract, and no repos named `translate-retro-game`/`fan-translation-template`.

- [ ] **Step 6: Commit** `git add .gitignore scripts/build.* && git commit -m "feat: build projects.json with dry-run IGDB cover step"`

---

### Task 4: Page

**Files:**
- Create: `site/view.mjs`, `site/view.test.mjs`, `site/index.html`, `site/style.css`, `site/app.js`

**Interfaces:**
- Consumes: the `projects.json` contract
- Produces:
  - `filterProjects(projects, {q = '', platform = '', status = ''}): Project[]`. `q` is case-insensitive over `title` + `description`. Empty values mean all.
  - `sortProjects(projects, key: 'updated'|'created'|'release'|'az'): Project[]` returns a new array.
    - `updated`/`created`: by `updatedAt`/`createdAt`, descending.
    - `release`: by `(release ?? testBuild)?.date`, descending, with nulls last.
    - `az`: `title.localeCompare`.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, sortProjects } from './view.mjs';

const P = [
  { title: 'Beta', description: 'gba thing', platform: 'GBA', status: 'progress', release: null, testBuild: null, createdAt: '2026-03', updatedAt: '2026-01' },
  { title: 'alpha', description: 'snes', platform: 'SNES', status: 'released', release: { date: '2026-05' }, testBuild: null, createdAt: '2026-01', updatedAt: '2026-02' },
  { title: 'Gamma', description: '', platform: 'SNES', status: 'test', release: null, testBuild: { date: '2026-06' }, createdAt: '2026-02', updatedAt: '2026-03' },
];
const titles = (a) => a.map((p) => p.title);

test('filter', () => {
  assert.deepEqual(titles(filterProjects(P, { platform: 'SNES' })), ['alpha', 'Gamma']);
  assert.deepEqual(titles(filterProjects(P, { status: 'test' })), ['Gamma']);
  assert.deepEqual(titles(filterProjects(P, { q: 'GBA' })), ['Beta']);
  assert.deepEqual(filterProjects(P, { q: 'zzz' }), []);
  assert.equal(filterProjects(P, {}).length, 3);
});

test('sort', () => {
  assert.deepEqual(titles(sortProjects(P, 'updated')), ['Gamma', 'alpha', 'Beta']);
  assert.deepEqual(titles(sortProjects(P, 'created')), ['Beta', 'Gamma', 'alpha']);
  assert.deepEqual(titles(sortProjects(P, 'release')), ['Gamma', 'alpha', 'Beta']);
  assert.deepEqual(titles(sortProjects(P, 'az')), ['alpha', 'Beta', 'Gamma']);
});
```

- [ ] **Step 2: Run** `npm test`. Expected: the view tests FAIL.
- [ ] **Step 3: Implement `site/view.mjs`.** Then run `npm test`. Expected: all pass.
- [ ] **Step 4: Write `site/index.html`, `site/style.css`, `site/app.js`**
  - The HTML has the header with the title, intro line and Ko-fi button, then controls: search `<input type=search>`, platform `<select>` (All, SNES, GBA, NDS, PS1, PSP, Other), status `<select>` (All, Released, Test build, In progress), and sort `<select>` (Last updated default, Newest project, Latest release, A–Z). Then `<main id="grid">`, and a footer with the Ko-fi button. Every control gets a `<label>`. `app.js` is loaded as `type="module"`.
  - Each card has these parts:
    - The cover `<img loading="lazy" alt="<title> cover">`. With no cover, a `<div class="cover placeholder cover--<platform>">` showing the platform name.
    - The title.
    - The platform.
    - A status badge (`Released` / `Test build` / `In progress`).
    - `⬇ Download <tag>` linking `release.url`, if present.
    - A small `Test build <tag>` linking `testBuild.url`, if present.
    - `Updated <toLocaleDateString>`.
    - Screenshot thumbnails, each an `<a target="_blank" rel="noopener">` around an `<img loading="lazy">`.
    - `⚠ Report issue` linking `issueUrl` (target `_blank`).
    - `Repo` linking `repoUrl`.
  - `app.js` builds the DOM with `createElement`/`textContent` only. If the filter result is empty, show `No projects match.` If the fetch fails, show `Couldn't load projects.`
  - CSS: style A, a CSS grid `repeat(auto-fill, minmax(240px, 1fr))`, and phone width with a 16px gutter. Placeholder colors per platform go in `.cover--SNES` etc.
- [ ] **Step 5: Check untrusted text is never parsed as HTML**

Run: `grep -n "innerHTML\|insertAdjacentHTML\|outerHTML" site/app.js`
Expected: no output (or only `innerHTML = ''` to clear the grid)

- [ ] **Step 6: Manual check**

Run: `python -m http.server -d site 8080` (using `projects.json` from Task 3, Step 5), then open `http://localhost:8080`.
Expected:
- Cards render.
- Platform/status/search filters work, and searching `zzzz` shows "No projects match."
- All 4 sorts reorder.
- Report issue opens `/issues/new?template=bug.yml`.
- The Ko-fi buttons link to ko-fi.com/minhnhattonthat.
- The layout works at 375px wide.

- [ ] **Step 7: Commit** `git add site && git commit -m "feat: project grid page with filter and sort"`

---

### Task 5: Workflow + README

**Files:**
- Create: `.github/workflows/pages.yml`, `README.md`

- [ ] **Step 1: Write `pages.yml`**
  - `on`:
    - `schedule: [{cron: '0 */6 * * *'}]`
    - `push: {branches: [main]}`
    - `workflow_dispatch: {inputs: {commit: {type: boolean, default: false, description: 'Commit IGDB covers into project repos'}}}`
  - `permissions: {contents: read, pages: write, id-token: write}`. `concurrency: {group: pages, cancel-in-progress: false}`.
  - Job `build`:
    - `actions/checkout@v4`
    - `actions/setup-node@v4` (node 20)
    - `npm test`
    - `node scripts/build.mjs`, with env:
      - `REPO_WRITE_TOKEN: ${{ secrets.REPO_WRITE_TOKEN }}`
      - `GITHUB_TOKEN: ${{ github.token }}`
      - `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` from secrets
      - `COMMIT_COVERS: ${{ inputs.commit == true && 'true' || 'false' }}`
    - `actions/upload-pages-artifact@v3` with `path: site`
  - Job `deploy`: `needs: build`, `environment: github-pages`, `actions/deploy-pages@v4`.
- [ ] **Step 2: Write `README.md`**
  - What the site is, and its live URL.
  - How projects get listed: the topic, `docs/cover.jpg` and `docs/screenshots/`.
  - Local preview: the Task 3 smoke command plus `python -m http.server -d site`.
  - Secrets setup:
    - Twitch: dev.twitch.tv/console → Register app, OAuth redirect `http://localhost`, category "Application Integration" → copy the Client ID and generate a secret.
    - Fine-grained PAT: Settings → Developer settings → Fine-grained tokens, owner minhnhattonthat, All repositories, Contents read/write.
    - Add all three under the repo's Settings → Secrets → Actions.
  - Cover run: a manual run with `commit` unchecked is a dry run (see the job summary). Check `commit` to write covers. Fix a wrong cover by replacing `docs/cover.jpg`.
- [ ] **Step 3: Validate the YAML parses.** Run `node -e "require('fs').readFileSync('.github/workflows/pages.yml','utf8')"` and inspect it by eye. Expected: indentation is consistent, with the triggers and two jobs above.
- [ ] **Step 4: Commit** `git add .github README.md && git commit -m "ci: scheduled build and Pages deploy"`

---

### Task 6: One-off repo changes (user pre-approved)

- [ ] **Step 1: Add topics**

```bash
gh repo edit minhnhattonthat/smt-devil-children-2-honoo-no-sho --add-topic fan-translation --add-topic gba
gh repo edit minhnhattonthat/hanjuku-hero-ah-sekai-yo-hanjuku-nare --add-topic fan-translation --add-topic snes
```
Verify with `gh repo view <repo> --json repositoryTopics`. Expected: both topics listed.

- [ ] **Step 2: Template note.** Clone `minhnhattonthat/fan-translation-template` into the scratchpad. Add `docs/screenshots/.gitkeep` and a README section titled "Project page", with these 3 lines:
  - The repo appears on the Minh-Nhat Ton-That Localization site via the `fan-translation` topic plus a platform topic.
  - Put up to 4 screenshots in `docs/screenshots/`.
  - `docs/cover.jpg` is added automatically from IGDB; replace it to fix a wrong match.

  Commit (`docs: project page conventions`) and push to the default branch.

`nage-libre` and `deltora-quest` are the user's to update. Don't touch them.

---

### Task 7: Publish and first cover run

- [ ] **Step 1: Ask the user to confirm**, then create the public repo and push: `gh repo create minhnhattonthat/minhnhat-tonthat-localization --public --source . --push`
- [ ] **Step 2: Enable Pages via Actions:** `gh api -X POST repos/minhnhattonthat/minhnhat-tonthat-localization/pages -f build_type=workflow`
- [ ] **Step 3: User adds the 3 secrets** (README steps). Wait for them to confirm.
- [ ] **Step 4: Dry run:** `gh workflow run pages.yml -f commit=false`, then `gh run watch`. Expected: green, with the site live at `https://minhnhattonthat.github.io/minhnhat-tonthat-localization/`.
- [ ] **Step 5: Show the user the job summary's match table**, and get an OK or fixes. They can drop a cover in by hand for bad matches.
- [ ] **Step 6: Real run:** `gh workflow run pages.yml -f commit=true`. Expected: covers committed by `cover-bot` with `[skip ci]`. Once the run finishes, cards show covers, and "last updated" order is unchanged from the dry run.
