from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.models import PipelineParams, ProviderSelections
from app.providers import get_provider

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(disabled_extensions=("j2", "py")),
    keep_trailing_newline=True,
    trim_blocks=True,
    lstrip_blocks=True,
)

STAGE_ORDER = ("storage", "document_extraction", "embedding", "vector_search")

_EMBEDDING_DIMS: dict[str, int] = {
    "text-embedding-3-large": 3072,
    "text-embedding-3-small": 1536,
    "text-embedding-ada-002": 1536,
    "amazon.titan-embed-text-v2:0": 1024,
    "embed-english-v3.0": 1024,
    "embed-multilingual-v3.0": 1024,
    "BAAI/bge-large-en-v1.5": 1024,
}


def _dims(params: PipelineParams) -> int:
    return _EMBEDDING_DIMS.get(params.embedding_model, 3072)


def _make_cell(source: str) -> dict:
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": source,
    }


def _build_utilities_cell(params: PipelineParams) -> str:
    return (
        "# --- utilities: chunking + document structure ---\n"
        "import uuid\n"
        "from dataclasses import dataclass, field\n"
        "\n"
        f"# Strategy recommendation: chunk_size={params.chunk_size}, overlap={params.overlap}\n"
        f"CHUNK_SIZE = {params.chunk_size}\n"
        f"CHUNK_OVERLAP = {params.overlap}\n"
        "\n"
        "\n"
        "@dataclass\n"
        "class Chunk:\n"
        "    content: str\n"
        "    source: str\n"
        "    chunk_index: int = 0\n"
        "    id: str = field(default_factory=lambda: str(uuid.uuid4()))\n"
        "\n"
        "    def to_doc(self, embedding: list[float]) -> dict:\n"
        "        return {\n"
        '            "id": self.id,\n'
        '            "content": self.content,\n'
        '            "source": self.source,\n'
        '            "chunk_index": self.chunk_index,\n'
        '            "embedding": embedding,\n'
        "        }\n"
        "\n"
        "\n"
        "def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:\n"
        "    words = text.split()\n"
        "    chunks, i = [], 0\n"
        "    while i < len(words):\n"
        "        chunks.append(\" \".join(words[i : i + chunk_size]))\n"
        "        i += chunk_size - overlap\n"
        "    return [c for c in chunks if c.strip()]\n"
    )


def _build_file_extract_cell() -> str:
    return (
        "# --- step-by-step: load file → upload to storage → extract text ---\n"
        "import pathlib\n"
        "\n"
        "file_path = \"path/to/your/document.pdf\"  # ← set your file path here\n"
        "file_bytes = pathlib.Path(file_path).read_bytes()\n"
        "print(f\"Loaded {len(file_bytes):,} bytes from {file_path}\")\n"
        "\n"
        "# Upload raw file to storage\n"
        "source_ref = upload_document(\"rag-documents\", pathlib.Path(file_path).name, file_bytes)\n"
        "print(f\"Stored at: {source_ref}\")\n"
        "\n"
        "# Extract text from file bytes\n"
        "raw_text = extract_text(file_bytes)\n"
        "print(f\"Extracted {len(raw_text.split()):,} words\")\n"
        "print(raw_text[:500])  # preview\n"
    )


def _build_ingestion_cell() -> str:
    return (
        "# --- pipeline: ingestion ---\n"
        "\n"
        "\n"
        "def ingest_document(\n"
        "    file_path: str,\n"
        "    container: str = \"rag-documents\",\n"
        "    chunk_size: int = CHUNK_SIZE,\n"
        "    overlap: int = CHUNK_OVERLAP,\n"
        ") -> int:\n"
        '    """Upload → extract → chunk → embed → upsert. Returns number of chunks indexed."""\n'
        "    path = pathlib.Path(file_path)\n"
        "    data = path.read_bytes()\n"
        "    source_ref = upload_document(container, path.name, data)\n"
        "    text = extract_text(data)\n"
        "    raw_chunks = chunk_text(text, chunk_size=chunk_size, overlap=overlap)\n"
        "    embeddings = embed(raw_chunks)\n"
        "    docs = [\n"
        "        Chunk(content=c, source=source_ref, chunk_index=i).to_doc(e)\n"
        "        for i, (c, e) in enumerate(zip(raw_chunks, embeddings))\n"
        "    ]\n"
        "    upsert(docs)\n"
        "    return len(docs)\n"
    )


def _build_init_cell(vector_search_provider: str, dims: int) -> str | None:
    if vector_search_provider == "azure_ai_search":
        return f"# --- index: create Azure AI Search index (run once) ---\ncreate_index(embedding_dimensions={dims})\n"
    if vector_search_provider == "pgvector":
        return f"# --- index: initialise pgvector table (run once) ---\ninit_db(embedding_dimensions={dims})\n"
    if vector_search_provider == "pinecone":
        return f"# --- index: create Pinecone index (run once) ---\ncreate_index(dimensions={dims})\n"
    if vector_search_provider == "weaviate":
        return f"# --- index: create Weaviate collection (run once) ---\ncreate_collection(dimensions={dims})\n"
    return None  # faiss is in-memory, no init needed


def _build_generation_cell(embedding_provider: str, llm_model: str, top_k: int) -> str:
    if embedding_provider == "azure_openai":
        client_setup = (
            "from openai import AzureOpenAI as _AzureOpenAI\n"
            "import os\n\n"
            "_chat = _AzureOpenAI(\n"
            '    api_key=os.environ["AZURE_OPENAI_KEY"],\n'
            '    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],\n'
            '    api_version="2024-06-01",\n'
            ")\n\n"
            f"def _complete(messages: list[dict]) -> str:\n"
            f'    resp = _chat.chat.completions.create(model="{llm_model}", messages=messages)\n'
            "    return resp.choices[0].message.content\n"
        )
    elif embedding_provider == "openai":
        client_setup = (
            "from openai import OpenAI as _OpenAI\n"
            "import os\n\n"
            '_chat = _OpenAI(api_key=os.environ["OPENAI_API_KEY"])\n\n'
            f"def _complete(messages: list[dict]) -> str:\n"
            f'    resp = _chat.chat.completions.create(model="{llm_model}", messages=messages)\n'
            "    return resp.choices[0].message.content\n"
        )
    elif embedding_provider == "aws_bedrock":
        client_setup = (
            "import boto3 as _boto3\n"
            "import json as _json\n"
            "import os\n\n"
            '_bedrock_chat = _boto3.client("bedrock-runtime", region_name=os.environ["AWS_REGION"])\n\n'
            "def _complete(messages: list[dict]) -> str:\n"
            "    body = _json.dumps({\n"
            '        "anthropic_version": "bedrock-2023-05-31",\n'
            '        "max_tokens": 1024,\n'
            '        "messages": messages,\n'
            "    })\n"
            '    resp = _bedrock_chat.invoke_model(modelId="anthropic.claude-3-5-sonnet-20241022-v2:0", body=body)\n'
            '    return _json.loads(resp["body"].read())["content"][0]["text"]\n'
        )
    elif embedding_provider == "cohere":
        client_setup = (
            "import os\n\n"
            "def _complete(messages: list[dict]) -> str:\n"
            "    user_msg = next(m['content'] for m in reversed(messages) if m['role'] == 'user')\n"
            "    system_msg = next((m['content'] for m in messages if m['role'] == 'system'), None)\n"
            "    preamble = system_msg or 'Answer using only the provided context. If unsure, say so.'\n"
            f'    resp = _client.chat(message=user_msg, preamble=preamble, model="{llm_model}")\n'
            "    return resp.text\n"
        )
    else:  # hf_local
        client_setup = (
            "from openai import OpenAI as _OpenAI\n"
            "import os\n\n"
            "_chat = _OpenAI(\n"
            '    api_key=os.environ.get("OPENAI_API_KEY", "not-needed"),\n'
            '    base_url=os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1"),\n'
            ")\n\n"
            "def _complete(messages: list[dict]) -> str:\n"
            '    model = os.environ.get("LLM_MODEL", "llama3")\n'
            "    resp = _chat.chat.completions.create(model=model, messages=messages)\n"
            "    return resp.choices[0].message.content\n"
        )

    return (
        "# --- pipeline: retrieval + generation ---\n"
        + client_setup
        + "\n\n"
        "def query_rag(question: str, top_k: int = "
        + str(top_k)
        + ") -> str:\n"
        '    """Embed query → search → generate answer."""\n'
        "    q_vec = embed_query(question)\n"
        "    hits = search(q_vec, top_k=top_k)\n"
        '    context = "\\n\\n".join(h["content"] for h in hits)\n'
        "    messages = [\n"
        '        {"role": "system", "content": "Answer using only the provided context. If unsure, say so."},\n'
        '        {"role": "user", "content": f"Context:\\n{context}\\n\\nQuestion: {question}"},\n'
        "    ]\n"
        "    return _complete(messages)\n"
        "\n\n"
        "# Example usage\n"
        '# answer = query_rag("What are the key findings in the document?")\n'
        "# print(answer)\n"
    )


def render_notebook(selections: ProviderSelections, params: PipelineParams | None = None) -> dict:
    if params is None:
        params = PipelineParams()

    stage_cells: list[dict] = []
    all_packages: list[str] = []
    all_env_vars: list[str] = []

    sel_dict = selections.model_dump()
    embedding_dims = _dims(params)

    for stage in STAGE_ORDER:
        provider_id = sel_dict.get(stage)
        if not provider_id:
            continue

        provider = get_provider(stage, provider_id)
        template = _env.get_template(f"{stage}/{provider_id}.py.j2")
        cell_source = (
            f"# --- {stage}: {provider['name']} ---\n"
            + template.render(provider=provider, params={"embedding_model": params.embedding_model, "embedding_dims": embedding_dims})
        )
        stage_cells.append(_make_cell(cell_source))
        all_packages.extend(provider.get("requires_packages", []))
        all_env_vars.extend(provider.get("requires_env", []))

    if not stage_cells:
        cells = [_make_cell("# No providers selected.")]
    else:
        setup_lines: list[str] = []
        unique_packages = list(dict.fromkeys(all_packages))
        for pkg in unique_packages:
            setup_lines.append(f"%pip install {pkg}")

        unique_env_vars = sorted(set(all_env_vars))
        if unique_env_vars:
            if setup_lines:
                setup_lines.append("")
            setup_lines.append("import os")
            for var in unique_env_vars:
                setup_lines.append(f'os.environ["{var}"] = "your-value-here"')

        setup_source = "\n".join(setup_lines) if setup_lines else "# No dependencies required."

        extra_cells: list[dict] = [_make_cell(_build_utilities_cell(params))]

        init_src = _build_init_cell(sel_dict.get("vector_search", ""), embedding_dims)
        if init_src:
            extra_cells.append(_make_cell(init_src))

        extra_cells.append(_make_cell(_build_file_extract_cell()))
        extra_cells.append(_make_cell(_build_ingestion_cell()))
        extra_cells.append(_make_cell(_build_generation_cell(sel_dict.get("embedding", ""), params.llm_model, params.top_k)))

        cells = [_make_cell(setup_source), *stage_cells, *extra_cells]

    return {
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {"name": "python", "version": "3.11.0"},
        },
        "cells": cells,
    }
