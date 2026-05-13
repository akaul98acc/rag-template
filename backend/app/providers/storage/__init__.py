CATALOG: dict[str, dict] = {
    "azure_blob": {
        "name": "Azure Blob Storage",
        "description": "Azure object storage. Good fit if other Azure services (DI, AI Search) are in use.",
        "pricing_notes": "Per-GB stored + egress + transactions.",
        "requires_env": ["AZURE_BLOB_CONNECTION_STRING"],
    },
    "aws_s3": {
        "name": "AWS S3",
        "description": "AWS object storage. Mature, durable, broad SDK support.",
        "pricing_notes": "Per-GB stored + requests + egress.",
        "requires_env": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
    },
    "gcs": {
        "name": "Google Cloud Storage",
        "description": "GCP object storage. Strong choice when paired with Doc AI / Vertex.",
        "pricing_notes": "Per-GB stored + operations + egress.",
        "requires_env": ["GOOGLE_APPLICATION_CREDENTIALS"],
    },
    "minio_local": {
        "name": "MinIO (local)",
        "description": "S3-compatible local storage. Useful for dev/offline.",
        "pricing_notes": "Self-hosted; only infra cost.",
        "requires_env": [],
    },
}
