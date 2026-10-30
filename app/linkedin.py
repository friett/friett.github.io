"""Import from LinkedIn's own data export.

LinkedIn: Settings › Data privacy › Get a copy of your data.

LinkedIn's API gives individuals only their name, photo and email, so the export is the
reliable source. Upload the ZIP, or single CSV files, in the admin. Nothing changes on
the site directly: every difference becomes a draft for the owner to apply or dismiss.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from datetime import datetime

from app.content import list_entries, propose
from app.db import Draft

MONTHS = {
    m: i
    for i, m in enumerate(
        [
            "jan",
            "feb",
            "mar",
            "apr",
            "may",
            "jun",
            "jul",
            "aug",
            "sep",
            "oct",
            "nov",
            "dec",
        ],
        1,
    )
}
FILES = ("positions.csv", "skills.csv", "projects.csv", "profile.csv")


def month(value: str) -> str | None:
    """'Mar 2021' -> '2021-03', '2021' -> '2021'; empty -> None."""
    value = (value or "").strip()
    if not value:
        return None
    m = re.match(r"^([A-Za-z]{3})[a-z]*\.? (\d{4})$", value)
    if m and m.group(1).lower() in MONTHS:
        return f"{m.group(2)}-{MONTHS[m.group(1).lower()]:02d}"
    m = re.match(r"^(\d{4})(?:-(\d{2}))?", value)
    if m:
        return m.group(0)
    for fmt in ("%m/%d/%Y", "%d %b %Y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m")
        except ValueError:
            pass
    return None


def rows(text: str) -> list[dict[str, str]]:
    """CSV rows, skipping the "Notes:" block some exports put above the header."""
    lines = text.lstrip("\ufeff").splitlines()
    if lines and lines[0].lower().startswith("notes"):
        blank = next((i for i, ln in enumerate(lines) if not ln.strip()), len(lines))
        lines = lines[blank + 1 :]
    reader = csv.DictReader(io.StringIO("\n".join(lines)))
    return [
        {(k or "").strip(): (v or "").strip() for k, v in r.items() if k is not None}
        for r in reader
    ]


def read_upload(name: str, payload: bytes) -> dict[str, list[dict[str, str]]]:
    """The known CSV files from a ZIP export or a single CSV, by lower-case name."""
    found: dict[str, list[dict[str, str]]] = {}
    if name.lower().endswith(".zip") or payload[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            for info in archive.infolist():
                base = info.filename.rsplit("/", 1)[-1].lower()
                if base in FILES and info.file_size < 5_000_000:
                    found[base] = rows(
                        archive.read(info).decode("utf-8", errors="replace")
                    )
    else:
        base = name.rsplit("/", 1)[-1].lower()
        if base in FILES:
            found[base] = rows(payload.decode("utf-8", errors="replace"))
    return found


def drafts_from(files: dict[str, list[dict[str, str]]]) -> list[Draft]:
    made: list[Draft] = []

    def add(kind: str, data: dict, action: str, reason: str) -> None:
        try:
            draft = propose(kind, data, action=action, reason=reason, source="linkedin")
        except ValueError:
            return
        if draft:
            made.append(draft)

    for r in files.get("positions.csv", []):
        company, title, start = (
            r.get("Company Name", ""),
            r.get("Title", ""),
            month(r.get("Started On", "")),
        )
        if not (company and title and start):
            continue
        add(
            "role",
            {
                "company": company,
                "title": title,
                "start": start,
                "end": month(r.get("Finished On", "")),
                "location": r.get("Location") or None,
                "description": r.get("Description", ""),
            },
            "update",
            "From your LinkedIn positions",
        )

    for r in files.get("projects.csv", []):
        title = r.get("Title", "")
        if not title:
            continue
        start = month(r.get("Started On", "")) or ""
        add(
            "project",
            {
                "title": title,
                "description": r.get("Description", "") or title,
                "tags": [],
                "date": start[:4],
                "link": r.get("Url") or None,
            },
            "update",
            "From your LinkedIn projects",
        )

    skills = [r.get("Name", "") for r in files.get("skills.csv", []) if r.get("Name")]
    if skills:
        known = {
            item.lower()
            for e in list_entries("skill")
            for item in e.data.get("items", [])
        }
        missing = [s for s in skills if s.lower() not in known]
        if missing:
            add(
                "skill",
                {"category": "From LinkedIn", "items": missing[:40]},
                "update",
                f"{len(missing)} LinkedIn skills that the site does not list",
            )

    profile_rows = files.get("profile.csv", [])
    if profile_rows:
        p = profile_rows[0]
        current = next((e.data for e in list_entries("profile")), None)
        if current:
            data = dict(current)
            summary = [
                part.strip()
                for part in re.split(r"\n\s*\n", p.get("Summary", ""))
                if part.strip()
            ]
            if summary:
                data["bio"] = summary
            headline = p.get("Headline", "")
            if headline and len(headline) <= 80:
                data["role"] = headline
            add("profile", data, "update", "Your LinkedIn headline and summary")
    return made
