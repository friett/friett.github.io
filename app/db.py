"""Database: the admin passkey, the site content, visits, chats and proposed updates.

Neon Postgres in production (`DATABASE_URL`), SQLite in development and tests.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import JSON, Column, Text, UniqueConstraint, text
from sqlalchemy.pool import StaticPool
from sqlmodel import Field, Session, SQLModel, create_engine, select

from app.config import get_settings

_engine = None


def utcnow() -> datetime:
    return datetime.now(UTC)


class Credential(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    credential_id: str = Field(unique=True, index=True)
    public_key: str
    sign_count: int = 0


class Entry(SQLModel, table=True):
    """One piece of content: the profile, a role, a project, a skill group or a tool.

    `data` holds the fields of the matching model in app/models.py.
    """

    __table_args__ = (UniqueConstraint("kind", "slug"),)
    id: int | None = Field(default=None, primary_key=True)
    kind: str = Field(index=True)
    slug: str
    data: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    position: int = 0
    visible: bool = True
    # seed (site.py), admin, linkedin or ai: where the current version came from.
    source: str = "seed"
    updated_at: datetime = Field(default_factory=utcnow)


class PageView(SQLModel, table=True):
    """A page view without cookies or IP addresses. `visitor` is a daily-salted hash."""

    id: int | None = Field(default=None, primary_key=True)
    ts: datetime = Field(default_factory=utcnow)
    day: str = Field(index=True)
    path: str
    referrer: str = ""
    visitor: str = Field(index=True)
    device: str = ""
    country: str = ""


class ChatTurn(SQLModel, table=True):
    """A question to the hosted chat and its answer. Browser-model chats stay local."""

    id: int | None = Field(default=None, primary_key=True)
    conversation: str = Field(index=True)
    visitor: str = Field(index=True)
    day: str = Field(index=True)
    question: str = Field(sa_column=Column(Text, nullable=False))
    answer: str = Field(default="", sa_column=Column(Text, nullable=False))
    model: str = ""
    # The site content had no answer: the model marked the reply as a gap.
    unanswered: bool = False
    tokens: int = 0
    created_at: datetime = Field(default_factory=utcnow)


class Draft(SQLModel, table=True):
    """A proposed change (from AI or a LinkedIn import) that waits for the owner."""

    id: int | None = Field(default=None, primary_key=True)
    kind: str
    slug: str
    # create, update or hide
    action: str
    data: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    reason: str = ""
    source: str = "ai"
    # pending, applied or dismissed
    status: str = Field(default="pending", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    decided_at: datetime | None = None


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str


class ApiToken(SQLModel, table=True):
    """A token for agents that propose drafts, such as Claude with LinkedIn access."""

    id: int | None = Field(default=None, primary_key=True)
    name: str
    token_hash: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=utcnow)


def database_url(url: str) -> str:
    if url.startswith(("postgres://", "postgresql://")):
        return "postgresql+psycopg://" + url.split("://", 1)[1]
    return url


def engine():
    global _engine
    if _engine is None:
        url = database_url(get_settings().database)
        kwargs: dict[str, Any] = {}
        if url == "sqlite://":
            kwargs = {
                "connect_args": {"check_same_thread": False},
                "poolclass": StaticPool,
            }
        elif url.startswith("sqlite"):
            kwargs = {"connect_args": {"check_same_thread": False}}
        elif url.startswith("postgresql"):
            # Neon's pooler keeps no prepared statements, and idle computes drop
            # connections.
            kwargs = {
                "connect_args": {"connect_timeout": 10, "prepare_threshold": None},
                "pool_pre_ping": True,
                "pool_size": 3,
                "max_overflow": 2,
            }
        _engine = create_engine(url, **kwargs)
    return _engine


def reset_engine() -> None:
    """Forget the engine, for tests that change the database URL."""
    global _engine
    _engine = None


def init_db() -> None:
    url = get_settings().database
    if url.startswith("sqlite:///") and url != "sqlite://":
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    with engine().begin() as connection:
        if connection.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(5219)"))
        SQLModel.metadata.create_all(connection)


def session() -> Session:
    return Session(engine())


def get_setting(key: str) -> str | None:
    with session() as db:
        row = db.get(Setting, key)
        return row.value if row else None


def set_setting(key: str, value: str) -> None:
    with session() as db:
        row = db.get(Setting, key) or Setting(key=key, value=value)
        row.value = value
        db.add(row)
        db.commit()


def one_credential() -> Credential | None:
    with session() as db:
        row = db.exec(select(Credential)).first()
        if row is not None:
            db.expunge(row)
        return row
