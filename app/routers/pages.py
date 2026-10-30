from datetime import date

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from app.deps import BlogStoreDep, PublicUrlDep, SiteDep
from app.models import Post, PostSummary
from app.render import templates
from app.site import HOME_DESCRIPTION, HOME_TITLE, person_json_ld, post_json_ld

router = APIRouter(include_in_schema=False)


def _related(post: Post, posts: list[PostSummary]) -> list[PostSummary]:
    tags = set(post.tags)
    ranked = [
        (len(tags.intersection(other.tags)), other)
        for other in posts
        if other.slug != post.slug and tags.intersection(other.tags)
    ]
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [other for _score, other in ranked[:2]]


@router.get("/", response_class=HTMLResponse)
def home(
    request: Request,
    site: SiteDep,
    blog: BlogStoreDep,
    public_url: PublicUrlDep,
) -> HTMLResponse:
    canonical = f"{public_url}/"
    return templates.TemplateResponse(
        request,
        "index.html",
        {
            "site": site,
            "posts": blog.list_posts(),
            "year": date.today().year,
            "public_url": public_url,
            "canonical": canonical,
            "page_title": HOME_TITLE,
            "page_description": HOME_DESCRIPTION,
            "og_type": "website",
            "robots": "index, follow, max-image-preview:large, max-snippet:-1",
            "json_ld": person_json_ld(public_url),
        },
    )


@router.get("/blog/{slug}", response_class=HTMLResponse)
def blog_post(
    request: Request,
    slug: str,
    site: SiteDep,
    blog: BlogStoreDep,
    public_url: PublicUrlDep,
) -> HTMLResponse:
    post = blog.get_post(slug)
    if post is None:
        return templates.TemplateResponse(
            request,
            "not_found.html",
            {
                "site": site,
                "year": date.today().year,
                "public_url": public_url,
                "canonical": f"{public_url}/blog/{slug}",
                "page_title": "Post not found | Fried Schölvinck",
                "page_description": "This post does not exist.",
                "og_type": "website",
                "robots": "noindex",
                "json_ld": None,
            },
            status_code=404,
        )
    canonical = f"{public_url}/blog/{post.slug}"
    posts = blog.list_posts()
    index = next(
        item for item, summary in enumerate(posts) if summary.slug == post.slug
    )
    return templates.TemplateResponse(
        request,
        "post.html",
        {
            "site": site,
            "post": post,
            "newer": posts[index - 1] if index > 0 else None,
            "older": posts[index + 1] if index + 1 < len(posts) else None,
            "related": _related(post, posts),
            "year": date.today().year,
            "public_url": public_url,
            "canonical": canonical,
            "page_title": f"{post.title} | Fried Schölvinck",
            "page_description": post.preview,
            "og_type": "article",
            "robots": "index, follow, max-image-preview:large, max-snippet:-1",
            "json_ld": post_json_ld(
                public_url, post.title, post.date, post.preview, post.slug
            ),
        },
    )
