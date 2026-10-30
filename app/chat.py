"""The "Ask about Fried" chat.

The same context and instructions serve two models: Groq's hosted models (streamed through
`/api/chat`, the default) and Gemma 4 in the visitor's browser (it fetches them from
`/api/chat/context` and nothing leaves the device). The model ends a reply with:

- `<gap/>` when the site content does not answer the question, so the owner sees what is missing;
- a `<followups>` block with questions the visitor can ask next.

Both are stripped from the stream and returned with the `done` event.
"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from sqlmodel import func, select

from app.config import get_settings
from app.db import ChatTurn, session
from app.models import PostSummary, Site

FOLLOW_UPS = "<followups>"
GAP = "<gap/>"
STOP_TAGS = (GAP, FOLLOW_UPS)
MAX_MESSAGES = 12
MAX_CHARS = 2000
MAX_TOKENS = 600


def site_context(site: Site, posts: list[PostSummary], public_url: str) -> str:
    """Everything the assistant knows about Fried, as compact Markdown."""
    lines = [
        f"# {site.name}",
        f"{site.role}, {site.location}. GitHub: {site.github}. LinkedIn: {site.linkedin}.",
        f"Website: {public_url}/",
        "",
        "## About",
        *site.bio,
    ]
    if site.roles:
        lines += ["", "## Experience"]
        for r in site.roles:
            when = f"{r.start} to {r.end or 'now'}"
            lines.append(
                f"- {r.title} at {r.company} ({when}{', ' + r.location if r.location else ''}). {r.description}".rstrip()
            )
    lines += ["", "## Work and projects"]
    for p in site.projects:
        extra = f" Highlights: {'; '.join(p.highlights)}." if p.highlights else ""
        link = f" Link: {p.link}" if p.link else ""
        lines.append(
            f"- {p.title} ({p.date}; {', '.join(p.tags)}): {p.description}{extra}{link}"
        )
    lines += ["", "## Skills"]
    for s in site.skills:
        lines.append(f"- {s.category}: {', '.join(s.items)}")
    lines += ["", "## Tools Fried uses"]
    for t in site.tools:
        lines.append(f"- {t.name}: {t.description}")
    if posts:
        lines += ["", "## Writing"]
        for post in posts:
            lines.append(
                f"- {post.title} ({post.date}): {post.preview} {public_url}/blog/{post.slug}"
            )
    return "\n".join(lines)


def system_prompt(context: str, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    return f"""You are the assistant on Fried Schölvinck's personal website. Visitors ask about Fried: his work, projects, skills, tools and writing. Today is {now:%-d %B %Y}.

How to answer
- Use only the facts below. Never invent employers, dates, clients, numbers or opinions.
- Keep it short and plain: one to three sentences, under 70 words, unless the visitor asks for detail. Start with the answer itself.
- Talk about Fried in the third person. Answer in the visitor's language.
- Link to pages from the facts with Markdown links when they help.
- For work enquiries, point to LinkedIn or the contact links on the site.
- If the facts do not answer the question, say so in one sentence, suggest LinkedIn, and write {GAP} on its own line.
- Stay on the topic of Fried and his work. Politely decline anything else.

After every answer, write two or three short follow-up questions the visitor is likely to ask next, each under 60 characters:
{FOLLOW_UPS}
What tools does he use every day?
</followups>
Never mention these markers in your answer.

Facts about Fried
{context}"""


def starters(site: Site, posts: list[PostSummary]) -> list[str]:
    """Suggested first questions, picked from the current content."""
    out = [f"What kind of work does {site.name.split()[0]} do?"]
    featured = next(
        (p for p in site.projects if p.featured),
        site.projects[0] if site.projects else None,
    )
    if featured:
        out.append(f"Tell me about {featured.title}")
    if site.roles:
        out.append(f"What does he do at {site.roles[0].company}?")
    if posts:
        out.append("What has he written about lately?")
    if site.tools:
        out.append("Which tools does he use every day?")
    out.append("How can I work with him?")
    return out[:4]


def split_reply(text: str) -> tuple[str, list[str], bool]:
    """The visible answer, the follow-up questions, and whether the model marked a gap."""
    gap = GAP in text
    cut = min(
        [i for i in (text.find(t) for t in STOP_TAGS) if i >= 0], default=len(text)
    )
    answer = text[:cut].strip()
    follow_ups: list[str] = []
    at = text.find(FOLLOW_UPS)
    if at >= 0:
        block = text[at + len(FOLLOW_UPS) :].split("</followups>")[0]
        seen: set[str] = set()
        for raw in block.splitlines():
            q = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", raw).strip().strip('"“”')
            if q and len(q) <= 80 and q.lower() not in seen and GAP not in q:
                seen.add(q.lower())
                follow_ups.append(q)
    return answer, follow_ups[:3], gap


@dataclass
class TagFilter:
    """Streams text through but stops at the first marker, never showing part of one."""

    held: str = ""
    done: bool = False

    def push(self, text: str) -> str:
        if self.done:
            return ""
        s = self.held + text
        hits = [i for i in (s.find(t) for t in STOP_TAGS) if i >= 0]
        if hits:
            self.done, self.held = True, ""
            return s[: min(hits)].rstrip()
        cut = len(s)
        for n in range(min(max(len(t) for t in STOP_TAGS) - 1, len(s)), 0, -1):
            if any(t.startswith(s[-n:]) for t in STOP_TAGS):
                cut = len(s) - n
                break
        while cut > 0 and s[cut - 1].isspace():
            cut -= 1
        self.held = s[cut:]
        return s[:cut]

    def flush(self) -> str:
        rest = "" if self.done else self.held
        self.held = ""
        return rest


def clean_messages(raw: object) -> list[dict[str, str]]:
    """The conversation as the client sent it: the last messages, ending with a question."""
    if not isinstance(raw, list) or not raw:
        raise ValueError("Send at least one message")
    out: list[dict[str, str]] = []
    for m in raw[-MAX_MESSAGES:]:
        if not isinstance(m, dict) or m.get("role") not in {"user", "assistant"}:
            raise ValueError("Each message needs a role: user or assistant")
        content = m.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Each message needs text")
        out.append({"role": m["role"], "content": content.strip()[:MAX_CHARS]})
    while out and out[0]["role"] == "assistant":
        out.pop(0)
    if not out or out[-1]["role"] != "user":
        raise ValueError("The last message must be a question")
    return out


def usage_today(visitor: str, day: str) -> tuple[int, int]:
    """Questions today from this visitor, and from everyone."""
    with session() as db:
        mine = db.exec(
            select(func.count())
            .select_from(ChatTurn)
            .where(ChatTurn.day == day, ChatTurn.visitor == visitor)
        ).one()
        total = db.exec(
            select(func.count()).select_from(ChatTurn).where(ChatTurn.day == day)
        ).one()
    return int(mine), int(total)


@dataclass
class ChatRequest:
    messages: list[dict[str, str]]
    system: str
    visitor: str
    conversation: str
    day: str


class Unavailable(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# Tests swap in an httpx.MockTransport.
transport: httpx.AsyncBaseTransport | None = None


async def _stream_model(
    client: httpx.AsyncClient, model: str, req: ChatRequest
) -> AsyncIterator[tuple[str, int]]:
    """Text chunks from one model, and the token count at the end. Raises Unavailable before the
    first chunk when the model is rate limited or down, so the caller can try the next one."""
    settings = get_settings()
    body = {
        "model": model,
        "messages": [{"role": "system", "content": req.system}, *req.messages],
        "stream": True,
        "max_tokens": MAX_TOKENS,
        "temperature": 0.3,
    }
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    async with client.stream(
        "POST", f"{settings.groq_base_url}/chat/completions", json=body, headers=headers
    ) as res:
        if res.status_code == 429:
            raise Unavailable(
                "rate_limited", "The free model quota is used up for now."
            )
        if res.status_code >= 400:
            raise Unavailable("provider", f"The model returned HTTP {res.status_code}.")
        tokens = 0
        async for line in res.aiter_lines():
            if not line.startswith("data: "):
                continue
            data = line[6:].strip()
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
            except json.JSONDecodeError:
                continue
            usage = chunk.get("usage") or (chunk.get("x_groq") or {}).get("usage")
            if usage:
                tokens = int(usage.get("total_tokens") or 0)
            delta = ((chunk.get("choices") or [{}])[0].get("delta") or {}).get(
                "content"
            )
            if delta:
                yield delta, 0
        yield "", tokens


async def answer(req: ChatRequest) -> AsyncIterator[dict]:
    """Stream events for one question: delta, then done (or error). Saves the turn."""
    settings = get_settings()
    if not settings.groq_api_key:
        yield {
            "type": "error",
            "code": "unavailable",
            "message": "The hosted model is not set up.",
        }
        return
    mine, total = usage_today(req.visitor, req.day)
    if mine >= settings.chat_visitor_daily:
        yield {
            "type": "error",
            "code": "visitor_limit",
            "message": "You reached today's question limit.",
        }
        return
    if total >= settings.chat_site_daily:
        yield {
            "type": "error",
            "code": "site_limit",
            "message": "The site reached today's question limit.",
        }
        return
    text, tokens, used, last_error = "", 0, "", None
    async with httpx.AsyncClient(
        transport=transport, timeout=httpx.Timeout(60, connect=10)
    ) as client:
        for model in settings.chat_models:
            filt = TagFilter()
            started = False
            try:
                async for chunk, count in _stream_model(client, model, req):
                    if count:
                        tokens = count
                    if not chunk:
                        continue
                    started = True
                    text += chunk
                    shown = filt.push(chunk)
                    if shown:
                        yield {"type": "delta", "text": shown}
                tail = filt.flush()
                if tail:
                    yield {"type": "delta", "text": tail}
                used = model
                break
            except (Unavailable, httpx.HTTPError) as error:
                last_error = error
                if started:
                    break
                continue
    if not used:
        code = last_error.code if isinstance(last_error, Unavailable) else "network"
        message = (
            last_error.message
            if isinstance(last_error, Unavailable)
            else "The model could not be reached."
        )
        yield {"type": "error", "code": code, "message": message}
        return
    reply, follow_ups, gap = split_reply(text)
    with session() as db:
        db.add(
            ChatTurn(
                conversation=req.conversation[:40],
                visitor=req.visitor,
                day=req.day,
                question=req.messages[-1]["content"],
                answer=reply,
                model=used,
                unanswered=gap,
                tokens=tokens,
            )
        )
        db.commit()
    yield {"type": "done", "model": used, "followUps": follow_ups, "gap": gap}


def chat_stats(days: int = 30, limit: int = 50) -> dict:
    """Questions for the admin: totals, the latest, and the ones the content could not answer."""
    from datetime import timedelta

    since = (datetime.now(UTC) - timedelta(days=days - 1)).date().isoformat()
    with session() as db:
        rows = db.exec(
            select(ChatTurn).where(ChatTurn.day >= since).order_by(ChatTurn.id.desc())
        ).all()
        latest = [
            {
                "id": r.id,
                "question": r.question,
                "answer": r.answer,
                "unanswered": r.unanswered,
                "model": r.model,
                "createdAt": r.created_at.isoformat(),
            }
            for r in rows[:limit]
        ]
    return {
        "questions": len(rows),
        "conversations": len({r.conversation for r in rows}),
        "unanswered": sum(1 for r in rows if r.unanswered),
        "latest": latest,
        "gaps": [q for q in latest if q["unanswered"]][:20],
    }
