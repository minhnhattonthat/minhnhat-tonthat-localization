# Minh-Nhat Ton-That Localization

Project page for my English fan translations of Japanese retro games:
https://minhnhattonthat.github.io/minhnhat-tonthat-localization/

## How a project gets listed

A GitHub Action rebuilds the page every 6 hours. Any public repo of mine with the
`fan-translation` topic (plus a platform topic: `snes`, `gba`, `nds`, `psx`, `psp`)
shows up automatically, except the ones in `EXCLUDE` in `scripts/lib.mjs`.

Per repo:

- **Title**: taken from the description ("English fan translation of **Title** (Platform)").
- **Cover**: `docs/cover.jpg`. Added automatically from IGDB (see below). Replace the file to fix a wrong match.
- **Screenshots**: up to 4 images in `docs/screenshots/`, first 4 by filename.
- **Status**: Released (a full release exists), Test build (only pre-releases), In progress (no releases).
- **Report issue**: opens the repo's `bug.yml` issue form, or a blank issue if there isn't one.

## Covers from IGDB

Repos without `docs/cover.jpg` are looked up on IGDB by title and platform.

- Scheduled runs and manual runs with **commit** unchecked are a dry run: the matches
  are listed in the run's job summary, nothing is written.
- Run the workflow manually with **commit** checked to commit the covers
  (author `cover-bot`, message ends with `[skip ci]`).

## Secrets

Add these under the repo's Settings → Secrets and variables → Actions:

| Secret | How to get it |
|---|---|
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | IGDB uses Twitch accounts. https://dev.twitch.tv/console → Register Your Application, OAuth redirect `http://localhost`, category "Application Integration" → copy the Client ID, then New Secret. |
| `REPO_WRITE_TOKEN` | GitHub → Settings → Developer settings → Fine-grained tokens → Generate. Resource owner `minhnhattonthat`, All repositories, Repository permissions → Contents: Read and write. |

Without the Twitch secrets the cover step is skipped and the site still builds.

## Local preview

```bash
npm test
GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs   # writes site/projects.json
python -m http.server -d site 8080                     # open http://localhost:8080
```
