/**
 * Cross-view coordination context.
 *
 * When a user clicks a claim in the Provenance view or a card in the
 * Diagnostic Summary, this context propagates the selection to all
 * three views so they can highlight the corresponding elements.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SelectionState {
  /** Currently selected claim ID (or null) */
  selectedClaimId: string | null;
  /** Currently selected diagnosis ID (or null) */
  selectedDiagnosisId: string | null;
  /** Trace step IDs to highlight (causal chain of selected diagnosis) */
  highlightedStepIds: number[];
  /** Hovered step ID for timeline hover effects */
  hoveredStepId: number | null;
}

interface SelectionActions {
  selectClaim: (claimId: string | null) => void;
  selectDiagnosis: (diagnosisId: string | null, causalChain?: number[]) => void;
  hoverStep: (stepId: number | null) => void;
  clearSelection: () => void;
}

type SelectionContextType = SelectionState & SelectionActions;

const SelectionContext = createContext<SelectionContextType | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SelectionState>({
    selectedClaimId: null,
    selectedDiagnosisId: null,
    highlightedStepIds: [],
    hoveredStepId: null,
  });

  const selectClaim = useCallback((claimId: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedClaimId: claimId,
      selectedDiagnosisId: null,
    }));
  }, []);

  const selectDiagnosis = useCallback(
    (diagnosisId: string | null, causalChain: number[] = []) => {
      setState((prev) => ({
        ...prev,
        selectedDiagnosisId: diagnosisId,
        highlightedStepIds: causalChain,
      }));
    },
    []
  );

  const hoverStep = useCallback((stepId: number | null) => {
    setState((prev) => ({ ...prev, hoveredStepId: stepId }));
  }, []);

  const clearSelection = useCallback(() => {
    setState({
      selectedClaimId: null,
      selectedDiagnosisId: null,
      highlightedStepIds: [],
      hoveredStepId: null,
    });
  }, []);

  return (
    <SelectionContext.Provider
      value={{ ...state, selectClaim, selectDiagnosis, hoverStep, clearSelection }}
    >
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
  return ctx;
}
