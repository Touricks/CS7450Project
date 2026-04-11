---
date: 2026-04-10
title: "M1 Foundation — project setup, data models, sample data, bootstrap docs"
task_source: prd-requirement
files_changed: 12
---

# M1 Foundation — project setup, data models, sample data, bootstrap docs

## Objective
Bootstrap the hallucination detection prototype with project infrastructure, shared data models, curated sample data with seeded hallucinations, and core documentation. This establishes the foundation for M2 (vertical slice visualization).

## Changes

### Project Setup
- Created `pyproject.toml` with dependencies (langgraph, langchain-anthropic/google-genai, fastapi, pydantic)
- Created `src/` directory structure: `trace/`, `agent/`, `agent/tools/`, `detection/`, `api/`, `api/routes/`
- Created `.env.example` with LLM_PROVIDER, API key, and Notion token placeholders
- Installed all dependencies via `uv sync`

### Data Models (Central Contract)
- `src/agent/models.py`: UserProfile, POI (with POICategory enum), ScheduleEntry, DaySchedule, TravelPlan, TravelPace with PACE_LIMITS
- `src/trace/models.py`: TraceStepType, TraceStep, ClaimType, Claim (with answer_span for highlighting), ExecutionTrace (with final_answer field)
- `src/detection/models.py`: HallucinationType (4 types), MechanismType (A/B1/B2/B3), Severity, Diagnosis with causal_chain and fix_suggestion

### Sample Data
- `assets/data/ground_truth/sf_pois.json`: 20 manually verified SF POIs with opening hours
- `assets/data/sample_profiles/sf_traveler.yaml`: moderate-pace traveler with nature/food/history interests
- `assets/data/sample_traces/sf_trip_hallucinated.json`: 9-step trace with 7 claims, 18 schedule entries, and 5 seeded hallucinations covering all 4 types + 3 mechanism types (B1, B2, B3)
- `assets/data/claim_corrections/trace-sf-hallucinated-001.json`: Hand-labeled expected diagnoses (ground truth for detection pipeline testing)

### Bootstrap Documents
- `CLAUDE.md`: Project rules and workflow commands
- `ARCHITECTURE.md`: Tech stack, module structure, data flow, taxonomy mapping, D3+React integration pattern
- `docs/PRD.md`: Replaced stale Chinese DAG notes with unified PRD (11 requirements, 2 use cases, taxonomy)

### Files Modified
| File | Change |
|------|--------|
| `pyproject.toml` | Created — project metadata and dependencies |
| `.env.example` | Created — environment variable template |
| `src/agent/models.py` | Created — agent domain models (UserProfile, POI, TravelPlan) |
| `src/trace/models.py` | Created — execution trace central contract |
| `src/detection/models.py` | Created — hallucination detection types and Diagnosis |
| `assets/data/ground_truth/sf_pois.json` | Created — 20 verified SF POIs |
| `assets/data/sample_profiles/sf_traveler.yaml` | Created — demo user profile |
| `assets/data/sample_traces/sf_trip_hallucinated.json` | Created — trace with 5 seeded hallucinations |
| `assets/data/claim_corrections/trace-sf-hallucinated-001.json` | Created — hand-labeled diagnoses |
| `CLAUDE.md` | Created — project rules |
| `ARCHITECTURE.md` | Created — system architecture |
| `docs/PRD.md` | Replaced — unified PRD with hallucination detection requirements |

## Decisions
- **Vertical slice strategy (per Codex review):** Visualization (M2) comes before backend (M4) and agent (M5). Static JSON fixtures prove the research claim before automation.
- **D3+React integration:** React owns DOM, D3 computes geometry only (Pattern B). Fixed-row Bezier layout, not force-directed.
- **Semi-automatic claim extraction:** Hand-labeled correction files override auto-extraction for demo traces. Full automation deferred to M3.
- **Curated ground truth:** 20 SF POIs with manually verified opening hours. Sufficient for prototype; live verification deferred.

## Issues and Follow-ups
- `notion_payload` field on TravelPlan is a raw dict — may need a Pydantic model when Notion integration matures
- B2 (context loss) mechanism not seeded in demo trace — consider adding a B2 example for completeness
- `answer_span` offsets in claims are approximate — need precise calculation when claim extractor is built
