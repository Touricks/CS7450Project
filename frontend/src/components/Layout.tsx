/**
 * Vertical two-panel layout:
 *
 * ┌──────────────────────────────────┐
 * │  Diagnostic Summary              │
 * ├──────────────────────────────────┤
 * │  Pipeline Flow                   │
 * │  (scrollable)                    │
 * └──────────────────────────────────┘
 */

import type { ReactNode } from "react";

interface LayoutProps {
  provenanceView: ReactNode;
  summaryPanel: ReactNode;
}

export function Layout({ provenanceView, summaryPanel }: LayoutProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Inter, system-ui, sans-serif", background: "#ffffff" }}>
      {/* Top: Pipeline Flow */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 20px",
          minHeight: 0,
        }}
      >
        <h2 style={{ margin: "0 0 10px", fontSize: "14px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Pipeline Flow
        </h2>
        {provenanceView}
      </div>

      {/* Bottom: Diagnostic Summary */}
      <div
        style={{
          flex: "0 0 280px",
          borderTop: "1px solid #e2e8f0",
          overflow: "auto",
          padding: "16px 20px",
          minHeight: 0,
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Diagnostic Summary
        </h2>
        {summaryPanel}
      </div>
    </div>
  );
}
