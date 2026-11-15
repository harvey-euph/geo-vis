import React from "react";
import { Check, Sparkles } from "lucide-react";
import type { HoveredVertexInfo } from "@/types/geovis";

interface VertexTooltipProps {
  isDevMode: boolean;
  showPolygonVertices: boolean;
  hoveredVertex: HoveredVertexInfo | null;
  copiedVertexNotice: string | null;
  autoFixTopology: boolean;
}

export function VertexTooltip({
  isDevMode,
  showPolygonVertices,
  hoveredVertex,
  copiedVertexNotice,
  autoFixTopology,
}: VertexTooltipProps) {
  return (
    <>
      {/* Toast Notice: Copied Vertex Info */}
      {copiedVertexNotice && (
        <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-emerald-500/60 bg-slate-950/95 px-4 py-2.5 text-xs font-semibold text-emerald-300 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{copiedVertexNotice}</span>
        </div>
      )}

      {/* Floating Vertex Info Tooltip on Hover */}
      {isDevMode && showPolygonVertices && hoveredVertex && (
        <div
          style={{
            left: Math.min(
              hoveredVertex.screenX + 16,
              (typeof window !== "undefined" ? window.innerWidth : 1200) - 340
            ),
            top: Math.max(
              16,
              Math.min(
                hoveredVertex.screenY - 20,
                (typeof window !== "undefined" ? window.innerHeight : 800) - 320
              )
            ),
          }}
          className="pointer-events-none absolute z-40 w-80 rounded-xl border border-sky-400/50 bg-slate-950/95 p-3.5 shadow-2xl backdrop-blur-md"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              <span className="font-mono text-xs font-bold text-amber-300">
                頂點 #{hoveredVertex.vertexIdx}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                / 共 {hoveredVertex.ringVertexCount} 點
              </span>
            </div>
            <div className="flex items-center gap-1">
              {hoveredVertex.polyCount > 1 && (
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                  Part {hoveredVertex.polyIdx + 1}/{hoveredVertex.polyCount}
                </span>
              )}
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  hoveredVertex.isHole
                    ? "bg-purple-950/80 text-purple-300 border border-purple-800/60"
                    : "bg-sky-950/80 text-sky-300 border border-sky-800/60"
                }`}
              >
                {hoveredVertex.isHole
                  ? `內環 Hole #${hoveredVertex.ringIdx}`
                  : "外環 Exterior"}
              </span>
            </div>
          </div>

          {/* Region Info */}
          <div className="text-xs font-semibold text-white mb-2 truncate">
            {hoveredVertex.shapeName}{" "}
            <span className="font-mono text-[11px] text-slate-400">
              ({hoveredVertex.shapeID}) · {hoveredVertex.shapeType}
            </span>
          </div>

          {/* Coordinates & Neighbors */}
          <div className="space-y-1.5 rounded-lg bg-slate-900/80 p-2 font-mono text-[11px] text-slate-300 border border-slate-800/60">
            <div className="flex justify-between items-center text-sky-300 font-semibold">
              <span>WGS84 座標:</span>
              <span>
                [{hoveredVertex.rawLng.toFixed(6)}, {hoveredVertex.rawLat.toFixed(6)}]
              </span>
            </div>
            <div className="flex justify-between text-slate-400 text-[10px]">
              <span>上一點 #{hoveredVertex.prevIdx}:</span>
              <span>
                [{hoveredVertex.prevLng.toFixed(4)}, {hoveredVertex.prevLat.toFixed(4)}]
              </span>
            </div>
            <div className="flex justify-between text-slate-400 text-[10px]">
              <span>下一點 #{hoveredVertex.nextIdx}:</span>
              <span>
                [{hoveredVertex.nextLng.toFixed(4)}, {hoveredVertex.nextLat.toFixed(4)}]
              </span>
            </div>
            <div className="flex justify-between text-slate-400 text-[10px] pt-1 border-t border-slate-800/80">
              <span>至下一點跨距:</span>
              <span
                className={`font-semibold ${
                  hoveredVertex.isAbnormalJump
                    ? "text-rose-400 font-bold"
                    : "text-emerald-400"
                }`}
              >
                {hoveredVertex.distToNextDeg.toFixed(4)}°
                {hoveredVertex.isAbnormalJump && " ⚠️ 異常跨距"}
              </span>
            </div>
          </div>

          {/* Abnormal jump banner */}
          {hoveredVertex.isAbnormalJump && (
            <div className="mt-2 rounded-md bg-rose-950/80 border border-rose-600/50 p-1.5 text-[10px] text-rose-200">
              ⚠️ 幾何折線跳點跨度達 {hoveredVertex.distToNextDeg.toFixed(2)}°，可能為破面或跨經度連接錯誤！
            </div>
          )}

          {/* Topology Status */}
          <div className="mt-2 flex items-center justify-between text-[10px] border-t border-slate-800/80 pt-1.5">
            <div className="flex items-center gap-1 font-medium text-emerald-400">
              <Sparkles className="h-3 w-3" />
              <span>
                拓撲修復:{" "}
                {autoFixTopology
                  ? "已啟用 (Auto-Untangled)"
                  : "已關閉 (原始幾何)"}
              </span>
            </div>
            <span className="font-mono text-[9px] text-slate-500">快捷鍵 T</span>
          </div>

          {/* Click to copy prompt */}
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
            <span className="text-amber-400 font-medium">💡 點擊頂點複製 JSON 除錯資訊</span>
            <span className="font-mono text-[9px] text-slate-500">Click to copy</span>
          </div>
        </div>
      )}
    </>
  );
}
