"""Blog posts from the portal, the single source of truth for the writing.

The portal publishes posts at `GET /api/public/posts` and `/api/public/posts/{slug}`.
Each answer is kept in memory for five minutes. `POST /api/revalidate` (called by the
portal on publish) marks every copy as old, so the next request asks again.

When the portal fails, the site shows the last good copy. When the portal has not
answered once since the start, the site shows the local posts in `content/blog`, so the
blog is never empty.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Protocol

import httpx
from pydantic import BaseModel, Field

from app.blog import _SLUG, blog_store, render_with_toc
from app.config import get_settings
from app.models import Post, PostSummary
from app.paths import AUDIO_DIR

log = logging.getLogger(__name__)

CACHE_SECONDS = 300.0
# After a failed request, the old copy is used for this long before the next try, so
# an outage does not make every page wait for a timeout.
RETRY_SECONDS = 30.0
TIMEOUT = httpx.Timeout(3.0, connect=2.0)


class PostSource(Protocol):
    def list_posts(self) -> list[PostSummary]: ...

    def get_post(self, slug: str) -> Post | None: ...


class _PortalPost(BaseModel):
    slug: str
    title: str
    summary: str = ""
    tags: list[str] = Field(default_factory=list)
    published_at: str | None = None
    minutes: int = 1
    body: str = ""


@dataclass
class _Cached[T]:
    value: T
    expires: float


class PortalPosts:
    """Posts from the portal API, with a memory cache and the local posts as backup."""

    def __init__(
        self,
        base_url: str,
        fallback: PostSource,
        audio_directory: Path,
        *,
        transport: httpx.BaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.fallback = fallback
        self.audio_directory = audio_directory
        self.transport = transport
        self.clock = clock
        self._lock = Lock()
        self._list: _Cached[list[PostSummary]] | None = None
        self._posts: dict[str, _Cached[Post]] = {}

    def clear(self) -> None:
        """Make every copy old. Old copies stay as the backup if the portal fails."""
        with self._lock:
            if self._list is not None:
                self._list.expires = 0.0
            for cached in self._posts.values():
                cached.expires = 0.0

    def list_posts(self) -> list[PostSummary]:
        posts = self._summaries()
        return posts if posts is not None else self.fallback.list_posts()

    def get_post(self, slug: str) -> Post | None:
        if not _SLUG.fullmatch(slug):
            return None
        summaries = self._summaries()
        if summaries is None:
            return self.fallback.get_post(slug)
        if not any(summary.slug == slug for summary in summaries):
            return None
        now = self.clock()
        with self._lock:
            cached = self._posts.get(slug)
        if cached is not None and cached.expires > now:
            return cached.value
        try:
            response = self._get(f"/api/public/posts/{slug}")
            if response.status_code == 404:
                # Unpublished since the list was loaded: load the list again next time.
                with self._lock:
                    self._posts.pop(slug, None)
                    if self._list is not None:
                        self._list.expires = 0.0
                return None
            response.raise_for_status()
            post = self._post(_PortalPost.model_validate(response.json()))
        except (httpx.HTTPError, ValueError):
            log.warning("portal post %s unavailable", slug, exc_info=True)
            if cached is not None:
                with self._lock:
                    cached.expires = now + RETRY_SECONDS
                return cached.value
            return self.fallback.get_post(slug)
        with self._lock:
            self._posts[slug] = _Cached(post, now + CACHE_SECONDS)
        return post

    def _summaries(self) -> list[PostSummary] | None:
        """The portal's list, the last good copy, or None if it never answered."""
        now = self.clock()
        with self._lock:
            cached = self._list
        if cached is not None and cached.expires > now:
            return cached.value
        try:
            response = self._get("/api/public/posts")
            response.raise_for_status()
            items = response.json()
            if not isinstance(items, list):
                raise ValueError("expected a list of posts")
            posts = [self._summary(_PortalPost.model_validate(i)) for i in items]
        except (httpx.HTTPError, ValueError):
            log.warning("portal posts unavailable", exc_info=True)
            if cached is None:
                return None
            with self._lock:
                cached.expires = now + RETRY_SECONDS
            return cached.value
        with self._lock:
            self._list = _Cached(posts, now + CACHE_SECONDS)
        return posts

    def _get(self, path: str) -> httpx.Response:
        with httpx.Client(
            base_url=self.base_url,
            timeout=TIMEOUT,
            transport=self.transport,
            headers={"Accept": "application/json"},
        ) as client:
            return client.get(path)

    def _summary(self, item: _PortalPost) -> PostSummary:
        if not _SLUG.fullmatch(item.slug):
            raise ValueError(f"bad slug {item.slug!r}")
        audio = self.audio_directory / f"{item.slug}.mp3"
        return PostSummary(
            slug=item.slug,
            title=item.title,
            date=(item.published_at or "")[:10],
            tags=item.tags,
            preview=item.summary,
            minutes=item.minutes,
            audio=f"/audio/{item.slug}.mp3" if audio.is_file() else None,
        )

    def _post(self, item: _PortalPost) -> Post:
        body = item.body.strip()
        html, toc = render_with_toc(body)
        summary = self._summary(item)
        return Post(**summary.model_dump(), markdown=body, html=html, toc=toc)


post_source = PortalPosts(get_settings().portal_url, blog_store, AUDIO_DIR)
