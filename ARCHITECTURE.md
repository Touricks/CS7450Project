# Hallucination Detection Prototype — Architecture

## 1. Tech Stack

- **Language (backend):** Python 3.11+
- **Frameworks:** FastAPI, LangGraph, Pydantic v2
- **Language (frontend):** TypeScript, React 19, D3.js v7
- **Build tool:** Vite
- **Package managers:** uv (Python), npm (Node)
- **Storage:** SQLite (traces), JSON files (sample data, ground truth)
- **LLM:** Configurable — Claude (Anthropic) or Gemini (Google) via env var

## 2. Module Structure

| Directory | Responsibility |
|-----------|---------------|
| `src/trace/` | Execution trace data model (central contract) |
| `src/agent/` | Travel planner agent (LangGraph StateGraph) |
| `src/agent/tools/` | MCP tool stubs (POI search, schedule, Notion) |
| `src/detection/` | Hallucination detection pipeline (4 detectors) |
| `src/api/` | FastAPI backend serving traces and diagnoses |
| `frontend/` | React + D3.js visualization (3 coordinated views) |
| `assets/data/` | Ground truth, sample profiles, curated traces |

## 3. Data Flow

```
User Query + Profile
       |
       v
 [Travel Planner Agent] ── produces ──> ExecutionTrace + TravelPlan
       |
       v
 [Claim Extractor] ── extracts ──> Claims (linked to TraceSteps)
       |
       v
 [Detection Pipeline] ── runs 4 detectors ──> list[Diagnosis]
       |
       v
 [FastAPI] ── serves JSON ──> React Frontend (3 views)
```

## 4. Hallucination Types → Taxonomy Mapping

| Type | Detector | Mechanism |
|------|----------|-----------|
| POI Results Error | `poi_existence.py` | A (data-grounded) or B3 (bypass) |
| POI Arrangement Error | `profile_compliance.py` | B2 (context loss) or B3 (bypass) |
| POI Schedule Error | `schedule_conflict.py` | B2 (context loss) or B1 (routing) |
| POI Visualization Error | `notion_alignment.py` | B1 (tool routing) or A (tool bug) |

## 5. Central Data Contract

ExecutionTrace in `src/trace/models.py` is the central data contract between agent, detection, and visualization subsystems. All three subsystems depend on TraceStep, Claim, and ExecutionTrace types.

## 6. D3+React Integration

React owns all SVG rendering via JSX. D3 is used as a math library only:
- `d3.scaleLinear()` / `d3.scaleOrdinal()` for positioning
- `d3.line().curve(d3.curveBasis)` for Bezier path generation
- No `d3.select().append()` — all elements rendered by React
