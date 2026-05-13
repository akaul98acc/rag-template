from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cors_origins: list[str] = ["http://localhost:5173"]
    upload_dir: str = "uploads"

    anthropic_api_key: str | None = None
    openai_api_key: str | None = None

    llm_fallback_model: str = "claude-opus-4-7"
    rule_confidence_threshold: float = 0.7


settings = Settings()
