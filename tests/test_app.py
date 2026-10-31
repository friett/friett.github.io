import json
import re

import httpx
from fastapi.testclient import TestClient

from app import projects as projects_mod
from app.blog import blog_store
from app.deps import get_project_source
from app.main import app
from app.paths import PROJECTS_BACKUP
from tests.test_projects import Portal

client = TestClient(app)


def _current_sections(page: str) -> list[str]:
    """Navigation sections the server marks as the current page."""
    return re.findall(r'data-section="([a-z]+)"[^>]*aria-current="page"', page)


HTML = {"accept": "text/html"}


def test_home_includes_portfolio_and_posts() -> None:
    response = client.get("/")
    assert response.status_code == 200
    page = response.text
    assert "Hello, I'm Fried." in page
    assert "Xomnia" in page
    assert "Arc Browser" in page
    assert "/blog/dokploy" in page
    assert 'href="/projects"' in page
    assert "<audio" not in page
    assert 'data-filter="FastAPI"' in page
    assert "min read" in page


def test_blog_post_renders_markdown_audio_and_image() -> None:
    response = client.get("/blog/openwebui")
    assert response.status_code == 200
    page = response.text
    assert "Setting up OpenWebUI" in page
    assert "<figure>" in page
    assert "/images/blog/owui.png" in page
    assert 'src="/audio/openwebui.mp3"' in page
    assert "Listen to this post" in page
    assert "min read" in page
    assert "Newer" in page
    assert "/blog/smolagents" in page


def test_external_links_open_in_a_new_tab_and_internal_links_stay() -> None:
    html = client.get("/api/posts/raycast").json()["html"]
    assert 'href="/blog/openwebui"' in html
    assert 'href="/blog/openwebui" target=' not in html
    assert 'target="_blank"' in html
    assert 'rel="noopener noreferrer"' in html


def test_missing_post_is_not_found() -> None:
    assert client.get("/blog/not-a-real-post").status_code == 404
    assert client.get("/api/posts/not-a-real-post").status_code == 404
    assert blog_store.get_post("../pyproject") is None
    assert blog_store.get_post("openwebui") is not None


def test_posts_are_newest_first_and_keep_audio() -> None:
    posts = client.get("/api/posts").json()
    assert [post["slug"] for post in posts] == [
        "dokploy",
        "dia-browser",
        "raycast",
        "smolagents",
        "openwebui",
    ]
    assert posts[0]["audio"] == "/audio/dokploy.mp3"
    assert "markdown" not in posts[0]
    detail = client.get("/api/posts/smolagents").json()
    assert "<pre>" in detail["html"]
    assert "markdown" in detail


def test_site_payload_and_health() -> None:
    site = client.get("/api/site").json()
    assert site["name"] == "Fried Schölvinck"
    assert site["projects"][0]["title"] == "Coldfinch"
    assert client.get("/api/health").json() == {"status": "ok"}


def test_assets_sitemap_and_unknown_page() -> None:
    assert client.get("/styles.css").status_code == 200
    assert client.get("/icons/neovim.svg").status_code == 200
    assert client.get("/images/blog/owui.png").status_code == 200
    audio = client.get("/audio/dia-browser.mp3")
    assert audio.status_code == 200
    assert audio.headers["content-type"].startswith("audio/")
    sitemap = client.get("/sitemap.xml").text
    assert "/blog/dokploy" in sitemap
    assert "Sitemap:" in client.get("/robots.txt").text
    assert "Coldfinch" in client.get("/llms.txt").text
    missing = client.get("/not-a-page", headers=HTML)
    assert missing.status_code == 404
    assert "Page not found" in missing.text


def test_manifest_and_app_icons() -> None:
    response = client.get("/manifest.webmanifest")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/manifest+json")
    manifest = response.json()
    assert manifest["start_url"] == "/"
    assert manifest["display"] == "standalone"
    purposes = {icon.get("purpose", "any") for icon in manifest["icons"]}
    assert "maskable" in purposes
    for icon in manifest["icons"]:
        assert client.get(icon["src"]).status_code == 200
    assert client.get("/icons/apple-touch-icon.png").status_code == 200


def test_pages_carry_the_shell_and_home_screen_tags() -> None:
    page = client.get("/").text
    assert '<link rel="manifest" href="/manifest.webmanifest">' in page
    assert 'rel="apple-touch-icon"' in page
    assert 'name="theme-color" media="(prefers-color-scheme: dark)"' in page
    assert "viewport-fit=cover" in page
    assert 'localStorage.getItem("fried:theme")' in page
    assert 'class="sidebar"' in page
    assert 'class="tabbar"' in page
    assert 'id="contact"' in page
    assert _current_sections(page) == ["home", "home"]


def test_palette_index_lists_sections_posts_projects_and_profiles() -> None:
    source = projects_mod.PortalProjects(
        "https://portal.test",
        projects_mod.JsonProjectStore(PROJECTS_BACKUP),
        transport=httpx.MockTransport(Portal()),
    )
    app.dependency_overrides[get_project_source] = lambda: source
    try:
        page = client.get("/blog/raycast").text
        start = page.index('<script type="application/json" id="palette-data">')
        raw = page[start:].split(">", 1)[1].split("</script>", 1)[0]
        items = json.loads(raw)
        groups = {item["group"] for item in items}
        assert {"Go to", "Writing", "Projects", "Profiles", "Tools", "Theme"} <= groups
        hrefs = {item.get("href") for item in items}
        assert "/blog/dokploy" in hrefs
        assert "/projects#coldfinch" in hrefs
        assert "https://github.com/friett" in hrefs
    finally:
        app.dependency_overrides.pop(get_project_source, None)


def test_post_has_a_server_rendered_table_of_contents() -> None:
    page = client.get("/blog/openwebui").text
    assert 'id="toc"' in page
    assert 'href="#what-is-openwebui"' in page
    assert 'id="what-is-openwebui"' in page
    assert _current_sections(page) == ["writing", "writing"]
    toc = client.get("/api/posts/openwebui").json()["toc"]
    assert toc[0] == {
        "id": "what-is-openwebui",
        "title": "What is OpenWebUI?",
        "level": 2,
    }
    assert any(entry["level"] == 3 for entry in toc)
