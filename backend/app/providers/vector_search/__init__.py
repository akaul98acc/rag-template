CATALOG: dict[str, dict] = {
    "pinecone": {
        "name": "Pinecone",
        "description": "Managed vector DB. Low-latency, serverless and pod options.",
        "pricing_notes": "Per-pod or serverless reads/writes.",
        "requires_env": ["PINECONE_API_KEY"],
        "requires_packages": ["pinecone-client"],
    },
    "weaviate": {
        "name": "Weaviate",
        "description": "Open-source vector DB with hybrid search built in.",
        "pricing_notes": "Free self-host; cloud is usage-based.",
        "requires_env": ["WEAVIATE_URL", "WEAVIATE_API_KEY"],
        "requires_packages": ["weaviate-client"],
    },
    "faiss_local": {
        "name": "FAISS (local)",
        "description": "In-process ANN library by Meta. No server, no network.",
        "pricing_notes": "Free; rebuild on changes.",
        "requires_env": [],
        "requires_packages": ["faiss-cpu"],
    },
    "pgvector": {
        "name": "pgvector (Postgres)",
        "description": "Vector extension for Postgres. Co-locate with relational data.",
        "pricing_notes": "Postgres hosting only.",
        "requires_env": ["DATABASE_URL"],
        "requires_packages": ["psycopg2-binary", "pgvector"],
    },
    "azure_ai_search": {
        "name": "Azure AI Search",
        "description": "Hybrid keyword + vector search managed by Azure.",
        "pricing_notes": "Per replica/partition.",
        "requires_env": ["AZURE_AI_SEARCH_ENDPOINT", "AZURE_AI_SEARCH_KEY"],
        "requires_packages": ["azure-search-documents"],
    },
}
