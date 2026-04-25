/** Mirrors src/detection/models.py */

import type { Claim } from "./trace";

export type HallucinationType =
  | "poi_results_error"
  | "poi_arrangement_error"
  | "poi_schedule_error"
  | "poi_visualization_error";

export interface Diagnosis {
  diagnosis_id: string;
  claim: Claim;
  hallucination_type: HallucinationType;
  evidence: string;
  ground_truth?: string | null;
  causal_chain: number[];
  fix_suggestion: string;
}

export const HALLUCINATION_LABELS: Record<HallucinationType, string> = {
  poi_results_error: "POI Results Error",
  poi_arrangement_error: "POI Arrangement Error",
  poi_schedule_error: "POI Schedule Error",
  poi_visualization_error: "POI Visualization Error",
};
