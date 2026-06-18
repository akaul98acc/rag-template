from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.models import GenerateResponse, PipelineParams, ProviderSelections
from app.providers import get_provider
from app.services.notebook_generator import (
    STAGE_ORDER,
    _build_file_extract_cell,
    _build_generation_cell,
    _build_ingestion_cell,
    _build_init_cell,
    _build_utilities_cell,
    _dims,
    _env,
)


def render_pipeline(selections: ProviderSelections, params: PipelineParams | None = None) -> GenerateResponse:
    if params is None:
        params = PipelineParams()

    blocks: list[str] = []
    requires_env: list[str] = []

    sel_dict = selections.model_dump()
    embedding_dims = _dims(params)

    for stage in STAGE_ORDER:
        provider_id = sel_dict.get(stage)
        if not provider_id:
            continue

        provider = get_provider(stage, provider_id)
        template = _env.get_template(f"{stage}/{provider_id}.py.j2")
        blocks.append(
            f"# --- {stage}: {provider['name']} ---\n"
            + template.render(provider=provider, params={"embedding_model": params.embedding_model, "embedding_dims": embedding_dims})
        )
        requires_env.extend(provider.get("requires_env", []))

    if blocks:
        blocks.append(_build_utilities_cell(params))

        init_src = _build_init_cell(sel_dict.get("vector_search", ""), embedding_dims)
        if init_src:
            blocks.append(init_src)

        blocks.append(_build_file_extract_cell())
        blocks.append(_build_ingestion_cell())
        blocks.append(_build_generation_cell(sel_dict.get("embedding", ""), params.llm_model, params.top_k))

    code = "\n\n".join(blocks) if blocks else "# No providers selected."
    return GenerateResponse(code=code, language="python", requires_env=sorted(set(requires_env)))
