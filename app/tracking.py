"""Cookieless visit counting for the owner's stats.

Each page view stores the path, the referring site, the device type and a visitor hash.
The hash is SHA-256 over a random salt for the day, the IP address and the user agent,
so the same visitor counts once per day and cannot be followed across days. The IP
address and the user agent are never stored, and each day's salt is deleted once the day
is over. Bots, prefetches and visitors who send Global Privacy Control or Do Not Track
are not counted.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

from sqlmodel import delete, select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.db import PageView, Setting, session

BOT = re.compile(
    r"bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python|"
    r"httpx|"
    r"go-http|java/|uptime|facebookexternalhit|embedly|whatsapp|telegram|discord",
    re.IGNORECASE,
)
SKIP_PREFIXES = ("/api", "/admin", "/docs", "/redoc", "/openapi.json")
RETENTION_DAYS = 400
SALT_PREFIX = "visitor_salt:"

# Tests set this to write before the response returns.
SYNC = False


def today() -> str:
    return datetime.now(UTC).date().isoformat()


def daily_salt(day: str) -> str:
    """The salt for `day`, created on first use. Older salts are deleted."""
    key = SALT_PREFIX + day
    with session() as db:
        row = db.get(Setting, key)
        if row is not None:
            return row.value
        row = Setting(key=key, value=secrets.token_hex(16))
        db.add(row)
        db.exec(
            delete(Setting).where(
                Setting.key.startswith(SALT_PREFIX), Setting.key != key
            )
        )
        cutoff = (datetime.now(UTC) - timedelta(days=RETENTION_DAYS)).date().isoformat()
        db.exec(delete(PageView).where(PageView.day < cutoff))
        db.commit()
        return row.value


def visitor_id(ip: str, user_agent: str, day: str | None = None) -> str:
    day = day or today()
    raw = f"{daily_salt(day)}|{ip}|{user_agent}".encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def opted_out(request: Request) -> bool:
    h = request.headers
    return h.get("sec-gpc") == "1" or h.get("dnt") == "1"


def is_bot(user_agent: str) -> bool:
    return not user_agent or bool(BOT.search(user_agent))


def referrer_of(request: Request) -> str:
    """The referring host, or `utm:<source>`; empty for direct visits and own pages."""
    source = parse_qs(urlsplit(str(request.url)).query).get("utm_source")
    if source:
        return f"utm:{source[0][:60].lower()}"
    host = urlsplit(request.headers.get("referer", "")).hostname or ""
    if not host or host == request.url.hostname:
        return ""
    return host.removeprefix("www.")[:120]


def record(path: str, referrer: str, visitor: str, device: str, country: str) -> None:
    with session() as db:
        db.add(
            PageView(
                day=today(),
                path=path[:200],
                referrer=referrer,
                visitor=visitor,
                device=device,
                country=country[:2].upper(),
            )
        )
        db.commit()


def _record_safely(*args: str) -> None:
    try:
        record(*args)
    except Exception:  # noqa: BLE001 - stats must never break a page
        pass


class VisitTracker(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        ua = request.headers.get("user-agent", "")
        if (
            request.method != "GET"
            or response.status_code != 200
            or not response.headers.get("content-type", "").startswith("text/html")
            or request.url.path.startswith(SKIP_PREFIXES)
            or request.headers.get("sec-purpose", "").startswith("prefetch")
            or request.headers.get("purpose") == "prefetch"
            or opted_out(request)
            or is_bot(ua)
        ):
            return response
        try:
            visitor = visitor_id(client_ip(request), ua)
        except Exception:  # noqa: BLE001
            return response
        args = (
            request.url.path,
            referrer_of(request),
            visitor,
            "mobile" if re.search(r"Mobi|Android|iPhone", ua) else "desktop",
            request.headers.get("cf-ipcountry", "")
            or request.headers.get("x-country", ""),
        )
        if SYNC:
            _record_safely(*args)
        else:
            asyncio.get_running_loop().run_in_executor(None, _record_safely, *args)
        return response


def stats(days: int = 30) -> dict:
    """Visits per day, top pages and referrers, and devices for the admin overview."""
    since = (datetime.now(UTC) - timedelta(days=days - 1)).date().isoformat()
    with session() as db:
        rows = db.exec(
            select(
                PageView.day,
                PageView.path,
                PageView.referrer,
                PageView.visitor,
                PageView.device,
            ).where(PageView.day >= since)
        ).all()
    per_day: dict[str, dict[str, set | int]] = {}
    pages: dict[str, int] = {}
    referrers: dict[str, int] = {}
    devices: dict[str, int] = {}
    visitors: set[str] = set()
    for day, path, referrer, visitor, device in rows:
        d = per_day.setdefault(day, {"views": 0, "visitors": set()})
        d["views"] += 1
        d["visitors"].add(visitor)
        visitors.add(f"{day}:{visitor}")
        pages[path] = pages.get(path, 0) + 1
        if referrer:
            referrers[referrer] = referrers.get(referrer, 0) + 1
        devices[device or "unknown"] = devices.get(device or "unknown", 0) + 1
    start = datetime.fromisoformat(since).date()
    series = []
    for i in range(days):
        day = (start + timedelta(days=i)).isoformat()
        d = per_day.get(day)
        series.append(
            {
                "day": day,
                "views": d["views"] if d else 0,
                "visitors": len(d["visitors"]) if d else 0,
            }
        )

    def top(counts: dict[str, int], n: int = 10) -> list[dict]:
        return [
            {"name": k, "count": v}
            for k, v in sorted(counts.items(), key=lambda kv: -kv[1])[:n]
        ]

    return {
        "days": days,
        "views": len(rows),
        "visitors": len(visitors),
        "series": series,
        "pages": top(pages),
        "referrers": top(referrers),
        "devices": top(devices, 3),
    }
