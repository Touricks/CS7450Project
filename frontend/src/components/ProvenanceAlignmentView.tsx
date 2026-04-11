/**
 * View 1: Provenance Alignment View
 *
 * Two-column layout for paper figure:
 * - Left: Agent claims (C1-C7), color-coded green/orange/red
 * - Right: Merged tool call nodes + thought annotations
 *   - Tool calls: action+observation merged into single node (e.g. "poi_search")
 *   - Thoughts: shown as smaller inline annotations between tool calls
 * - Bezier curves connect claims to their source evidence
 * - Claims linking only to thoughts = dangling red (fabricated without tool evidence)
 *
 * React renders all SVG. D3 computes path geometry only.
 */

import { useMemo, useRef } from "react";
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

/** A merged tool call: combines action + observation into one node */
interface ToolCallNode {
  id: string;           // e.g. "tool-poi_search"
  toolName: string;
  actionStep: TraceStep;
  observationStep: TraceStep;
  sourceStepIds: number[]; // both action and observation step IDs
  confidence: number;      // observation's confidence (result quality)
  tokenCount: number;      // combined tokens
}

/** A thought step shown as an annotation */
interface ThoughtNode {
  id: string;
  step: TraceStep;
  contentPreview: string;
  isFabrication: boolean;  // true if a diagnosed claim links here
}

/** Union type for right-column entries */
type RightEntry =
  | { type: "tool"; data: ToolCallNode; y: number; ordinal: number }
  | { type: "thought"; data: ThoughtNode; y: number; ordinal: number };

const TOOL_ROW_HEIGHT = 62;
const THOUGHT_ROW_HEIGHT = 40;
const CLAIM_ROW_HEIGHT = 56;
const COL_GAP = 140;
const LEFT_WIDTH = 280;
const RIGHT_WIDTH = 300;
const SVG_PADDING = 20;

export function ProvenanceAlignmentView({ claims, steps, diagnoses }: Props) {
  const { selectedClaimId, selectClaim, selectDiagnosis } = useSelection();
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Step IDs that diagnosed claims reference (to detect fabrication thoughts)
  const diagnosedSourceSteps = useMemo(() => {
    const ids = new Set<number>();
    for (const d of diagnoses) {
      const claim = claims.find((c) => c.claim_id === d.claim.claim_id);
      if (claim) claim.source_step_ids.forEach((id) => ids.add(id));
    }
    return ids;
  }, [diagnoses, claims]);

  // ── Build right-column entries ──
  const rightEntries = useMemo(() => {
    const entries: RightEntry[] = [];
    let y = SVG_PADDING;
    let ordinal = 1;

    // Group steps by their role
    const actionMap = new Map<string, TraceStep>(); // tool_name → action step
    const obsMap = new Map<string, TraceStep>();    // tool_name → observation step
    const thoughts: TraceStep[] = [];

    for (const step of steps) {
      if (step.step_type === "thought") {
        thoughts.push(step);
      } else if (step.step_type === "action" && step.tool_name) {
        actionMap.set(step.tool_name, step);
      } else if (step.step_type === "observation" && step.tool_name) {
        obsMap.set(step.tool_name, step);
      }
    }

    // Interleave: thought → tool call → thought → tool call...
    // Walk through steps in order, emit thoughts and merged tool calls
    let i = 0;
    while (i < steps.length) {
      const step = steps[i];

      if (step.step_type === "thought") {
        const isFab = diagnosedSourceSteps.has(step.step_id);
        entries.push({
          type: "thought",
          data: {
            id: `thought-${step.step_id}`,
            step,
            contentPreview: step.content.slice(0, 60) + (step.content.length > 60 ? "…" : ""),
            isFabrication: isFab,
          },
          y,
          ordinal: ordinal++,
        });
        y += THOUGHT_ROW_HEIGHT;
        i++;
      } else if (step.step_type === "action" && step.tool_name) {
        // Look ahead for the observation
        const obsStep = i + 1 < steps.length && steps[i + 1].step_type === "observation"
          ? steps[i + 1]
          : null;

        entries.push({
          type: "tool",
          data: {
            id: `tool-${step.tool_name}`,
            toolName: step.tool_name,
            actionStep: step,
            observationStep: obsStep ?? step,
            sourceStepIds: obsStep ? [step.step_id, obsStep.step_id] : [step.step_id],
            confidence: obsStep ? obsStep.confidence : step.confidence,
            tokenCount: (step.token_count ?? 0) + (obsStep?.token_count ?? 0),
          },
          y,
          ordinal: ordinal++,
        });
        y += TOOL_ROW_HEIGHT;
        i += obsStep ? 2 : 1; // skip the observation
      } else {
        i++;
      }
    }

    return entries;
  }, [steps, diagnosedSourceSteps]);

  // ── Build step ID → Y position map (for Bezier targets) ──
  const stepYMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const entry of rightEntries) {
      const centerY = entry.type === "tool"
        ? entry.y + TOOL_ROW_HEIGHT / 2
        : entry.y + THOUGHT_ROW_HEIGHT / 2;

      if (entry.type === "tool") {
        for (const sid of entry.data.sourceStepIds) {
          map.set(sid, centerY);
        }
      } else {
        map.set(entry.data.step.step_id, centerY);
      }
    }
    return map;
  }, [rightEntries]);

  // ── Claim Y positions ──
  const claimYMap = useMemo(() => {
    const map = new Map<string, number>();
    claims.forEach((c, i) => {
      map.set(c.claim_id, SVG_PADDING + i * CLAIM_ROW_HEIGHT + CLAIM_ROW_HEIGHT / 2);
    });
    return map;
  }, [claims]);

  // ── Bezier links ──
  const links = useMemo(() => {
    const result: { path: string; claimId: string; color: string }[] = [];
    const leftX = LEFT_WIDTH;
    const rightX = LEFT_WIDTH + COL_GAP;

    for (const claim of claims) {
      const claimY = claimYMap.get(claim.claim_id);
      if (claimY === undefined) continue;

      const color = getClaimColor(claim.claim_id, diagnosedClaimIds, mechanismMap);
      let hasLink = false;

      for (const stepId of claim.source_step_ids) {
        const stepY = stepYMap.get(stepId);
        if (stepY === undefined) continue;
        result.push({
          path: cubicBezierPath(leftX, claimY, rightX, stepY),
          claimId: claim.claim_id,
          color,
        });
        hasLink = true;
      }

      // Dangling claim — no source found in visible entries
      if (!hasLink) {
        result.push({
          path: cubicBezierPath(leftX, claimY, leftX + COL_GAP * 0.6, claimY),
          claimId: claim.claim_id,
          color: "#ef4444",
        });
      }
    }
    return result;
  }, [claims, claimYMap, stepYMap, diagnosedClaimIds, mechanismMap]);

  // ── Dimensions ──
  const rightHeight = rightEntries.length > 0
    ? rightEntries[rightEntries.length - 1].y +
      (rightEntries[rightEntries.length - 1].type === "tool" ? TOOL_ROW_HEIGHT : THOUGHT_ROW_HEIGHT)
    : 200;
  const leftHeight = SVG_PADDING * 2 + claims.length * CLAIM_ROW_HEIGHT;
  const totalHeight = Math.max(rightHeight + SVG_PADDING, leftHeight, 200);
  const totalWidth = LEFT_WIDTH + COL_GAP + RIGHT_WIDTH;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        style={{ width: "100%", height: "auto" }}
      >
        {/* Column headers */}
        <text x={LEFT_WIDTH / 2} y={12} textAnchor="middle" fontSize={11} fontWeight={600} fill="#64748b">
          Agent Claims
        </text>
        <text x={LEFT_WIDTH + COL_GAP + RIGHT_WIDTH / 2} y={12} textAnchor="middle" fontSize={11} fontWeight={600} fill="#64748b">
          Evidence Sources
        </text>

        {/* ── Bezier curves ── */}
        <g>
          {links.map((link, i) => {
            const isSelected = selectedClaimId === link.claimId;
            return (
              <g key={`link-${i}`}>
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
                <path
                  d={link.path}
                  fill="none"
                  stroke={link.color}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeOpacity={selectedClaimId === null || isSelected ? 0.7 : 0.12}
                  style={{ transition: "stroke-opacity 0.2s, stroke-width 0.2s" }}
                />
              </g>
            );
          })}
        </g>

        {/* ── Left column: Claims ── */}
        <g>
          {claims.map((claim, i) => {
            const y = SVG_PADDING + i * CLAIM_ROW_HEIGHT;
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
                <rect
                  x={4} y={2}
                  width={LEFT_WIDTH - 8} height={CLAIM_ROW_HEIGHT - 4}
                  rx={6}
                  fill={isSelected ? "#f0f9ff" : "#fafafa"}
                  stroke={isSelected ? "#3b82f6" : "#e2e8f0"}
                  strokeWidth={isSelected ? 2 : 1}
                />
                <rect x={4} y={2} width={4} height={CLAIM_ROW_HEIGHT - 4} rx={2} fill={color} />
                <text x={16} y={18} fontSize={10} fontWeight={700} fill={color}>
                  {claim.claim_id.toUpperCase()}
                </text>
                <text x={16} y={34} fontSize={11} fill="#334155">
                  {claim.text.length > 36 ? claim.text.slice(0, 36) + "…" : claim.text}
                </text>
                <text x={16} y={48} fontSize={9} fill="#94a3b8">
                  {claim.claim_type}
                </text>
              </g>
            );
          })}
        </g>

        {/* ── Right column: Tool calls + Thought annotations ── */}
        <g transform={`translate(${LEFT_WIDTH + COL_GAP}, 0)`}>
          {rightEntries.map((entry) => {
            if (entry.type === "tool") {
              const { data, y } = entry;
              const isHighlighted =
                selectedClaimId !== null &&
                claims.some(
                  (c) =>
                    c.claim_id === selectedClaimId &&
                    c.source_step_ids.some((sid) => data.sourceStepIds.includes(sid))
                );

              return (
                <g key={data.id} transform={`translate(0, ${y})`}>
                  <rect
                    x={4} y={2}
                    width={RIGHT_WIDTH - 8} height={TOOL_ROW_HEIGHT - 4}
                    rx={6}
                    fill={isHighlighted ? "#f0fdf4" : "#fafafa"}
                    stroke={isHighlighted ? "#22c55e" : "#e2e8f0"}
                    strokeWidth={isHighlighted ? 2 : 1}
                  />
                  {/* Ordinal badge */}
                  <circle cx={22} cy={18} r={10} fill="#6366f1" opacity={0.12} />
                  <text x={22} y={22} textAnchor="middle" fontSize={10} fontWeight={700} fill="#6366f1">
                    {entry.ordinal}
                  </text>
                  {/* Tool name */}
                  <text x={38} y={22} fontSize={12} fontWeight={700} fill="#6366f1">
                    {data.toolName}
                  </text>
                  {/* Metadata row */}
                  <text x={14} y={42} fontSize={10} fill="#64748b">
                    conf: {data.confidence.toFixed(2)}
                  </text>
                  <text x={100} y={42} fontSize={10} fill="#94a3b8">
                    {data.tokenCount} tokens
                  </text>
                </g>
              );
            } else {
              // Thought annotation
              const { data, y } = entry;
              const thoughtColor = data.isFabrication ? "#dc2626" : "#94a3b8";
              return (
                <g key={data.id} transform={`translate(0, ${y})`}>
                  <rect
                    x={8} y={4}
                    width={RIGHT_WIDTH - 16} height={THOUGHT_ROW_HEIGHT - 8}
                    rx={4}
                    fill={data.isFabrication ? "#fef2f2" : "#f8fafc"}
                    stroke={data.isFabrication ? "#fca5a5" : "#f1f5f9"}
                    strokeWidth={1}
                    strokeDasharray={data.isFabrication ? "none" : "4,2"}
                  />
                  {/* Ordinal badge */}
                  <circle cx={20} cy={20} r={7} fill={thoughtColor} opacity={0.12} />
                  <text x={20} y={23} textAnchor="middle" fontSize={8} fontWeight={600} fill={thoughtColor}>
                    {entry.ordinal}
                  </text>
                  {/* Fabrication warning */}
                  {data.isFabrication && (
                    <text x={32} y={24} fontSize={10} fill="#dc2626">&#9888;</text>
                  )}
                  {/* Content preview */}
                  <text
                    x={data.isFabrication ? 44 : 32} y={24}
                    fontSize={9}
                    fontStyle="italic"
                    fill={thoughtColor}
                    fontWeight={data.isFabrication ? 600 : 400}
                  >
                    {data.contentPreview.slice(0, 42)}{data.contentPreview.length > 42 ? "…" : ""}
                  </text>
                </g>
              );
            }
          })}
        </g>
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "11px", color: "#64748b" }}>
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
        <span style={{ marginLeft: "8px", borderLeft: "1px solid #e2e8f0", paddingLeft: "12px" }}>
          <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#6366f1", marginRight: 4, verticalAlign: "middle" }} />
          Tool call
        </span>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 3, background: "#fca5a5", marginRight: 4, verticalAlign: "middle" }} />
          Agent reasoning
        </span>
      </div>
    </div>
  );
}
