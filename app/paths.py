from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOG_DIR = ROOT / "content" / "blog"
PROJECTS_BACKUP = ROOT / "content" / "projects.json"
PUBLIC_DIR = ROOT / "frontend" / "public"
TEMPLATES_DIR = ROOT / "frontend" / "templates"
AUDIO_DIR = PUBLIC_DIR / "audio"
