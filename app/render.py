from datetime import date

from starlette.templating import Jinja2Templates

from app.blog import render_inline
from app.paths import TEMPLATES_DIR


def pretty_date(value: str) -> str:
    try:
        parsed = date.fromisoformat(value[:10])
    except ValueError:
        return value
    return f"{parsed.day} {parsed.strftime('%B')} {parsed.year}"


templates = Jinja2Templates(directory=TEMPLATES_DIR)
templates.env.auto_reload = True
templates.env.filters["inline"] = render_inline
templates.env.filters["pretty_date"] = pretty_date
