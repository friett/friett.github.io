from fastapi import APIRouter, HTTPException

from app.deps import BlogStoreDep, SiteDep
from app.models import Health, Post, PostSummary, Site

router = APIRouter(prefix="/api", tags=["api"])


@router.get("/health")
def health() -> Health:
    return Health(status="ok")


@router.get("/site")
def read_site(site: SiteDep) -> Site:
    return site


@router.get("/posts")
def list_posts(blog: BlogStoreDep) -> list[PostSummary]:
    return blog.list_posts()


@router.get("/posts/{slug}")
def read_post(slug: str, blog: BlogStoreDep) -> Post:
    post = blog.get_post(slug)
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    return post
