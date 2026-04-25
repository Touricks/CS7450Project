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
import { HALLUCINATION_LABELS } from "../types/diagnosis";
import { useSelection } from "../hooks/useSelectionContext";

interface Props {
  diagnoses: Diagnosis[];
}

const diagnosisDisplayName = (index: number) => `Issue ${index + 1}`;
const ISSUE_ACCENT = "#ef4444";

function EmptyState({ diagnoses, onViewIssues }: { diagnoses: Diagnosis[]; onViewIssues: () => void }) {

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
        <div style={{ fontSize: "12px", color: "#64748b" }}>Click View Issues to inspect details</div>
      </div>

      {/* View Issues button */}
      <button
        onClick={onViewIssues}
        style={{
          fontSize: "13px", fontWeight: 600,
          color: "#fff", background: "#ef4444",
          border: "none", borderRadius: "6px",
          padding: "8px 20px", cursor: "pointer",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#dc2626")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#ef4444")}
      >
        View Issues
      </button>

      {/* Prompt */}
      <div style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center", lineHeight: 1.5 }}>
        or select a schedule item<br />to jump to a specific diagnosis
      </div>
    </div>
  );
}

function DetailCard({ diag }: { diag: Diagnosis }) {
  return (
    <div style={{ padding: "4px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
          {HALLUCINATION_LABELS[diag.hallucination_type]}
        </span>
      </div>

      {/* Claim text */}
      <div style={{
        fontSize: "14px", color: "#1e293b", marginBottom: "12px",
        fontStyle: "italic", lineHeight: 1.5,
        borderLeft: `3px solid ${ISSUE_ACCENT}`,
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
  const { selectedClaimId, selectedDiagnosisId, selectDiagnosis, selectClaim, clearSelection } = useSelection();

  const sorted = diagnoses;

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
    function handleViewIssues() {
      const first = sorted[0];
      if (!first) return;
      selectDiagnosis(first.diagnosis_id, first.causal_chain);
      selectClaim(first.claim.claim_id);
    }
    return <EmptyState diagnoses={diagnoses} onViewIssues={handleViewIssues} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginBottom: "8px" }}>
        <button
          type="button"
          onClick={clearSelection}
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#475569",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "4px",
            padding: "4px 8px",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
      </div>
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
                background: isActive ? ISSUE_ACCENT : "#f1f5f9",
                border: "none", borderRadius: "4px",
                padding: "3px 10px", cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {diagnosisDisplayName(i)}
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
