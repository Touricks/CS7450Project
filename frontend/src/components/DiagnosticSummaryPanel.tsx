/**
 * View 3: Diagnostic Summary Panel (Interactive Detail View)
 *
 * Empty state: shows issue count summary + prompt to click a claim.
 * Selected state: shows ONE diagnosis card matching the selected claim,
 * with a mini tab bar for navigating between diagnoses.
 *
 * Follows "details on demand" — no dense list, one card at a time.
 */

import { useMemo } from "react";
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

function EmptyState({ diagnoses }: { diagnoses: Diagnosis[] }) {
  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    for (const d of diagnoses) c[d.severity]++;
    return c;
  }, [diagnoses]);

  if (diagnoses.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#22c55e", gap: "8px" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <div style={{ fontSize: "14px", fontWeight: 600 }}>No hallucinations detected</div>
        <div style={{ fontSize: "12px", color: "#6b7280" }}>All claims are supported by evidence</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "16px" }}>
      {/* Issue count card */}
      <div style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        padding: "16px 24px",
        textAlign: "center",
        minWidth: "200px",
      }}>
        <div style={{ fontSize: "28px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>
          {diagnoses.length}
        </div>
        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          issues found
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
          {counts.high > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEVERITY_COLORS.high, display: "inline-block" }} />
              <span style={{ color: "#64748b" }}>{counts.high} high</span>
            </span>
          )}
          {counts.medium > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEVERITY_COLORS.medium, display: "inline-block" }} />
              <span style={{ color: "#64748b" }}>{counts.medium} med</span>
            </span>
          )}
          {counts.low > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEVERITY_COLORS.low, display: "inline-block" }} />
              <span style={{ color: "#64748b" }}>{counts.low} low</span>
            </span>
          )}
        </div>
      </div>

      {/* Prompt */}
      <div style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>
        Select a highlighted claim to view<br />diagnosis details
      </div>
    </div>
  );
}

function DetailCard({ diag }: { diag: Diagnosis }) {
  return (
    <div style={{ padding: "4px 0" }}>
      {/* Header: severity + type + mechanism */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
        <span style={{
          fontSize: "11px", fontWeight: 700, color: "#fff",
          background: SEVERITY_COLORS[diag.severity],
          padding: "2px 8px", borderRadius: "10px", textTransform: "uppercase",
        }}>
          {diag.severity}
        </span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
          {HALLUCINATION_LABELS[diag.hallucination_type]}
        </span>
        <span style={{
          fontSize: "11px", fontWeight: 600,
          color: MECHANISM_COLORS[diag.mechanism],
          border: `1px solid ${MECHANISM_COLORS[diag.mechanism]}`,
          padding: "1px 6px", borderRadius: "4px",
        }}>
          {diag.mechanism}: {MECHANISM_LABELS[diag.mechanism]}
        </span>
      </div>

      {/* Claim text */}
      <div style={{
        fontSize: "14px", color: "#1e293b", marginBottom: "12px",
        fontStyle: "italic", lineHeight: 1.5,
        borderLeft: `3px solid ${SEVERITY_COLORS[diag.severity]}`,
        paddingLeft: "12px",
      }}>
        "{diag.claim.text}"
      </div>

      {/* Evidence */}
      <div style={{ fontSize: "13px", color: "#475569", marginBottom: "12px", lineHeight: 1.6 }}>
        {diag.evidence}
      </div>

      {/* Ground truth */}
      {diag.ground_truth && (
        <div style={{
          fontSize: "13px", color: "#166534", background: "#f0fdf4",
          padding: "8px 12px", borderRadius: "6px", marginBottom: "12px", lineHeight: 1.5,
        }}>
          <strong>Ground truth:</strong> {diag.ground_truth}
        </div>
      )}

      {/* Fix suggestion */}
      {diag.fix_suggestion && (
        <div style={{
          fontSize: "13px", color: "#1e40af", background: "#eff6ff",
          padding: "8px 12px", borderRadius: "6px", borderLeft: "3px solid #3b82f6", lineHeight: 1.5,
        }}>
          <strong>Fix:</strong> {diag.fix_suggestion}
        </div>
      )}
    </div>
  );
}

export function DiagnosticSummaryPanel({ diagnoses }: Props) {
  const { selectedClaimId, selectedDiagnosisId, selectDiagnosis, selectClaim } = useSelection();

  const sorted = useMemo(
    () => [...diagnoses].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2)),
    [diagnoses]
  );

  // Resolve active diagnosis from either selectedDiagnosisId or selectedClaimId
  const activeDiag = useMemo(() => {
    if (selectedDiagnosisId) {
      return sorted.find((d) => d.diagnosis_id === selectedDiagnosisId) ?? null;
    }
    if (selectedClaimId) {
      return sorted.find((d) => d.claim.claim_id === selectedClaimId) ?? null;
    }
    return null;
  }, [sorted, selectedDiagnosisId, selectedClaimId]);

  const activeIndex = activeDiag ? sorted.indexOf(activeDiag) : -1;

  // No selection → empty state
  if (!activeDiag) {
    return <EmptyState diagnoses={diagnoses} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Mini tab bar */}
      <div style={{
        display: "flex", gap: "4px", marginBottom: "12px",
        borderBottom: "1px solid #e2e8f0", paddingBottom: "8px",
      }}>
        {sorted.map((diag, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={diag.diagnosis_id}
              onClick={() => {
                selectDiagnosis(diag.diagnosis_id, diag.causal_chain);
                selectClaim(diag.claim.claim_id);
              }}
              style={{
                fontSize: "11px", fontWeight: isActive ? 700 : 500,
                color: isActive ? "#fff" : "#64748b",
                background: isActive ? SEVERITY_COLORS[diag.severity] : "#f1f5f9",
                border: "none", borderRadius: "4px",
                padding: "3px 10px", cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {diag.diagnosis_id}
            </button>
          );
        })}

        {/* Counter */}
        <span style={{ marginLeft: "auto", fontSize: "11px", color: "#94a3b8", alignSelf: "center" }}>
          {activeIndex + 1} / {sorted.length}
        </span>
      </div>

      {/* Single detail card */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <DetailCard diag={activeDiag} />
      </div>
    </div>
  );
}
