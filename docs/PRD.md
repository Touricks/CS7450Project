---
project: HallucinationDetectionPrototype
version: v1.0
created_at: 2026-04-02
updated_at: 2026-04-10
---

# Hallucination Detection Prototype — Product Requirements Document

## 1. Project Identity

- **Name**: Visual Provenance Analysis for Diagnosing Hallucinations in LLM Agent Execution Traces
- **Problem statement**: When LLM agents use external tools to generate travel plans, they produce plausible but incorrect outputs — non-existent POIs, wrong opening hours, schedules with time overlaps, and visualization mismatches. Developers must manually read hundreds of lines of execution traces to diagnose where errors originated.
- **Target user**: HCI researchers and AI developers diagnosing agent hallucinations
- **Scope**: Post-hoc visual analytics system for a travel planner agent, combining automated hallucination detection with three coordinated visualization views

## 2. Core Requirements

| # | Requirement | Priority | Acceptance Criteria |
|---|-------------|----------|---------------------|
| R1 | 4-state travel planner agent (info → POI search → schedule → visualize) | MUST | Agent produces ExecutionTrace with steps, claims, and TravelPlan |
| R2 | POI Results Error detection (Type 1) | MUST | Detects non-existent POIs and wrong opening hours against ground truth |
| R3 | POI Arrangement Error detection (Type 2) | MUST | Detects itinerary choices violating user profile (pace, interests, wishlist) |
| R4 | POI Schedule Error detection (Type 3) | MUST | Detects time overlaps, consecutive dining, POIs outside opening hours |
| R5 | POI Visualization Error detection (Type 4) | MUST | Detects Notion display misaligned with source JSON data |
| R6 | Provenance Alignment View | MUST | Two-column view with Bezier curves linking claims to trace observations, color-coded green/orange/red |
| R7 | Trace Confidence Timeline | MUST | Horizontal timeline with step-type shapes, confidence gradient, trigger glyphs |
| R8 | Diagnostic Summary Panel | MUST | Card per diagnosis with causal chain, mechanism label, fix suggestion |
| R9 | Cross-view coordination | MUST | Click claim in View 1 → highlights in View 2 + View 3 |
| R10 | Hierarchical taxonomy mapping (A, B1, B2, B3) | SHOULD | Each diagnosis mapped to MidReport mechanism type |
| R11 | Configurable LLM (Claude/Gemini) | SHOULD | Agent works with either provider via env var |

## 3. Deliverables

- **Primary deliverable**: Working prototype with travel planner agent, 4-detector hallucination pipeline, and 3 coordinated D3.js visualization views
- **v1 definition of done**: Load curated SF trip trace → detect all 4 hallucination types → display in 3 coordinated views with cross-view interaction

## 4. Key Use Cases

### UC1: Diagnose hallucinations in a curated trace
**Actor:** Researcher
**Flow:**
1. Load pre-recorded SF trip trace with seeded hallucinations
2. System runs 4 detectors, produces diagnoses
3. Provenance Alignment View shows claims linked to trace observations
4. Researcher clicks a red claim → Timeline highlights causal steps → Summary card shows diagnosis
**Edge cases:** Clean trace with no hallucinations → all claims green

### UC2: Run live agent and diagnose
**Actor:** Developer
**Flow:**
1. Submit trip query via API
2. Agent executes, produces ExecutionTrace
3. Detection pipeline runs automatically
4. Results appear in visualization views

## 5. Assumptions and Dependencies

| # | Assumption | Status |
|---|-----------|--------|
| A1 | Curated ground truth (~20 SF POIs) is sufficient for prototype demo | confirmed |
| A2 | Semi-automatic claim extraction (sentence splitting + manual corrections) is acceptable | confirmed |
| A3 | Notion MCP available for visualization output | assumed |

| # | Dependency | Purpose |
|---|-----------|---------|
| D1 | LangGraph | Agent orchestration |
| D2 | FastAPI | Backend API |
| D3 | React + D3.js | Visualization frontend |
| D4 | Notion MCP | Visualization output (deferred to M6) |

## 6. Constraints and Non-Goals

### Non-Goals
- Real-time streaming diagnostics (post-hoc analysis only)
- Multi-agent support (single travel planner agent)
- Automatic booking or reservation
- B2 (context loss) automated detection (hand-labeled for prototype)

## 7. Hallucination Taxonomy (from MidReport)

| Mechanism | Label | Description |
|-----------|-------|-------------|
| A | Data-Grounded | Source data contains errors; agent faithfully reproduces them |
| B1 | Tool Routing Error | Agent selects wrong tool or sequence |
| B2 | Context Loss | Multi-step reasoning exceeds context; evidence disappears |
| B3 | Overconfident Tool Bypass | Agent skips tool use, relies on parametric knowledge |

## Changelog

| Version | Date | What changed | Why |
|---------|------|-------------|-----|
| v1.0 | 2026-04-02 | Initial travel planner PRD | Project bootstrap |
| v1.1 | 2026-04-10 | Unified PRD with hallucination detection + visualization | Prototype scope defined |
