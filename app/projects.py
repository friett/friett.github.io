"""Public projects from the portal, with cache, last good copy and local backup."""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Protocol

import httpx
from pydantic import BaseModel, Field

from app.config import get_settings
from app.models import PublicProject
from app.paths import PROJECTS_BACKUP

log = logging.getLogger(__name__)

CACHE_SECONDS = 300.0
RETRY_SECONDS = 30.0
TIMEOUT = httpx.Timeout(3.0, connect=2.0)
_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class ProjectSource(Protocol):
    def list_projects(self) -> list[PublicProject]: ...


class _PortalProject(BaseModel):
    slug: str
    name: str
    public_summary: str = ""
    status: str = ""
    stage: str = ""
    type: str = ""
    live_url: str | None = None
    repo_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    updated_at: str | None = None


@dataclass
class _Cached[T]:
    value: T
    expires: float


class JsonProjectStore:
    """Bundled backup when the portal has never answered."""

    def __init__(self, path: Path) -> None:
        self.path = path

    def list_projects(self) -> list[PublicProject]:
        if not self.path.is_file():
            return []
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError):
            log.warning("project backup unreadable", exc_info=True)
            return []
        if not isinstance(raw, list):
            return []
        projects: list[PublicProject] = []
        for item in raw:
            try:
                projects.append(PublicProject.model_validate(item))
            except ValueError:
                log.warning("skipping invalid project in backup", exc_info=True)
        return projects


class PortalProjects:
    """Projects from the portal API, with memory cache and JSON backup."""

    def __init__(
        self,
        base_url: str,
        fallback: ProjectSource,
        *,
        transport: httpx.BaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.fallback = fallback
        self.transport = transport
        self.clock = clock
        self._lock = Lock()
        self._list: _Cached[list[PublicProject]] | None = None

    def clear(self) -> None:
        with self._lock:
            if self._list is not None:
                self._list.expires = 0.0

    def list_projects(self) -> list[PublicProject]:
        projects = self._load_list()
        return projects if projects is not None else self.fallback.list_projects()

    def _load_list(self) -> list[PublicProject] | None:
        now = self.clock()
        with self._lock:
            cached = self._list
        if cached is not None and cached.expires > now:
            return cached.value
        try:
            response = self._get("/api/public/projects")
            if response.status_code == 404:
                raise httpx.HTTPStatusError(
                    "not found", request=response.request, response=response
                )
            response.raise_for_status()
            items = response.json()
            if not isinstance(items, list):
                raise ValueError("expected a list of projects")
            projects = [
                self._project(_PortalProject.model_validate(item)) for item in items
            ]
        except (httpx.HTTPError, ValueError):
            log.warning("portal projects unavailable", exc_info=True)
            if cached is None:
                return None
            with self._lock:
                cached.expires = now + RETRY_SECONDS
            return cached.value
        with self._lock:
            self._list = _Cached(projects, now + CACHE_SECONDS)
        return projects

    def _get(self, path: str) -> httpx.Response:
        with httpx.Client(
            base_url=self.base_url,
            timeout=TIMEOUT,
            transport=self.transport,
            headers={"Accept": "application/json"},
        ) as client:
            return client.get(path)

    def _project(self, item: _PortalProject) -> PublicProject:
        if not _SLUG.fullmatch(item.slug):
            raise ValueError(f"bad slug {item.slug!r}")
        updated = (item.updated_at or "")[:10]
        return PublicProject(
            slug=item.slug,
            name=item.name,
            summary=item.public_summary,
            status=item.status,
            stage=item.stage,
            type=item.type,
            live_url=item.live_url,
            repo_url=item.repo_url,
            tags=item.tags,
            updated_at=updated,
        )


backup_store = JsonProjectStore(PROJECTS_BACKUP)
project_source = PortalProjects(get_settings().portal_url, backup_store)
