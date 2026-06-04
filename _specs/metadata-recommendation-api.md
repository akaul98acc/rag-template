# Feature: Metadata-Driven Pipeline Recommendation API

> **Status:** Draft
> **Author:** Adarsh Kaul
> **Created:** 2026-06-04
> **Last Updated:** 2026-06-04
> **Ticket:** N/A

---

## Overview

A new backend endpoint, `POST /api/recommend`, that takes a `doc_id` returned by a prior
`POST /api/upload`, loads the stored `DocumentMetadata`, and uses an **Azure OpenAI GPT-4o-mini**
chat model to recommend an embedding model, an LLM model, and a chunking strategy (with suggested
parameters) as structured JSON. The endpoint reads **all** metadata fields as decision context.
When Azure OpenAI is unavailable, it falls back to the existing deterministic rules engine so it
always returns a usable result. It is designed to be invoked directly after upload.

---

## Goals

- [ ] New `POST /api/recommend` endpoint accepting `{ "doc_id": str }`, returning a JSON recommendation.
- [ ] Server fetches stored metadata via the existing in-memory document store (`get_document(doc_id)`) — the client only sends `doc_id`.
- [ ] All `DocumentMetadata` fields are passed to GPT-4o-mini as decision context (size, pages, tables, images, language, is_scanned, plus derived `avg_words_per_page`, `text_density`, `table_ratio`, `doc_type`, `content_type`, `avg_sentence_length`).
- [ ] Recommendation JSON returns: `embedding_model`, `llm_model`, `chunking_strategy` (each constrained to the known valid option IDs), plus `chunk_size`, `overlap`, `top_k`, `rationale`, `confidence`, and `source` ("llm" | "rules").
- [ ] LLM picks are validated against the allowed vocabularies; invalid/unknown picks are rejected or corrected rather than passed through.
- [ ] Graceful fallback: GPT-4o-mini is tried first; on missing config, error, or throttling, reuse the existing `strategy_agent` rules so the endpoint never hard-fails. `source` reflects which path produced the result.
- [ ] Metadata validation: if `doc_id` is unknown/expired, or required metadata is missing/incomplete, return HTTP 422 with a message instructing the user to upload the document again.
- [ ] New Azure OpenAI configuration (endpoint, key, deployment name, api version) added to settings and documented in `backend/.env.example`; no secrets committed.
- [ ] Azure OpenAI SDK added to `backend/requirements.txt`; provider stubs/services remain import-light (lazy SDK import).

---

## Non-Goals

- No frontend changes in this iteration — auto-calling `/api/recommend` after upload is a documented follow-up.
- Not modifying, replacing, or removing `POST /api/analyze` or the existing rules engine (it is reused as the fallback, untouched in behavior).
- Not executing any pipeline — recommendation output only.
- Not persisting recommendations beyond the response (the in-memory document store is unchanged).
- Not adding new embedding/LLM/chunking options to the catalog — the recommender chooses among existing ones.

---

## User Stories

| # | Persona | Want | So That | Priority |
|---|---------|------|---------|----------|
| 1 | Pipeline builder | Get an LLM-driven recommendation for embedding model, LLM model, and chunking strategy from my uploaded document | I can configure a sound RAG pipeline without manual guesswork | P0 |
| 2 | Pipeline builder | The recommendation to still work when the LLM service is down | I am never blocked by an external outage | P1 |
| 3 | Pipeline builder | A clear "please upload again" response when my document/metadata is invalid | I understand how to recover instead of getting a cryptic error | P1 |
| 4 | Backend developer | A clean, standalone endpoint decoupled from `/upload` | I can reuse or call it again later without re-uploading | P1 |

---

## UX

### User Flow

1. Client uploads a document via `POST /api/upload` and receives `{ doc_id, metadata }`.
2. Client calls `POST /api/recommend` with `{ doc_id }` (intended to run immediately after upload).
3. Server loads the stored metadata for `doc_id` and validates completeness.
4. Server prompts Azure GPT-4o-mini with the full metadata and a constrained instruction set; parses and validates the JSON reply.
5. On success, server returns the recommendation JSON (`source: "llm"`).
6. On LLM unavailability/error, server returns the rules-engine recommendation instead (`source: "rules"`).
7. On invalid `doc_id` or incomplete metadata, server returns 422 asking the user to upload again.

### Wireframes / Mockups

> Backend API feature — no UI in this iteration. The JSON response shape is the contract; example fields are listed under Acceptance Criteria.

### Edge Cases & Empty States

| Scenario | Expected Behaviour |
|----------|--------------------|
| Unknown / expired `doc_id` | 422 with message to upload the document again |
| Metadata present but incomplete (e.g. missing fields needed to decide) | 422 with message to upload again |
| Azure OpenAI not configured | Fall back to rules engine; return 200 with `source: "rules"` |
| Azure OpenAI errors or is rate-limited | Fall back to rules engine; return 200 with `source: "rules"` |
| LLM returns malformed / non-JSON output | Parse-guard, then fall back to rules engine |
| LLM returns an option ID outside the allowed vocabulary | Reject the invalid pick; correct to nearest valid option or fall back to rules |

---

## Acceptance Criteria

### Functional

- [ ] Given a valid `doc_id` with complete metadata and Azure configured, when `POST /api/recommend` is called, then it returns 200 with `embedding_model`, `llm_model`, `chunking_strategy`, `chunk_size`, `overlap`, `top_k`, `rationale`, `confidence`, `source: "llm"`.
- [ ] Given Azure OpenAI is unavailable, when the endpoint is called with a valid `doc_id`, then it returns 200 with a rules-based recommendation and `source: "rules"`.
- [ ] Given an unknown `doc_id` or incomplete metadata, when the endpoint is called, then it returns 422 instructing the user to upload again.
- [ ] Given the LLM returns an option outside the allowed vocabulary, when the response is validated, then the invalid pick does not reach the client (corrected or rules fallback).
- [ ] `embedding_model` ∈ {`text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`}; `llm_model` ∈ {`gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`}; `chunking_strategy` ∈ {`auto`, `fixed`, `semantic`, `sliding`, `recursive`, `sentence`}.
- [ ] All metadata fields are included in the prompt context sent to the model.
- [ ] `POST /api/analyze` behaviour is unchanged.

### Non-Functional

- [ ] Backend imports cleanly without the Azure OpenAI SDK installed (lazy import); `/providers` and app startup stay fast.
- [ ] No secrets committed; required env keys documented in `backend/.env.example`.
- [ ] Thin route, logic in services, Pydantic v2 models for all request/response I/O (per project conventions).
- [ ] Endpoint returns within a reasonable bound for a single GPT-4o-mini call; LLM failures degrade to the fast rules path rather than hanging.

### Out of Scope for This Release

- [ ] ~~Frontend auto-call of `/api/recommend` after upload~~
- [ ] ~~Caching / persisting recommendations~~

---

## Open Questions

| # | Question | Owner | Due | Resolution |
|---|----------|-------|-----|------------|
| 1 | Which Azure OpenAI `api-version` and deployment-name convention to standardize on? | Adarsh | impl | Pick a current GA api-version; deployment name via env |
| 2 | Should `confidence` come from the model or be derived server-side? | Adarsh | impl | Prefer model-reported, clamp to [0,1]; default if absent |
| 3 | Exact definition of "incomplete metadata" that triggers 422 (which fields are mandatory)? | Adarsh | impl | Define minimal required set during implementation |

---

## Dependencies

- [ ] Azure OpenAI resource with a **gpt-4o-mini** deployment — _Owner: Adarsh / available before impl_
- [ ] Azure OpenAI SDK (`openai` with `AzureOpenAI`) added to `backend/requirements.txt` — _Owner: backend-agent_
- [ ] Existing rules engine `strategy_agent.recommend_strategy` (reused as fallback) — _already present_
- [ ] Existing document store `get_document(doc_id)` (reused to fetch metadata) — _already present_

---

## Notes & References

- Reuse: `backend/app/services/document_analyzer.py` (`get_document`, `StoredDocument`), `backend/app/services/strategy_agent.py` (rules fallback), `backend/app/models/strategy.py` (existing `StrategyRecommendation` shape to mirror/extend), `backend/app/api/routes/analyze.py` (route pattern), `backend/app/main.py` (router registration under `/api`).
- Valid option vocabularies: embedding models from `providers/embedding`; LLM models + chunking strategies mirror `frontend/src/config/configuratorOptions.ts` (`gpt-4o`/`gpt-4o-mini`/`gpt-4-turbo`; `auto`/`fixed`/`semantic`/`sliding`/`recursive`/`sentence`).
- Config: add `azure_openai_endpoint`, `azure_openai_key`, `azure_openai_deployment`, `azure_openai_api_version` to `backend/app/core/config.py` + `backend/.env.example`.
- Implementation to be carried out by **backend-agent**, backend changes only.
