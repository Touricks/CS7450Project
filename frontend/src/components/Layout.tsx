/**
 * Two-panel layout with split right panel:
 *
 * ┌─────────────────────┬──────────────────┐
 * │                     │  Diagnostic      │
 * │  Provenance         │  Summary Panel   │
 * │  Alignment View     │                  │
 * │  (full height)      ├──────────────────┤
 * │                     │  Constraint      │
 * │                     │  Conflict Graph  │
 * └─────────────────────┴──────────────────┘
 */

import type { ReactNode } from "react";

interface LayoutProps {
  provenanceView: ReactNode;
  conflictView: ReactNode;
  summaryPanel: ReactNode;
}

export function Layout({ provenanceView, conflictView, summaryPanel }: LayoutProps) {
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc" }}>
      {/* Left panel: Provenance Alignment View */}
      <div
        style={{
          flex: "0 0 50%",
          borderRight: "1px solid #e2e8f0",
          overflow: "auto",
          padding: "16px",
          background: "#ffffff",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Provenance Alignment
        </h2>
        {provenanceView}
      </div>

      {/* Right panel: split top/bottom */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Top-right: Diagnostic Summary */}
        <div
          style={{
            flex: "0 0 35%",
            overflow: "auto",
            padding: "16px",
            borderBottom: "1px solid #e2e8f0",
            minHeight: 0,
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Diagnostic Summary
          </h2>
          {summaryPanel}
        </div>

        {/* Bottom-right: Constraint Conflict Graph */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "12px 16px",
            minHeight: 0,
          }}
        >
          <h2 style={{ margin: "0 0 6px", fontSize: "13px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Constraint Conflicts
          </h2>
          {conflictView}
        </div>
      </div>
    </div>
  );
}
