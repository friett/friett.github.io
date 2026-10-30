"""The public chat API: the browser model's context, and the hosted model's stream."""

import json
import re
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app import chat, tracking
from app.config import get_settings
from app.deps import BlogStoreDep, PublicUrlDep, SiteDep

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/context")
def context(site: SiteDep, blog: BlogStoreDep, public_url: PublicUrlDep) -> dict:
    """The instructions and facts both models use, starter questions, availability."""
    posts = blog.list_posts()
    return {
        "system": chat.system_prompt(chat.site_context(site, posts, public_url)),
        "starters": chat.starters(site, posts),
        "hosted": bool(get_settings().groq_api_key),
        "name": site.name,
    }


@router.post("")
async def ask(
    request: Request, site: SiteDep, blog: BlogStoreDep, public_url: PublicUrlDep
) -> StreamingResponse:
    """Answer the last question as Server-Sent Events: delta, then done or error."""
    # Only the site's own pages may use the chat and its free quota, under any address
    # the site has (custom domain or fastapicloud.dev).
    origin = request.headers.get("origin")
    if origin and urlsplit(origin).netloc != request.headers.get("host", ""):
        raise HTTPException(status_code=403, detail="Cross-site request")
    try:
        body = await request.json()
        messages = chat.clean_messages(
            body.get("messages") if isinstance(body, dict) else None
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    conversation = str(body.get("conversation", "")) if isinstance(body, dict) else ""
    conversation = re.sub(r"[^A-Za-z0-9_-]", "", conversation)[:40] or "none"
    day = tracking.today()
    req = chat.ChatRequest(
        messages=messages,
        system=chat.system_prompt(
            chat.site_context(site, blog.list_posts(), public_url)
        ),
        visitor=tracking.visitor_id(
            tracking.client_ip(request), request.headers.get("user-agent", ""), day
        ),
        conversation=conversation,
        day=day,
    )

    async def events():
        async for event in chat.answer(req):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no"},
    )
