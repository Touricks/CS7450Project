"""Data models for the travel planner agent domain."""

from __future__ import annotations

from datetime import date, time
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class TravelPace(StrEnum):
    SLOW = "slow"          # max 3 POIs per day
    MODERATE = "moderate"  # max 5 POIs per day
    FAST = "fast"          # max 7 POIs per day


PACE_LIMITS: dict[TravelPace, int] = {
    TravelPace.SLOW: 3,
    TravelPace.MODERATE: 5,
    TravelPace.FAST: 7,
}


class POICategory(StrEnum):
    ATTRACTION = "attraction"
    RESTAURANT = "restaurant"
    NATURE = "nature"
    MUSEUM = "museum"
    SHOPPING = "shopping"
    HOTEL = "hotel"


class UserProfile(BaseModel):
    name: str
    travel_pace: TravelPace = TravelPace.MODERATE
    interests: list[str] = Field(default_factory=list)
    dietary_preferences: list[str] = Field(default_factory=list)
    budget: Literal["budget", "moderate", "luxury"] = "moderate"
    wishlist_pois: list[str] = Field(default_factory=list)
    accessibility_needs: list[str] = Field(default_factory=list)
    special_comments: list[str] = Field(
        default_factory=list,
        description="Free-text constraints, e.g. 'rest day after day 3'",
    )


class POI(BaseModel):
    name: str
    category: POICategory
    address: str
    lat: float
    lng: float
    opening_hours: dict[str, str] = Field(
        default_factory=dict,
        description="Day-of-week to hours, e.g. {'monday': '09:00-17:00'}",
    )
    avg_visit_duration_min: int = 60
    rating: float | None = None
    source: Literal["codex_search", "user_wishlist", "manual"] = "codex_search"
    raw_search_result: str = ""


class ScheduleEntry(BaseModel):
    day: int
    start_time: time
    end_time: time
    poi: POI
    notes: str = ""


class DaySchedule(BaseModel):
    date: date
    entries: list[ScheduleEntry] = Field(default_factory=list)


class TravelPlan(BaseModel):
    destination: str
    start_date: date
    end_date: date
    user_profile: UserProfile
    daily_schedules: list[DaySchedule] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)
    notion_payload: dict | None = Field(
        default=None,
        description="Raw JSON payload sent to Notion API, captured for Type 4 detection",
    )
