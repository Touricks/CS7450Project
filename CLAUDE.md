# Hallucination Detection Prototype

Architecture and stack: see ARCHITECTURE.md
Requirements: see docs/PRD.md
Travel planner workflow: see docs/workflow.md

## Rules

- Python 3.11+, use `uv` for package management
- Pydantic v2 for all data models — models live in `src/*/models.py`
- D3.js v7 for visualization — React owns DOM, D3 computes geometry only
- The `ExecutionTrace` model in `src/trace/models.py` is the central data contract
- Sample data in `assets/data/` is the source of truth for development
- Ground truth POIs in `assets/data/ground_truth/sf_pois.json`
- Hand-labeled claims in `assets/data/claim_corrections/`
- React owns all SVG rendering via JSX; D3 is used as a math library only (scales, path generators). Never use d3.select().append() in React components.
- For visualization research prototypes, build a vertical slice with static JSON fixtures first to prove the end-to-end experience, then add API/backend.
- Hand-labeled claim corrections in assets/data/claim_corrections/ override auto-extracted claims when a correction file exists for the trace_id.

## Workflow

- Run backend: `uv run uvicorn src.api.main:app --reload`
- Run frontend: `cd frontend && npm run dev`
- Test models: `uv run python -c "from src.trace.models import ExecutionTrace"`
