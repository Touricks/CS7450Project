/**
 * View 1: Provenance Alignment View
 *
 * Two-column layout:
 * - Left column: agent's final claims
 * - Right column: ordered trace observations (tool outputs)
 * - Cubic Bezier curves connect claims to supporting observations
 *
 * Color coding:
 * - Green: claim supported by evidence
 * - Orange: data-grounded hallucination (Mechanism A)
 * - Red: model-fabricated hallucination (Mechanism B)
 *
 * React renders all elements. D3 is used only for path generation.
 */

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { Claim, TraceStep } from "../types/trace";
import type { Diagnosis, MechanismType } from "../types/diagnosis";
import { useSelection } from "../hooks/useSelectionContext";
import { getClaimColor } from "../lib/colors";
import { cubicBezierPath } from "../lib/bezier";

interface Props {
  claims: Claim[];
  steps: TraceStep[];
  diagnoses: Diagnosis[];
}

const ROW_HEIGHT = 56;
const COL_GAP = 160;
const LEFT_WIDTH = 280;
const RIGHT_WIDTH = 280;
const SVG_PADDING = 16;

export function ProvenanceAlignmentView({ claims, steps, diagnoses }: Props) {
  const { selectedClaimId, selectClaim, selectDiagnosis } = useSelection();
  const containerRef = useRef<HTMLDivElement>(null);
  const [claimPositions, setClaimPositions] = useState<Map<string, number>>(new Map());
  const [stepPositions, setStepPositions] = useState<Map<number, number>>(new Map());

  // Build lookup maps
  const diagnosedClaimIds = useMemo(
    () => new Set(diagnoses.map((d) => d.claim.claim_id)),
    [diagnoses]
  );

  const mechanismMap = useMemo(
    () => new Map<string, MechanismType>(diagnoses.map((d) => [d.claim.claim_id, d.mechanism])),
    [diagnoses]
  );

  const diagnosisByClaimId = useMemo(
    () => new Map(diagnoses.map((d) => [d.claim.claim_id, d])),
    [diagnoses]
  );

  // Filter to observation steps (the right column shows tool observations)
  const observationSteps = useMemo(
    () => steps.filter((s) => s.step_type === "observation" || s.step_type === "action"),
    [steps]
  );

  // Compute fixed positions for claims and steps
  const measurePositions = useCallback(() => {
    const newClaimPos = new Map<string, number>();
    claims.forEach((c, i) => {
      newClaimPos.set(c.claim_id, SVG_PADDING + i * ROW_HEIGHT + ROW_HEIGHT / 2);
    });
    setClaimPositions(newClaimPos);

    const newStepPos = new Map<number, number>();
    observationSteps.forEach((s, i) => {
      newStepPos.set(s.step_id, SVG_PADDING + i * ROW_HEIGHT + ROW_HEIGHT / 2);
    });
    setStepPositions(newStepPos);
  }, [claims, observationSteps]);

  useEffect(() => {
    measurePositions();
  }, [measurePositions]);

  // Compute Bezier links
  const links = useMemo(() => {
    const result: {
      path: string;
      claimId: string;
      stepId: number;
      color: string;
    }[] = [];

    const leftX = LEFT_WIDTH;
    const rightX = LEFT_WIDTH + COL_GAP;

    for (const claim of claims) {
      const claimY = claimPositions.get(claim.claim_id);
      if (claimY === undefined) continue;

      const color = getClaimColor(claim.claim_id, diagnosedClaimIds, mechanismMap);

      for (const stepId of claim.source_step_ids) {
        const stepY = stepPositions.get(stepId);
        if (stepY === undefined) continue;

        result.push({
          path: cubicBezierPath(leftX, claimY, rightX, stepY),
          claimId: claim.claim_id,
          stepId,
          color,
        });
      }

      // Claims with no source steps get a dangling indicator
      if (claim.source_step_ids.length === 0) {
        result.push({
          path: cubicBezierPath(leftX, claimY, leftX + COL_GAP / 2, claimY),
          claimId: claim.claim_id,
          stepId: -1,
          color: "#ef4444",
        });
      }
    }

    return result;
  }, [claims, claimPositions, stepPositions, diagnosedClaimIds, mechanismMap]);

  const totalHeight = Math.max(
    SVG_PADDING * 2 + claims.length * ROW_HEIGHT,
    SVG_PADDING * 2 + observationSteps.length * ROW_HEIGHT,
    200
  );

  const totalWidth = LEFT_WIDTH + COL_GAP + RIGHT_WIDTH;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg
        width={totalWidth}
        height={totalHeight}
        style={{ maxWidth: "100%", height: "auto" }}
      >
        {/* Bezier curves (render behind everything) */}
        <g>
          {links.map((link, i) => {
            const isSelected = selectedClaimId === link.claimId;
            return (
              <g key={`link-${i}`}>
                {/* Invisible thick hit-test path */}
                <path
                  d={link.path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    selectClaim(link.claimId);
                    const diag = diagnosisByClaimId.get(link.claimId);
                    if (diag) selectDiagnosis(diag.diagnosis_id, diag.causal_chain);
                  }}
                />
                {/* Visible path */}
                <path
                  d={link.path}
                  fill="none"
                  stroke={link.color}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeOpacity={
                    selectedClaimId === null || isSelected ? 0.7 : 0.15
                  }
                  style={{ transition: "stroke-opacity 0.2s, stroke-width 0.2s" }}
                />
              </g>
            );
          })}
        </g>

        {/* Left column: Claims */}
        <g>
          {claims.map((claim, i) => {
            const y = SVG_PADDING + i * ROW_HEIGHT;
            const color = getClaimColor(claim.claim_id, diagnosedClaimIds, mechanismMap);
            const isSelected = selectedClaimId === claim.claim_id;

            return (
              <g
                key={claim.claim_id}
                transform={`translate(0, ${y})`}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  selectClaim(claim.claim_id);
                  const diag = diagnosisByClaimId.get(claim.claim_id);
                  if (diag) selectDiagnosis(diag.diagnosis_id, diag.causal_chain);
                }}
              >
                {/* Background */}
                <rect
                  x={4}
                  y={2}
                  width={LEFT_WIDTH - 8}
                  height={ROW_HEIGHT - 4}
                  rx={6}
                  fill={isSelected ? "#f0f9ff" : "#fafafa"}
                  stroke={isSelected ? "#3b82f6" : "#e2e8f0"}
                  strokeWidth={isSelected ? 2 : 1}
                />

                {/* Color indicator bar */}
                <rect
                  x={4}
                  y={2}
                  width={4}
                  height={ROW_HEIGHT - 4}
                  rx={2}
                  fill={color}
                />

                {/* Claim ID */}
                <text
                  x={16}
                  y={18}
                  fontSize={10}
                  fontWeight={700}
                  fill={color}
                >
                  {claim.claim_id.toUpperCase()}
                </text>

                {/* Claim text (truncated) */}
                <text
                  x={16}
                  y={34}
                  fontSize={11}
                  fill="#334155"
                  style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                >
                  {claim.text.length > 38
                    ? claim.text.slice(0, 38) + "…"
                    : claim.text}
                </text>

                {/* Claim type tag */}
                <text
                  x={16}
                  y={48}
                  fontSize={9}
                  fill="#94a3b8"
                >
                  {claim.claim_type}
                </text>
              </g>
            );
          })}
        </g>

        {/* Right column: Trace observations */}
        <g transform={`translate(${LEFT_WIDTH + COL_GAP}, 0)`}>
          {observationSteps.map((step, i) => {
            const y = SVG_PADDING + i * ROW_HEIGHT;
            const isHighlighted =
              selectedClaimId !== null &&
              claims.some(
                (c) =>
                  c.claim_id === selectedClaimId &&
                  c.source_step_ids.includes(step.step_id)
              );

            return (
              <g key={step.step_id} transform={`translate(0, ${y})`}>
                {/* Background */}
                <rect
                  x={4}
                  y={2}
                  width={RIGHT_WIDTH - 8}
                  height={ROW_HEIGHT - 4}
                  rx={6}
                  fill={isHighlighted ? "#f0fdf4" : "#fafafa"}
                  stroke={isHighlighted ? "#22c55e" : "#e2e8f0"}
                  strokeWidth={isHighlighted ? 2 : 1}
                />

                {/* Step type indicator */}
                <text
                  x={14}
                  y={18}
                  fontSize={10}
                  fontWeight={700}
                  fill="#6366f1"
                >
                  S{step.step_id} [{step.step_type}]
                </text>

                {/* Tool name or content preview */}
                <text
                  x={14}
                  y={34}
                  fontSize={11}
                  fill="#334155"
                >
                  {step.tool_name
                    ? `🔧 ${step.tool_name}`
                    : step.content.slice(0, 35) + (step.content.length > 35 ? "…" : "")}
                </text>

                {/* Confidence */}
                <text
                  x={14}
                  y={48}
                  fontSize={9}
                  fill="#94a3b8"
                >
                  conf: {step.confidence.toFixed(2)}
                </text>
              </g>
            );
          })}
        </g>

        {/* Column headers */}
        <text x={LEFT_WIDTH / 2} y={10} textAnchor="middle" fontSize={11} fontWeight={600} fill="#64748b">
          Agent Claims
        </text>
        <text x={LEFT_WIDTH + COL_GAP + RIGHT_WIDTH / 2} y={10} textAnchor="middle" fontSize={11} fontWeight={600} fill="#64748b">
          Trace Observations
        </text>
      </svg>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginTop: "8px",
          fontSize: "11px",
          color: "#64748b",
        }}
      >
        <span>
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#22c55e", marginRight: 4, verticalAlign: "middle" }} />
          Supported
        </span>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#f97316", marginRight: 4, verticalAlign: "middle" }} />
          Data-Grounded (A)
        </span>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#ef4444", marginRight: 4, verticalAlign: "middle" }} />
          Model-Fabricated (B)
        </span>
      </div>
    </div>
  );
}
