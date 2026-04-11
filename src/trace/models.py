"""Execution trace data model — the central contract between all subsystems.

The agent produces ExecutionTrace objects. The detection pipeline reads them
and produces Diagnosis objects. The frontend renders both.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from src.agent.models import TravelPlan


class TraceStepType(StrEnum):
    THOUGHT = "thought"
    ACTION = "action"
    OBSERVATION = "observation"


class TraceStep(BaseModel):
    step_id: int
    step_type: TraceStepType
    timestamp: datetime
    content: str
    tool_name: str | None = None
    tool_input: dict[str, Any] | None = None
    tool_output: str | None = None
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence score: 0.0 (low) to 1.0 (high)",
    )
    parent_step_id: int | None = Field(
        default=None,
        description="Links observations back to the action that produced them",
    )
    token_count: int | None = None


class ClaimType(StrEnum):
    POI_EXISTS = "poi_exists"
    POI_HOURS = "poi_hours"
    POI_LOCATION = "poi_location"
    POI_CATEGORY = "poi_category"
    SCHEDULE_TIME = "schedule_time"
    SCHEDULE_ORDER = "schedule_order"
    PROFILE_MATCH = "profile_match"
    GENERAL = "general"


class Claim(BaseModel):
    claim_id: str
    text: str
    source_step_ids: list[int] = Field(
        default_factory=list,
        description="TraceStep IDs that support this claim (provenance link)",
    )
    claim_type: ClaimType = ClaimType.GENERAL
    extracted_entities: dict[str, Any] = Field(
        default_factory=dict,
        description="Structured data extracted from claim, e.g. {'poi_name': 'X', 'attribute': 'hours', 'value': '9am'}",
    )
    answer_span: tuple[int, int] | None = Field(
        default=None,
        description="Character offset (start, end) in the agent's final answer text",
    )


class ExecutionTrace(BaseModel):
    trace_id: str
    agent_run_id: str = ""
    steps: list[TraceStep] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)
    plan: TravelPlan | None = None
    final_answer: str = Field(
        default="",
        description="Agent's final output text, used for claim span highlighting",
    )
    created_at: datetime = Field(default_factory=datetime.now)
