"""The database-backed site: content, visits, the admin API, the chat and imports."""

import io
import json
import zipfile
from base64 import b64encode

import httpx
import pytest
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from sqlmodel import delete, select

from app import chat, content, linkedin, suggest, tracking
from app.config import get_settings
from app.db import ChatTurn, Draft, PageView, session
from app.main import app

BROWSER = {
    "accept": "text/html",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit Safari/605",
}
SAME_ORIGIN = {"origin": "http://testserver"}


def owner_client() -> TestClient:
    """A client signed in as the owner, with a session cookie as Starlette signs it."""
    data = b64encode(json.dumps({"user": "owner"}).encode())
    cookie = TimestampSigner("test-secret").sign(data).decode()
    client = TestClient(app)
    client.cookies.set("site_admin", cookie)
    return client


@pytest.fixture(autouse=True)
def clean_tables():
    with session() as db:
        for table in (PageView, ChatTurn, Draft):
            db.exec(delete(table))
        db.commit()
    yield
    settings = get_settings()
    settings.groq_api_key = ""
    chat.transport = None


def views() -> list[PageView]:
    with session() as db:
        return list(db.exec(select(PageView)).all())


# Visits ------------------------------------------------------------------------------


def test_a_page_view_is_counted_without_ip_or_user_agent() -> None:
    client = TestClient(app)
    client.get("/", headers={**BROWSER, "referer": "https://www.google.com/search"})
    client.get("/blog/dokploy", headers=BROWSER)
    rows = views()
    assert [r.path for r in rows] == ["/", "/blog/dokploy"]
    assert rows[0].referrer == "google.com"
    assert rows[0].visitor == rows[1].visitor
    assert rows[0].device == "desktop"
    stored = json.dumps([r.model_dump(mode="json") for r in rows])
    assert "testclient" not in stored and "Safari" not in stored


def test_bots_opt_outs_and_api_calls_are_not_counted() -> None:
    client = TestClient(app)
    client.get("/", headers={**BROWSER, "user-agent": "Googlebot/2.1"})
    client.get("/", headers={**BROWSER, "sec-gpc": "1"})
    client.get("/", headers={**BROWSER, "dnt": "1"})
    client.get("/", headers={**BROWSER, "sec-purpose": "prefetch"})
    client.get("/api/site", headers=BROWSER)
    client.get("/blog/not-a-post", headers=BROWSER)
    assert views() == []


def test_the_visitor_hash_changes_with_the_day_salt() -> None:
    a = tracking.visitor_id("1.2.3.4", "UA", "2026-10-30")
    assert a == tracking.visitor_id("1.2.3.4", "UA", "2026-10-30")
    assert a != tracking.visitor_id("1.2.3.4", "UA", "2026-10-31")
    assert a != tracking.visitor_id("1.2.3.5", "UA", "2026-10-30")


def test_utm_source_counts_as_the_referrer() -> None:
    TestClient(app).get("/?utm_source=LinkedIn", headers=BROWSER)
    assert views()[0].referrer == "utm:linkedin"


# Admin -------------------------------------------------------------------------------


def test_admin_routes_need_the_owner() -> None:
    client = TestClient(app)
    assert client.get("/api/admin/stats").status_code == 401
    assert client.get("/api/admin/entries").status_code == 401
    assert client.get("/api/admin/state").json() == {
        "hasPasskey": False,
        "signedIn": False,
    }
    owner = owner_client()
    assert owner.get("/api/admin/stats").status_code == 200
    blocked = owner.post(
        "/api/admin/tokens",
        json={"name": "x"},
        headers={"origin": "https://evil.example"},
    )
    assert blocked.status_code == 403


def test_registration_needs_the_setup_token() -> None:
    client = TestClient(app)
    wrong = client.post("/api/admin/register/options", json={"token": "nope"})
    assert wrong.status_code == 403
    ok = client.post("/api/admin/register/options", json={"token": "test-setup-token"})
    assert ok.status_code == 200
    assert ok.json()["rp"]["id"] == "testserver"


def test_the_owner_edits_content_and_the_page_follows() -> None:
    owner = owner_client()
    projects = owner.get("/api/admin/entries", params={"kind": "project"}).json()
    first = projects[0]
    data = {**first["data"], "description": "A brand new description for the test."}
    saved = owner.put(
        f"/api/admin/entries/{first['id']}",
        json={"kind": "project", "data": data},
        headers=SAME_ORIGIN,
    )
    assert saved.status_code == 200
    assert saved.json()["source"] == "admin"
    assert "A brand new description for the test." in TestClient(app).get("/").text
    owner.patch(
        f"/api/admin/entries/{first['id']}",
        json={"visible": False},
        headers=SAME_ORIGIN,
    )
    assert first["data"]["title"] not in [p.title for p in content.load_site().projects]
    owner.patch(
        f"/api/admin/entries/{first['id']}", json={"visible": True}, headers=SAME_ORIGIN
    )
    bad = owner.post(
        "/api/admin/entries",
        json={"kind": "tool", "data": {"name": "x"}},
        headers=SAME_ORIGIN,
    )
    assert bad.status_code == 422
    script = {**data, "link": "javascript:alert(1)"}
    sneaky = owner.put(
        f"/api/admin/entries/{first['id']}",
        json={"kind": "project", "data": script},
        headers=SAME_ORIGIN,
    )
    assert sneaky.status_code == 422


def test_a_role_shows_in_the_experience_section() -> None:
    owner = owner_client()
    role = {"company": "Testco", "title": "AI Engineer", "start": "2024-02"}
    made = owner.post(
        "/api/admin/entries", json={"kind": "role", "data": role}, headers=SAME_ORIGIN
    )
    assert made.status_code == 200
    page = TestClient(app).get("/").text
    assert "Testco" in page and "Experience" in page
    owner.delete(f"/api/admin/entries/{made.json()['id']}", headers=SAME_ORIGIN)


def test_agents_propose_drafts_that_the_owner_applies() -> None:
    owner = owner_client()
    token = owner.post(
        "/api/admin/tokens", json={"name": "Claude"}, headers=SAME_ORIGIN
    )
    bearer = {"authorization": f"Bearer {token.json()['token']}"}
    tool = {
        "name": "Zed",
        "icon": "/icons/zed.svg",
        "description": "Fast editor.",
        "url": "https://zed.dev",
    }
    agent = TestClient(app)
    made = agent.post(
        "/api/admin/drafts",
        json={"kind": "tool", "action": "create", "data": tool, "reason": "New tool"},
        headers=bearer,
    )
    assert made.status_code == 200
    draft = made.json()["draft"]
    assert draft["source"] == "agent"
    again = agent.post(
        "/api/admin/drafts",
        json={"kind": "tool", "action": "create", "data": tool},
        headers=bearer,
    )
    assert again.json()["draft"] is None
    assert agent.get("/api/admin/drafts", headers=bearer).status_code == 401
    applied = owner.post(
        f"/api/admin/drafts/{draft['id']}/apply", json={}, headers=SAME_ORIGIN
    )
    assert applied.json()["status"] == "applied"
    assert "Zed" in [t.name for t in content.load_site().tools]
    entry = next(e for e in content.list_entries("tool") if e.slug == "zed")
    content.delete_entry(entry.id)
    unknown = TestClient(app).post(
        "/api/admin/drafts",
        json={"kind": "tool", "data": tool},
        headers={"authorization": "Bearer site_wrong"},
    )
    assert unknown.status_code == 401


# LinkedIn ----------------------------------------------------------------------------


def export_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(
            "Basic_LinkedInDataExport/Positions.csv",
            "Company Name,Title,Description,Location,Started On,Finished On\n"
            "Acme AI,Lead Engineer,Built agents,Amsterdam,Mar 2023,\n"
            "Old Corp,Analyst,,Utrecht,Jan 2019,Feb 2021\n",
        )
        z.writestr("Skills.csv", "Name\nFastAPI\nRust\n")
        z.writestr("Connections.csv", "Notes:\nwhatever\n")
    return buf.getvalue()


def test_month_parsing() -> None:
    assert linkedin.month("Mar 2023") == "2023-03"
    assert linkedin.month("2021") == "2021"
    assert linkedin.month("") is None


def test_a_linkedin_export_becomes_drafts() -> None:
    owner = owner_client()
    res = owner.post(
        "/api/admin/linkedin",
        files={"file": ("export.zip", export_zip(), "application/zip")},
        headers=SAME_ORIGIN,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["files"] == ["positions.csv", "skills.csv"]
    roles = [d for d in body["drafts"] if d["kind"] == "role"]
    assert {r["data"]["company"] for r in roles} == {"Acme AI", "Old Corp"}
    acme = next(r for r in roles if r["data"]["company"] == "Acme AI")
    assert acme["data"]["start"] == "2023-03" and acme["data"]["end"] is None
    skills = next(d for d in body["drafts"] if d["kind"] == "skill")
    assert skills["data"]["items"] == ["Rust"]  # FastAPI is on the site already
    # Importing the same file again adds nothing.
    again = owner.post(
        "/api/admin/linkedin",
        files={"file": ("export.zip", export_zip(), "application/zip")},
        headers=SAME_ORIGIN,
    )
    assert again.json()["drafts"] == []
    bad = owner.post(
        "/api/admin/linkedin",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        headers=SAME_ORIGIN,
    )
    assert bad.status_code == 422


# Chat --------------------------------------------------------------------------------


def sse(*chunks: str, usage: int = 42) -> bytes:
    lines = [
        f"data: {json.dumps({'choices': [{'delta': {'content': c}}]})}\n\n"
        for c in chunks
    ]
    lines.append(
        f"data: {json.dumps({'choices': [], 'usage': {'total_tokens': usage}})}\n\n"
    )
    lines.append("data: [DONE]\n\n")
    return "".join(lines).encode()


def fake_groq(handler) -> list[dict]:
    seen: list[dict] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append(body)
        return handler(body)

    get_settings().groq_api_key = "gsk_test"
    chat.transport = httpx.MockTransport(wrapped)
    return seen


def ask(question: str, **headers: str) -> list[dict]:
    res = TestClient(app).post(
        "/api/chat",
        json={
            "messages": [{"role": "user", "content": question}],
            "conversation": "c1",
        },
        headers={"user-agent": "Mozilla/5.0 Test", **headers},
    )
    assert res.status_code == 200, res.text
    return [json.loads(b[6:]) for b in res.text.split("\n\n") if b.startswith("data: ")]


def test_the_context_names_the_content_and_offers_starters() -> None:
    body = TestClient(app).get("/api/chat/context").json()
    assert "CatFinder" in body["system"]
    assert "<followups>" in body["system"] and "<gap/>" in body["system"]
    assert len(body["starters"]) >= 3
    assert body["hosted"] is False


def test_without_a_key_the_hosted_chat_says_so() -> None:
    assert ask("Who is Fried?") == [
        {
            "type": "error",
            "code": "unavailable",
            "message": "The hosted model is not set up.",
        }
    ]


def test_an_answer_streams_without_markers_and_is_saved() -> None:
    reply = [
        "Fried builds ",
        "AI systems.\n\n<fol",
        "lowups>\nWhat tools?\nWhere?\n</followups>",
    ]
    seen = fake_groq(lambda body: httpx.Response(200, content=sse(*reply)))
    events = ask("What does Fried do?")
    text = "".join(e["text"] for e in events if e["type"] == "delta")
    assert text == "Fried builds AI systems."
    assert events[-1] == {
        "type": "done",
        "model": "openai/gpt-oss-120b",
        "followUps": ["What tools?", "Where?"],
        "gap": False,
    }
    assert seen[0]["messages"][0]["role"] == "system"
    assert "CatFinder" in seen[0]["messages"][0]["content"]
    with session() as db:
        turn = db.exec(select(ChatTurn)).one()
    assert (turn.question, turn.answer, turn.tokens) == (
        "What does Fried do?",
        "Fried builds AI systems.",
        42,
    )


def test_a_gap_is_flagged_for_the_owner() -> None:
    fake_groq(
        lambda body: httpx.Response(200, content=sse("I do not know that.\n<gap/>"))
    )
    events = ask("What is his favourite food?")
    assert events[-1]["gap"] is True
    stats = owner_client().get("/api/admin/stats").json()["chat"]
    assert stats["unanswered"] == 1
    assert stats["gaps"][0]["question"] == "What is his favourite food?"


def test_a_rate_limited_model_falls_through_to_the_next() -> None:
    def handler(body: dict) -> httpx.Response:
        if body["model"] == "openai/gpt-oss-120b":
            return httpx.Response(429, json={"error": {"message": "rate limit"}})
        return httpx.Response(200, content=sse("Hi."))

    seen = fake_groq(handler)
    events = ask("Hello?")
    assert events[-1]["model"] == "openai/gpt-oss-20b"
    assert [b["model"] for b in seen] == ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]


def test_all_models_down_is_an_error() -> None:
    fake_groq(lambda body: httpx.Response(429, json={}))
    assert ask("Hello?")[-1]["code"] == "rate_limited"


def test_the_daily_visitor_limit(monkeypatch) -> None:
    fake_groq(lambda body: httpx.Response(200, content=sse("Hi.")))
    monkeypatch.setattr(get_settings(), "chat_visitor_daily", 1)
    assert ask("One?")[-1]["type"] == "done"
    assert ask("Two?")[-1]["code"] == "visitor_limit"


def test_chat_input_is_checked() -> None:
    client = TestClient(app)
    assert client.post("/api/chat", json={"messages": []}).status_code == 422
    only_answer = {"messages": [{"role": "assistant", "content": "hi"}]}
    assert client.post("/api/chat", json=only_answer).status_code == 422
    cross = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers={"origin": "https://evil.example"},
    )
    assert cross.status_code == 403


def test_the_tag_filter_never_shows_part_of_a_marker() -> None:
    full = "Answer text here.\n<gap/>\n<followups>\nQ?\n</followups>"
    for size in range(1, 8):
        f = chat.TagFilter()
        shown = "".join(f.push(full[i : i + size]) for i in range(0, len(full), size))
        assert shown + f.flush() == "Answer text here."


# AI suggestions ----------------------------------------------------------------------


@pytest.mark.anyio
async def test_ai_suggestions_become_drafts_and_invented_kinds_are_skipped() -> None:
    project = content.list_entries("project")[0]
    reply = {
        "changes": [
            {
                "kind": "project",
                "action": "update",
                "data": {**project.data, "description": "Shorter."},
                "reason": "Tighter wording",
            },
            {"kind": "award", "action": "create", "data": {"name": "x"}, "reason": "?"},
        ],
        "gaps": ["Nothing says where Fried studied."],
    }
    fake_groq(
        lambda body: httpx.Response(
            200, json={"choices": [{"message": {"content": json.dumps(reply)}}]}
        )
    )
    out = await suggest.suggest()
    assert [d["data"]["description"] for d in out["drafts"]] == ["Shorter."]
    assert out["skipped"] == 1
    assert out["gaps"] == ["Nothing says where Fried studied."]


# Pages -------------------------------------------------------------------------------


def test_the_ask_and_admin_pages_mount_their_islands() -> None:
    client = TestClient(app)
    ask = client.get("/ask?q=What+tools%3F").text
    assert 'data-island="ask"' in ask and 'data-q="What tools?"' in ask
    assert "/app/ask.js?v=" in ask
    admin = client.get("/admin").text
    assert 'data-island="admin"' in admin and "noindex, nofollow" in admin
    home = client.get("/").text
    assert 'action="/ask"' in home and 'href="/ask"' in home
