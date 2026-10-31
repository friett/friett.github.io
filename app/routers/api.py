import hmac
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from app.config import get_settings
from app.deps import BlogStoreDep, ProjectSourceDep, SiteDep
from app.models import Health, Post, PostSummary, PublicProject, Site
from app.posts import post_source
from app.projects import project_source

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


@router.get("/projects")
def list_projects(projects: ProjectSourceDep) -> list[PublicProject]:
    return projects.list_projects()


@router.post("/revalidate")
def revalidate(
    authorization: Annotated[str, Header()] = "",
) -> dict[str, bool]:
    """Forget cached portal content. The portal calls this on publish."""
    secret = get_settings().portal_revalidate_secret
    if not secret:
        raise HTTPException(status_code=404, detail="Not Found")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(
        token.strip().encode(), secret.encode()
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    post_source.clear()
    project_source.clear()
    return {"ok": True}
