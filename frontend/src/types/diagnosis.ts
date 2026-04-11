/** Mirrors src/detection/models.py */

import type { Claim } from "./trace";

export type HallucinationType =
  | "poi_results_error"
  | "poi_arrangement_error"
  | "poi_schedule_error"
  | "poi_visualization_error";

export type MechanismType = "A" | "B1" | "B2" | "B3";

export type Severity = "high" | "medium" | "low";

export interface Diagnosis {
  diagnosis_id: string;
  claim: Claim;
  hallucination_type: HallucinationType;
  mechanism: MechanismType;
  severity: Severity;
  evidence: string;
  ground_truth?: string | null;
  causal_chain: number[];
  fix_suggestion: string;
}

export const MECHANISM_LABELS: Record<MechanismType, string> = {
  A: "Data-Grounded",
  B1: "Tool Routing Error",
  B2: "Context Loss",
  B3: "Overconfident Bypass",
};

export const HALLUCINATION_LABELS: Record<HallucinationType, string> = {
  poi_results_error: "POI Results Error",
  poi_arrangement_error: "POI Arrangement Error",
  poi_schedule_error: "POI Schedule Error",
  poi_visualization_error: "POI Visualization Error",
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  high: "#dc2626",
  medium: "#f59e0b",
  low: "#6b7280",
};

export const MECHANISM_COLORS: Record<MechanismType, string> = {
  A: "#f97316",   // orange — data-grounded
  B1: "#ef4444",  // red — tool routing
  B2: "#8b5cf6",  // purple — context loss
  B3: "#dc2626",  // dark red — overconfident bypass
};
