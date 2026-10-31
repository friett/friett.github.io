from html import escape

from fastapi import APIRouter
from fastapi.responses import JSONResponse, PlainTextResponse, Response

from app.content import load_site
from app.deps import BlogStoreDep, ProjectSourceDep, PublicUrlDep
from app.site import HOME_DESCRIPTION

router = APIRouter(include_in_schema=False)


@router.get("/robots.txt", response_class=PlainTextResponse)
def robots(public_url: PublicUrlDep) -> str:
    return (
        "User-agent: *\n"
        "Allow: /\n"
        "\n"
        "User-agent: OAI-SearchBot\n"
        "Allow: /\n"
        "\n"
        "User-agent: Claude-SearchBot\n"
        "Allow: /\n"
        "\n"
        "User-agent: PerplexityBot\n"
        "Allow: /\n"
        "\n"
        f"Sitemap: {public_url}/sitemap.xml\n"
    )


# Colours match the navigation surface in styles.css, so the iOS status bar and
# the Android splash screen blend with the page.
THEME_LIGHT = "#f0f3f2"
THEME_DARK = "#0a0e0d"


@router.get("/manifest.webmanifest")
def manifest() -> JSONResponse:
    icons = [
        {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {
            "src": "/icons/icon-maskable-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "maskable",
        },
        {"src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml"},
    ]
    shortcuts = [
        {"name": "Writing", "url": "/#blog"},
        {"name": "Projects", "url": "/projects"},
    ]
    return JSONResponse(
        {
            "name": load_site().name,
            "short_name": "Fried",
            "description": HOME_DESCRIPTION,
            "id": "/",
            "start_url": "/",
            "scope": "/",
            "display": "standalone",
            "lang": "en",
            "background_color": THEME_LIGHT,
            "theme_color": THEME_LIGHT,
            "icons": icons,
            "shortcuts": shortcuts,
        },
        media_type="application/manifest+json",
    )


@router.get("/sitemap.xml")
def sitemap(
    public_url: PublicUrlDep,
    blog: BlogStoreDep,
    projects: ProjectSourceDep,
) -> Response:
    entries: list[tuple[str, str, str, str | None]] = [
        (f"{public_url}/", "monthly", "1.0", None),
        (f"{public_url}/projects", "weekly", "0.9", None),
    ]
    for project in projects.list_projects():
        lastmod = project.updated_at or None
        entries.append(
            (f"{public_url}/projects#{project.slug}", "monthly", "0.6", lastmod)
        )
    for post in blog.list_posts():
        entries.append(
            (f"{public_url}/blog/{post.slug}", "yearly", "0.7", post.date or None)
        )
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, freq, priority, lastmod in entries:
        lines.append("  <url>")
        lines.append(f"    <loc>{escape(loc)}</loc>")
        if lastmod:
            lines.append(f"    <lastmod>{escape(lastmod)}</lastmod>")
        lines.append(f"    <changefreq>{freq}</changefreq>")
        lines.append(f"    <priority>{priority}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return Response(content="\n".join(lines) + "\n", media_type="application/xml")


@router.get("/llms.txt", response_class=PlainTextResponse)
def llms(
    public_url: PublicUrlDep,
    blog: BlogStoreDep,
    projects: ProjectSourceDep,
) -> str:
    lines = [
        f"# {load_site().name}",
        "",
        f"> {HOME_DESCRIPTION}",
        "",
        (
            "Fried works on production AI systems, generative AI, agentic "
            "applications, data engineering and custom software. He works at "
            "Xomnia and runs Coldfinch, a Dutch company providing managed "
            "open-source software and custom business applications."
        ),
        "",
        "## Main pages",
        "",
        (
            f"- [Home]({public_url}/): Biography, skills, selected work and writing."
        ),
        (
            f"- [Projects]({public_url}/projects): "
            "Work and products from the developer portal."
        ),
        (
            "- [Coldfinch](https://coldfinch.eu/): Managed open-source and "
            "custom software company founded by Fried."
        ),
        (
            "- [Momberger Airport Information](https://momberger.app/): B2B "
            "airport intelligence platform built by Coldfinch."
        ),
        (
            "- [Huib Luns](https://huibluns.nl/): Digital art archive built "
            "by Coldfinch."
        ),
        "",
        "## Projects",
        "",
    ]
    portal_projects = projects.list_projects()
    if portal_projects:
        for project in portal_projects:
            line = f"- [{project.name}]({public_url}/projects#{project.slug})"
            if project.summary:
                line += f": {project.summary}"
            if project.live_url:
                line += f" Live: {project.live_url}."
            lines.append(line)
    else:
        lines.append(
            f"- [Projects index]({public_url}/projects): Portal-backed project list."
        )
    lines.extend(
        [
            "",
            "## Writing",
            "",
        ]
    )
    for post in blog.list_posts():
        lines.append(f"- [{post.title}]({public_url}/blog/{post.slug})")
    lines.extend(
        [
            "",
            "## Profiles",
            "",
            f"- [GitHub]({load_site().github})",
            f"- [LinkedIn]({load_site().linkedin})",
            "- [Xomnia](https://xomnia.com/)",
            "",
        ]
    )
    return "\n".join(lines)
