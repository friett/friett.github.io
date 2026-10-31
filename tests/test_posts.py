"""Posts from the portal: cache, last good copy, local backup and revalidate."""

import httpx
import pytest
from fastapi.testclient import TestClient

from app import posts
from app.blog import blog_store
from app.config import get_settings
from app.deps import get_blog_store
from app.main import app
from app.paths import AUDIO_DIR

PORTAL = "https://portal.test"
LIST = [
    {
        "slug": "openwebui",
        "title": "OpenWebUI from the portal",
        "summary": "The summary the portal wrote.",
        "tags": ["AI"],
        "published_at": "2025-02-25T00:00:00+00:00",
        "updated_at": "2026-10-30T17:09:12+00:00",
        "minutes": 6,
    },
    {
        "slug": "brand-new",
        "title": "Only in the portal",
        "summary": "A post that has no markdown file.",
        "tags": [],
        "published_at": "2026-10-31T00:00:00+00:00",
        "updated_at": "2026-10-31T00:00:00+00:00",
        "minutes": 2,
    },
]
BODY = "Intro.\n\n## Setup\n\n![OpenWebUI](/images/blog/owui.png)\n"


class Portal:
    """A fake portal. `down` makes every request fail like a network error."""

    def __init__(self) -> None:
        self.down = False
        self.calls: list[str] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request.url.path)
        if self.down:
            raise httpx.ConnectError("portal down", request=request)
        if request.url.path == "/api/public/posts":
            return httpx.Response(200, json=LIST)
        slug = request.url.path.rsplit("/", 1)[-1]
        item = next((p for p in LIST if p["slug"] == slug), None)
        if item is None:
            return httpx.Response(404, json={"detail": "Not found"})
        return httpx.Response(200, json={**item, "body": BODY})


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
def source(portal: Portal, clock: Clock) -> posts.PortalPosts:
    return posts.PortalPosts(
        PORTAL,
        blog_store,
        AUDIO_DIR,
        transport=httpx.MockTransport(portal),
        clock=clock,
    )


def test_posts_come_from_the_portal(source: posts.PortalPosts) -> None:
    listed = source.list_posts()
    assert [p.slug for p in listed] == ["openwebui", "brand-new"]
    assert listed[0].title == "OpenWebUI from the portal"
    assert listed[0].preview == "The summary the portal wrote."
    assert listed[0].date == "2025-02-25"
    assert listed[0].audio == "/audio/openwebui.mp3"
    assert listed[1].audio is None

    post = source.get_post("openwebui")
    assert post is not None
    assert post.markdown == BODY.strip()
    assert '<img alt="OpenWebUI" loading="lazy" src="/images/blog/owui.png"' in (
        post.html
    )
    assert [entry.title for entry in post.toc] == ["Setup"]


def test_answers_are_cached_for_five_minutes(
    source: posts.PortalPosts, portal: Portal, clock: Clock
) -> None:
    source.list_posts()
    source.get_post("openwebui")
    source.list_posts()
    source.get_post("openwebui")
    assert len(portal.calls) == 2

    clock.now += posts.CACHE_SECONDS + 1
    source.list_posts()
    assert len(portal.calls) == 3


def test_unknown_and_unpublished_posts_are_not_found(
    source: posts.PortalPosts, portal: Portal
) -> None:
    assert source.get_post("not-in-the-portal") is None
    assert source.get_post("../pyproject") is None
    # Neither asks the portal for the post itself: the list says it is not there.
    assert portal.calls == ["/api/public/posts"]


def test_a_down_portal_serves_the_last_good_copy(
    source: posts.PortalPosts, portal: Portal, clock: Clock
) -> None:
    source.list_posts()
    source.get_post("openwebui")
    portal.down = True
    clock.now += posts.CACHE_SECONDS + 1

    assert [p.slug for p in source.list_posts()] == ["openwebui", "brand-new"]
    post = source.get_post("openwebui")
    assert post is not None and post.title == "OpenWebUI from the portal"

    # The next try waits a little, so pages do not wait for a timeout every time.
    calls = len(portal.calls)
    source.list_posts()
    assert len(portal.calls) == calls


def test_a_portal_that_never_answered_uses_the_local_posts(
    source: posts.PortalPosts, portal: Portal
) -> None:
    portal.down = True
    listed = source.list_posts()
    assert listed == blog_store.list_posts()
    assert len(listed) == 5
    post = source.get_post("openwebui")
    assert post is not None
    assert post.title == blog_store.get_post("openwebui").title
    assert source.get_post("brand-new") is None


def test_a_bad_answer_counts_as_a_failure(
    source: posts.PortalPosts, portal: Portal
) -> None:
    source.transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"not": "a list"})
    )
    assert source.list_posts() == blog_store.list_posts()
    source.transport = httpx.MockTransport(lambda request: httpx.Response(502))
    assert source.list_posts() == blog_store.list_posts()


def test_clear_makes_the_next_request_ask_again(
    source: posts.PortalPosts, portal: Portal
) -> None:
    source.list_posts()
    source.clear()
    source.list_posts()
    assert portal.calls == ["/api/public/posts", "/api/public/posts"]

    # A cleared copy is still the backup when the portal is down.
    source.clear()
    portal.down = True
    assert [p.slug for p in source.list_posts()] == ["openwebui", "brand-new"]


client = TestClient(app)


@pytest.fixture
def secret(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(get_settings(), "portal_revalidate_secret", "s3cret-value")
    return "s3cret-value"


def test_revalidate_clears_the_cache(
    secret: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    cleared: list[str] = []

    def mark(kind: str) -> None:
        cleared.append(kind)

    monkeypatch.setattr(posts.post_source, "clear", lambda: mark("posts"))
    monkeypatch.setattr(
        "app.projects.project_source.clear", lambda: mark("projects")
    )
    response = client.post(
        "/api/revalidate", headers={"Authorization": f"Bearer {secret}"}
    )
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert sorted(cleared) == ["posts", "projects"]


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Bearer wrong"},
        {"Authorization": "Bearer "},
        {"Authorization": "Basic s3cret-value"},
        {"Authorization": "s3cret-value"},
    ],
)
def test_revalidate_needs_the_secret(
    secret: str, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    cleared: list[bool] = []
    monkeypatch.setattr(posts.post_source, "clear", lambda: cleared.append(True))
    response = client.post("/api/revalidate", headers=headers)
    assert response.status_code == 401
    assert cleared == []


def test_revalidate_is_off_without_a_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "portal_revalidate_secret", "")
    response = client.post("/api/revalidate", headers={"Authorization": "Bearer "})
    assert response.status_code == 404


def test_pages_use_the_portal() -> None:
    source = posts.PortalPosts(
        PORTAL, blog_store, AUDIO_DIR, transport=httpx.MockTransport(Portal())
    )
    app.dependency_overrides[get_blog_store] = lambda: source
    try:
        assert "Only in the portal" in client.get("/").text
        page = client.get("/blog/brand-new")
        assert page.status_code == 200
        assert "/images/blog/owui.png" in page.text
        assert client.get("/blog/not-in-the-portal").status_code == 404
        assert "/blog/brand-new" in client.get("/sitemap.xml").text
        assert "Only in the portal" in client.get("/llms.txt").text
        assert client.get("/api/posts").json()[1]["slug"] == "brand-new"
    finally:
        app.dependency_overrides.pop(get_blog_store, None)
