import { useTraceData } from "./hooks/useTraceData";
import { SelectionProvider } from "./hooks/useSelectionContext";
import { Layout } from "./components/Layout";
import { ProvenanceAlignmentView } from "./components/ProvenanceAlignmentView";
import { ConflictGraphView } from "./components/ConflictGraphView";
import { DiagnosticSummaryPanel } from "./components/DiagnosticSummaryPanel";

function AppContent() {
  const { trace, diagnoses, loading, error } = useTraceData();

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>Loading trace data...</div>
          <div style={{ fontSize: "14px" }}>Fetching static JSON fixtures</div>
        </div>
      </div>
    );
  }

  if (error || !trace) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", color: "#ef4444" }}>
          <div style={{ fontSize: "24px", marginBottom: "8px" }}>Error loading data</div>
          <div style={{ fontSize: "14px" }}>{error ?? "Unknown error"}</div>
        </div>
      </div>
    );
  }

  return (
    <Layout
      provenanceView={
        <ProvenanceAlignmentView
          claims={trace.claims}
          steps={trace.steps}
          diagnoses={diagnoses}
        />
      }
      conflictView={
        trace.plan ? (
          <ConflictGraphView plan={trace.plan} diagnoses={diagnoses} />
        ) : (
          <div style={{ color: "#94a3b8", textAlign: "center", padding: "40px" }}>
            No travel plan available
          </div>
        )
      }
      summaryPanel={
        <DiagnosticSummaryPanel diagnoses={diagnoses} />
      }
    />
  );
}

function App() {
  return (
    <SelectionProvider>
      <AppContent />
    </SelectionProvider>
  );
}

export default App;
