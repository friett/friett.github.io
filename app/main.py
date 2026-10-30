import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.config import get_settings
from app.content import seed
from app.db import init_db
from app.paths import PUBLIC_DIR
from app.routers.admin import router as admin_router
from app.routers.api import router as api_router
from app.routers.chat import router as chat_router
from app.routers.meta import router as meta_router
from app.routers.pages import router as pages_router
from app.tracking import VisitTracker

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        init_db()
        seed()
    except Exception:  # noqa: BLE001 - without a database, pages use app/site.py
        log.exception("database unavailable at startup")
    yield


settings = get_settings()
app = FastAPI(
    title="Fried Schölvinck",
    description=(
        "Portfolio and blog. JSON routes under /api are the backend for the "
        "site, the chat and the owner's admin."
    ),
    version="0.2.0",
    lifespan=lifespan,
)
# The session cookie is set only by the admin sign-in; visitors get none.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    https_only=settings.https_only,
    same_site="strict",
    session_cookie="site_admin",
    max_age=14 * 24 * 3600,
)
app.add_middleware(VisitTracker)

app.include_router(api_router)
app.include_router(chat_router)
app.include_router(admin_router)
app.include_router(meta_router)
app.include_router(pages_router)
app.frontend("/", directory=PUBLIC_DIR)
