"""Hallucination detection models — diagnosis types and taxonomy mapping.

Maps the user's 4 hallucination types to the MidReport's hierarchical taxonomy:
  Mechanism A: Data-grounded (source data has errors)
  Mechanism B: Model-fabricated (LLM generates unsupported claims)
    B1: Tool routing error
    B2: Context loss
    B3: Overconfident tool bypass
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field

from src.trace.models import Claim


class HallucinationType(StrEnum):
    POI_RESULTS_ERROR = "poi_results_error"
    POI_ARRANGEMENT_ERROR = "poi_arrangement_error"
    POI_SCHEDULE_ERROR = "poi_schedule_error"
    POI_VISUALIZATION_ERROR = "poi_visualization_error"


class MechanismType(StrEnum):
    DATA_GROUNDED = "A"
    TOOL_ROUTING = "B1"
    CONTEXT_LOSS = "B2"
    OVERCONFIDENT_BYPASS = "B3"


MECHANISM_LABELS: dict[MechanismType, str] = {
    MechanismType.DATA_GROUNDED: "Data-Grounded Hallucination",
    MechanismType.TOOL_ROUTING: "Tool Routing Error",
    MechanismType.CONTEXT_LOSS: "Context Loss",
    MechanismType.OVERCONFIDENT_BYPASS: "Overconfident Tool Bypass",
}

HALLUCINATION_LABELS: dict[HallucinationType, str] = {
    HallucinationType.POI_RESULTS_ERROR: "POI Results Error",
    HallucinationType.POI_ARRANGEMENT_ERROR: "POI Arrangement Error",
    HallucinationType.POI_SCHEDULE_ERROR: "POI Schedule Error",
    HallucinationType.POI_VISUALIZATION_ERROR: "POI Visualization Error",
}


class Severity(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Diagnosis(BaseModel):
    diagnosis_id: str
    claim: Claim
    hallucination_type: HallucinationType
    mechanism: MechanismType
    severity: Severity = Severity.MEDIUM
    evidence: str = Field(
        description="Explanation of why this is a hallucination",
    )
    ground_truth: str | None = Field(
        default=None,
        description="What the correct value should be",
    )
    causal_chain: list[int] = Field(
        default_factory=list,
        description="Ordered list of TraceStep IDs forming the causal path",
    )
    fix_suggestion: str = ""
