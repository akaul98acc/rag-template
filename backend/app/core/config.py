from pydantic_settings import BaseSettings, SettingsConfigDict


# Supported MIME types for document upload
SUPPORTED_MIME_TYPES: frozenset[str] = frozenset(
    [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/tiff",
        "image/bmp",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cors_origins: list[str] = ["http://localhost:5173"]
    upload_dir: str = "uploads"

    anthropic_api_key: str | None = None
    openai_api_key: str | None = None

    llm_fallback_model: str = "claude-opus-4-7"
    rule_confidence_threshold: float = 0.7

    # Azure Document Intelligence settings
    azure_docint_endpoint: str | None = None

    # Upload constraints
    max_upload_size_mb: int = 50


settings = Settings()
