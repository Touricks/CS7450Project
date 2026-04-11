/**
 * Constraint Conflict Graph — Three-Lane Layered View
 *
 * Three vertical lanes: UserProfile | POI Metadata | Schedule
 * Nodes represent data fields; dashed edges connect conflicting pairs.
 *
 * React renders all SVG. D3 computes geometry only (scales).
 */

import { useMemo } from "react";
import type { TravelPlan } from "../types/trace";
import type { Diagnosis } from "../types/diagnosis";
import { useSelection } from "../hooks/useSelectionContext";
import {
  detectConflicts,
  CONFLICT_COLORS,
  CONFLICT_LABELS,
  type ConflictNode,
  type ConflictEdge,
  type NodeClass,
  type ConflictType,
} from "../lib/conflictDetection";

interface Props {
  plan: TravelPlan;
  diagnoses: Diagnosis[];
}

/* ── Layout constants ── */

const SVG_PADDING = 12;
const LANE_WIDTH = 130;
const LANE_GAP = 36;
const NODE_HEIGHT = 40;
const NODE_GAP = 8;
const HEADER_HEIGHT = 24;

const LANE_COLORS: Record<NodeClass, { bg: string; border: string; text: string; badge: string }> = {
  profile: { bg: "#eef2ff", border: "#6366f1", text: "#4338ca", badge: "#6366f1" },
  poi: { bg: "#f0f9ff", border: "#0ea5e9", text: "#0369a1", badge: "#0ea5e9" },
  schedule: { bg: "#ecfdf5", border: "#10b981", text: "#065f46", badge: "#10b981" },
};

const LANE_LABELS: Record<NodeClass, string> = {
  profile: "UserProfile",
  poi: "POI Metadata",
  schedule: "Schedule",
};

const LANE_ORDER: NodeClass[] = ["profile", "poi", "schedule"];

export function ConflictGraphView({ plan, diagnoses }: Props) {
  const { selectedClaimId, selectClaim, selectDiagnosis } = useSelection();

  // Detect conflicts
  const graph = useMemo(() => detectConflicts(plan), [plan]);

  // Group nodes by class
  const laneNodes = useMemo(() => {
    const groups: Record<NodeClass, ConflictNode[]> = { profile: [], poi: [], schedule: [] };
    for (const node of graph.nodes) {
      groups[node.class].push(node);
    }
    return groups;
  }, [graph.nodes]);

  // Compute Y positions for each node
  const nodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; laneIdx: number }>();
    for (let laneIdx = 0; laneIdx < LANE_ORDER.length; laneIdx++) {
      const laneClass = LANE_ORDER[laneIdx];
      const nodesInLane = laneNodes[laneClass];
      const laneX = SVG_PADDING + laneIdx * (LANE_WIDTH + LANE_GAP);
      for (let i = 0; i < nodesInLane.length; i++) {
        const y = SVG_PADDING + HEADER_HEIGHT + i * (NODE_HEIGHT + NODE_GAP);
        positions.set(nodesInLane[i].id, { x: laneX, y, laneIdx });
      }
    }
    return positions;
  }, [laneNodes]);

  // Build diagnosis lookup for edge→claim mapping
  const diagByClaimId = useMemo(
    () => new Map(diagnoses.map((d) => [d.claim.claim_id, d])),
    [diagnoses],
  );

  // Determine which edges are selected
  const selectedEdgeIds = useMemo(() => {
    if (!selectedClaimId) return new Set<string>();
    return new Set(
      graph.edges
        .filter((e) => e.relatedClaimId === selectedClaimId)
        .map((e) => e.id),
    );
  }, [selectedClaimId, graph.edges]);

  // ── Dimensions ──
  const maxNodesPerLane = Math.max(
    laneNodes.profile.length,
    laneNodes.poi.length,
    laneNodes.schedule.length,
    1,
  );
  const contentHeight = SVG_PADDING + HEADER_HEIGHT + maxNodesPerLane * (NODE_HEIGHT + NODE_GAP);
  const totalWidth = SVG_PADDING * 2 + LANE_ORDER.length * LANE_WIDTH + (LANE_ORDER.length - 1) * LANE_GAP;
  const totalHeight = contentHeight + SVG_PADDING;

  // ── Edge path generator ──
  function edgePath(edge: ConflictEdge): string {
    const src = nodePositions.get(edge.source);
    const tgt = nodePositions.get(edge.target);
    if (!src || !tgt) return "";

    const x1 = src.x + LANE_WIDTH;
    const y1 = src.y + NODE_HEIGHT / 2;
    const x2 = tgt.x;
    const y2 = tgt.y + NODE_HEIGHT / 2;

    // Same lane: curve within lane
    if (src.laneIdx === tgt.laneIdx) {
      const offset = 30;
      return `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x1 + offset} ${y2}, ${x2 + LANE_WIDTH} ${y2}`;
    }

    // Cross-lane: cubic Bezier
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  }

  function handleEdgeClick(edge: ConflictEdge) {
    if (edge.relatedClaimId) {
      selectClaim(edge.relatedClaimId);
      const diag = diagByClaimId.get(edge.relatedClaimId);
      if (diag) selectDiagnosis(diag.diagnosis_id, diag.causal_chain);
    }
  }

  if (graph.nodes.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "300px", color: "#22c55e", gap: "8px" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <div style={{ fontSize: "14px", fontWeight: 600 }}>No conflicts detected</div>
        <div style={{ fontSize: "12px", color: "#6b7280" }}>UserProfile, POI metadata, and Schedule are consistent</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <svg
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", flex: 1, minHeight: 0, display: "block" }}
      >
        {/* ── Lane backgrounds + headers ── */}
        {LANE_ORDER.map((laneClass, laneIdx) => {
          const x = SVG_PADDING + laneIdx * (LANE_WIDTH + LANE_GAP);
          const colors = LANE_COLORS[laneClass];
          return (
            <g key={`lane-${laneClass}`}>
              <rect
                x={x - 4}
                y={SVG_PADDING}
                width={LANE_WIDTH + 8}
                height={contentHeight - SVG_PADDING}
                rx={8}
                fill={colors.bg}
                opacity={0.5}
              />
              <text
                x={x + LANE_WIDTH / 2}
                y={SVG_PADDING + 16}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={colors.text}
              >
                {LANE_LABELS[laneClass]}
              </text>
            </g>
          );
        })}

        {/* ── Edges (behind nodes) ── */}
        <g>
          {graph.edges.map((edge) => {
            const path = edgePath(edge);
            if (!path) return null;
            const isSelected = selectedEdgeIds.has(edge.id);
            const hasSelection = selectedClaimId !== null;
            return (
              <g key={edge.id}>
                {/* Hit area */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: "pointer" }}
                  onClick={() => handleEdgeClick(edge)}
                />
                {/* Visible edge */}
                <path
                  d={path}
                  fill="none"
                  stroke={CONFLICT_COLORS[edge.type]}
                  strokeWidth={isSelected ? 3 : 2}
                  strokeDasharray="6,4"
                  strokeOpacity={hasSelection && !isSelected ? 0.15 : 0.8}
                  style={{ transition: "stroke-opacity 0.2s, stroke-width 0.2s" }}
                />
                {/* Midpoint dot */}
                {(() => {
                  const src = nodePositions.get(edge.source);
                  const tgt = nodePositions.get(edge.target);
                  if (!src || !tgt) return null;
                  const mx = (src.x + LANE_WIDTH + tgt.x) / 2;
                  const my = (src.y + NODE_HEIGHT / 2 + tgt.y + NODE_HEIGHT / 2) / 2;
                  return (
                    <circle
                      cx={mx}
                      cy={my}
                      r={4}
                      fill={CONFLICT_COLORS[edge.type]}
                      opacity={hasSelection && !isSelected ? 0.15 : 0.9}
                    />
                  );
                })()}
              </g>
            );
          })}
        </g>

        {/* ── Nodes ── */}
        {graph.nodes.map((node) => {
          const pos = nodePositions.get(node.id);
          if (!pos) return null;
          const colors = LANE_COLORS[node.class];
          // Highlight if any selected edge connects to this node
          const isHighlighted = selectedEdgeIds.size > 0 &&
            graph.edges.some(
              (e) => selectedEdgeIds.has(e.id) && (e.source === node.id || e.target === node.id),
            );

          return (
            <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
              <rect
                x={0}
                y={0}
                width={LANE_WIDTH}
                height={NODE_HEIGHT}
                rx={6}
                fill={isHighlighted ? "#f0f9ff" : "#fafafa"}
                stroke={isHighlighted ? "#3b82f6" : "#e2e8f0"}
                strokeWidth={isHighlighted ? 2 : 1}
              />
              {/* Class-colored left border */}
              <rect x={0} y={0} width={4} height={NODE_HEIGHT} rx={2} fill={colors.badge} />
              {/* Label */}
              <text x={12} y={18} fontSize={11} fontWeight={600} fill={colors.text}>
                {node.label.length > 18 ? node.label.slice(0, 18) + "\u2026" : node.label}
              </text>
              {/* Detail */}
              <text x={12} y={34} fontSize={9} fill="#64748b">
                {node.detail.length > 22 ? node.detail.slice(0, 22) + "\u2026" : node.detail}
              </text>
              {/* Tooltip on hover */}
              <title>{`${node.label}\n${node.detail}`}</title>
            </g>
          );
        })}
      </svg>

      {/* ── Legend ── */}
      <div style={{ display: "flex", gap: "12px", marginTop: "8px", fontSize: "11px", color: "#64748b", flexWrap: "wrap" }}>
        {(Object.entries(CONFLICT_COLORS) as [ConflictType, string][]).map(([type, color]) => {
          // Only show legend entries for conflict types present in the graph
          if (!graph.edges.some((e) => e.type === type)) return null;
          return (
            <span key={type} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{
                display: "inline-block",
                width: 16,
                height: 2,
                background: color,
                borderTop: `2px dashed ${color}`,
                marginRight: 2,
              }} />
              {CONFLICT_LABELS[type]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
