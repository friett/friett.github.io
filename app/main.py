from fastapi import FastAPI

from app.paths import PUBLIC_DIR
from app.routers.api import router as api_router
from app.routers.meta import router as meta_router
from app.routers.pages import router as pages_router

app = FastAPI(
    title="Fried Schölvinck",
    description=(
        "Portfolio and blog. JSON routes under /api are the backend for the "
        "site and for later features."
    ),
    version="0.1.0",
)

app.include_router(api_router)
app.include_router(meta_router)
app.include_router(pages_router)
app.frontend("/", directory=PUBLIC_DIR)
