import React from "react";
import { CircleDot, Copy } from "lucide-react";
import type { AdmLevel } from "@/lib/fgb-loader";
import type { InteractiveMapFeatureProperties } from "@/lib/union-engine";
import type { HoveredVertexInfo } from "@/types/geovis";
import { getCapitalBadgeInfo } from "@/lib/capital-manager";

interface LeftHudInspectorProps {
  hoveredProps: InteractiveMapFeatureProperties | null;
  hoveredVertex: HoveredVertexInfo | null;
  zoom: number;
  effectiveAdmLevel: AdmLevel;
  activeProjectionName: string;
  cursorCoordsRef: React.RefObject<HTMLSpanElement | null>;
  isLoadingData: boolean;
  loadingMessage: string;
  isDevMode: boolean;
  showPolygonVertices: boolean;
  autoFixTopology: boolean;
  interactiveFeaturesCount: number;
  verticesCount: number;
  onCopyVertexDebugInfo: (v: HoveredVertexInfo) => void;
}

export function LeftHudInspector({
  hoveredProps,
  hoveredVertex,
  zoom,
  effectiveAdmLevel,
  activeProjectionName,
  cursorCoordsRef,
  isLoadingData,
  loadingMessage,
  isDevMode,
  showPolygonVertices,
  autoFixTopology,
  interactiveFeaturesCount,
  verticesCount,
  onCopyVertexDebugInfo,
}: LeftHudInspectorProps) {
  return (
    <aside className="pointer-events-none absolute top-20 left-3 z-10 flex w-80 flex-col gap-3">
      {/* Hover Region / Union Target Inspector Card */}
      <div className="pointer-events-auto rounded-2xl border border-slate-700/60 bg-slate-900/85 p-3.5 shadow-xl backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Hover / 區域資訊檢視
          </span>
          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-sky-300">
            Zoom {zoom.toFixed(1)} · {effectiveAdmLevel}
          </span>
        </div>

        {hoveredProps ? (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-bold text-white leading-tight">
                {hoveredProps.shapeName}
              </h2>
              <div className="flex items-center gap-1.5 shrink-0">
                {hoveredProps.isCapital && (() => {
                  const badge = getCapitalBadgeInfo(
                    hoveredProps.shapeGroup,
                    hoveredProps.shapeType,
                    hoveredProps.shapeName,
                    hoveredProps.shapeID
                  );
                  return (
                    <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/40 flex items-center gap-1">
                      <span>★</span>
                      <span>{badge?.label || "國家首都"}</span>
                    </span>
                  );
                })()}
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                    isDevMode && hoveredProps.unionMode === "dissolved"
                      ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                      : isDevMode && hoveredProps.unionMode === "grouped"
                        ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                        : "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/30"
                  }`}
                >
                  {isDevMode && hoveredProps.unionMode === "dissolved"
                    ? "幾何合併 (Dissolved)"
                    : isDevMode && hoveredProps.unionMode === "grouped"
                      ? "邏輯群組 (Grouped)"
                      : hoveredProps.shapeType}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              所屬國家:{" "}
              <span className="font-medium text-slate-100">
                {hoveredProps.adm0Name} ({hoveredProps.shapeGroup})
              </span>
            </p>

            {isDevMode && (
              <p className="font-mono text-[10px] text-emerald-300/90">
                ID: {hoveredProps.targetId} · Features:{" "}
                {interactiveFeaturesCount}
                {showPolygonVertices && ` · Points: ${verticesCount}`}
              </p>
            )}

            {isDevMode && hoveredProps.memberCount > 1 && (
              <div className="mt-2 rounded-lg bg-slate-950/70 p-2 text-[11px] text-slate-300 ring-1 ring-slate-800">
                <div className="font-semibold text-slate-200 mb-0.5">
                  包含 {hoveredProps.memberCount} 個成員區域：
                </div>
                <div className="line-clamp-3 text-slate-400">
                  {hoveredProps.memberNamesStr}
                </div>
              </div>
            )}

            {/* Dev Mode: Vertex Inspector Card */}
            {isDevMode && showPolygonVertices && hoveredVertex && (
              <div className="mt-2.5 rounded-xl border border-amber-500/50 bg-amber-950/20 p-2.5 ring-1 ring-amber-500/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <CircleDot className="h-3.5 w-3.5 text-amber-400" />
                    <span>頂點 #{hoveredVertex.vertexIdx}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCopyVertexDebugInfo(hoveredVertex)}
                    className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30 ring-1 ring-amber-500/40 transition cursor-pointer"
                    title="複製頂點 JSON 除錯資訊"
                  >
                    <Copy className="h-3 w-3" />
                    複製 JSON
                  </button>
                </div>

                <div className="mt-1.5 space-y-1 font-mono text-[10px] text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">序號 / 總點數:</span>
                    <span className="font-semibold text-white">
                      #{hoveredVertex.vertexIdx} / {hoveredVertex.ringVertexCount} 點
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">環類型:</span>
                    <span className={hoveredVertex.isHole ? "text-purple-300" : "text-sky-300"}>
                      {hoveredVertex.isHole ? `內環 Hole #${hoveredVertex.ringIdx}` : "外環 (Exterior)"}
                      {hoveredVertex.polyCount > 1 && ` (Part ${hoveredVertex.polyIdx + 1})`}
                    </span>
                  </div>
                  <div className="flex justify-between text-amber-300 font-semibold pt-1 border-t border-slate-800">
                    <span>WGS84 座標:</span>
                    <span>
                      [{hoveredVertex.rawLng.toFixed(5)}, {hoveredVertex.rawLat.toFixed(5)}]
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>前點 #{hoveredVertex.prevIdx}:</span>
                    <span>[{hoveredVertex.prevLng.toFixed(4)}, {hoveredVertex.prevLat.toFixed(4)}]</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>後點 #{hoveredVertex.nextIdx}:</span>
                    <span>[{hoveredVertex.nextLng.toFixed(4)}, {hoveredVertex.nextLat.toFixed(4)}]</span>
                  </div>
                  <div className="flex justify-between pt-0.5 border-t border-slate-800">
                    <span className="text-slate-400">間距:</span>
                    <span className={hoveredVertex.isAbnormalJump ? "font-bold text-rose-400" : "text-emerald-400"}>
                      {hoveredVertex.distToNextDeg.toFixed(4)}°
                      {hoveredVertex.isAbnormalJump && " ⚠️ 異常跨距"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-800 text-[10px]">
                    <span className="text-slate-400">拓撲修復:</span>
                    <span
                      className={
                        autoFixTopology
                          ? "text-emerald-400 font-semibold"
                          : "text-amber-400"
                      }
                    >
                      {autoFixTopology
                        ? "已啟用 (Auto-Untangled)"
                        : "已關閉 (原始幾何)"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-1 text-[10px] text-slate-400">
              {isDevMode
                ? "點擊選取 · Shift+點擊多選 · 按 ESC 或點擊海洋取消選取"
                : "點擊行政區下鑽展開 · 按 ESC 或點擊海洋取消選取"}
            </div>
          </div>
        ) : (
          <div className="py-3 text-xs text-slate-400">
            點擊地圖上的國家或行政區展開下鑽；滑鼠移至區域檢視資訊；按 ESC 或點擊海洋可取消所有選取狀態。
          </div>
        )}

        {/* Cursor coordinates & projection footer */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2 text-[11px] text-slate-400">
          <span>{activeProjectionName}</span>
          <span ref={cursorCoordsRef} className="font-mono text-slate-300">
            -- , --
          </span>
        </div>
      </div>

      {/* Loading status pill if active */}
      {isLoadingData && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-sky-500/40 bg-slate-900/90 px-3 py-2 text-xs text-sky-300 shadow-lg backdrop-blur-md">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          <span>{loadingMessage || "載入資料中..."}</span>
        </div>
      )}
    </aside>
  );
}
