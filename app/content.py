"""Site content in the database, so it can change without a deploy.

The first start copies `app/site.py` into the `entry` table. After that the database is
the source: the admin edits entries, and approved drafts (from AI or a LinkedIn import)
update them. Pages read one cached `Site`, rebuilt after every change.
"""

from __future__ import annotations

import re
from threading import Lock

from pydantic import BaseModel, ValidationError
from sqlmodel import select

from app.db import Draft, Entry, session, utcnow
from app.models import Profile, Project, Role, Site, SkillGroup, Tool
from app.site import SITE

KINDS: dict[str, type[BaseModel]] = {
    "profile": Profile,
    "role": Role,
    "project": Project,
    "skill": SkillGroup,
    "tool": Tool,
}
PROFILE_SLUG = "main"
LINK_FIELDS = ("url", "link", "github", "linkedin", "icon", "preview")

_lock = Lock()
_cache: Site | None = None


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80] or "item"


def slug_for(kind: str, data: dict) -> str:
    if kind == "profile":
        return PROFILE_SLUG
    if kind == "role":
        return slugify(f"{data.get('company', '')} {data.get('title', '')}")
    if kind == "project":
        return slugify(data.get("title", ""))
    if kind == "skill":
        return slugify(data.get("category", ""))
    return slugify(data.get("name", ""))


def validate(kind: str, data: dict) -> dict:
    """The entry's fields, checked against its model. Raises a readable ValueError."""
    model = KINDS.get(kind)
    if model is None:
        raise ValueError(f"Unknown kind {kind!r}")
    try:
        clean = model.model_validate(data).model_dump()
    except ValidationError as error:
        first = error.errors()[0]
        where = ".".join(str(p) for p in first["loc"]) or kind
        raise ValueError(f"{where}: {first['msg']}") from error
    # Links from drafts (AI, LinkedIn, agents) go into href attributes: web only.
    for key in LINK_FIELDS:
        value = clean.get(key)
        if value and not str(value).startswith(("https://", "http://", "/")):
            raise ValueError(f"{key}: use a web address that starts with https://")
    return clean


def seed() -> int:
    """Copy app/site.py into an empty table. Returns the number of entries written."""
    with session() as db:
        if db.exec(select(Entry.id)).first() is not None:
            return 0
        profile = Profile.model_validate(SITE.model_dump()).model_dump()
        rows = [Entry(kind="profile", slug=PROFILE_SLUG, data=profile)]
        groups = [
            ("role", SITE.roles),
            ("project", SITE.projects),
            ("skill", SITE.skills),
            ("tool", SITE.tools),
        ]
        for kind, items in groups:
            for position, item in enumerate(items):
                data = item.model_dump()
                rows.append(
                    Entry(
                        kind=kind,
                        slug=slug_for(kind, data),
                        data=data,
                        position=position,
                    )
                )
        db.add_all(rows)
        db.commit()
    invalidate()
    return len(rows)


def invalidate() -> None:
    global _cache
    with _lock:
        _cache = None


def _build() -> Site:
    with session() as db:
        rows = db.exec(
            select(Entry)
            .where(Entry.visible)
            .order_by(Entry.kind, Entry.position, Entry.id)
        ).all()
    by_kind: dict[str, list[dict]] = {kind: [] for kind in KINDS}
    for row in rows:
        by_kind.setdefault(row.kind, []).append(row.data)
    profile = by_kind["profile"][0] if by_kind["profile"] else SITE.model_dump()
    roles = sorted(
        by_kind["role"],
        key=lambda r: (r.get("end") is None, r.get("end") or "", r.get("start", "")),
        reverse=True,
    )
    return Site.model_validate(
        {
            **Profile.model_validate(profile).model_dump(),
            "roles": roles,
            "projects": by_kind["project"],
            "skills": by_kind["skill"],
            "tools": by_kind["tool"],
        }
    )


def load_site() -> Site:
    """The site as the pages show it, or app/site.py if the database is down."""
    global _cache
    with _lock:
        if _cache is not None:
            return _cache
    try:
        site = _build()
    except Exception:  # noqa: BLE001 - a broken database must not take the site down
        return SITE
    with _lock:
        _cache = site
    return site


def list_entries(kind: str | None = None) -> list[Entry]:
    with session() as db:
        query = select(Entry).order_by(Entry.kind, Entry.position, Entry.id)
        if kind:
            query = query.where(Entry.kind == kind)
        rows = db.exec(query).all()
        for row in rows:
            db.expunge(row)
        return list(rows)


def save_entry(
    kind: str, data: dict, *, source: str, entry_id: int | None = None
) -> Entry:
    """Create or update an entry. Raises ValueError for bad data or a duplicate."""
    clean = validate(kind, data)
    slug = slug_for(kind, clean)
    with session() as db:
        clash = db.exec(
            select(Entry).where(Entry.kind == kind, Entry.slug == slug)
        ).first()
        if entry_id is None:
            if clash is not None:
                raise ValueError(f"A {kind} named {slug!r} already exists")
            last = db.exec(
                select(Entry.position)
                .where(Entry.kind == kind)
                .order_by(Entry.position.desc())
            ).first()
            row = Entry(
                kind=kind,
                slug=slug,
                data=clean,
                source=source,
                position=(last or 0) + 1,
            )
        else:
            row = db.get(Entry, entry_id)
            if row is None or row.kind != kind:
                raise LookupError("No such entry")
            if clash is not None and clash.id != row.id:
                raise ValueError(f"A {kind} named {slug!r} already exists")
            row.slug, row.data, row.source, row.updated_at = (
                slug,
                clean,
                source,
                utcnow(),
            )
        db.add(row)
        db.commit()
        db.refresh(row)
        db.expunge(row)
    invalidate()
    return row


def update_entry(
    entry_id: int, *, visible: bool | None = None, position: int | None = None
) -> Entry:
    with session() as db:
        row = db.get(Entry, entry_id)
        if row is None:
            raise LookupError("No such entry")
        if visible is not None:
            row.visible = visible
        if position is not None:
            row.position = position
        row.updated_at = utcnow()
        db.add(row)
        db.commit()
        db.refresh(row)
        db.expunge(row)
    invalidate()
    return row


def delete_entry(entry_id: int) -> None:
    with session() as db:
        row = db.get(Entry, entry_id)
        if row is None:
            raise LookupError("No such entry")
        if row.kind == "profile":
            raise ValueError("The profile cannot be deleted")
        db.delete(row)
        db.commit()
    invalidate()


def propose(
    kind: str, data: dict, *, action: str, reason: str, source: str
) -> Draft | None:
    """Queue a change for the owner. Skips duplicates and changes that do nothing."""
    if action not in {"create", "update", "hide"}:
        raise ValueError(f"Unknown action {action!r}")
    clean = validate(kind, data) if action != "hide" else data
    slug = slug_for(kind, clean) if action != "hide" else str(data.get("slug", ""))
    with session() as db:
        current = db.exec(
            select(Entry).where(Entry.kind == kind, Entry.slug == slug)
        ).first()
        if action == "update" and current is None:
            action = "create"
        if action == "create" and current is not None:
            action = "update"
        if action == "update" and current is not None and current.data == clean:
            return None
        if action == "hide" and (current is None or not current.visible):
            return None
        pending = db.exec(
            select(Draft).where(
                Draft.kind == kind, Draft.slug == slug, Draft.status == "pending"
            )
        ).all()
        if any(p.action == action and p.data == clean for p in pending):
            return None
        draft = Draft(
            kind=kind,
            slug=slug,
            action=action,
            data=clean,
            reason=reason[:500],
            source=source,
        )
        db.add(draft)
        db.commit()
        db.refresh(draft)
        db.expunge(draft)
        return draft


def list_drafts(status: str = "pending") -> list[Draft]:
    with session() as db:
        rows = db.exec(
            select(Draft).where(Draft.status == status).order_by(Draft.id.desc())
        ).all()
        for row in rows:
            db.expunge(row)
        return list(rows)


def decide_draft(draft_id: int, apply: bool, data: dict | None = None) -> Draft:
    """Apply (optionally with the owner's edits) or dismiss a pending draft."""
    with session() as db:
        draft = db.get(Draft, draft_id)
        if draft is None or draft.status != "pending":
            raise LookupError("No such pending draft")
        draft.decided_at = utcnow()
        if not apply:
            draft.status = "dismissed"
            db.add(draft)
            db.commit()
            db.refresh(draft)
            db.expunge(draft)
            return draft
        kind, slug, action = draft.kind, draft.slug, draft.action
        payload = data if data is not None else draft.data
    if action == "hide":
        with session() as db:
            row = db.exec(
                select(Entry).where(Entry.kind == kind, Entry.slug == slug)
            ).first()
        if row is not None:
            update_entry(row.id, visible=False)
    else:
        with session() as db:
            row = db.exec(
                select(Entry).where(Entry.kind == kind, Entry.slug == slug)
            ).first()
        save_entry(kind, payload, source=draft.source, entry_id=row.id if row else None)
    with session() as db:
        draft = db.get(Draft, draft_id)
        draft.status = "applied"
        draft.decided_at = utcnow()
        db.add(draft)
        db.commit()
        db.refresh(draft)
        db.expunge(draft)
    return draft
