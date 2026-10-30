import hashlib
from datetime import date
from functools import cache

from starlette.templating import Jinja2Templates

from app.blog import render_inline
from app.icons import icon
from app.paths import PUBLIC_DIR, TEMPLATES_DIR
from app.shell import NAV, SHORTCUT_TARGETS, TABS, slugify


def pretty_date(value: str) -> str:
    try:
        parsed = date.fromisoformat(value[:10])
    except ValueError:
        return value
    return f"{parsed.day} {parsed.strftime('%B')} {parsed.year}"


def short_date(value: str) -> str:
    try:
        parsed = date.fromisoformat(value[:10])
    except ValueError:
        return value
    return f"{parsed.strftime('%b')} {parsed.year}"


def bare_url(value: str) -> str:
    return value.removeprefix("https://").removeprefix("http://").rstrip("/")


@cache
def asset(name: str) -> str:
    """A built island file in frontend/public/app, with a hash for cache busting."""
    path = PUBLIC_DIR / "app" / name
    try:
        version = hashlib.sha256(path.read_bytes()).hexdigest()[:10]
    except OSError:
        version = "dev"
    return f"/app/{name}?v={version}"


templates = Jinja2Templates(directory=TEMPLATES_DIR)
templates.env.auto_reload = True
templates.env.filters["inline"] = render_inline
templates.env.filters["pretty_date"] = pretty_date
templates.env.filters["short_date"] = short_date
templates.env.filters["bare_url"] = bare_url
templates.env.filters["slug"] = slugify
templates.env.globals.update(
    icon=icon,
    asset=asset,
    nav=NAV,
    tabs=TABS,
    shortcut_targets=SHORTCUT_TARGETS,
)
