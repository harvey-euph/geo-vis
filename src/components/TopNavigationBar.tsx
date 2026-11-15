"use client";

import React from "react";
import type maplibregl from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import {
  Compass,
  Terminal,
  Layers,
  Sparkles,
  MousePointerClick,
  ZoomIn,
  Sliders,
  CircleDot,
  Pin,
  X,
  ChevronRight,
  Search,
} from "lucide-react";
import type { CountryMeta, AdminFeature, AdmLevel } from "@/lib/fgb-loader";
import type { DrilldownTarget, InteractionMode } from "@/types/geovis";

export interface TopNavigationBarProps {
  showOptionsWindow: boolean;
  setShowOptionsWindow: React.Dispatch<React.SetStateAction<boolean>>;
  isDevMode: boolean;
  interactionMode: InteractionMode;
  setInteractionMode: React.Dispatch<React.SetStateAction<InteractionMode>>;
  setHoverDrilldown: React.Dispatch<React.SetStateAction<DrilldownTarget | null>>;
  manualAdmLevel: "ADM0" | "ADM1" | "ADM2";
  setManualAdmLevel: (lvl: "ADM0" | "ADM1" | "ADM2") => void;
  effectiveAdmLevel: string;
  zoom: number;
  showPolygonVertices: boolean;
  setShowPolygonVertices: React.Dispatch<React.SetStateAction<boolean>>;
  projectedVerticesFC: FeatureCollection<Point>;
  autoFixTopology: boolean;
  setAutoFixTopology: React.Dispatch<React.SetStateAction<boolean>>;
  clearAllSelection: () => void;
  setAdmMode: (mode: "auto" | AdmLevel) => void;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  pinnedDrilldown: DrilldownTarget | null;
  setPinnedDrilldown: (target: DrilldownTarget | null) => void;
  hoverDrilldown: DrilldownTarget | null;
  clickDrilldown: DrilldownTarget | null;
  setClickDrilldown: (target: DrilldownTarget | null) => void;
  focusedCountries: string[];
  setFocusedCountries: (countries: string[]) => void;
  countryMetaMap: Map<string, CountryMeta>;
  rawFeaturesById: Map<string, AdminFeature>;
  setSelectedTargetIds: (ids: Set<string>) => void;
  countrySearch: string;
  setCountrySearch: (search: string) => void;
  showCountryDropdown: boolean;
  setShowCountryDropdown: (show: boolean) => void;
  filteredCountries: CountryMeta[];
  loadCountryHierarchy: (country: string) => Promise<unknown>;
  setHierarchyVersion: React.Dispatch<React.SetStateAction<number>>;
  drillDownToCountries: (countries: string[], level: AdmLevel) => void;
}

export const TopNavigationBar: React.FC<TopNavigationBarProps> = ({
  showOptionsWindow,
  setShowOptionsWindow,
  isDevMode,
  interactionMode,
  setInteractionMode,
  setHoverDrilldown,
  manualAdmLevel,
  setManualAdmLevel,
  effectiveAdmLevel,
  zoom,
  showPolygonVertices,
  setShowPolygonVertices,
  projectedVerticesFC,
  autoFixTopology,
  setAutoFixTopology,
  clearAllSelection,
  setAdmMode,
  mapRef,
  pinnedDrilldown,
  setPinnedDrilldown,
  hoverDrilldown,
  clickDrilldown,
  setClickDrilldown,
  focusedCountries,
  setFocusedCountries,
  countryMetaMap,
  rawFeaturesById,
  setSelectedTargetIds,
  countrySearch,
  setCountrySearch,
  showCountryDropdown,
  setShowCountryDropdown,
  filteredCountries,
  loadCountryHierarchy,
  setHierarchyVersion,
  drillDownToCountries,
}) => {
  return (
    <header className="pointer-events-none absolute top-3 left-3 right-3 z-20 flex flex-wrap items-start justify-between gap-3">
      {/* Left: Brand + Mode & Projection Switcher */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/85 p-2 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2 px-2.5 py-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowOptionsWindow((v) => !v);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition active:scale-95 cursor-pointer ${
              showOptionsWindow
                ? "bg-sky-500 text-slate-950 font-bold shadow-lg shadow-sky-500/30 ring-2 ring-sky-400 scale-105"
                : "bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/40 hover:bg-sky-500/30 hover:scale-105 hover:text-sky-300"
            }`}
            title={
              showOptionsWindow
                ? "關閉選項視窗 (點擊關閉)"
                : "開啟選項視窗 (點擊開啟)"
            }
          >
            <Compass
              className={`h-4.5 w-4.5 transition-transform duration-300 ${
                showOptionsWindow ? "rotate-45" : ""
              }`}
            />
          </button>
          <div
            onClick={(e) => {
              e.stopPropagation();
              setShowOptionsWindow((v) => !v);
            }}
            className="cursor-pointer group"
            title="點擊開啟/關閉選項視窗"
          >
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold tracking-wide text-white group-hover:text-sky-300 transition">
                Geo-Vis
              </h1>
              {isDevMode && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300 ring-1 ring-emerald-500/40">
                  <Terminal className="h-2.5 w-2.5" />
                  DEV
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 group-hover:text-slate-300 transition">
              FlatGeobuf · Multi-Projection
            </p>
          </div>
        </div>
      </div>

      {/* Center: Interaction Mode Switcher & Drill-down Breadcrumb */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/85 p-2 shadow-2xl backdrop-blur-md">
        {/* Dev Mode Only: Interaction Mode Switcher & Scope Options */}
        {isDevMode && (
          <>
            <div className="flex items-center gap-1.5 px-2 text-xs text-slate-300">
              <Layers className="h-3.5 w-3.5 text-sky-400" />
              <span className="font-medium">互動模式:</span>
              <span className="rounded bg-emerald-500/15 px-1 py-0.5 font-mono text-[9px] font-semibold text-emerald-300">
                DEV
              </span>
            </div>

            {/* 4 Mode Buttons */}
            <div className="flex rounded-xl bg-slate-950/80 p-1 ring-1 ring-slate-800">
              <button
                type="button"
                onClick={() => {
                  setInteractionMode((prev) =>
                    prev === "wide-hover" || prev === "wide-click"
                      ? "wide-hover"
                      : "local-hover"
                  );
                  setHoverDrilldown(null);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  interactionMode === "local-hover" ||
                  interactionMode === "wide-hover"
                    ? "bg-violet-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="懸停下鑽模式 (滑鼠移入自動展開 ADM1 / ADM2)"
              >
                <Sparkles className="h-3.5 w-3.5 text-violet-300" />
                <span>Hover (懸停下鑽)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInteractionMode((prev) =>
                    prev === "wide-hover" || prev === "wide-click"
                      ? "wide-click"
                      : "local-click"
                  );
                  setHoverDrilldown(null);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  interactionMode === "local-click" ||
                  interactionMode === "wide-click"
                    ? "bg-emerald-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="點選下鑽模式 (單擊選取展開 ADM1 / ADM2)"
              >
                <MousePointerClick className="h-3.5 w-3.5 text-emerald-300" />
                <span>Click (點擊下鑽)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInteractionMode("zoom");
                  setHoverDrilldown(null);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  interactionMode === "zoom"
                    ? "bg-sky-500 text-slate-950 font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="依縮放倍率自動切換全域 ADM"
              >
                <ZoomIn className="h-3.5 w-3.5 text-sky-200" />
                <span>縮放模式 (Zoom)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInteractionMode("manual");
                  setHoverDrilldown(null);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  interactionMode === "manual"
                    ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="手動指定全域 ADM 層級"
              >
                <Sliders className="h-3.5 w-3.5 text-amber-200" />
                <span>手動模式 (Manual)</span>
              </button>
            </div>

            {/* Sub-controller for Hover Mode: Local vs Wide */}
            {(interactionMode === "local-hover" ||
              interactionMode === "wide-hover") && (
              <div className="flex rounded-xl bg-slate-950/80 p-1 ring-1 ring-violet-500/40">
                <button
                  type="button"
                  onClick={() => setInteractionMode("local-hover")}
                  className={`rounded-lg px-2 py-0.5 text-xs font-medium transition ${
                    interactionMode === "local-hover"
                      ? "bg-violet-500 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="局部展開：僅展開當前懸停的單一 ADM1 內部之 ADM2"
                >
                  📍 局部展開
                </button>
                <button
                  type="button"
                  onClick={() => setInteractionMode("wide-hover")}
                  className={`rounded-lg px-2 py-0.5 text-xs font-medium transition ${
                    interactionMode === "wide-hover"
                      ? "bg-violet-500 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="廣域展開：懸停 ADM1 時展開全體 ADM2，並以醒目色彩標示該 ADM1"
                >
                  🌐 廣域展開 (全體 ADM2)
                </button>
              </div>
            )}

            {/* Sub-controller for Click Mode: Local vs Wide */}
            {(interactionMode === "local-click" ||
              interactionMode === "wide-click") && (
              <div className="flex rounded-xl bg-slate-950/80 p-1 ring-1 ring-emerald-500/40">
                <button
                  type="button"
                  onClick={() => setInteractionMode("local-click")}
                  className={`rounded-lg px-2 py-0.5 text-xs font-medium transition ${
                    interactionMode === "local-click"
                      ? "bg-emerald-500 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="局部展開：僅展開當前點選的單一 ADM1 內部之 ADM2"
                >
                  📍 局部展開
                </button>
                <button
                  type="button"
                  onClick={() => setInteractionMode("wide-click")}
                  className={`rounded-lg px-2 py-0.5 text-xs font-medium transition ${
                    interactionMode === "wide-click"
                      ? "bg-emerald-500 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="廣域展開：點選 ADM1 時展開全體 ADM2，並以醒目色彩標示該 ADM1"
                >
                  🌐 廣域展開 (全體 ADM2)
                </button>
              </div>
            )}

            {/* Sub-controller for Manual Mode */}
            {interactionMode === "manual" && (
              <div className="flex rounded-xl bg-slate-950/80 p-1 ring-1 ring-amber-500/40">
                {(["ADM0", "ADM1", "ADM2"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setManualAdmLevel(lvl)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      manualAdmLevel === lvl
                        ? "bg-amber-400 text-slate-950 font-semibold shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            )}

            {/* Sub-badge for Zoom Mode */}
            {interactionMode === "zoom" && (
              <div className="flex items-center gap-1 rounded-xl bg-slate-950/80 px-2.5 py-1 text-xs ring-1 ring-sky-500/40">
                <span className="font-semibold text-sky-300">
                  {effectiveAdmLevel}
                </span>
                <span className="text-[11px] text-slate-400">
                  (z={zoom.toFixed(1)})
                </span>
              </div>
            )}

            {/* Dev Mode: Toggle Polygon Vertices */}
            <button
              type="button"
              onClick={() => setShowPolygonVertices((v) => !v)}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                showPolygonVertices
                  ? "bg-sky-500/25 text-sky-300 ring-1 ring-sky-500/50 shadow-sm"
                  : "bg-slate-950/80 text-slate-400 hover:text-slate-200 ring-1 ring-slate-800"
              }`}
              title="開啟/關閉多邊形幾何頂點 (Polygon Point) 顯示 (快捷鍵 P)"
            >
              <CircleDot className="h-3.5 w-3.5 text-sky-400" />
              <span>
                頂點 Point {showPolygonVertices ? "ON" : "OFF"}
                {showPolygonVertices &&
                  ` (${projectedVerticesFC.features.length} 點)`}
              </span>
            </button>

            {/* Dev Mode: Auto-Fix Geometry Topology Toggle */}
            <button
              type="button"
              onClick={() => setAutoFixTopology((v) => !v)}
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition ${
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
          </>
        )}

        {/* Drill-down Breadcrumb / Active Centers */}
        <div className="flex items-center gap-1 text-xs">
          {/* Pinned Center in hover modes */}
          {(interactionMode === "local-hover" ||
            interactionMode === "wide-hover") &&
            pinnedDrilldown && (
              <div className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-emerald-300 ring-1 ring-emerald-500/40">
                <Pin className="h-3 w-3 text-emerald-400" />
                <span className="font-medium text-emerald-400">固定展開:</span>
                <span className="font-semibold">
                  {countryMetaMap.get(pinnedDrilldown.shapeGroup)?.shapeName ||
                    pinnedDrilldown.shapeGroup}
                </span>
                {pinnedDrilldown.adm1Id && (
                  <>
                    <span className="text-emerald-500">&gt;</span>
                    <span>
                      {rawFeaturesById.get(pinnedDrilldown.adm1Id)?.properties
                        .shapeName || pinnedDrilldown.adm1Id}
                    </span>
                  </>
                )}
                {pinnedDrilldown.adm2Id && (
                  <>
                    <span className="text-emerald-500">&gt;</span>
                    <span>
                      {rawFeaturesById.get(pinnedDrilldown.adm2Id)?.properties
                        .shapeName || pinnedDrilldown.adm2Id}
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPinnedDrilldown(null);
                    setSelectedTargetIds(new Set());
                  }}
                  title="取消固定"
                  className="ml-1 rounded p-0.5 text-emerald-300 hover:bg-emerald-500/30 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

          {/* Hovered Center in hover modes */}
          {(interactionMode === "local-hover" ||
            interactionMode === "wide-hover") &&
            hoverDrilldown && (
              <div className="flex items-center gap-1 rounded-lg bg-violet-500/15 px-2.5 py-1 text-violet-300 ring-1 ring-violet-500/40">
                <Sparkles className="h-3 w-3 text-violet-400" />
                <span className="font-medium text-violet-400">即時懸停:</span>
                <span className="font-semibold">
                  {countryMetaMap.get(hoverDrilldown.shapeGroup)?.shapeName ||
                    hoverDrilldown.shapeGroup}
                </span>
                {hoverDrilldown.adm1Id && (
                  <>
                    <span className="text-violet-400">&gt;</span>
                    <span>
                      {rawFeaturesById.get(hoverDrilldown.adm1Id)?.properties
                        .shapeName || hoverDrilldown.adm1Id}
                    </span>
                  </>
                )}
                {hoverDrilldown.adm2Id && (
                  <>
                    <span className="text-violet-400">&gt;</span>
                    <span>
                      {rawFeaturesById.get(hoverDrilldown.adm2Id)?.properties
                        .shapeName || hoverDrilldown.adm2Id}
                    </span>
                  </>
                )}
              </div>
            )}

          {/* Click Drilldown Center in click modes */}
          {(interactionMode === "local-click" ||
            interactionMode === "wide-click") &&
            clickDrilldown && (
              <div className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-emerald-300 ring-1 ring-emerald-500/40">
                <MousePointerClick className="h-3 w-3 text-emerald-400" />
                <span className="font-medium text-emerald-400">點選展開:</span>
                <span className="font-semibold">
                  {countryMetaMap.get(clickDrilldown.shapeGroup)?.shapeName ||
                    clickDrilldown.shapeGroup}
                </span>
                {clickDrilldown.adm1Id && (
                  <>
                    <span className="text-emerald-500">&gt;</span>
                    <span>
                      {rawFeaturesById.get(clickDrilldown.adm1Id)?.properties
                        .shapeName || clickDrilldown.adm1Id}
                    </span>
                  </>
                )}
                {clickDrilldown.adm2Id && (
                  <>
                    <span className="text-emerald-500">&gt;</span>
                    <span>
                      {rawFeaturesById.get(clickDrilldown.adm2Id)?.properties
                        .shapeName || clickDrilldown.adm2Id}
                    </span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setClickDrilldown(null);
                    setSelectedTargetIds(new Set());
                  }}
                  title="收合"
                  className="ml-1 rounded p-0.5 text-emerald-300 hover:bg-emerald-500/30 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

          {/* Focused Countries in zoom / manual */}
          {(interactionMode === "zoom" || interactionMode === "manual") &&
            focusedCountries.length > 0 && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                <div className="flex items-center gap-1 rounded-lg bg-sky-500/15 px-2.5 py-1 text-sky-300 ring-1 ring-sky-500/30">
                  <span className="font-semibold">
                    下鑽焦點:{" "}
                    {focusedCountries
                      .slice(0, 3)
                      .map(
                        (sg) => countryMetaMap.get(sg)?.shapeName || sg
                      )
                      .join(", ")}
                    {focusedCountries.length > 3
                      ? ` +${focusedCountries.length - 3}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFocusedCountries([])}
                    title="清除國家下鑽鎖定，改回依視窗載入"
                    className="ml-1 rounded p-0.5 text-sky-300 hover:bg-sky-500/30 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </>
            )}
        </div>

        {/* Quick Country Search & Drill-down Jumper */}
        <div className="relative">
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-950/90 px-2.5 py-1 ring-1 ring-slate-800 focus-within:ring-sky-500/60">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={countrySearch}
              onFocus={() => setShowCountryDropdown(true)}
              onChange={(e) => {
                setCountrySearch(e.target.value);
                setShowCountryDropdown(true);
              }}
              placeholder="搜尋國家下鑽 (如 TWN, JPN)..."
              className="w-40 bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            {countrySearch && (
              <button
                type="button"
                onClick={() => setCountrySearch("")}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {showCountryDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowCountryDropdown(false)}
              />
              <div className="absolute right-0 mt-2 z-20 max-h-72 w-72 overflow-y-auto rounded-xl border border-slate-700/80 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-xl">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  點擊國家直接下鑽行政區 (ADM1 / ADM2)
                </div>
                {filteredCountries.map((c) => (
                  <button
                    key={c.shapeGroup}
                    type="button"
                    onClick={() => {
                      setShowCountryDropdown(false);
                      if (
                        interactionMode === "local-click" ||
                        interactionMode === "wide-click"
                      ) {
                        loadCountryHierarchy(c.shapeGroup)
                          .then(() => setHierarchyVersion((v) => v + 1))
                          .catch((err) => console.warn(err));
                        setSelectedTargetIds(new Set([c.shapeID]));
                        setClickDrilldown({
                          shapeGroup: c.shapeGroup,
                          adm1Id: null,
                          adm2Id: null,
                        });
                      }
                      drillDownToCountries([c.shapeGroup], "ADM1");
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-sky-500/20 hover:text-sky-200"
                  >
                    <div>
                      <span className="font-medium">{c.shapeName}</span>
                      <span className="ml-1.5 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {c.shapeGroup}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {c.adm1Count} 省 / {c.adm2Count} 縣市
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
