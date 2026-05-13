from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import analyze, generate, providers, upload
from app.core.config import settings

app = FastAPI(title="RAG Builder", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(analyze.router, prefix="/api", tags=["phase1"])
app.include_router(providers.router, prefix="/api", tags=["phase2"])
app.include_router(generate.router, prefix="/api", tags=["phase2"])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
