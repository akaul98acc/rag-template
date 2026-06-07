from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Anchor .env to backend/ (two levels up from this file: app/core/config.py),
# so settings load regardless of the current working directory.
_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


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
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    cors_origins: list[str] = ["http://localhost:5173"]
    upload_dir: str = "uploads"

    anthropic_api_key: str | None = None
    openai_api_key: str | None = None

    llm_fallback_model: str = "claude-opus-4-7"
    rule_confidence_threshold: float = 0.7

    # Azure Document Intelligence settings
    azure_docint_endpoint: str | None = None
    # Optional API key. When set, the DI client uses key auth (AzureKeyCredential)
    # instead of DefaultAzureCredential (Managed Identity / az login).
    azure_docint_key: str | None = None

    # Azure OpenAI settings (used by the /recommend pipeline recommender)
    azure_openai_endpoint: str | None = None
    azure_openai_key: str | None = None
    azure_openai_deployment: str = "gpt-4o-mini"
    azure_openai_api_version: str = "2024-10-21"

    # Upload constraints
    max_upload_size_mb: int = 50


settings = Settings()
