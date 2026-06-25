import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import feedback, generate, notebook, providers, recommend, recommend_providers, upload
from app.core.config import settings
from app.services.azure_document_intelligence import is_azure_di_configured
from app.services.database import close_db, init_db

# Make app INFO logs visible alongside uvicorn output. Without this the
# document_analyzer "Azure DI ..." messages are emitted at INFO and dropped.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="RAG Builder", version="0.1.0")


@app.on_event("startup")
async def _startup() -> None:
    # --- PostgreSQL document store ---
    if settings.database_url:
        try:
            await init_db(settings.database_url)
        except Exception as exc:
            logger.error(
                "Failed to connect to PostgreSQL (%s) — falling back to in-memory store: %s",
                settings.database_url,
                exc,
            )
    else:
        logger.warning(
            "DATABASE_URL not set — document store is in-memory only "
            "(documents lost on process restart)"
        )

    # --- Azure Document Intelligence ---
    if is_azure_di_configured():
        auth = "API key" if settings.azure_docint_key else "DefaultAzureCredential"
        logger.info(
            "Azure Document Intelligence CONFIGURED (endpoint=%s, auth=%s)",
            settings.azure_docint_endpoint,
            auth,
        )
    else:
        logger.warning(
            "Azure Document Intelligence NOT configured "
            "(set azure_docint_endpoint in backend/.env) - uploads use local pypdf fallback"
        )


@app.on_event("shutdown")
async def _shutdown() -> None:
    await close_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(recommend.router, prefix="/api", tags=["step1"])
app.include_router(providers.router, prefix="/api", tags=["step2"])
app.include_router(generate.router, prefix="/api", tags=["step2"])
app.include_router(notebook.router, prefix="/api", tags=["step2"])
app.include_router(recommend_providers.router, prefix="/api", tags=["step2"])
app.include_router(feedback.router, prefix="/api", tags=["feedback"])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
