/**
 * View 3: Diagnostic Summary Panel
 *
 * One card per diagnosis, ordered by severity.
 * Each card shows: claim text, hallucination type label, mechanism label,
 * severity badge, causal chain visualization, fix suggestion.
 *
 * Clicking a card propagates selection to Views 1 and 2.
 */

import type { Diagnosis } from "../types/diagnosis";
import {
  HALLUCINATION_LABELS,
  MECHANISM_LABELS,
  SEVERITY_COLORS,
  MECHANISM_COLORS,
} from "../types/diagnosis";
import { useSelection } from "../hooks/useSelectionContext";

interface Props {
  diagnoses: Diagnosis[];
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function DiagnosticSummaryPanel({ diagnoses }: Props) {
  const { selectedDiagnosisId, selectDiagnosis, selectClaim } = useSelection();

  const sorted = [...diagnoses].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2)
  );

  if (sorted.length === 0) {
    return (
      <div style={{ color: "#22c55e", padding: "20px", textAlign: "center" }}>
        No hallucinations detected. All claims are supported.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {sorted.map((diag) => {
        const isSelected = selectedDiagnosisId === diag.diagnosis_id;

        return (
          <div
            key={diag.diagnosis_id}
            onClick={() => {
              selectDiagnosis(diag.diagnosis_id, diag.causal_chain);
              selectClaim(diag.claim.claim_id);
            }}
            style={{
              border: isSelected ? "2px solid #3b82f6" : "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "12px 16px",
              cursor: "pointer",
              background: isSelected ? "#eff6ff" : "#ffffff",
              transition: "all 0.15s ease",
            }}
          >
            {/* Header: type + mechanism + severity */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
                flexWrap: "wrap",
              }}
            >
              {/* Severity badge */}
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#fff",
                  background: SEVERITY_COLORS[diag.severity],
                  padding: "2px 8px",
                  borderRadius: "10px",
                  textTransform: "uppercase",
                }}
              >
                {diag.severity}
              </span>

              {/* Hallucination type */}
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                {HALLUCINATION_LABELS[diag.hallucination_type]}
              </span>

              {/* Mechanism badge */}
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: MECHANISM_COLORS[diag.mechanism],
                  border: `1px solid ${MECHANISM_COLORS[diag.mechanism]}`,
                  padding: "1px 6px",
                  borderRadius: "4px",
                }}
              >
                {diag.mechanism}: {MECHANISM_LABELS[diag.mechanism]}
              </span>
            </div>

            {/* Claim text */}
            <div
              style={{
                fontSize: "13px",
                color: "#1e293b",
                marginBottom: "8px",
                fontStyle: "italic",
                lineHeight: 1.4,
              }}
            >
              "{diag.claim.text}"
            </div>

            {/* Evidence */}
            <div
              style={{
                fontSize: "12px",
                color: "#475569",
                marginBottom: "8px",
                lineHeight: 1.5,
              }}
            >
              {diag.evidence}
            </div>

            {/* Ground truth (if available) */}
            {diag.ground_truth && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#166534",
                  background: "#f0fdf4",
                  padding: "6px 10px",
                  borderRadius: "4px",
                  marginBottom: "8px",
                }}
              >
                <strong>Ground truth:</strong> {diag.ground_truth}
              </div>
            )}

            {/* Causal chain mini-visualization */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "11px", color: "#94a3b8", marginRight: "4px" }}>
                Causal chain:
              </span>
              {diag.causal_chain.map((stepId, i) => (
                <span key={stepId} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#3b82f6",
                      background: "#dbeafe",
                      padding: "1px 6px",
                      borderRadius: "3px",
                    }}
                  >
                    S{stepId}
                  </span>
                  {i < diag.causal_chain.length - 1 && (
                    <span style={{ color: "#cbd5e1", fontSize: "10px" }}>→</span>
                  )}
                </span>
              ))}
            </div>

            {/* Fix suggestion */}
            {diag.fix_suggestion && (
              <div
                style={{
                  fontSize: "12px",
                  color: "#1e40af",
                  background: "#eff6ff",
                  padding: "6px 10px",
                  borderRadius: "4px",
                  borderLeft: "3px solid #3b82f6",
                }}
              >
                <strong>Fix:</strong> {diag.fix_suggestion}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
