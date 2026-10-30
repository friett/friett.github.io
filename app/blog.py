import re
from datetime import date, datetime
from pathlib import Path
from xml.etree.ElementTree import Element

import frontmatter
from markdown import Markdown
from markdown.extensions import Extension
from markdown.treeprocessors import Treeprocessor

from app.models import Post, PostSummary
from app.paths import AUDIO_DIR, BLOG_DIR

_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class _MediaTreeprocessor(Treeprocessor):
    def run(self, root: Element) -> None:
        for parent in list(root.iter()):
            for child in list(parent):
                if child.tag == "a":
                    self._external_link(child)
                elif child.tag == "p" and self._only_image(child):
                    index = list(parent).index(child)
                    figure = self._figure(child[0])
                    parent.remove(child)
                    parent.insert(index, figure)
                elif child.tag == "img":
                    index = list(parent).index(child)
                    figure = self._figure(child)
                    parent.insert(index, figure)

    def _external_link(self, link: Element) -> None:
        href = link.get("href") or ""
        if href.startswith(("http://", "https://")):
            link.set("target", "_blank")
            link.set("rel", "noopener noreferrer")

    def _only_image(self, paragraph: Element) -> bool:
        children = list(paragraph)
        if len(children) != 1 or children[0].tag != "img":
            return False
        if (paragraph.text or "").strip():
            return False
        return not (children[0].tail or "").strip()

    def _figure(self, image: Element) -> Element:
        image.set("loading", "lazy")
        figure = Element("figure")
        figure.append(image)
        alt = (image.get("alt") or "").strip()
        if alt:
            caption = Element("figcaption")
            caption.text = alt
            figure.append(caption)
        return figure


class _MediaExtension(Extension):
    def extendMarkdown(self, md: Markdown) -> None:
        md.treeprocessors.register(_MediaTreeprocessor(md), "media", 15)


def render_markdown(text: str) -> str:
    parser = Markdown(
        extensions=["fenced_code", "tables", "sane_lists", "toc", _MediaExtension()],
        output_format="html",
    )
    return parser.convert(text).strip()


def render_inline(text: str) -> str:
    html = render_markdown(text).strip()
    if html.startswith("<p>") and html.endswith("</p>") and html.count("<p>") == 1:
        return html[3:-4]
    return html


def reading_minutes(content: str) -> int:
    words = re.findall(r"[A-Za-z0-9']+", content)
    return max(1, round(len(words) / 220))


def preview_text(content: str, length: int = 150) -> str:
    plain = re.sub(r"```[\s\S]*?```", "", content)
    plain = re.sub(r"!\[(.*?)\]\(.*?\)", r"\1", plain)
    plain = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", plain)
    plain = re.sub(r"#+\s+", "", plain)
    plain = re.sub(r"[*_`]", "", plain)
    paragraphs = [" ".join(part.split()) for part in re.split(r"\n\s*\n", plain)]
    first = next((part for part in paragraphs if part), "")
    if len(first) <= length:
        return first
    cut = first[:length]
    last_space = cut.rfind(" ")
    if last_space == -1:
        return f"{cut}..."
    return f"{cut[:last_space]}..."


class BlogStore:
    def __init__(self, directory: Path, audio_directory: Path) -> None:
        self.directory = directory
        self.audio_directory = audio_directory

    def list_posts(self) -> list[PostSummary]:
        posts = [self._summary(path) for path in self._paths()]
        posts.sort(key=lambda post: _sort_date(post.date), reverse=True)
        return posts

    def get_post(self, slug: str) -> Post | None:
        if not _SLUG.fullmatch(slug):
            return None
        path = (self.directory / f"{slug}.md").resolve()
        if path.parent != self.directory.resolve() or not path.is_file():
            return None
        summary = self._summary(path)
        loaded = frontmatter.load(path)
        body = loaded.content.strip()
        return Post(
            **summary.model_dump(),
            markdown=body,
            html=render_markdown(body),
        )

    def _paths(self) -> list[Path]:
        if not self.directory.is_dir():
            return []
        return [
            path for path in self.directory.glob("*.md") if _SLUG.fullmatch(path.stem)
        ]

    def _summary(self, path: Path) -> PostSummary:
        loaded = frontmatter.load(path)
        slug = path.stem
        audio = self.audio_directory / f"{slug}.mp3"
        return PostSummary(
            slug=slug,
            title=_title(loaded.metadata.get("title")),
            date=_date_text(loaded.metadata.get("date")),
            tags=_tags(loaded.metadata.get("tags")),
            preview=preview_text(loaded.content),
            minutes=reading_minutes(loaded.content),
            audio=f"/audio/{slug}.mp3" if audio.is_file() else None,
        )


def _title(value: object) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return "Untitled"


def _date_text(value: object) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str) and value.strip():
        return value.strip()
    return ""


def _tags(value: object) -> list[str]:
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _sort_date(value: str) -> date:
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return date.min


blog_store = BlogStore(BLOG_DIR, AUDIO_DIR)
