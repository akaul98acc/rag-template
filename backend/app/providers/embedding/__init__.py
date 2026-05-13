CATALOG: dict[str, dict] = {
    "openai": {
        "name": "OpenAI Embeddings",
        "description": "text-embedding-3-small / large. Strong general quality.",
        "pricing_notes": "Per 1K tokens; small is ~5x cheaper than large.",
        "requires_env": ["OPENAI_API_KEY"],
    },
    "aws_bedrock": {
        "name": "AWS Bedrock Embeddings",
        "description": "Titan / Cohere embeddings hosted in AWS.",
        "pricing_notes": "Per 1K tokens; varies by model.",
        "requires_env": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
    },
    "azure_openai": {
        "name": "Azure OpenAI Embeddings",
        "description": "OpenAI models via Azure with regional data residency.",
        "pricing_notes": "Same model tiers; billed via Azure.",
        "requires_env": ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_KEY"],
    },
    "cohere": {
        "name": "Cohere Embed",
        "description": "embed-english-v3 / embed-multilingual-v3.",
        "pricing_notes": "Per 1K tokens.",
        "requires_env": ["COHERE_API_KEY"],
    },
    "hf_local": {
        "name": "HuggingFace (local)",
        "description": "Self-hosted sentence-transformers (e.g. bge-large, e5).",
        "pricing_notes": "Free; needs local CPU/GPU.",
        "requires_env": [],
    },
}
