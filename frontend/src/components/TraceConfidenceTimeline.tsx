/**
 * View 2: Trace Confidence Timeline
 *
 * Horizontal timeline of execution steps.
 * - Shape encodes step type: circle=thought, rect=action, diamond=observation
 * - Color encodes confidence: dark blue (high) → yellow (low)
 * - Stacked area shows cumulative token count
 * - Trigger glyphs mark diagnosed steps (B1/B2/B3)
 *
 * D3 computes scales and positions; React renders all SVG elements.
 */

import { useMemo } from "react";
import * as d3 from "d3";
import type { TraceStep } from "../types/trace";
import type { Diagnosis } from "../types/diagnosis";
import { useSelection } from "../hooks/useSelectionContext";
import { confidenceColorScale, STEP_TYPE_COLORS } from "../lib/colors";
import { MECHANISM_LABELS } from "../types/diagnosis";

interface Props {
  steps: TraceStep[];
  diagnoses: Diagnosis[];
}

const MARGIN = { top: 30, right: 20, bottom: 50, left: 40 };
const WIDTH = 700;
const HEIGHT = 260;
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const NODE_R = 14;

/** Render shape for step type (centered at 0,0) */
function StepShape({ type, size }: { type: string; size: number }) {
  switch (type) {
    case "thought":
      return <circle r={size} />;
    case "action":
      return <rect x={-size} y={-size} width={size * 2} height={size * 2} rx={3} />;
    case "observation": {
      const d = size * 1.2;
      return <polygon points={`0,${-d} ${d},0 0,${d} ${-d},0`} />;
    }
    default:
      return <circle r={size} />;
  }
}

export function TraceConfidenceTimeline({ steps, diagnoses }: Props) {
  const { selectedClaimId, highlightedStepIds, hoveredStepId, hoverStep, selectClaim } =
    useSelection();

  // Build a map: stepId → diagnosis mechanism (for trigger glyphs)
  const stepDiagnosisMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of diagnoses) {
      for (const stepId of d.causal_chain) {
        if (!map.has(stepId)) map.set(stepId, d.mechanism);
      }
    }
    return map;
  }, [diagnoses]);

  // X scale: step index → x position
  const xScale = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([0, steps.length - 1])
        .range([0, INNER_W]),
    [steps.length]
  );

  // Token count area
  const cumulativeTokens = useMemo(() => {
    let total = 0;
    return steps.map((s) => {
      total += s.token_count ?? 0;
      return total;
    });
  }, [steps]);

  const tokenYScale = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([0, Math.max(...cumulativeTokens, 1)])
        .range([INNER_H, INNER_H - 60]),
    [cumulativeTokens]
  );

  const areaPath = useMemo(() => {
    const area = d3
      .area<number>()
      .x((_, i) => xScale(i))
      .y0(INNER_H)
      .y1((d) => tokenYScale(d))
      .curve(d3.curveMonotoneX);
    return area(cumulativeTokens) ?? "";
  }, [cumulativeTokens, xScale, tokenYScale]);

  // X axis ticks
  const xTicks = useMemo(
    () => steps.map((s, i) => ({ x: xScale(i), label: `S${s.step_id}` })),
    [steps, xScale]
  );

  return (
    <svg width={WIDTH} height={HEIGHT} style={{ maxWidth: "100%", height: "auto" }}>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {/* Token count area (background) */}
        <path d={areaPath} fill="#e0e7ff" opacity={0.4} />

        {/* Connection lines between steps */}
        {steps.slice(0, -1).map((_, i) => (
          <line
            key={`edge-${i}`}
            x1={xScale(i)}
            y1={INNER_H / 2}
            x2={xScale(i + 1)}
            y2={INNER_H / 2}
            stroke="#cbd5e1"
            strokeWidth={2}
          />
        ))}

        {/* Step nodes */}
        {steps.map((step, i) => {
          const x = xScale(i);
          const y = INNER_H / 2;
          const isHighlighted = highlightedStepIds.includes(step.step_id);
          const isHovered = hoveredStepId === step.step_id;
          const fillColor = confidenceColorScale(step.confidence);
          const mechanism = stepDiagnosisMap.get(step.step_id);

          return (
            <g
              key={step.step_id}
              transform={`translate(${x},${y})`}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => hoverStep(step.step_id)}
              onMouseLeave={() => hoverStep(null)}
              onClick={() => {
                // Find a claim that references this step
                const relatedDiag = diagnoses.find((d) =>
                  d.causal_chain.includes(step.step_id)
                );
                if (relatedDiag) selectClaim(relatedDiag.claim.claim_id);
              }}
            >
              {/* Highlight ring */}
              {(isHighlighted || isHovered) && (
                <circle
                  r={NODE_R + 4}
                  fill="none"
                  stroke={isHighlighted ? "#3b82f6" : "#94a3b8"}
                  strokeWidth={2}
                  strokeDasharray={isHovered && !isHighlighted ? "4,2" : "none"}
                />
              )}

              {/* Step shape */}
              <g fill={fillColor} stroke={STEP_TYPE_COLORS[step.step_type as keyof typeof STEP_TYPE_COLORS] ?? "#666"} strokeWidth={2}>
                <StepShape type={step.step_type} size={NODE_R} />
              </g>

              {/* Step ID label */}
              <text
                y={-NODE_R - 8}
                textAnchor="middle"
                fontSize={10}
                fill="#64748b"
                fontWeight={isHighlighted ? 700 : 400}
              >
                S{step.step_id}
              </text>

              {/* Trigger glyph (if diagnosed) */}
              {mechanism && (
                <text
                  y={NODE_R + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={700}
                  fill={mechanism === "A" ? "#f97316" : "#ef4444"}
                >
                  {mechanism}
                </text>
              )}

              {/* Tooltip on hover */}
              {isHovered && (
                <g transform={`translate(0, ${-NODE_R - 24})`}>
                  <rect
                    x={-100}
                    y={-36}
                    width={200}
                    height={34}
                    rx={4}
                    fill="#1e293b"
                    opacity={0.95}
                  />
                  <text
                    y={-22}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#f1f5f9"
                    fontWeight={600}
                  >
                    {step.step_type}{step.tool_name ? `: ${step.tool_name}` : ""}
                  </text>
                  <text
                    y={-10}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#94a3b8"
                  >
                    conf: {step.confidence.toFixed(2)} | tokens: {step.token_count ?? "?"}
                    {mechanism ? ` | ${MECHANISM_LABELS[mechanism as keyof typeof MECHANISM_LABELS]}` : ""}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* X axis labels */}
        {xTicks.map((tick) => (
          <text
            key={tick.label}
            x={tick.x}
            y={INNER_H + 20}
            textAnchor="middle"
            fontSize={10}
            fill="#94a3b8"
          >
            {tick.label}
          </text>
        ))}

        {/* Legend */}
        <g transform={`translate(0, ${INNER_H + 35})`}>
          {(["thought", "action", "observation"] as const).map((type, i) => (
            <g key={type} transform={`translate(${i * 120}, 0)`}>
              <g
                fill={STEP_TYPE_COLORS[type]}
                stroke={STEP_TYPE_COLORS[type]}
                strokeWidth={1}
                opacity={0.7}
                transform="translate(6,0)"
              >
                <StepShape type={type} size={5} />
              </g>
              <text x={16} y={4} fontSize={10} fill="#64748b">
                {type}
              </text>
            </g>
          ))}
          <text x={380} y={4} fontSize={10} fill="#94a3b8">
            color = confidence
          </text>
        </g>
      </g>
    </svg>
  );
}
