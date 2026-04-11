/**
 * Three-panel layout matching MidReport Figure 2.
 *
 * ┌─────────────────┬──────────────────┐
 * │  Provenance      │  Trace Confidence │
 * │  Alignment View  │  Timeline         │
 * │  (View 1)        │  (View 2)         │
 * │                  │                   │
 * │                  ├──────────────────┤
 * │                  │  Diagnostic       │
 * │                  │  Summary Panel    │
 * │                  │  (View 3)         │
 * └─────────────────┴──────────────────┘
 */

import type { ReactNode } from "react";

interface LayoutProps {
  provenanceView: ReactNode;
  timelineView: ReactNode;
  summaryPanel: ReactNode;
}

export function Layout({ provenanceView, timelineView, summaryPanel }: LayoutProps) {
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "Inter, system-ui, sans-serif", background: "#f8fafc" }}>
      {/* Left panel: Provenance Alignment View */}
      <div
        style={{
          flex: "0 0 45%",
          borderRight: "1px solid #e2e8f0",
          overflow: "auto",
          padding: "16px",
          background: "#ffffff",
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Provenance Alignment
        </h2>
        {provenanceView}
      </div>

      {/* Right panels: Timeline (top) + Summary (bottom) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top right: Trace Confidence Timeline */}
        <div
          style={{
            flex: "0 0 45%",
            borderBottom: "1px solid #e2e8f0",
            overflow: "auto",
            padding: "16px",
            background: "#ffffff",
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Trace Confidence Timeline
          </h2>
          {timelineView}
        </div>

        {/* Bottom right: Diagnostic Summary */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "16px",
            background: "#ffffff",
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Diagnostic Summary
          </h2>
          {summaryPanel}
        </div>
      </div>
    </div>
  );
}
