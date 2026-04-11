/**
 * Loads execution trace and diagnoses from static JSON fixtures.
 *
 * For the vertical slice (M2), this fetches directly from /data/ in the
 * public directory. In M4+, this will be replaced with FastAPI calls.
 */

import { useState, useEffect } from "react";
import type { ExecutionTrace } from "../types/trace";
import type { Diagnosis } from "../types/diagnosis";

interface TraceData {
  trace: ExecutionTrace | null;
  diagnoses: Diagnosis[];
  loading: boolean;
  error: string | null;
}

export function useTraceData(): TraceData {
  const [state, setState] = useState<TraceData>({
    trace: null,
    diagnoses: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function load() {
      try {
        const [traceRes, correctionsRes] = await Promise.all([
          fetch("/data/sf_trip_hallucinated.json"),
          fetch("/data/trace-sf-hallucinated-001.json"),
        ]);

        if (!traceRes.ok) throw new Error("Failed to load trace data");
        if (!correctionsRes.ok) throw new Error("Failed to load corrections");

        const trace: ExecutionTrace = await traceRes.json();
        const corrections = await correctionsRes.json();

        // Convert correction entries to Diagnosis objects
        const diagnoses: Diagnosis[] = (
          corrections.expected_diagnoses ?? []
        ).map((d: Record<string, unknown>) => {
          const claim = trace.claims.find(
            (c) => c.claim_id === d.claim_id
          );
          return {
            ...d,
            claim: claim ?? { claim_id: d.claim_id, text: "Unknown claim", source_step_ids: [], claim_type: "general", extracted_entities: {} },
          } as Diagnosis;
        });

        setState({ trace, diagnoses, loading: false, error: null });
      } catch (err) {
        setState({
          trace: null,
          diagnoses: [],
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    load();
  }, []);

  return state;
}
