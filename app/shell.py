"""Navigation and command palette data shared by every page."""

import re
from typing import NamedTuple

from app.models import PostSummary, Site


class NavItem(NamedTuple):
    id: str
    label: str
    href: str
    icon: str
    key: str


HOME = NavItem("home", "Home", "/", "house", "h")
ABOUT = NavItem("about", "About", "/#about", "user", "a")
PROJECTS = NavItem("projects", "Projects", "/#projects", "briefcase-business", "p")
WRITING = NavItem("writing", "Writing", "/#blog", "notebook-pen", "w")
TOOLS = NavItem("tools", "Tools", "/#tools", "wrench", "t")
CONTACT = NavItem("contact", "Contact", "#contact", "at-sign", "c")

# Sidebar on wide screens. Contact links sit in their own group below it.
NAV = [HOME, ABOUT, PROJECTS, WRITING, TOOLS]
# Tab bar on phones: five thumb-sized targets.
TABS = [HOME, PROJECTS, WRITING, TOOLS, CONTACT]
# `g` then the key jumps to the section.
SHORTCUT_TARGETS = [HOME, ABOUT, PROJECTS, WRITING, TOOLS, CONTACT]


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def profiles(site: Site) -> list[dict[str, str]]:
    return [
        {"label": "GitHub", "href": site.github, "icon": "github"},
        {"label": "LinkedIn", "href": site.linkedin, "icon": "linkedin"},
    ]


def palette_index(site: Site, posts: list[PostSummary]) -> list[dict[str, object]]:
    """Everything the command palette can find, in display order."""
    items: list[dict[str, object]] = []
    for item in SHORTCUT_TARGETS:
        items.append(
            {
                "group": "Go to",
                "label": item.label,
                "href": item.href,
                "icon": item.icon,
                "hint": f"G {item.key.upper()}",
                "entity": item.id,
            }
        )
    for post in posts:
        items.append(
            {
                "group": "Writing",
                "label": post.title,
                "href": f"/blog/{post.slug}",
                "icon": "file-text",
                "keywords": " ".join([*post.tags, post.preview]),
                "hint": f"{post.minutes} min",
                "entity": "writing",
            }
        )
    for project in site.projects:
        items.append(
            {
                "group": "Projects",
                "label": project.title,
                "href": f"/#project-{slugify(project.title)}",
                "icon": "briefcase-business",
                "keywords": " ".join([*project.tags, project.description]),
                "hint": project.date,
                "entity": "projects",
            }
        )
    for profile in profiles(site):
        items.append(
            {
                "group": "Profiles",
                "label": profile["label"],
                "href": profile["href"],
                "icon": profile["icon"],
                "keywords": "contact profile social",
                "external": True,
            }
        )
    for tool in site.tools:
        items.append(
            {
                "group": "Tools",
                "label": tool.name,
                "href": tool.url,
                "image": tool.icon,
                "keywords": tool.description,
                "external": True,
            }
        )
    items.extend(
        [
            {
                "group": "Theme",
                "label": "Light theme",
                "action": "theme:light",
                "icon": "sun",
                "keywords": "appearance mode",
            },
            {
                "group": "Theme",
                "label": "Dark theme",
                "action": "theme:dark",
                "icon": "moon",
                "keywords": "appearance mode",
            },
            {
                "group": "Theme",
                "label": "System theme",
                "action": "theme:system",
                "icon": "monitor",
                "keywords": "appearance mode auto",
            },
            {
                "group": "Actions",
                "label": "Copy link to this page",
                "action": "copy-link",
                "icon": "link",
                "keywords": "share url",
            },
            {
                "group": "Actions",
                "label": "Toggle sidebar",
                "action": "toggle-nav",
                "icon": "panel-left-close",
                "keywords": "collapse expand navigation",
                "hint": "[",
            },
            {
                "group": "Help",
                "label": "Keyboard shortcuts",
                "action": "shortcuts",
                "icon": "keyboard",
                "hint": "?",
            },
        ]
    )
    return items
