-- Migration 001: Create recommendations table
-- Applied automatically by database._ensure_schema() on startup.
-- One-time migration: if the table exists with a TEXT id column (old schema),
-- it is dropped and recreated here with a UUID column.

CREATE TABLE IF NOT EXISTS recommendations (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id               TEXT        REFERENCES documents(doc_id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Provenance
    -- source:        'llm' | 'rules'  (only two values until ML is built)
    -- model_version: '<deployment>-<api_version>' for LLM, 'rules-v1' for rules engine
    -- confidence:    LLM-reported confidence clamped to [0, 1]; 1.0 for rules (deterministic)
    source               TEXT        NOT NULL CHECK (source IN ('llm', 'rules', 'ml')),
    model_version        TEXT        NOT NULL,
    confidence           FLOAT       CHECK (confidence BETWEEN 0 AND 1),
    raw_llm_response     JSONB,      -- Populated only when source='llm'

    -- Metadata features (snapshot at inference time — denormalised, not FK'd)
    filename             TEXT,
    size_bytes           BIGINT,
    page_count           INT,
    is_scanned           BOOLEAN,
    has_tables           BOOLEAN,
    table_count          INT,
    image_count          INT,
    doc_type             TEXT,
    content_type         TEXT,
    text_density         TEXT,
    avg_words_per_page   FLOAT,
    table_ratio          FLOAT,
    avg_sentence_length  FLOAT,

    -- Recommendation labels (outputs — used as ML training targets)
    chunking_strategy    TEXT        NOT NULL,
    chunk_size           INT         NOT NULL,
    overlap              INT         NOT NULL,
    embedding_model      TEXT        NOT NULL,
    llm_model            TEXT        NOT NULL,
    top_k                INT         NOT NULL,
    rationale            TEXT
);

CREATE INDEX IF NOT EXISTS idx_recommendations_source     ON recommendations(source);
CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON recommendations(created_at);
CREATE INDEX IF NOT EXISTS idx_recommendations_doc_id     ON recommendations(doc_id);
