from datetime import date
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from app.deps import BlogStoreDep, PublicUrlDep, SiteDep
from app.models import Post, PostSummary, Site
from app.posts import PostSource
from app.render import templates
from app.shell import palette_index, profiles
from app.site import HOME_DESCRIPTION, HOME_TITLE, person_json_ld, post_json_ld

router = APIRouter(include_in_schema=False)

INDEXABLE = "index, follow, max-image-preview:large, max-snippet:-1"


def _related(post: Post, posts: list[PostSummary]) -> list[PostSummary]:
    tags = set(post.tags)
    ranked = [
        (len(tags.intersection(other.tags)), other)
        for other in posts
        if other.slug != post.slug and tags.intersection(other.tags)
    ]
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [other for _score, other in ranked[:2]]


def _render(
    request: Request,
    name: str,
    *,
    site: Site,
    blog: PostSource,
    public_url: str,
    current: str,
    status_code: int = 200,
    **context: Any,
) -> HTMLResponse:
    """Render a page inside the shell: navigation, palette and footer."""
    posts = context.get("posts") or blog.list_posts()
    return templates.TemplateResponse(
        request,
        name,
        {
            "site": site,
            "year": date.today().year,
            "public_url": public_url,
            "current": current,
            "profiles": profiles(site),
            "palette": palette_index(site, posts),
            **context,
        },
        status_code=status_code,
    )


@router.get("/", response_class=HTMLResponse)
def home(
    request: Request,
    site: SiteDep,
    blog: BlogStoreDep,
    public_url: PublicUrlDep,
) -> HTMLResponse:
    return _render(
        request,
        "index.html",
        site=site,
        blog=blog,
        public_url=public_url,
        current="home",
        posts=blog.list_posts(),
        canonical=f"{public_url}/",
        page_title=HOME_TITLE,
        page_description=HOME_DESCRIPTION,
        og_type="website",
        robots=INDEXABLE,
        json_ld=person_json_ld(public_url),
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
        return _render(
            request,
            "not_found.html",
            site=site,
            blog=blog,
            public_url=public_url,
            current="writing",
            status_code=404,
            canonical=f"{public_url}/blog/{slug}",
            page_title="Post not found | Fried Schölvinck",
            page_description="This post does not exist.",
            og_type="website",
            robots="noindex",
            json_ld=None,
        )
    posts = blog.list_posts()
    index = next(
        item for item, summary in enumerate(posts) if summary.slug == post.slug
    )
    return _render(
        request,
        "post.html",
        site=site,
        blog=blog,
        public_url=public_url,
        current="writing",
        posts=posts,
        post=post,
        newer=posts[index - 1] if index > 0 else None,
        older=posts[index + 1] if index + 1 < len(posts) else None,
        related=_related(post, posts),
        canonical=f"{public_url}/blog/{post.slug}",
        page_title=f"{post.title} | Fried Schölvinck",
        page_description=post.preview,
        og_type="article",
        robots=INDEXABLE,
        json_ld=post_json_ld(
            public_url, post.title, post.date, post.preview, post.slug
        ),
    )


@router.get("/ask", response_class=HTMLResponse)
def ask_page(
    request: Request,
    site: SiteDep,
    blog: BlogStoreDep,
    public_url: PublicUrlDep,
) -> HTMLResponse:
    return _render(
        request,
        "app.html",
        site=site,
        blog=blog,
        public_url=public_url,
        current="ask",
        island="ask",
        data={"q": request.query_params.get("q", "")[:500]},
        canonical=f"{public_url}/ask",
        page_title="Ask about Fried | Fried Schölvinck",
        page_description=(
            f"Ask an AI assistant about {site.name}'s work, projects and writing."
        ),
        og_type="website",
        robots=INDEXABLE,
        json_ld=None,
    )


@router.get("/admin", response_class=HTMLResponse)
def admin_page(
    request: Request,
    site: SiteDep,
    blog: BlogStoreDep,
    public_url: PublicUrlDep,
) -> HTMLResponse:
    return _render(
        request,
        "app.html",
        site=site,
        blog=blog,
        public_url=public_url,
        current="admin",
        island="admin",
        canonical=f"{public_url}/admin",
        page_title="Admin | Fried Schölvinck",
        page_description="Site admin.",
        og_type="website",
        robots="noindex, nofollow",
        json_ld=None,
    )
