"use client";

import React from "react";
import type maplibregl from "maplibre-gl";
import {
  GripHorizontal,
  Sliders,
  RotateCcw,
  X,
  Globe,
  Map as MapIcon,
  Check,
  Orbit,
  Sparkles,
  Info,
  CircleDot,
  Share2,
  Copy,
  Crown,
  Tag,
} from "lucide-react";
import {
  ALL_PROJECTIONS,
  type FlatProjectionId,
  type MapMode,
  type ProjectionModeId,
  unprojectLngLat,
} from "@/lib/projections";
import type { InteractionMode } from "@/types/geovis";

export interface OptionsWindowProps {
  optionsWindowRef: React.RefObject<HTMLDivElement | null>;
  windowPos: { x: number; y: number };
  onClearMapHover: () => void;
  hoveredTargetIdRef: React.MutableRefObject<string | null>;
  onHeaderPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onHeaderPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onHeaderPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  isDevMode: boolean;
  onResetWindowPos: () => void;
  onClose: () => void;
  currentProjectionId: ProjectionModeId;
  onSelectProjection: (id: ProjectionModeId) => void;
  showStarfield: boolean;
  setShowStarfield: React.Dispatch<React.SetStateAction<boolean>>;
  showStarLabels: boolean;
  setShowStarLabels: React.Dispatch<React.SetStateAction<boolean>>;
  showMilkyWay: boolean;
  setShowMilkyWay: React.Dispatch<React.SetStateAction<boolean>>;
  showAtmosphereGlow: boolean;
  setShowAtmosphereGlow: React.Dispatch<React.SetStateAction<boolean>>;
  showCapitals: boolean;
  setShowCapitals: React.Dispatch<React.SetStateAction<boolean>>;
  showIso3Labels: boolean;
  setShowIso3Labels: React.Dispatch<React.SetStateAction<boolean>>;
  selectedLabelDatasetId?: string;
  setSelectedLabelDatasetId?: (id: string) => void;
  mapMode: MapMode;
  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;
  autoFixTopology: boolean;
  setAutoFixTopology: React.Dispatch<React.SetStateAction<boolean>>;
  showPolygonVertices: boolean;
  setShowPolygonVertices: React.Dispatch<React.SetStateAction<boolean>>;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  flatProjection: FlatProjectionId;
  zoom: number;
  currentShareTargetString: string;
  onCopyShareUrl: () => void;
  copiedUrl: boolean;
}

export const OptionsWindow: React.FC<OptionsWindowProps> = ({
  optionsWindowRef,
  windowPos,
  onClearMapHover,
  hoveredTargetIdRef,
  onHeaderPointerDown,
  onHeaderPointerMove,
  onHeaderPointerUp,
  isDevMode,
  onResetWindowPos,
  onClose,
  currentProjectionId,
  onSelectProjection,
  showStarfield,
  setShowStarfield,
  showStarLabels,
  setShowStarLabels,
  showMilkyWay,
  setShowMilkyWay,
  showAtmosphereGlow,
  setShowAtmosphereGlow,
  showCapitals,
  setShowCapitals,
  showIso3Labels,
  setShowIso3Labels,
  selectedLabelDatasetId = "none",
  setSelectedLabelDatasetId,
  mapMode,
  interactionMode,
  setInteractionMode,
  autoFixTopology,
  setAutoFixTopology,
  showPolygonVertices,
  setShowPolygonVertices,
  mapRef,
  flatProjection,
  zoom,
  currentShareTargetString,
  onCopyShareUrl,
  copiedUrl,
}) => {
  return (
    <div
      ref={optionsWindowRef}
      style={{
        transform: `translate3d(${windowPos.x}px, ${windowPos.y}px, 0)`,
        left: 0,
        top: 0,
        willChange: "transform",
      }}
      onMouseEnter={onClearMapHover}
      onMouseMove={(e) => {
        e.stopPropagation();
        if (hoveredTargetIdRef.current) {
          onClearMapHover();
        }
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onWheel={(e) => {
        e.stopPropagation();
      }}
      className="pointer-events-auto absolute z-40 w-96 flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl animate-in fade-in duration-150"
    >
      {/* Window Header (Draggable) */}
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
        onDragStart={(e) => e.preventDefault()}
        className="flex cursor-move select-none items-center justify-between border-b border-slate-800 bg-slate-950/80 px-3.5 py-2.5 touch-none"
      >
        <div className="flex items-center gap-2 pointer-events-none select-none">
          <GripHorizontal className="h-4 w-4 text-slate-500" />
          <div className="flex items-center gap-1.5 font-bold text-xs text-white">
            <Sliders className="h-3.5 w-3.5 text-sky-400" />
            <span>選項視窗 (Options)</span>
          </div>
          <span className="rounded bg-sky-950/80 px-1.5 py-0.5 font-mono text-[9px] text-sky-300 border border-sky-800/60">
            Window
          </span>
          {isDevMode && (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300 border border-emerald-500/40">
              DEV
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onResetWindowPos}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            title="重設視窗位置至左上角"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition"
            title="關閉視窗 (ESC)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Window Body (Scrollable options container) */}
      <div className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto p-4 text-xs text-slate-200">
        {/* Group 1: 投影與視角設定 (單一列表選擇 3D 與各投影法) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span>投影與視角設定</span>
            <span className="font-mono text-[9px] text-slate-500">Projections & 3D</span>
          </div>

          <div className="space-y-1.5 rounded-xl bg-slate-950/60 p-2 ring-1 ring-slate-800">
            {ALL_PROJECTIONS.map((proj) => {
              const active = currentProjectionId === proj.id;
              return (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => onSelectProjection(proj.id)}
                  className={`flex w-full items-center justify-between rounded-lg p-2 text-left transition ${
                    active
                      ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/50 shadow-sm"
                      : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`mt-0.5 rounded-md p-1.5 ${
                        active
                          ? "bg-sky-500 text-slate-950 font-bold"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {proj.id === "globe" ? (
                        <Globe className="h-4 w-4" />
                      ) : (
                        <MapIcon className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-semibold ${
                            active ? "text-white" : "text-slate-200"
                          }`}
                        >
                          {proj.name}
                        </span>
                        {proj.is3D && (
                          <span className="rounded bg-sky-950 px-1 py-0.2 font-mono text-[9px] font-bold text-sky-300 border border-sky-800/80">
                            預設 3D
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                        {proj.description}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center pl-2">
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        active
                          ? "border-sky-400 bg-sky-500 text-slate-950"
                          : "border-slate-700 bg-slate-900"
                      }`}
                    >
                      {active && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Group 2: 3D 宇宙星空設定 (Cosmic Starfield & Celestial Sphere) */}
        <div className="space-y-2 border-t border-slate-800/80 pt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <div className="flex items-center gap-1.5">
              <Orbit className="h-3.5 w-3.5 text-indigo-400" />
              <span>3D 宇宙星空背景</span>
            </div>
            <span className="font-mono text-[9px] text-indigo-400">Celestial 3D</span>
          </div>

          {/* Master Toggle: 3D 宇宙星空開關 */}
          <div className="flex items-center justify-between rounded-xl bg-slate-950/60 p-2.5 ring-1 ring-slate-800">
            <div className="pr-2">
              <div className="flex items-center gap-1.5 font-medium text-slate-200">
                <span>真實天文星空</span>
                <span className="rounded bg-indigo-950 px-1 py-0.2 font-mono text-[9px] text-indigo-300 border border-indigo-800/80">
                  BSC5 / Hipparcos
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                還原 120+ 顆亮星真實座標、光譜色溫、視星等與 8,500+ 細密帶狀銀河星塵微閃
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowStarfield((v) => !v)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition active:scale-95 cursor-pointer ${
                showStarfield
                  ? "bg-indigo-500 text-slate-950 shadow-md shadow-indigo-500/20"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {showStarfield ? "已開啟 ON" : "已關閉 OFF"}
            </button>
          </div>

          {/* Sub-options when Starfield is enabled */}
          {showStarfield && (
            <div className="space-y-2 rounded-xl border border-indigo-900/40 bg-indigo-950/20 p-2.5">
              {/* Sub-toggle: 恆星名稱與星座連線 */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-medium text-slate-200">
                    恆星名稱與導航星座
                  </div>
                  <div className="text-[9px] text-slate-400">
                    天狼星、老人星、織女星、獵戶座、北斗七星
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStarLabels((v) => !v)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                    showStarLabels
                      ? "bg-indigo-500/30 text-indigo-200 ring-1 ring-indigo-400/50"
                      : "bg-slate-800/80 text-slate-400 hover:text-white"
                  }`}
                >
                  {showStarLabels ? "顯示 ON" : "隱藏 OFF"}
                </button>
              </div>

              {/* Sub-toggle: 銀河系星雲塵埃帶 */}
              <div className="flex items-center justify-between border-t border-indigo-900/30 pt-2">
                <div>
                  <div className="text-[11px] font-medium text-slate-200">
                    銀河細密星塵帶 (Milky Way)
                  </div>
                  <div className="text-[9px] text-slate-400">
                    7,300+ 顆微恆星構成之連貫帶狀星河與大裂縫暗星雲
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMilkyWay((v) => !v)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                    showMilkyWay ? "開啟 ON" : "關閉 OFF"}
                `}
                >
                  {showMilkyWay ? "開啟 ON" : "關閉 OFF"}
                </button>
              </div>

              {/* Sub-toggle: 地球大氣藍色輝光 */}
              <div className="flex items-center justify-between border-t border-indigo-900/30 pt-2">
                <div>
                  <div className="text-[11px] font-medium text-slate-200">
                    地球大氣邊緣光暈 (Atmosphere)
                  </div>
                  <div className="text-[9px] text-slate-400">
                    雷利散射 (Rayleigh scattering) 地平線藍色大氣光暈
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAtmosphereGlow((v) => !v)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition cursor-pointer ${
                    showAtmosphereGlow ? "開啟 ON" : "關閉 OFF"}
                `}
                >
                  {showAtmosphereGlow ? "開啟 ON" : "關閉 OFF"}
                </button>
              </div>
            </div>
          )}

          {/* Informative notice when current mode is 2D projection */}
          {mapMode !== "globe" && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-950/40 px-2.5 py-1.5 text-[10px] text-amber-300/90 ring-1 ring-amber-800/50">
              <Info className="h-3 w-3 shrink-0 text-amber-400" />
              <span>3D 宇宙星空僅在 3D 地球視角下渲染 (目前為 2D 投影)</span>
            </div>
          )}
        </div>

        {/* Group: 行政區與地圖標示 (Administrative & Map Display) */}
        <div className="space-y-2 border-t border-slate-800/80 pt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-sky-400" />
              <span>行政區與地圖標示</span>
            </div>
            <span className="font-mono text-[9px] text-sky-400">Labels & Admin</span>
          </div>

          {/* 區塊：區域與地圖標示 (Labels) */}
          <div className="rounded-xl bg-slate-950/60 p-2.5 ring-1 ring-slate-800 space-y-2.5">
            {/* Toggle: 是否顯示 ISO3 代碼 */}
            <div className="flex items-center justify-between">
              <div className="pr-2">
                <div className="flex items-center gap-1.5 font-medium text-slate-200">
                  <span className="text-slate-400 font-mono text-xs">›</span>
                  <span>是否顯示 ISO3 代碼</span>
                  <span className="rounded bg-sky-950/80 px-1.5 py-0.5 font-mono text-[9px] font-bold text-sky-300 border border-sky-800/80">
                    ISO3 Code
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                  對所有層級行政區顯示代碼；若開啟的 CSV Label 已指向該處則由 CSV 優先
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowIso3Labels((v) => !v);
                  mapRef.current?.triggerRepaint();
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition active:scale-95 cursor-pointer ${
                  showIso3Labels
                    ? "bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Tag className="h-3.5 w-3.5" />
                {showIso3Labels ? "已開啟 ON" : "已關閉 OFF"}
              </button>
            </div>

            {/* Selector: Label 列表 (from csv...) */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                  <span className="text-slate-400 font-mono text-[11px]">v</span>
                  <span>Label 列表</span>
                  <span className="text-[10px] text-slate-400 font-mono">(from csv...)</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLabelDatasetId?.("none");
                    mapRef.current?.triggerRepaint();
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition cursor-pointer ${
                    selectedLabelDatasetId === "none"
                      ? "bg-sky-600 text-white font-bold shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  <span>🚫</span>
                  <span>無 (None)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLabelDatasetId?.("flags");
                    mapRef.current?.triggerRepaint();
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition cursor-pointer ${
                    selectedLabelDatasetId === "flags"
                      ? "bg-sky-600 text-white font-bold shadow-sm"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  <span>🏳️</span>
                  <span>國旗 (flags.csv)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Toggle: 國家首都高亮標示 */}
          <div className="flex items-center justify-between rounded-xl bg-slate-950/60 p-2.5 ring-1 ring-slate-800">
            <div className="pr-2">
              <div className="flex items-center gap-1.5 font-medium text-slate-200">
                <span>國家首都高亮標示</span>
                <span className="rounded bg-amber-950/80 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300 border border-amber-800/80 flex items-center gap-1">
                  <span>★</span>
                  <span>Capital</span>
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                選取國家時以金黃色特別標示首都或首都所屬行政區（並於 HUD 顯示首都標籤）
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCapitals((v) => !v)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition active:scale-95 cursor-pointer ${
                showCapitals
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Crown className="h-3.5 w-3.5" />
              {showCapitals ? "已開啟 ON" : "已關閉 OFF"}
            </button>
          </div>
        </div>

        {/* Group 3: 互動模式 (Dev Mode Only) */}
        {isDevMode && (
          <div className="space-y-2 border-t border-slate-800/80 pt-3">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
              <div className="flex items-center gap-1.5">
                <span>互動下鑽模式</span>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300 ring-1 ring-emerald-500/40">
                  DEV
                </span>
              </div>
              <span className="font-mono text-[9px] text-slate-500">InteractionMode</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-950/60 p-1.5 ring-1 ring-slate-800">
              <button
                type="button"
                onClick={() => setInteractionMode("wide-click")}
                className={`rounded-lg px-2.5 py-1.5 text-left transition ${
                  interactionMode === "wide-click"
                    ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50 font-semibold"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <div className="text-[11px]">點擊下鑽 (廣域)</div>
                <div className="text-[9px] text-slate-500">預設推薦模式</div>
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode("local-click")}
                className={`rounded-lg px-2.5 py-1.5 text-left transition ${
                  interactionMode === "local-click"
                    ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50 font-semibold"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <div className="text-[11px]">點擊下鑽 (局部)</div>
                <div className="text-[9px] text-slate-500">僅展開點擊行政區</div>
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode("wide-hover")}
                className={`rounded-lg px-2.5 py-1.5 text-left transition ${
                  interactionMode === "wide-hover"
                    ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50 font-semibold"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <div className="text-[11px]">懸停下鑽 (廣域)</div>
                <div className="text-[9px] text-slate-500">滑鼠移入即展開</div>
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode("local-hover")}
                className={`rounded-lg px-2.5 py-1.5 text-left transition ${
                  interactionMode === "local-hover"
                    ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50 font-semibold"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <div className="text-[11px]">懸停下鑽 (局部)</div>
                <div className="text-[9px] text-slate-500">僅展開懸停行政區</div>
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode("zoom")}
                className={`rounded-lg px-2.5 py-1.5 text-left transition ${
                  interactionMode === "zoom"
                    ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50 font-semibold"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <div className="text-[11px]">縮放模式</div>
                <div className="text-[9px] text-slate-500">隨地圖倍率自動切換</div>
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode("manual")}
                className={`rounded-lg px-2.5 py-1.5 text-left transition ${
                  interactionMode === "manual"
                    ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50 font-semibold"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <div className="text-[11px]">手動模式</div>
                <div className="text-[9px] text-slate-500">自由切換 ADM 級別</div>
              </button>
            </div>
          </div>
        )}

        {/* Group 3: 幾何與拓撲修復 (Dev Mode Only) */}
        {isDevMode && (
          <div className="space-y-2 border-t border-slate-800/80 pt-3">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
              <div className="flex items-center gap-1.5">
                <span>幾何與拓撲控制</span>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300 ring-1 ring-emerald-500/40">
                  DEV
                </span>
              </div>
              <span className="font-mono text-[9px] text-slate-500">Topology</span>
            </div>

            {/* Toggle Auto-Fix Topology */}
            <div className="flex items-center justify-between rounded-xl bg-slate-950/60 p-2.5 ring-1 ring-slate-800">
              <div>
                <div className="font-medium text-slate-200">
                  拓撲自動解結 (Auto-Untangler)
                </div>
                <div className="text-[10px] text-slate-400">
                  自動修復邊界自相交與反折 (如格陵蘭 #5599)
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutoFixTopology((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  autoFixTopology
                    ? "bg-emerald-500 text-slate-950 font-semibold"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                {autoFixTopology ? "已啟用 ON" : "關閉 OFF"}
              </button>
            </div>

            {/* Toggle Polygon Vertices */}
            <div className="flex items-center justify-between rounded-xl bg-slate-950/60 p-2.5 ring-1 ring-slate-800">
              <div>
                <div className="font-medium text-slate-200">
                  選取邊界頂點顯示 (Point Layer)
                </div>
                <div className="text-[10px] text-slate-400">
                  顯示所選區域之幾何頂點，供懸停檢視與除錯
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPolygonVertices((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  showPolygonVertices
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <CircleDot className="h-3 w-3" />
                {showPolygonVertices ? "顯示 ON" : "隱藏 OFF"}
              </button>
            </div>
          </div>
        )}

        {/* Group 4: URL 參數與分享連結 (URL Parameters & Share) */}
        <div className="space-y-2 border-t border-slate-800/80 pt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <div className="flex items-center gap-1.5">
              <Share2 className="h-3.5 w-3.5 text-sky-400" />
              <span>URL 參數與分享連結</span>
            </div>
            <span className="font-mono text-[9px] text-sky-400">URL Init</span>
          </div>

          <div className="rounded-xl bg-slate-950/60 p-3 ring-1 ring-slate-800 space-y-2.5">
            <div className="text-[11px] text-slate-300 leading-relaxed">
              支援從網址快速初始化投影模式、經緯度視角與目標行政區選取：
            </div>
            <div className="space-y-1 font-mono text-[10px] text-slate-400 bg-slate-900/90 p-2 rounded-lg border border-slate-800">
              <div>
                <span className="text-sky-300">proj</span>=
                <span className="text-amber-300">{currentProjectionId}</span>
              </div>
              <div>
                <span className="text-sky-300">lat</span>=
                <span className="text-emerald-300">
                  {mapRef.current
                    ? (
                        unprojectLngLat(
                          mapRef.current.getCenter().lng,
                          mapRef.current.getCenter().lat,
                          mapMode,
                          flatProjection
                        )?.[1] ?? mapRef.current.getCenter().lat
                      ).toFixed(4)
                    : "20.0000"}
                </span>
                &nbsp;
                <span className="text-sky-300">lon</span>=
                <span className="text-emerald-300">
                  {mapRef.current
                    ? (
                        unprojectLngLat(
                          mapRef.current.getCenter().lng,
                          mapRef.current.getCenter().lat,
                          mapMode,
                          flatProjection
                        )?.[0] ?? mapRef.current.getCenter().lng
                      ).toFixed(4)
                    : "15.0000"}
                </span>
                &nbsp;
                <span className="text-sky-300">ratio</span>=
                <span className="text-emerald-300">
                  {zoom.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-sky-300">target</span>=
                <span className="text-indigo-300">
                  {currentShareTargetString || "(無選取目標)"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onCopyShareUrl}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500/20 py-2 text-xs font-semibold text-sky-300 ring-1 ring-sky-500/40 hover:bg-sky-500/30 transition cursor-pointer"
            >
              {copiedUrl ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400 stroke-[2.5]" />
                  <span className="text-emerald-300">已複製完整 URL 連結至剪貼簿！</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>複製目前視角與目標狀態之 URL</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Window Footer */}
      <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/60 px-4 py-2.5 text-[11px]">
        <span className="text-slate-500 text-[10px]">
          按住標題列可拖曳移動 · 按 ESC 或右上角關閉
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-800 px-3 py-1 font-medium text-slate-200 hover:bg-slate-700 transition"
        >
          完成
        </button>
      </div>
    </div>
  );
};
