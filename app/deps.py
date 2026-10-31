import os
from typing import Annotated

from fastapi import Depends, Request

from app.content import load_site
from app.models import Site
from app.posts import PostSource, post_source


def get_blog_store() -> PostSource:
    return post_source


def get_site() -> Site:
    return load_site()


def get_public_url(request: Request) -> str:
    configured = os.environ.get("FASTAPI_PUBLIC_URL", "").strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


BlogStoreDep = Annotated[PostSource, Depends(get_blog_store)]
SiteDep = Annotated[Site, Depends(get_site)]
PublicUrlDep = Annotated[str, Depends(get_public_url)]
