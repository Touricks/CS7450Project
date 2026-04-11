/** Mirrors src/trace/models.py and src/agent/models.py */

export type TraceStepType = "thought" | "action" | "observation";

export interface TraceStep {
  step_id: number;
  step_type: TraceStepType;
  timestamp: string;
  content: string;
  tool_name?: string | null;
  tool_input?: Record<string, unknown> | null;
  tool_output?: string | null;
  confidence: number;
  parent_step_id?: number | null;
  token_count?: number | null;
}

export type ClaimType =
  | "poi_exists"
  | "poi_hours"
  | "poi_location"
  | "poi_category"
  | "schedule_time"
  | "schedule_order"
  | "profile_match"
  | "general";

export interface Claim {
  claim_id: string;
  text: string;
  source_step_ids: number[];
  claim_type: ClaimType;
  extracted_entities: Record<string, unknown>;
  answer_span?: [number, number] | null;
}

export type POICategory =
  | "attraction"
  | "restaurant"
  | "nature"
  | "museum"
  | "shopping"
  | "hotel";

export interface POI {
  name: string;
  category: POICategory;
  address: string;
  lat: number;
  lng: number;
  opening_hours: Record<string, string>;
  avg_visit_duration_min: number;
  rating?: number | null;
  source: "codex_search" | "user_wishlist" | "manual";
  raw_search_result: string;
}

export interface ScheduleEntry {
  day: number;
  start_time: string;
  end_time: string;
  poi: POI;
  notes: string;
}

export interface DaySchedule {
  date: string;
  entries: ScheduleEntry[];
}

export interface TravelPlan {
  destination: string;
  start_date: string;
  end_date: string;
  user_profile: {
    name: string;
    travel_pace: "slow" | "moderate" | "fast";
    interests: string[];
    dietary_preferences: string[];
    budget: "budget" | "moderate" | "luxury";
    wishlist_pois: string[];
    accessibility_needs: string[];
  };
  daily_schedules: DaySchedule[];
  metadata: Record<string, unknown>;
  notion_payload?: Record<string, unknown> | null;
}

export interface ExecutionTrace {
  trace_id: string;
  agent_run_id: string;
  steps: TraceStep[];
  claims: Claim[];
  plan: TravelPlan | null;
  final_answer: string;
  created_at: string;
}
