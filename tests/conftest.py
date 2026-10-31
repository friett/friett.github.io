"""Every test run uses a fresh in-memory database with the seeded content.

The portal is never called: its requests fail, so pages show the local posts.
"""

import os

os.environ["SITE_DATABASE"] = "sqlite://"
os.environ["SITE_ORIGIN"] = "http://testserver"
os.environ["SITE_RP_ID"] = "testserver"
os.environ["SITE_ENROLLMENT_TOKEN"] = "test-setup-token"
os.environ["SITE_SESSION_SECRET"] = "test-secret"
os.environ.pop("GROQ_API_KEY", None)
os.environ.pop("PORTAL_REVALIDATE_SECRET", None)

import httpx  # noqa: E402
import pytest  # noqa: E402

from app import tracking  # noqa: E402
from app.content import seed  # noqa: E402
from app.db import init_db  # noqa: E402
from app.posts import post_source  # noqa: E402

init_db()
seed()
tracking.SYNC = True


def _no_portal(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("tests do not call the portal", request=request)


post_source.transport = httpx.MockTransport(_no_portal)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
