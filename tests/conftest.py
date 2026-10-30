"""Every test run uses a fresh in-memory database with the seeded content."""

import os

os.environ["SITE_DATABASE"] = "sqlite://"
os.environ["SITE_ORIGIN"] = "http://testserver"
os.environ["SITE_RP_ID"] = "testserver"
os.environ["SITE_ENROLLMENT_TOKEN"] = "test-setup-token"
os.environ["SITE_SESSION_SECRET"] = "test-secret"
os.environ.pop("GROQ_API_KEY", None)

import pytest  # noqa: E402

from app import tracking  # noqa: E402
from app.content import seed  # noqa: E402
from app.db import init_db  # noqa: E402

init_db()
seed()
tracking.SYNC = True


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
