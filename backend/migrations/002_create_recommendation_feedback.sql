-- Migration 002: Create recommendation_feedback table
-- Applied automatically by database._ensure_schema() on startup.
-- One row per recommendation — enforced by UNIQUE(recommendation_id).

CREATE TABLE IF NOT EXISTS recommendation_feedback (
    id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id        UUID        NOT NULL REFERENCES recommendations(id)
                                             ON DELETE CASCADE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Signal: 'accepted' = used as-is, 'modified' = changed before use,
    --         'rejected' = dismissed without generating code
    outcome                  TEXT        NOT NULL
                                 CHECK (outcome IN ('accepted', 'modified', 'rejected')),
    notes                    TEXT,       -- Optional free-text

    -- Final values the user actually used (NULL = kept the recommended value)
    final_chunking_strategy  TEXT,
    final_chunk_size         INT,
    final_overlap            INT,
    final_embedding_model    TEXT,
    final_llm_model          TEXT,
    final_top_k              INT,

    -- One feedback row per recommendation
    UNIQUE (recommendation_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_recommendation_id ON recommendation_feedback(recommendation_id);
