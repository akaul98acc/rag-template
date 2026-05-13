from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.models import GenerateResponse, ProviderSelections
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


def render_pipeline(selections: ProviderSelections) -> GenerateResponse:
    blocks: list[str] = []
    requires_env: list[str] = []

    sel_dict = selections.model_dump()
    for stage in STAGE_ORDER:
        provider_id = sel_dict.get(stage)
        if not provider_id:
            continue

        provider = get_provider(stage, provider_id)
        template = _env.get_template(f"{stage}/{provider_id}.py.j2")
        blocks.append(f"# --- {stage}: {provider['name']} ---\n" + template.render(provider=provider))
        requires_env.extend(provider.get("requires_env", []))

    code = "\n\n".join(blocks) if blocks else "# No providers selected."
    return GenerateResponse(code=code, language="python", requires_env=sorted(set(requires_env)))
