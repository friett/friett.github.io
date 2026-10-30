from datetime import date

from starlette.templating import Jinja2Templates

from app.blog import render_inline
from app.icons import icon
from app.paths import TEMPLATES_DIR
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


templates = Jinja2Templates(directory=TEMPLATES_DIR)
templates.env.auto_reload = True
templates.env.filters["inline"] = render_inline
templates.env.filters["pretty_date"] = pretty_date
templates.env.filters["short_date"] = short_date
templates.env.filters["bare_url"] = bare_url
templates.env.filters["slug"] = slugify
templates.env.globals.update(
    icon=icon,
    nav=NAV,
    tabs=TABS,
    shortcut_targets=SHORTCUT_TARGETS,
)
