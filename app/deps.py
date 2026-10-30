import os
from typing import Annotated

from fastapi import Depends, Request

from app.blog import BlogStore, blog_store
from app.content import load_site
from app.models import Site


def get_blog_store() -> BlogStore:
    return blog_store


def get_site() -> Site:
    return load_site()


def get_public_url(request: Request) -> str:
    configured = os.environ.get("FASTAPI_PUBLIC_URL", "").strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


BlogStoreDep = Annotated[BlogStore, Depends(get_blog_store)]
SiteDep = Annotated[Site, Depends(get_site)]
PublicUrlDep = Annotated[str, Depends(get_public_url)]
