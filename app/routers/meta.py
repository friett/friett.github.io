from html import escape

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse, Response

from app.deps import BlogStoreDep, PublicUrlDep
from app.site import HOME_DESCRIPTION, SITE

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


@router.get("/sitemap.xml")
def sitemap(public_url: PublicUrlDep, blog: BlogStoreDep) -> Response:
    entries: list[tuple[str, str, str, str | None]] = [
        (f"{public_url}/", "monthly", "1.0", None)
    ]
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
def llms(public_url: PublicUrlDep, blog: BlogStoreDep) -> str:
    lines = [
        f"# {SITE.name}",
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
            f"- [Home and selected work]({public_url}/): Biography, skills, "
            "projects and writing."
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
        "## Writing",
        "",
    ]
    for post in blog.list_posts():
        lines.append(f"- [{post.title}]({public_url}/blog/{post.slug})")
    lines.extend(
        [
            "",
            "## Profiles",
            "",
            f"- [GitHub]({SITE.github})",
            f"- [LinkedIn]({SITE.linkedin})",
            "- [Xomnia](https://xomnia.com/)",
            "",
        ]
    )
    return "\n".join(lines)
