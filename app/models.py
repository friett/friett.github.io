from pydantic import BaseModel, Field


class Health(BaseModel):
    status: str


class SkillGroup(BaseModel):
    category: str
    items: list[str]


class Project(BaseModel):
    title: str
    description: str
    tags: list[str]
    date: str
    link: str | None = None
    preview: str | None = None
    featured: bool = False
    eyebrow: str | None = None
    highlights: list[str] = Field(default_factory=list)


class PublicProject(BaseModel):
    slug: str
    name: str
    summary: str = ""
    status: str = ""
    stage: str = ""
    type: str = ""
    live_url: str | None = None
    repo_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    updated_at: str = ""


class Tool(BaseModel):
    name: str
    icon: str
    description: str
    url: str


class Role(BaseModel):
    """A position, as LinkedIn lists it. Months are YYYY-MM; no end means current."""

    company: str
    title: str
    start: str
    end: str | None = None
    location: str | None = None
    description: str = ""
    url: str | None = None


class Profile(BaseModel):
    name: str
    role: str
    location: str
    bio: list[str]
    phrases: list[str]
    github: str
    linkedin: str


class Site(Profile):
    skills: list[SkillGroup]
    projects: list[Project]
    tools: list[Tool]
    roles: list[Role] = Field(default_factory=list)


class PostSummary(BaseModel):
    slug: str
    title: str
    date: str
    tags: list[str]
    preview: str
    minutes: int
    audio: str | None = None


class TocEntry(BaseModel):
    id: str
    title: str
    level: int


class Post(PostSummary):
    markdown: str
    html: str
    toc: list[TocEntry] = Field(default_factory=list)
