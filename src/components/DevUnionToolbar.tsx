import React from "react";
import {
  CheckSquare,
  ChevronRight,
  CircleDot,
  Combine,
  GitMerge,
  RefreshCw,
  Sparkles,
  Square,
  Terminal,
  Ungroup,
  ZoomIn,
} from "lucide-react";
import type { AdmLevel } from "@/lib/fgb-loader";
import type { UnionCycleState } from "@/lib/union-engine";
import type { SelectionAnalysisResult } from "@/types/geovis";

interface DevUnionToolbarProps {
  isDevMode: boolean;
  multiSelectMode: boolean;
  setMultiSelectMode: React.Dispatch<React.SetStateAction<boolean>>;
  showPolygonVertices: boolean;
  setShowPolygonVertices: React.Dispatch<React.SetStateAction<boolean>>;
  verticesCount: number;
  autoFixTopology: boolean;
  setAutoFixTopology: React.Dispatch<React.SetStateAction<boolean>>;
  canCycleUnion: boolean;
  onCycleUnionState: (forced?: UnionCycleState) => void;
  selectionAnalysis: SelectionAnalysisResult;
  effectiveAdmLevel: AdmLevel;
  onDrillDown: (sgs: string[], targetLevel?: AdmLevel) => void;
  selectedTargetIdsCount: number;
  onClearSelection: () => void;
}

export function DevUnionToolbar({
  isDevMode,
  multiSelectMode,
  setMultiSelectMode,
  showPolygonVertices,
  setShowPolygonVertices,
  verticesCount,
  autoFixTopology,
  setAutoFixTopology,
  canCycleUnion,
  onCycleUnionState,
  selectionAnalysis,
  effectiveAdmLevel,
  onDrillDown,
  selectedTargetIdsCount,
  onClearSelection,
}: DevUnionToolbarProps) {
  if (!isDevMode) return null;

  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
      <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/40 bg-slate-900/90 px-4 py-3 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-mono font-bold text-emerald-300 ring-1 ring-emerald-500/30">
            <Terminal className="h-3 w-3" />
            DEV UNION
          </span>

          {/* Multi-select mode toggle */}
          <button
            type="button"
            onClick={() => setMultiSelectMode((m) => !m)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              multiSelectMode
                ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
            title="開啟後直接點選多個區域即可累加選取 (或按住 Shift 點擊)"
          >
            {multiSelectMode ? (
              <CheckSquare className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <Square className="h-3.5 w-3.5 text-slate-400" />
            )}
            多選模式 {multiSelectMode ? "ON" : "OFF (或 Shift+Click)"}
          </button>

          {/* Polygon Vertices (Point) toggle */}
          <button
            type="button"
            onClick={() => setShowPolygonVertices((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              showPolygonVertices
                ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50 shadow-sm"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
            title="開啟/關閉所有多邊形幾何頂點 (Polygon Point) 顯示 (快捷鍵 P)"
          >
            <CircleDot className="h-3.5 w-3.5 text-sky-400" />
            <span>
              頂點 Point {showPolygonVertices ? "ON" : "OFF"}
              {showPolygonVertices && ` (${verticesCount} 點)`}
            </span>
          </button>

          {/* Dev Mode: Auto-Fix Geometry Topology Toggle */}
          <button
            type="button"
            onClick={() => setAutoFixTopology((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
              autoFixTopology
                ? "bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-500/50 shadow-sm"
                : "bg-slate-950/80 text-slate-400 hover:text-slate-200 ring-1 ring-slate-800"
            }`}
            title="自動修復邊界自相交與反折 (Auto-Fix Topology / Untangler) (快捷鍵 T)"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>拓撲修復 {autoFixTopology ? "ON" : "OFF"}</span>
          </button>

          <div className="h-5 w-px bg-slate-700/70" />

          {/* 3-State Union Cycle Indicator & Direct Switcher: [Separated -> Grouped -> Dissolved -> Separated] */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-950/90 p-1 ring-1 ring-slate-800">
            <button
              type="button"
              disabled={!canCycleUnion}
              onClick={() => onCycleUnionState("separated")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition cursor-pointer ${
                selectionAnalysis.cycleState === "separated" && canCycleUnion
                  ? "bg-slate-700 text-white font-semibold"
                  : "text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              <Ungroup className="h-3.5 w-3.5" />
              1. Separated (獨立)
            </button>

            <ChevronRight className="h-3 w-3 text-slate-600" />

            <button
              type="button"
              disabled={!canCycleUnion}
              onClick={() => onCycleUnionState("grouped")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition cursor-pointer ${
                selectionAnalysis.cycleState === "grouped"
                  ? "bg-emerald-500 text-slate-950 font-semibold shadow-sm"
                  : "text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              <Combine className="h-3.5 w-3.5" />
              2. Grouped (邏輯群組連動)
            </button>

            <ChevronRight className="h-3 w-3 text-slate-600" />

            <button
              type="button"
              disabled={!canCycleUnion}
              onClick={() => onCycleUnionState("dissolved")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition cursor-pointer ${
                selectionAnalysis.cycleState === "dissolved"
                  ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                  : "text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              <GitMerge className="h-3.5 w-3.5" />
              3. Dissolved (幾何合併消界)
            </button>
          </div>

          {/* One-Click Cycle Loop Button */}
          <button
            type="button"
            disabled={!canCycleUnion}
            onClick={() => onCycleUnionState()}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:from-sky-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
            title="快捷鍵 U：在 [Grouped 邏輯群組 -> Dissolved 幾何合併 -> Separated 獨立] 之間循環切換"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            循環切換狀態 (快捷鍵 U)
          </button>
        </div>

        {/* Selection status helper line */}
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span>
            已選取:{" "}
            <strong className="text-sky-300">
              {selectionAnalysis.resolvedMemberIds.length}
            </strong>{" "}
            個區域
            {selectionAnalysis.activeGroup && (
              <span className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-amber-300">
                目前為{" "}
                {selectionAnalysis.cycleState === "grouped"
                  ? "邏輯群組 (保留內界、同步高亮)"
                  : "幾何合併 (Polygon Union 消除內界)"}
              </span>
            )}
          </span>

          {selectionAnalysis.resolvedFeatures.length > 0 &&
            effectiveAdmLevel !== "ADM2" && (
              <button
                type="button"
                onClick={() => {
                  const sgs = selectionAnalysis.resolvedFeatures.map(
                    (f) => f.properties.shapeGroup
                  );
                  onDrillDown(
                    sgs,
                    effectiveAdmLevel === "ADM0" ? "ADM1" : "ADM2"
                  );
                }}
                className="flex items-center gap-1 rounded-md bg-sky-500/20 px-2 py-0.5 text-sky-300 ring-1 ring-sky-500/40 hover:bg-sky-500/30 cursor-pointer"
              >
                <ZoomIn className="h-3 w-3" />
                下鑽所選區域至{" "}
                {effectiveAdmLevel === "ADM0" ? "ADM1" : "ADM2"}
              </button>
            )}

          {selectedTargetIdsCount > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-slate-400 underline hover:text-slate-200 cursor-pointer"
            >
              取消選取
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
