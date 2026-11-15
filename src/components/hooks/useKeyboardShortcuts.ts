import { useEffect } from "react";

interface UseKeyboardShortcutsOptions {
  isDevMode: boolean;
  showOptionsWindowRef: React.RefObject<boolean>;
  setShowOptionsWindow: (show: boolean) => void;
  clearAllSelection: () => void;
  setShowPolygonVertices: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoFixTopology: React.Dispatch<React.SetStateAction<boolean>>;
  canCycleUnion: boolean;
  onCycleUnionState: () => void;
}

export function useKeyboardShortcuts({
  isDevMode,
  showOptionsWindowRef,
  setShowOptionsWindow,
  clearAllSelection,
  setShowPolygonVertices,
  setAutoFixTopology,
  canCycleUnion,
  onCycleUnionState,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (showOptionsWindowRef.current) {
          setShowOptionsWindow(false);
          return;
        }
        clearAllSelection();
        return;
      }

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (isDevMode && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        setShowPolygonVertices((v) => !v);
        return;
      }

      if (isDevMode && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        setAutoFixTopology((v) => !v);
        return;
      }

      if (isDevMode && (e.key === "u" || e.key === "U")) {
        if (canCycleUnion) {
          e.preventDefault();
          onCycleUnionState();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    clearAllSelection,
    isDevMode,
    canCycleUnion,
    onCycleUnionState,
    setShowOptionsWindow,
    setShowPolygonVertices,
    setAutoFixTopology,
    showOptionsWindowRef,
  ]);
}
