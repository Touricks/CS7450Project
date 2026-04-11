/**
 * View 2: Token Consumption Chart
 *
 * Focused bar chart showing per-step token consumption.
 * The execution flow (shapes, edges, causal chains) was removed because
 * the Provenance Alignment View already encodes that information.
 *
 * This view answers: "How much data flowed through each step?"
 * - Bar height = token count per step
 * - Bar color = red for causal-chain steps, blue for normal steps
 * - Step labels below each bar with tool name
 * - Highlighted bars on cross-view selection
 *
 * D3 computes scales; React renders all SVG via JSX.
 */

import { useMemo } from "react";
import * as d3 from "d3";
import type { TraceStep } from "../types/trace";
import type { Diagnosis } from "../types/diagnosis";
import { useSelection } from "../hooks/useSelectionContext";

interface Props {
  steps: TraceStep[];
  diagnoses: Diagnosis[];
}

const MARGIN = { top: 24, right: 20, bottom: 48, left: 50 };
const WIDTH = 700;
const HEIGHT = 200;
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

export function TraceConfidenceTimeline({ steps, diagnoses }: Props) {
  const { highlightedStepIds, hoveredStepId, hoverStep, selectClaim } =
    useSelection();

  // Steps in any causal chain
  const causalStepIds = useMemo(() => {
    const ids = new Set<number>();
    for (const d of diagnoses) {
      for (const sid of d.causal_chain) ids.add(sid);
    }
    return ids;
  }, [diagnoses]);

  // Root-cause steps with mechanism labels
  const rootCauseMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of diagnoses) {
      if (d.causal_chain.length > 0) {
        const root = d.causal_chain[0];
        if (!map.has(root)) map.set(root, d.mechanism);
      }
    }
    return map;
  }, [diagnoses]);

  const tokenCounts = useMemo(
    () => steps.map((s) => s.token_count ?? 0),
    [steps]
  );

  const xScale = useMemo(
    () =>
      d3.scaleBand<number>()
        .domain(steps.map((_, i) => i))
        .range([0, INNER_W])
        .padding(0.25),
    [steps.length]
  );

  const yScale = useMemo(
    () =>
      d3.scaleLinear()
        .domain([0, Math.max(...tokenCounts, 1)])
        .range([INNER_H, 0])
        .nice(),
    [tokenCounts]
  );

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const scale = yScale as d3.ScaleLinear<number, number>;
    return scale.ticks(4).map((v) => ({ y: scale(v), label: String(v) }));
  }, [yScale]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: "100%", height: "auto" }}>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>

        {/* Y-axis gridlines + labels */}
        {yTicks.map((tick) => (
          <g key={tick.label}>
            <line
              x1={0} y1={tick.y}
              x2={INNER_W} y2={tick.y}
              stroke="#f1f5f9" strokeWidth={1}
            />
            <text
              x={-8} y={tick.y + 3}
              textAnchor="end" fontSize={9} fill="#94a3b8"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Y-axis label */}
        <text
          x={-36} y={INNER_H / 2}
          textAnchor="middle" fontSize={10} fill="#64748b"
          transform={`rotate(-90, -36, ${INNER_H / 2})`}
        >
          tokens
        </text>

        {/* Baseline */}
        <line x1={0} y1={INNER_H} x2={INNER_W} y2={INNER_H} stroke="#e2e8f0" strokeWidth={1} />

        {/* Bars */}
        {steps.map((step, i) => {
          const tokens = step.token_count ?? 0;
          const x = xScale(i) ?? 0;
          const barW = xScale.bandwidth();
          const barH = INNER_H - yScale(tokens);
          const isCausal = causalStepIds.has(step.step_id);
          const isHighlighted = highlightedStepIds.includes(step.step_id);
          const isHovered = hoveredStepId === step.step_id;
          const rootMech = rootCauseMap.get(step.step_id);

          const barFill = isCausal ? "#fecaca" : "#dbeafe";
          const barStroke = isCausal ? "#ef4444" : "#93c5fd";
          const activeBarFill = isHighlighted ? (isCausal ? "#fca5a5" : "#bfdbfe") : barFill;

          return (
            <g
              key={step.step_id}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => hoverStep(step.step_id)}
              onMouseLeave={() => hoverStep(null)}
              onClick={() => {
                const relatedDiag = diagnoses.find((d) =>
                  d.causal_chain.includes(step.step_id)
                );
                if (relatedDiag) selectClaim(relatedDiag.claim.claim_id);
              }}
            >
              {/* Bar */}
              <rect
                x={x}
                y={yScale(tokens)}
                width={barW}
                height={barH}
                rx={3}
                fill={activeBarFill}
                stroke={isHighlighted || isHovered ? "#3b82f6" : barStroke}
                strokeWidth={isHighlighted || isHovered ? 2 : 1}
                opacity={0.85}
              />

              {/* Token count label above bar */}
              <text
                x={x + barW / 2}
                y={yScale(tokens) - 5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={tokens > 300 ? 700 : 400}
                fill={isCausal ? "#dc2626" : "#3b82f6"}
              >
                {tokens}
              </text>

              {/* Root-cause mechanism badge on top of bar */}
              {rootMech && (
                <g transform={`translate(${x + barW / 2}, ${yScale(tokens) - 18})`}>
                  <rect x={-12} y={-8} width={24} height={14} rx={3} fill="#dc2626" />
                  <text
                    textAnchor="middle" y={3}
                    fontSize={8} fontWeight={700} fill="#fff"
                  >
                    {rootMech}
                  </text>
                </g>
              )}

              {/* X-axis: step label */}
              <text
                x={x + barW / 2}
                y={INNER_H + 14}
                textAnchor="middle"
                fontSize={10}
                fill={isCausal ? "#dc2626" : "#64748b"}
                fontWeight={isCausal ? 600 : 400}
              >
                S{step.step_id}
              </text>

              {/* X-axis: tool/type sublabel */}
              <text
                x={x + barW / 2}
                y={INNER_H + 26}
                textAnchor="middle"
                fontSize={8}
                fill="#94a3b8"
              >
                {step.tool_name ?? step.step_type}
              </text>

              {/* Hover tooltip */}
              {isHovered && (
                <g transform={`translate(${x + barW / 2}, ${yScale(tokens) - 32})`}>
                  <rect
                    x={-80} y={-18}
                    width={160} height={16}
                    rx={3} fill="#1e293b" opacity={0.92}
                  />
                  <text
                    textAnchor="middle" y={-7}
                    fontSize={9} fill="#f1f5f9"
                  >
                    {step.step_type}{step.tool_name ? `: ${step.tool_name}` : ""} — conf: {step.confidence.toFixed(2)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(0, ${INNER_H + 36})`}>
          <rect x={0} y={-5} width={10} height={10} rx={2} fill="#dbeafe" stroke="#93c5fd" strokeWidth={1} />
          <text x={14} y={4} fontSize={9} fill="#64748b">normal step</text>

          <rect x={100} y={-5} width={10} height={10} rx={2} fill="#fecaca" stroke="#ef4444" strokeWidth={1} />
          <text x={114} y={4} fontSize={9} fill="#64748b">causal chain step</text>

          <g transform="translate(250, 0)">
            <rect x={-12} y={-7} width={24} height={14} rx={3} fill="#dc2626" />
            <text textAnchor="middle" y={4} fontSize={8} fontWeight={700} fill="#fff">B3</text>
          </g>
          <text x={270} y={4} fontSize={9} fill="#64748b">root cause</text>
        </g>
      </g>
    </svg>
  );
}
