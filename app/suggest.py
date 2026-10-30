"""AI review of the site content: drafts the owner can apply, and gaps only the owner can fill.

The model sees the current content, the questions visitors asked that the content could not
answer, and the pending drafts. It may reword or restructure what is there, but it must not add
facts: questions it cannot answer from the content come back as gaps, not as drafts.
"""

from __future__ import annotations

import json

import httpx

from app import chat
from app.config import get_settings
from app.content import list_drafts, list_entries, propose

PROMPT = """You maintain the content of Fried Schölvinck's personal website. Review it and propose improvements.

Rules
- Use only facts that appear in the content or the visitor questions below. Never invent employers, dates, clients, numbers, skills or links.
- Good changes: clearer or shorter descriptions, fixing typos, better tags, merging duplicate skills, moving a tool or skill to a better group, hiding an entry that is clearly outdated by a newer one.
- Visitor questions the site could not answer show what is missing. You cannot add those facts: list them as gaps for Fried to fill.
- At most 5 changes. Each change keeps every field of the entry, also the ones you do not change.

Reply with JSON only:
{"changes": [{"kind": "project|role|skill|tool|profile", "action": "update|create|hide", "data": {...full entry...}, "reason": "one short sentence"}],
 "gaps": ["one short sentence per missing fact"]}

Entry fields
- profile: name, role, location, bio (list of paragraphs), phrases (list), github, linkedin
- role: company, title, start (YYYY-MM), end (YYYY-MM or null), location, description, url
- project: title, description, tags (list), date, link, preview, featured, eyebrow, highlights (list)
- skill: category, items (list)
- tool: name, icon, description, url
- for hide: data is {"slug": "<the entry's slug>"}
"""


async def suggest() -> dict:
    settings = get_settings()
    if not settings.groq_api_key:
        raise RuntimeError("Set GROQ_API_KEY to use AI suggestions")
    content = [
        {"kind": e.kind, "slug": e.slug, "visible": e.visible, "data": e.data}
        for e in list_entries()
    ]
    gaps = [q["question"] for q in chat.chat_stats(days=60)["gaps"]]
    pending = [
        {"kind": d.kind, "slug": d.slug, "action": d.action} for d in list_drafts()
    ]
    user = json.dumps(
        {"content": content, "unanswered_questions": gaps, "pending_drafts": pending},
        ensure_ascii=False,
    )
    body = {
        "model": settings.chat_models[0],
        "messages": [
            {"role": "system", "content": PROMPT},
            {"role": "user", "content": user[:60_000]},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_tokens": 4000,
    }
    async with httpx.AsyncClient(transport=chat.transport, timeout=120) as client:
        res = await client.post(
            f"{settings.groq_base_url}/chat/completions",
            json=body,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        )
    if res.status_code >= 400:
        raise RuntimeError(f"The model returned HTTP {res.status_code}")
    try:
        reply = json.loads(res.json()["choices"][0]["message"]["content"])
    except (KeyError, IndexError, ValueError) as error:
        raise RuntimeError("The model did not return valid JSON") from error
    drafts, skipped = [], 0
    for change in (reply.get("changes") or [])[:5]:
        try:
            draft = propose(
                str(change.get("kind")),
                change.get("data") or {},
                action=str(change.get("action", "update")),
                reason=str(change.get("reason", "")),
                source="ai",
            )
        except ValueError:
            skipped += 1
            continue
        if draft:
            drafts.append(draft)
    return {
        "drafts": [d.model_dump(mode="json") for d in drafts],
        "skipped": skipped,
        "gaps": [str(g) for g in (reply.get("gaps") or [])][:10],
    }
