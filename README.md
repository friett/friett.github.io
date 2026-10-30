# Fried Schölvinck

Personal site: the portfolio and the blog. One FastAPI app serves the pages, the JSON API, and the files in `frontend/public`.

Live site: https://agent.fastapicloud.dev

## Develop

```bash
uv sync
uv run fastapi dev
```

Open http://127.0.0.1:8000. Interactive API docs are at http://127.0.0.1:8000/docs.

`fastapi dev` runs the whole app. There is no separate frontend server.

## Deploy

```bash
uv run fastapi deploy
```

The GitHub Actions workflow `.github/workflows/deploy.yml` ("Validate and deploy") runs ruff and pytest on every pull request. On a push to `main` it also runs `uv run fastapi deploy`. It reads the repository secrets `FASTAPI_CLOUD_TOKEN` (a deploy token for the `agent` app) and `FASTAPI_CLOUD_APP_ID`.

This directory is linked to the FastAPI Cloud app named `agent` on the Xomnia team. That command updates https://agent.fastapicloud.dev. The CLI prints the URL again when the deploy finishes.

FastAPI Cloud sets `FASTAPI_PUBLIC_URL` to the app address, or to the first custom domain once one is attached. Canonical links, the sitemap, and `/llms.txt` use that value. On your machine they use the local host instead.

## Custom domain

Attach a domain after a deploy has succeeded.

1. Open the app in the [FastAPI Cloud dashboard](https://fastapicloud.com).
2. Choose Domains.
3. Add the domain without `https://`.
4. Create the DNS records the dashboard shows. An apex domain uses `A` records and a `TXT` record. A subdomain uses a `CNAME`.
5. If the DNS is on Cloudflare, set those records to DNS only (grey cloud), not proxied.

FastAPI Cloud requests and renews the certificate. The full steps, including a zero-downtime option for a domain that already has traffic, are in the [custom domains guide](https://fastapicloud.com/docs/advanced-features/custom-domains/).

## GitHub Pages

The GitHub Pages workflow is gone. The deploy workflow now publishes to FastAPI Cloud, so a push to `main` does not publish a second copy of the site. https://friett.github.io/ still shows the previous build until GitHub Pages is turned off in the repository settings (Settings, Pages, then disable the source).

## Layout

- `app/` is the FastAPI app: pages, the JSON API, and markdown rendering
- `content/blog/` is the writing
- `frontend/templates/` is the HTML
- `frontend/public/` is CSS, JavaScript, icons, images, and narration audio
- `app.frontend()` serves `frontend/public`

Page routes are matched before those files. `/docs` shows the JSON API. New backend work belongs in `app/routers`, under `/api`, next to the site and blog routes.

## Blog

Add a markdown file in `content/blog`. The filename is the URL slug: `content/blog/my-note.md` is served at `/blog/my-note`.

```markdown
---
title: "Title"
date: "2026-10-28"
tags: ["AI"]
---

The post.
```

To add narration, save an MP3 at `frontend/public/audio/my-note.mp3`. The post page adds a player when that file exists. The old generator lived in a local `voice/` directory and was not part of the repository. The MP3s already in `frontend/public/audio/` are the recordings that ship with the site.

## Checks

```bash
uv run pytest
uv run ruff check
uv run ruff format --check
```
