# Fried Schölvinck

Personal site: the portfolio and the blog. One FastAPI app serves the pages, the JSON API, and the files in `frontend/public`.

Live site: https://fried.coldfinch.eu (also served at https://agent.fastapicloud.dev)

## Develop

```bash
uv sync
uv run fastapi dev
```

Open http://localhost:8000 (passkeys for `/admin` need a host name, not `127.0.0.1`). Interactive API docs are at http://localhost:8000/docs.

`fastapi dev` runs the whole app. There is no separate frontend server.

The `/ask` chat and the `/admin` dashboard are React islands in `frontend/app` (Vite, Tailwind, shadcn/ui). Build them once before you run the site, and again after you change them:

```bash
cd frontend/app && npm ci --ignore-scripts && npm run build
```

The build goes to `frontend/public/app`, which git ignores. CI builds it before every deploy.

## Content, stats and the chat

The site keeps its content in a database, so it changes without a deploy.

- **Content.** On the first start, the app copies `app/site.py` into the `entry` table (profile, experience, projects, skill groups, tools). After that, the database is the source. `app/site.py` stays the fallback when the database is down.
- **Admin.** `/admin` is for the owner only. Register the one passkey from `/admin#setup=<SITE_ENROLLMENT_TOKEN>`; after that, registration is closed. The admin shows visits, chat questions, and the questions the content could not answer. It edits every entry and reviews drafts.
- **Drafts.** Changes from AI and from LinkedIn are drafts. Nothing changes on the site until the owner applies a draft.
  - *AI suggestions* reword or restructure the content. They never add facts: a missing fact comes back as a gap for the owner to fill.
  - *LinkedIn* has no API for an individual's positions or skills. Upload LinkedIn's data export (Settings › Data privacy › Get a copy of your data) in the admin. Positions, projects, skills and the headline become drafts.
  - *Agents* (for example Claude with the LinkedIn connector) post drafts to `POST /api/admin/drafts` with a token from the admin.
- **Visits.** Counting uses no cookies. Each view stores the path, the referring site, the device type and a visitor hash: SHA-256 over a random salt for the day, the IP address and the user agent. The IP address and the user agent are never stored, and each day's salt is deleted after the day. Bots, prefetches, and browsers that send Global Privacy Control or Do Not Track are not counted. Views are kept for 400 days.
- **Chat.** `/ask` answers questions about Fried from the same content, in two modes:
  - *Fast*: the site streams Groq's free models (`openai/gpt-oss-120b`, then `openai/gpt-oss-20b`, then `qwen/qwen3.8-27b` when one is rate limited). The free tier allows about 1,000 requests a day per model. The site also limits questions to 30 per visitor and 600 in total per day. Questions and answers are stored for the owner.
  - *Private*: Gemma 4 E2B runs in the visitor's browser on WebGPU (`onnx-community/gemma-4-E2B-it-ONNX`, text only, q4f16, a one-time 3.1 GB download). Nothing leaves the device and nothing is stored. It needs WebGPU with 16-bit shaders, which desktop Chrome and Edge have.

### Settings

| Variable | Use |
|---|---|
| `DATABASE_URL` | Neon Postgres. Without it the app uses SQLite in `data/`, which FastAPI Cloud deletes on every redeploy. |
| `SITE_SESSION_SECRET` | Signs the admin session cookie. Long and random. |
| `SITE_ENROLLMENT_TOKEN` | Opens the one-time passkey setup at `/admin#setup=<token>`. |
| `SITE_ORIGIN`, `SITE_RP_ID` | The public origin (`https://example.com`) and its host name, for passkeys and same-origin checks. |
| `SITE_HTTPS_ONLY` | `true` in production. |
| `GROQ_API_KEY` | The hosted chat and AI suggestions. Without it, only the private mode works. |
| `PORTAL_URL` | The portal that holds the blog posts. The default is `https://api-421d8344.fastapicloud.dev`. |
| `PORTAL_REVALIDATE_SECRET` | The secret the portal sends to `POST /api/revalidate`. Without it, that route is off. |

Set secrets with `uv run fastapi cloud env set --secret NAME`.

Production uses the Neon project `portfolio` (`delicate-feather-09441654`, `aws-us-east-1`) in the `coldfinch` organization, through its pooled connection string. The admin setup link (`https://fried.coldfinch.eu/admin#setup=…`) is in the macOS Keychain as "fried.coldfinch.eu admin setup link". It works once: after the first passkey, registration is closed.

## Deploy

```bash
uv run fastapi deploy
```

The GitHub Actions workflow `.github/workflows/deploy.yml` ("Validate and deploy") runs ruff and pytest on every pull request. On a push to `main` it also runs `uv run fastapi deploy`. It reads the repository secrets `FASTAPI_CLOUD_TOKEN` (a deploy token for the `agent` app) and `FASTAPI_CLOUD_APP_ID`.

This directory is linked to the FastAPI Cloud app named `agent` on the Xomnia team. That command updates https://fried.coldfinch.eu and https://agent.fastapicloud.dev. The CLI prints the URL again when the deploy finishes.

FastAPI Cloud sets `FASTAPI_PUBLIC_URL` to the app address, or to the first custom domain once one is attached. Canonical links, the sitemap, and `/llms.txt` use that value. On your machine they use the local host instead.

## Custom domain

`fried.coldfinch.eu` is attached. It is the team's only custom domain on the Hobby plan. Its DNS is a DNS-only (grey cloud) CNAME in Cloudflare that points to `a3d689e3-23c0-4669-ab04-28173aafb756.custom-domains.fastapicloud.dev`.

To attach a different domain, a deploy must succeed first.

1. Open the app in the [FastAPI Cloud dashboard](https://fastapicloud.com).
2. Choose Domains.
3. Add the domain without `https://`.
4. Create the DNS records the dashboard shows. An apex domain uses `A` records and a `TXT` record. A subdomain uses a `CNAME`.
5. If the DNS is on Cloudflare, set those records to DNS only (grey cloud), not proxied.

FastAPI Cloud requests and renews the certificate. The full steps, including a zero-downtime option for a domain that already has traffic, are in the [custom domains guide](https://fastapicloud.com/docs/advanced-features/custom-domains/).

## GitHub Pages

The GitHub Pages workflow is gone. The deploy workflow now publishes to FastAPI Cloud, so a push to `main` does not publish a second copy of the site. https://friett.github.io/ still shows the previous build until GitHub Pages is turned off in the repository settings (Settings, Pages, then disable the source).

## Layout

- `app/` is the FastAPI app: pages, the JSON API, markdown rendering, the content store (`content.py`, `db.py`), visit counting (`tracking.py`), the chat (`chat.py`), the admin (`auth.py`, `routers/admin.py`), the LinkedIn import and the AI suggestions
- `frontend/app/` is the React source of the `/ask` and `/admin` islands
- `content/blog/` is a backup copy of the writing. The portal is the source (see Blog)
- `frontend/templates/` is the HTML
- `frontend/public/` is CSS, JavaScript, icons, images, and narration audio
- `app.frontend()` serves `frontend/public`

Page routes are matched before those files. `/docs` shows the JSON API. New backend work belongs in `app/routers`, under `/api`, next to the site and blog routes.

## Interface

The pages are server-rendered HTML in an app shell: a sidebar on wide screens (collapses to an icon rail, remembered per browser) and a top bar with a bottom tab bar on phones. `frontend/public/styles.css` starts with the design tokens. Colours, surfaces and radii are CSS variables with light and dark values. Light, dark or system theme is remembered per browser, and a small script in `base.html` applies it before the first paint.

`frontend/public/app.js` is optional. Without it every link, section and post still works. With it:

- `⌘K` / `Ctrl+K` or `/` opens search over sections, posts, projects, profiles and tools
- `?` shows the shortcuts, `G` then `H`, `K` (Ask AI), `A`, `P`, `W`, `T` or `C` jumps to a section, `[` collapses the sidebar

Navigation items and the palette index live in `app/shell.py`. Icons are inline SVG from `app/icons.py`.

The app icon is `frontend/public/icons/icon.svg`. After changing it, render the PNGs with any Playwright install:

```bash
PLAYWRIGHT=/path/to/node_modules/playwright node scripts/icons.mjs
```

For a visual check at phone and desktop sizes in light and dark, run the dev server on port 8123 and then:

```bash
PLAYWRIGHT=/path/to/node_modules/playwright BASE=http://127.0.0.1:8123 node scripts/screenshots.mjs
```

The screenshots go to `artifacts/screenshots/`, which git ignores.

## Blog

The portal is the source of the blog posts. Write and publish them at https://api-421d8344.fastapicloud.dev/writing. The site does not edit posts.

The site reads the portal's public API (`app/posts.py`):

- `GET {PORTAL_URL}/api/public/posts` for the list, newest first
- `GET {PORTAL_URL}/api/public/posts/{slug}` for one post with its markdown body

The home page, the post pages, the sitemap, `/llms.txt`, the search palette, the chat context and `/api/posts` all use it.

- **Cache.** Each answer is kept in memory for five minutes.
- **Portal down.** The site shows the last good copy. It tries the portal again after 30 seconds.
- **Portal never answered.** If the portal has not answered once since the app started, the site shows the markdown files in `content/blog`. These files are only a backup. Edits to them do not reach the live site while the portal works.
- **Revalidate.** The portal calls `POST /api/revalidate` with `Authorization: Bearer <PORTAL_REVALIDATE_SECRET>` when a post is published. The site then asks the portal again on the next request. The route answers 401 for a wrong secret, and 404 when `PORTAL_REVALIDATE_SECRET` is not set.

Image paths in a post body, like `/images/blog/owui.png`, point at files in `frontend/public`. Add new images there.

To add narration, save an MP3 at `frontend/public/audio/<slug>.mp3`. The post page adds a player when that file exists. The old generator lived in a local `voice/` directory and was not part of the repository. The MP3s already in `frontend/public/audio/` are the recordings that ship with the site.

## Checks

```bash
uv run pytest
uv run ruff check
uv run ruff format --check
```
