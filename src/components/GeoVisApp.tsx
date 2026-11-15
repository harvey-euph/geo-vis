"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type maplibregl from "maplibre-gl";

import {
  type DrilldownTarget,
  type HoveredVertexInfo,
  type InteractionMode,
  type VertexFeatureProperties,
  ALL_PROJECTIONS,
  type FlatProjectionId,
  type MapMode,
  type ProjectionModeId,
  type AdmLevel,
  loadCountryHierarchy,
} from "@/types/geovis";
export type {
  DrilldownTarget,
  HoveredVertexInfo,
  InteractionMode,
  VertexFeatureProperties,
};

import { useWindowDrag } from "@/components/hooks/useWindowDrag";
import { useStarfieldRender } from "@/components/hooks/useStarfieldRender";
import { usePolygonVertices } from "@/components/hooks/usePolygonVertices";
import { useUrlState } from "@/components/hooks/useUrlState";
import { useGeoData } from "@/components/hooks/useGeoData";
import { useUnionManager } from "@/components/hooks/useUnionManager";
import { useInteractiveLayers } from "@/components/hooks/useInteractiveLayers";
import { useRegionLabels } from "@/components/hooks/useRegionLabels";
import { useMapSync } from "@/components/hooks/useMapSync";
import { useKeyboardShortcuts } from "@/components/hooks/useKeyboardShortcuts";
import { getSelectedCountryGroups } from "@/lib/capital-manager";
import { loadLabelDatasetFromUrl, type ParsedLabelDataset } from "@/lib/label-parser";

import { VertexTooltip } from "@/components/VertexTooltip";
import { OptionsWindow } from "@/components/OptionsWindow";
import { TopNavigationBar } from "@/components/TopNavigationBar";
import { DevUnionToolbar } from "@/components/DevUnionToolbar";
import { LeftHudInspector } from "@/components/LeftHudInspector";
import { RightDevSidebar } from "@/components/RightDevSidebar";

export default function GeoVisApp() {
  const searchParams = useSearchParams();
  const isDevMode = useMemo(() => {
    const val = searchParams.get("dev")?.toLowerCase();
    return val === "true" || val === "1";
  }, [searchParams]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef<boolean>(false);

  // Projection & Map Mode state
  const [mapMode, setMapMode] = useState<MapMode>("globe");
  const [flatProjection, setFlatProjection] =
    useState<FlatProjectionId>("equirectangular");

  const currentProjectionId: ProjectionModeId =
    mapMode === "globe" ? "globe" : flatProjection;

  const handleSelectProjection = useCallback((id: ProjectionModeId) => {
    if (id === "globe") {
      setMapMode("globe");
    } else {
      setMapMode("flat");
      setFlatProjection(id);
    }
  }, []);

  // Camera & Viewport bounds state
  const [zoom, setZoom] = useState<number>(1.8);
  const [viewportGeoBbox, setViewportGeoBbox] = useState<
    [number, number, number, number]
  >([-180, -85, 180, 85]);

  // ADM Level & Country Search state
  const [admMode, setAdmMode] = useState<"auto" | AdmLevel>("auto");
  const [focusedCountries, setFocusedCountries] = useState<string[]>([]);
  const [countrySearch, setCountrySearch] = useState<string>("");
  const [showCountryDropdown, setShowCountryDropdown] =
    useState<boolean>(false);

  // Interaction Mode & Drilldown state
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("wide-click");
  const [manualAdmLevel, setManualAdmLevel] = useState<AdmLevel>("ADM0");
  const [showPolygonVertices, setShowPolygonVertices] =
    useState<boolean>(false);
  const [autoFixTopology, setAutoFixTopology] = useState<boolean>(true);
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);

  const [pinnedDrilldown, setPinnedDrilldown] =
    useState<DrilldownTarget | null>(null);
  const [hoverDrilldown, setHoverDrilldown] =
    useState<DrilldownTarget | null>(null);
  const [clickDrilldown, setClickDrilldown] =
    useState<DrilldownTarget | null>(null);
  const [hierarchyVersion, setHierarchyVersion] = useState<number>(0);

  // Selection state
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(
    new Set()
  );

  // 3D Cosmic Starfield state
  const [showStarfield, setShowStarfield] = useState<boolean>(true);
  const [showStarLabels, setShowStarLabels] = useState<boolean>(false);
  const [showMilkyWay, setShowMilkyWay] = useState<boolean>(true);
  const [showAtmosphereGlow, setShowAtmosphereGlow] = useState<boolean>(false);

  // Capital display toggle state
  const [showCapitals, setShowCapitals] = useState<boolean>(true);

  // Region label display state (ISO3 code labels & CSV label datasets)
  const [showIso3Labels, setShowIso3Labels] = useState<boolean>(true);
  const [selectedLabelDatasetId, setSelectedLabelDatasetId] =
    useState<string>("none");
  const [labelDatasets, setLabelDatasets] = useState<
    Map<string, ParsedLabelDataset>
  >(new Map());

  // 0. init 下載所有 label csv (僅解析 CSV 文字與 targets，不下載圖片資源)
  useEffect(() => {
    let cancelled = false;
    async function initAllLabelDatasets() {
      const knownCsvs = [
        { id: "flags", url: "/data/labels/flags.csv" },
      ];
      const entries: [string, ParsedLabelDataset][] = [];
      await Promise.all(
        knownCsvs.map(async (item) => {
          try {
            const ds = await loadLabelDatasetFromUrl(item.url);
            if (!cancelled) {
              entries.push([item.id, ds]);
            }
          } catch (err) {
            console.warn(`[GeoVisApp] Failed to load label csv from ${item.url}:`, err);
          }
        })
      );
      if (!cancelled) {
        setLabelDatasets(new Map(entries));
      }
    }
    initAllLabelDatasets();
    return () => {
      cancelled = true;
    };
  }, []);

  // 1. layer 被開啟時才下載資源：當選擇 "none" 時 activeLabelDataset 為 null，不觸發圖片資源下載
  const activeLabelDataset = useMemo(() => {
    if (selectedLabelDatasetId === "none") return null;
    return labelDatasets.get(selectedLabelDatasetId) || null;
  }, [selectedLabelDatasetId, labelDatasets]);

  const showRegionLabels = showIso3Labels || Boolean(activeLabelDataset);

  // Copied vertex debug notification
  const [copiedVertexNotice, setCopiedVertexNotice] = useState<string | null>(
    null
  );
  const copyNoticeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showCopyNotice = useCallback((msg: string) => {
    setCopiedVertexNotice(msg);
    if (copyNoticeTimerRef.current) {
      clearTimeout(copyNoticeTimerRef.current);
    }
    copyNoticeTimerRef.current = setTimeout(() => {
      setCopiedVertexNotice(null);
    }, 3200);
  }, []);

  const handleCopyVertexDebugInfo = useCallback(
    (v: HoveredVertexInfo) => {
      const debugPayload = {
        region: `${v.shapeName} (${v.shapeID})`,
        level: v.shapeType,
        group: v.shapeGroup,
        polyPart: `${v.polyIdx + 1} / ${v.polyCount}`,
        ringType: v.isHole ? `Hole #${v.ringIdx}` : "Exterior Ring (外環)",
        vertexSequence: `#${v.vertexIdx} / ${v.ringVertexCount}`,
        coordinateWGS84: [
          Number(v.rawLng.toFixed(6)),
          Number(v.rawLat.toFixed(6)),
        ],
        previousVertex: {
          index: v.prevIdx,
          coord: [
            Number(v.prevLng.toFixed(6)),
            Number(v.prevLat.toFixed(6)),
          ],
        },
        nextVertex: {
          index: v.nextIdx,
          coord: [
            Number(v.nextLng.toFixed(6)),
            Number(v.nextLat.toFixed(6)),
          ],
          distToNextDeg: Number(v.distToNextDeg.toFixed(4)),
        },
        isAbnormalJump: v.isAbnormalJump,
        ...(v.isAbnormalJump
          ? {
              alert: `⚠️ 異常跳點警告：跨距達 ${v.distToNextDeg.toFixed(4)} 度`,
            }
          : {}),
      };

      const jsonStr = JSON.stringify(debugPayload, null, 2);
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(jsonStr).catch(() => {});
      }
      console.log("[GeoVis Dev] Vertex Debug Info:", debugPayload);

      showCopyNotice(
        `已複製頂點 #${v.vertexIdx} (${v.rawLng.toFixed(4)}, ${v.rawLat.toFixed(4)}) 資訊至剪貼簿！`
      );
    },
    [showCopyNotice]
  );

  // Hook 1: Floating Options Window dragging & visibility
  const {
    showOptionsWindow,
    setShowOptionsWindow,
    showOptionsWindowRef,
    optionsWindowRef,
    windowPos,
    windowPosRef,
    isDraggingWindowRef,
    clearMapHoverRef,
    resetWindowPos,
    handleHeaderPointerDown,
    handleHeaderPointerMove,
    handleHeaderPointerUp,
    isPointOverOptionsWindow,
  } = useWindowDrag(mapContainerRef);

  const isPointOverOptionsWindowRef = useRef(isPointOverOptionsWindow);
  isPointOverOptionsWindowRef.current = isPointOverOptionsWindow;

  // Hook 2: Administrative GeoData Loading & Hierarchy
  const {
    metadata,
    adm0Features,
    isLoadingData,
    loadingMessage,
    effectiveAdmLevel,
    countryMetaMap,
    effectiveActiveRawFeatures,
    effectiveContextAdm0Features,
    rawFeaturesById,
    datasetUnionGroups,
    hierarchyConstraints,
  } = useGeoData({
    interactionMode,
    manualAdmLevel,
    admMode,
    zoom,
    focusedCountries,
    viewportGeoBbox,
    pinnedDrilldown,
    hoverDrilldown,
    clickDrilldown,
    hierarchyVersion,
    setHierarchyVersion,
    isDevMode,
    autoFixTopology,
    showRegionLabels: Boolean(activeLabelDataset),
    activeLabelDataset,
  });

  // Hook 3: Union Manager & Cycle State
  const {
    unionGroups,
    setUnionGroups,
    selectionAnalysis,
    handleCycleUnionState,
    handleApplyPresetUnion,
    canCycleUnion,
  } = useUnionManager({
    selectedTargetIds,
    setSelectedTargetIds,
    rawFeaturesById,
    effectiveAdmLevel,
    setAdmMode,
    setFocusedCountries,
    mapRef,
    mapMode,
    flatProjection,
  });

  // Combine user-created union groups with CSV dataset-defined union groups (e.g. A|B or (A|B)||(C|D))
  const allUnionGroups = useMemo(() => {
    if (datasetUnionGroups.length === 0) return unionGroups;
    return [...datasetUnionGroups, ...unionGroups];
  }, [datasetUnionGroups, unionGroups]);

  // Track currently selected ADM0 country groups to activate capital highlighting
  const selectedCountryGroups = useMemo(() => {
    if (!showCapitals) return new Set<string>();
    return getSelectedCountryGroups(
      clickDrilldown,
      pinnedDrilldown,
      selectedTargetIds,
      countryMetaMap
    );
  }, [showCapitals, clickDrilldown, pinnedDrilldown, selectedTargetIds, countryMetaMap]);

  // Hook 4: Interactive GeoJSON Layer Projections & SpatialHitIndex
  const {
    interactiveUnprojectedFC,
    projectedInteractiveFC,
    projectedContextFC,
    spatialHitIndex,
    contextHitIndex,
    projectedEnvelope,
    projectedGraticule,
  } = useInteractiveLayers({
    effectiveActiveRawFeatures,
    unionGroups: allUnionGroups,
    isDevMode,
    effectiveContextAdm0Features,
    mapMode,
    flatProjection,
    selectedCountryGroups,
  });

  // Hook 5: Polygon Boundary Vertices Inspection & Point FeatureCollection
  const projectedVerticesFC = usePolygonVertices({
    isDevMode,
    showPolygonVertices,
    projectedInteractiveFC,
    interactiveUnprojectedFC,
    selectedTargetIds,
    clickDrilldown,
    pinnedDrilldown,
  });

  // Hook 5.5: Region Center Labels (Text / Image / flags.csv Badges for ADM0, ADM1, ADM2 & Unions)
  useRegionLabels({
    mapRef,
    mapReadyRef,
    showRegionLabels,
    showIso3Labels,
    adm0Features,
    effectiveActiveRawFeatures,
    effectiveAdmLevel,
    mapMode,
    flatProjection,
    activeLabelDataset,
    unionGroups: allUnionGroups,
    countryMetaMap,
    rawFeaturesById,
    hierarchyConstraints,
  });

  // Hook 6: URL State & Parameter Parsing (Initial camera/projection + target resolution + share URL + live writeback)
  const mapModeRef = useRef(mapMode);
  mapModeRef.current = mapMode;
  const flatProjectionRef = useRef(flatProjection);
  flatProjectionRef.current = flatProjection;

  const {
    initialProjection,
    initialCamera,
    currentShareTargetString,
    copiedUrl,
    handleCopyShareUrl,
    scheduleWriteback,
  } = useUrlState({
    metadata,
    mapRef,
    mapReadyRef,
    mapModeRef,
    flatProjectionRef,
    setSelectedTargetIds,
    setClickDrilldown,
    setHierarchyVersion,
    currentProjectionId,
    isDevMode,
    clickDrilldown,
    selectedTargetIds,
    rawFeaturesById,
    setFocusedCountries,
    setMapMode,
    setFlatProjection,
  });

  // Sync initial projection from URL if defined
  const initialProjAppliedRef = useRef<boolean>(false);
  if (!initialProjAppliedRef.current) {
    initialProjAppliedRef.current = true;
    if (initialProjection.mode !== mapMode) {
      setMapMode(initialProjection.mode);
    }
    if (initialProjection.flat !== flatProjection) {
      setFlatProjection(initialProjection.flat);
    }
    if (initialCamera.zoom !== zoom) {
      setZoom(initialCamera.zoom);
    }
  }

  const handleCameraMove = useCallback(() => {
    scheduleWriteback(300);
  }, [scheduleWriteback]);

  const handleCameraMoveEnd = useCallback(() => {
    scheduleWriteback(100);
  }, [scheduleWriteback]);

  // Hook 7: MapLibre Map Instance Controller, Event Handlers & Layer Data Synchronization
  const {
    cursorCoordsRef,
    hoveredProps,
    hoveredVertex,
    hoveredTargetIdRef,
    clearAllSelection,
    clearMapHover,
    drillDownToCountries,
  } = useMapSync({
    externalMapRef: mapRef,
    externalMapReadyRef: mapReadyRef,
    onCameraMove: handleCameraMove,
    onCameraMoveEnd: handleCameraMoveEnd,
    mapContainerRef,
    initialCamera,
    initialProjection,
    mapMode,
    flatProjection,
    isDevMode,
    multiSelectMode,
    showPolygonVertices,
    interactionMode,
    pinnedDrilldown,
    setPinnedDrilldown,
    hoverDrilldown,
    setHoverDrilldown,
    clickDrilldown,
    setClickDrilldown,
    selectedTargetIds,
    setSelectedTargetIds,
    setFocusedCountries,
    setShowCountryDropdown,
    countryMetaMap,
    admMode,
    setAdmMode,
    setHierarchyVersion,
    spatialHitIndex,
    contextHitIndex,
    projectedEnvelope,
    projectedGraticule,
    projectedInteractiveFC,
    projectedContextFC,
    projectedVerticesFC,
    isPointOverOptionsWindowRef,
    isDraggingWindowRef,
    handleCopyVertexDebugInfo,
    showStarfield,
    setZoom,
    setViewportGeoBbox,
  });

  clearMapHoverRef.current = clearMapHover;

  // Hook 8: 3D Cosmic Starfield Canvas Render Loop
  const { starfieldCanvasRef } = useStarfieldRender({
    mapRef,
    mapMode,
    showStarfield,
    showStarLabels,
    showMilkyWay,
    showAtmosphereGlow,
  });

  // Hook 9: Keyboard Shortcuts (ESC, P, T, U)
  useKeyboardShortcuts({
    isDevMode,
    showOptionsWindowRef,
    setShowOptionsWindow,
    clearAllSelection,
    setShowPolygonVertices,
    setAutoFixTopology,
    canCycleUnion,
    onCycleUnionState: handleCycleUnionState,
  });

  // Filtered country list for quick search bar
  const filteredCountries = useMemo(() => {
    if (!metadata) return [];
    const q = countrySearch.trim().toLowerCase();
    if (!q) return metadata.countries.slice(0, 30);
    return metadata.countries
      .filter(
        (c) =>
          c.shapeName.toLowerCase().includes(q) ||
          c.shapeGroup.toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [metadata, countrySearch]);

  const activeProjectionInfo = useMemo(
    () =>
      ALL_PROJECTIONS.find((p) => p.id === currentProjectionId) ||
      ALL_PROJECTIONS[0],
    [currentProjectionId]
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050914] text-slate-100 select-none">
      {/* 3D Cosmic Starfield Canvas */}
      <canvas
        ref={starfieldCanvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{
          display: showStarfield && mapMode === "globe" ? "block" : "none",
        }}
      />

      {/* MapLibre Canvas Container */}
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

      {/* Vertex Hover Tooltip & Copy Toast */}
      <VertexTooltip
        isDevMode={isDevMode}
        showPolygonVertices={showPolygonVertices}
        hoveredVertex={hoveredVertex}
        copiedVertexNotice={copiedVertexNotice}
        autoFixTopology={autoFixTopology}
      />

      {/* FLOATING OPTIONS WINDOW */}
      {showOptionsWindow && (
        <OptionsWindow
          optionsWindowRef={optionsWindowRef}
          windowPos={windowPos}
          onClearMapHover={clearMapHover}
          hoveredTargetIdRef={hoveredTargetIdRef}
          onHeaderPointerDown={handleHeaderPointerDown}
          onHeaderPointerMove={handleHeaderPointerMove}
          onHeaderPointerUp={handleHeaderPointerUp}
          isDevMode={isDevMode}
          onResetWindowPos={resetWindowPos}
          onClose={() => setShowOptionsWindow(false)}
          currentProjectionId={currentProjectionId}
          onSelectProjection={handleSelectProjection}
          showStarfield={showStarfield}
          setShowStarfield={setShowStarfield}
          showStarLabels={showStarLabels}
          setShowStarLabels={setShowStarLabels}
          showMilkyWay={showMilkyWay}
          setShowMilkyWay={setShowMilkyWay}
          showAtmosphereGlow={showAtmosphereGlow}
          setShowAtmosphereGlow={setShowAtmosphereGlow}
          showCapitals={showCapitals}
          setShowCapitals={setShowCapitals}
          showIso3Labels={showIso3Labels}
          setShowIso3Labels={setShowIso3Labels}
          selectedLabelDatasetId={selectedLabelDatasetId}
          setSelectedLabelDatasetId={setSelectedLabelDatasetId}
          mapMode={mapMode}
          interactionMode={interactionMode}
          setInteractionMode={setInteractionMode}
          autoFixTopology={autoFixTopology}
          setAutoFixTopology={setAutoFixTopology}
          showPolygonVertices={showPolygonVertices}
          setShowPolygonVertices={setShowPolygonVertices}
          mapRef={mapRef}
          flatProjection={flatProjection}
          zoom={zoom}
          currentShareTargetString={currentShareTargetString}
          onCopyShareUrl={handleCopyShareUrl}
          copiedUrl={copiedUrl}
        />
      )}

      {/* TOP NAVIGATION & CONTROL BAR */}
      <TopNavigationBar
        showOptionsWindow={showOptionsWindow}
        setShowOptionsWindow={setShowOptionsWindow}
        isDevMode={isDevMode}
        interactionMode={interactionMode}
        setInteractionMode={setInteractionMode}
        setHoverDrilldown={setHoverDrilldown}
        manualAdmLevel={manualAdmLevel}
        setManualAdmLevel={setManualAdmLevel}
        effectiveAdmLevel={effectiveAdmLevel}
        zoom={zoom}
        showPolygonVertices={showPolygonVertices}
        setShowPolygonVertices={setShowPolygonVertices}
        projectedVerticesFC={projectedVerticesFC}
        autoFixTopology={autoFixTopology}
        setAutoFixTopology={setAutoFixTopology}
        clearAllSelection={clearAllSelection}
        setAdmMode={setAdmMode}
        mapRef={mapRef}
        pinnedDrilldown={pinnedDrilldown}
        setPinnedDrilldown={setPinnedDrilldown}
        hoverDrilldown={hoverDrilldown}
        clickDrilldown={clickDrilldown}
        setClickDrilldown={setClickDrilldown}
        focusedCountries={focusedCountries}
        setFocusedCountries={setFocusedCountries}
        countryMetaMap={countryMetaMap}
        rawFeaturesById={rawFeaturesById}
        setSelectedTargetIds={setSelectedTargetIds}
        countrySearch={countrySearch}
        setCountrySearch={setCountrySearch}
        showCountryDropdown={showCountryDropdown}
        setShowCountryDropdown={setShowCountryDropdown}
        filteredCountries={filteredCountries}
        loadCountryHierarchy={loadCountryHierarchy}
        setHierarchyVersion={setHierarchyVersion}
        drillDownToCountries={drillDownToCountries}
      />

      {/* FLOATING INTERACTIVE UNION CYCLE BAR (Bottom Center — Dev Mode Only) */}
      {isDevMode && (
        <DevUnionToolbar
          isDevMode={isDevMode}
          multiSelectMode={multiSelectMode}
          setMultiSelectMode={setMultiSelectMode}
          showPolygonVertices={showPolygonVertices}
          setShowPolygonVertices={setShowPolygonVertices}
          verticesCount={projectedVerticesFC.features.length}
          autoFixTopology={autoFixTopology}
          setAutoFixTopology={setAutoFixTopology}
          canCycleUnion={canCycleUnion}
          onCycleUnionState={handleCycleUnionState}
          selectionAnalysis={selectionAnalysis}
          effectiveAdmLevel={effectiveAdmLevel}
          onDrillDown={(sgs, targetLevel) => {
            drillDownToCountries(
              sgs,
              targetLevel || (effectiveAdmLevel === "ADM0" ? "ADM1" : "ADM2")
            );
          }}
          selectedTargetIdsCount={selectedTargetIds.size}
          onClearSelection={() => setSelectedTargetIds(new Set())}
        />
      )}

      {/* LEFT HUD: HOVER INSPECTOR & PROJECTION INFO */}
      <LeftHudInspector
        hoveredProps={hoveredProps}
        hoveredVertex={hoveredVertex}
        zoom={zoom}
        effectiveAdmLevel={effectiveAdmLevel}
        activeProjectionName={activeProjectionInfo.name}
        cursorCoordsRef={cursorCoordsRef}
        isLoadingData={isLoadingData}
        loadingMessage={loadingMessage}
        isDevMode={isDevMode}
        showPolygonVertices={showPolygonVertices}
        autoFixTopology={autoFixTopology}
        interactiveFeaturesCount={projectedInteractiveFC.features.length}
        verticesCount={projectedVerticesFC.features.length}
        onCopyVertexDebugInfo={handleCopyVertexDebugInfo}
      />

      {/* RIGHT SIDEBAR: DEV MODE TOOLS (UNION MANAGER & PRESETS) */}
      {isDevMode && (
        <RightDevSidebar
          unionGroups={unionGroups}
          selectedTargetIds={selectedTargetIds}
          rawFeaturesById={rawFeaturesById}
          onSelectGroup={(id) => setSelectedTargetIds(new Set([id]))}
          onRemoveGroup={(id) => {
            setUnionGroups((prev) => prev.filter((g) => g.id !== id));
            setSelectedTargetIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }}
          onUpdateGroup={(updater) => setUnionGroups(updater)}
          onApplyPresetUnion={handleApplyPresetUnion}
        />
      )}
    </div>
  );
}
