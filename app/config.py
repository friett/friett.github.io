"""Settings from the environment. Secrets are set on FastAPI Cloud with `--secret`."""

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="site_", env_file=".env", extra="ignore"
    )

    # Neon Postgres in production. SQLite is for development only: the FastAPI Cloud
    # disk is not persistent, so a redeploy would delete the passkey, stats and chats.
    database: str = Field(
        default="sqlite:///data/site.db",
        validation_alias=AliasChoices("site_database", "database_url"),
    )
    session_secret: str = "change-me"
    # The admin passkey is registered once from /admin#setup=<token>.
    enrollment_token: str = ""
    # Passkeys need a host name: in development use http://localhost:8000.
    origin: str = "http://localhost:8000"
    rp_id: str = "localhost"
    https_only: bool = False

    # The chat. Groq's free tier limits each model separately, so a 429 on one model
    # moves on to the next.
    groq_api_key: str = Field(
        default="", validation_alias=AliasChoices("site_groq_api_key", "groq_api_key")
    )
    groq_base_url: str = "https://api.groq.com/openai/v1"
    chat_models: list[str] = [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
    ]
    # Questions per visitor per day, and for the whole site per day.
    chat_visitor_daily: int = 30
    chat_site_daily: int = 600


@lru_cache
def get_settings() -> Settings:
    return Settings()
