"""Projects from the portal: cache, last good copy, JSON backup and revalidate."""

import httpx
import pytest
from fastapi.testclient import TestClient

from app import projects
from app.config import get_settings
from app.deps import get_project_source
from app.main import app
from app.paths import PROJECTS_BACKUP

PORTAL = "https://portal.test"
LIST = [
    {
        "slug": "coldfinch",
        "name": "Coldfinch",
        "public_summary": "Managed open source from the portal.",
        "status": "live",
        "stage": "production",
        "type": "product",
        "live_url": "https://coldfinch.eu",
        "repo_url": None,
        "tags": ["Open Source"],
        "updated_at": "2026-10-30T12:00:00+00:00",
    },
    {
        "slug": "momberger",
        "name": "Momberger",
        "public_summary": "Airport intelligence platform.",
        "status": "beta",
        "stage": "build",
        "type": "saas",
        "live_url": "https://momberger.app",
        "repo_url": "https://github.com/example/momberger",
        "tags": ["Next.js", "Supabase"],
        "updated_at": "2026-10-31T08:15:00+00:00",
    },
]


class Portal:
    def __init__(self) -> None:
        self.down = False
        self.not_found = False
        self.calls: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request.url.path)
        if self.down:
            raise httpx.ConnectError("portal down", request=request)
        if request.url.path == "/api/public/projects":
            if self.not_found:
                return httpx.Response(404, json={"detail": "Not found"})
            return httpx.Response(200, json=LIST)
        return httpx.Response(404)


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def portal() -> Portal:
    return Portal()


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def source(portal: Portal, clock: Clock) -> projects.PortalProjects:
    fallback = projects.JsonProjectStore(PROJECTS_BACKUP)
    return projects.PortalProjects(
        PORTAL,
        fallback,
        transport=httpx.MockTransport(portal),
        clock=clock,
    )


def test_projects_come_from_the_portal(source: projects.PortalProjects) -> None:
    listed = source.list_projects()
    assert [p.slug for p in listed] == ["coldfinch", "momberger"]
    assert listed[0].name == "Coldfinch"
    assert listed[0].summary == "Managed open source from the portal."
    assert listed[0].updated_at == "2026-10-30"
    assert listed[1].repo_url == "https://github.com/example/momberger"


def test_answers_are_cached_for_five_minutes(
    source: projects.PortalProjects, portal: Portal, clock: Clock
) -> None:
    source.list_projects()
    source.list_projects()
    assert len(portal.calls) == 1

    clock.now += projects.CACHE_SECONDS + 1
    source.list_projects()
    assert len(portal.calls) == 2


def test_a_down_portal_serves_the_last_good_copy(
    source: projects.PortalProjects, portal: Portal, clock: Clock
) -> None:
    source.list_projects()
    portal.down = True
    clock.now += projects.CACHE_SECONDS + 1

    assert [p.slug for p in source.list_projects()] == ["coldfinch", "momberger"]

    calls = len(portal.calls)
    source.list_projects()
    assert len(portal.calls) == calls


def test_a_portal_that_never_answered_uses_the_backup(
    source: projects.PortalProjects, portal: Portal
) -> None:
    portal.down = True
    assert source.list_projects() == []


def test_a_missing_endpoint_uses_the_backup(
    source: projects.PortalProjects, portal: Portal
) -> None:
    portal.not_found = True
    assert source.list_projects() == []


def test_clear_makes_the_next_request_ask_again(
    source: projects.PortalProjects, portal: Portal
) -> None:
    source.list_projects()
    source.clear()
    source.list_projects()
    assert portal.calls == ["/api/public/projects", "/api/public/projects"]

    source.clear()
    portal.down = True
    assert [p.slug for p in source.list_projects()] == ["coldfinch", "momberger"]


client = TestClient(app)


@pytest.fixture
def secret(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(get_settings(), "portal_revalidate_secret", "s3cret-value")
    return "s3cret-value"


def test_revalidate_clears_project_cache(
    secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    cleared: list[bool] = []
    monkeypatch.setattr(
        projects.project_source, "clear", lambda: cleared.append(True)
    )
    response = client.post(
        "/api/revalidate", headers={"Authorization": f"Bearer {secret}"}
    )
    assert response.status_code == 200
    assert cleared == [True]


def test_projects_page_uses_the_portal() -> None:
    portal = Portal()
    source = projects.PortalProjects(
        PORTAL,
        projects.JsonProjectStore(PROJECTS_BACKUP),
        transport=httpx.MockTransport(portal),
    )
    app.dependency_overrides[get_project_source] = lambda: source
    try:
        page = client.get("/projects").text
        assert "Coldfinch" in page
        assert "Managed open source from the portal." in page
        assert 'href="https://coldfinch.eu"' in page
        assert 'href="https://github.com/example/momberger"' in page
        assert "/projects" in client.get("/sitemap.xml").text
        assert "Coldfinch" in client.get("/llms.txt").text
        assert client.get("/api/projects").json()[0]["slug"] == "coldfinch"
        home = client.get("/").text
        assert "Coldfinch" in home
        assert 'href="/projects"' in home
    finally:
        app.dependency_overrides.pop(get_project_source, None)
