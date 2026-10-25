# Minh-Nhat Ton-That Localization — site design

## Intent
One public page listing all of Minh-Nhat's fan-translation projects on GitHub (`minhnhattonthat`), so players can find patches, see what each game looks like, report bugs, and support the work via Ko-fi. New projects must appear without manual site edits.

## Goals
- Auto-list every project repo; new repo shows up within ~6h.
- Per project: cover art (from IGDB), screenshots (from the repo), status, download, report issue.
- Filter and sort.
- Ko-fi support link.

## Non-goals / anti-goals
- No framework, no build tooling beyond one Node script. User wants a **simple** website.
- No backend/server; no client-side GitHub/IGDB API calls (rate limits, IGDB secret + CORS).
- No IGDB screenshot fallback (those are the Japanese originals).
- Do not touch `minhnhattonthat.github.io` (existing Jekyll site).

## Hosting
This repo (`minhnhattonthat/minhnhat-tonthat-localization`), GitHub Pages project site: `https://minhnhattonthat.github.io/minhnhat-tonthat-localization/`. Deployed by GitHub Actions (Pages "GitHub Actions" source).

## Which repos count
Owner `minhnhattonthat`, public, non-fork, topic `fan-translation`, minus exclude list in the build script: `translate-retro-game`, `fan-translation-template`. (~31 games today.)

## Data pipeline
Workflow: `schedule` every 6h + `workflow_dispatch` (+ push to main).
1. Node script (Node 20, built-in `fetch`, no deps) lists repos via GitHub REST API, filters as above.
2. For each repo gathers:
   - name, html_url, description, topics, created_at, pushed_at/updated_at
   - releases: latest full release (tag, published_at, html_url) and whether pre-releases exist
   - `docs/cover.jpg` presence
   - `docs/screenshots/*` image files (png/jpg/jpeg/gif/webp), first 4 by filename
3. Cover automation: if `docs/cover.jpg` missing → IGDB search (title + platform), download `t_cover_big` image, commit it to the **project repo** at `docs/cover.jpg` (message e.g. "Add cover art from IGDB"). One-time per repo; fixing a wrong match = user replaces the file. If no match → no commit, card shows placeholder; retried next run.
   - **Dry run by default**: scheduled runs and plain manual runs only log `repo → IGDB game (id, name, year)` to the job summary. Covers are committed only on a manual `workflow_dispatch` with input `commit=true`.
   - Commit message includes `[skip ci]` (`sigma-harmonics-en` has a push workflow). No default branch is protected (checked 2026-10-25).
   - "Last updated" = date of the latest commit on the default branch whose author is not the cover bot (so cover commits don't reset sorting).
4. Writes `projects.json` into the Pages artifact (not committed) alongside static files; deploys.

Image URLs on the page point at `raw.githubusercontent.com/minhnhattonthat/<repo>/<default_branch>/docs/...`.

Failure of one repo (API error, IGDB miss) must not fail the whole build; log and continue. If the GitHub listing itself fails, fail the run (keep last deployed site).

### Title + platform
- Title: parsed from description, e.g. "English fan translation of **X** (SNES)" / "English translation patch for **X** (SNES)" / "Unofficial English … of **X** (Nintendo DS): …". Take text after "of"/"for" up to the last " (" before platform. Fallback: repo name humanized. (Builder may refine regex; covered by a small test over current descriptions.)
- Platform: from topics: `snes`, `gba`, `nds`, `psx`/`ps1` → "PS1", `psp`. Unknown → "Other".
- IGDB search: `/v4/games` with `search "<title>"`, filtered by IGDB platform id (SNES 19, GBA 24, NDS 20, PS1 7, PSP 38), take first with a cover; fetch `/v4/covers`.

### Status
- **Released**: at least one non-prerelease release → show latest version + download (release page link).
- **Test build**: only pre-releases → link latest pre-release.
- **In progress**: no releases.
- Released game whose newest release is a pre-release: card also shows a small "Test build vX" link.
- "Latest release" sort: Released → latest full release date; Test build → latest pre-release date; In progress → last.

## Secrets (user creates; builder documents steps in README)
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` — IGDB access (client-credentials token).
- `REPO_WRITE_TOKEN` — fine-grained PAT, owner minhnhattonthat, all repos, Contents read/write. Used for listing + cover commits.
If IGDB secrets absent, skip cover step (site still builds).

## Page
Style A "dark retro grid": dark background, monospace accents, neon highlights, compact cards. Keep it simple: one `index.html`, one `style.css`, one `app.js`.

- Header: "Minh-Nhat Ton-That Localization", one-line intro ("English fan translations of Japanese retro games"), Ko-fi button → `https://ko-fi.com/minhnhattonthat`.
- Controls: text search (title/description), platform filter, status filter, sort: last updated (default), newest project (created_at), latest release (date; repos without release last), A–Z.
- Card: cover (placeholder colored by platform if missing), title, platform, status badge, version + Download (if any), last updated, up to 4 screenshot thumbnails (click → full image in new tab), **Report issue** → `https://github.com/minhnhattonthat/<repo>/issues/new?template=bug.yml` (script checks the file exists; else plain `/issues/new` — `nage-libre`, `deltora-quest` lack it today), repo link.
- Footer: Ko-fi button again.
- Responsive grid; works on phone width. Images lazy-loaded, with alt text.

## One-off tasks (builder does, with user OK given)
- Add topic `fan-translation` (+ platform topic) to `smt-devil-children-2-honoo-no-sho` (gba) and `hanjuku-hero-ah-sekai-yo-hanjuku-nare` (snes).
- `fan-translation-template`: add `docs/screenshots/.gitkeep` and a README note: put up to 4 screenshots in `docs/screenshots/`; `docs/cover.jpg` is auto-added from IGDB, replace to fix.

## Left to the builder
File layout, exact CSS, regex details, logging, README contents.
