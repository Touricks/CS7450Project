/** Color scales and constants for the visualization views. */

import * as d3 from "d3";

/** Confidence gradient: dark blue (high) → yellow (low) */
export const confidenceColorScale = d3
  .scaleSequential(d3.interpolateRdYlBu)
  .domain([0, 1]); // 0 = red/yellow (low), 1 = blue (high)

/** Provenance support status colors */
export const PROVENANCE_COLORS = {
  supported: "#22c55e",     // green — claim supported by evidence
  dataGrounded: "#f97316",  // orange — Mechanism A (source data error)
  fabricated: "#ef4444",    // red — Mechanism B (model fabricated)
  noSource: "#9ca3af",      // gray — no provenance link
} as const;

/** Step type colors for timeline */
export const STEP_TYPE_COLORS = {
  thought: "#6366f1",    // indigo
  action: "#0ea5e9",     // sky blue
  observation: "#10b981", // emerald
} as const;

/** Get provenance color for a claim based on its diagnosis status */
export function getClaimColor(
  claimId: string,
  diagnosedClaimIds: Set<string>
): string {
  if (!diagnosedClaimIds.has(claimId)) return PROVENANCE_COLORS.supported;
  return PROVENANCE_COLORS.fabricated;
}
