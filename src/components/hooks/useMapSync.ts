import React, { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { type AdmLevel, type CountryMeta, getCountryFitBbox } from "@/lib/fgb-loader";
import type { InteractiveMapFeatureProperties } from "@/lib/union-engine";
import {
  type FlatProjectionId,
  type MapMode,
  projectBbox,
  projectLngLat,
  unprojectLngLat,
} from "@/lib/projections";
import {
  getCachedCountryHierarchy,
  getParentAdm1Id,
  loadCountryHierarchy,
} from "@/lib/hierarchy-manager";
import type { SpatialHitIndex } from "@/lib/spatial-index";
import {
  type DrilldownTarget,
  EMPTY_FC,
  type HoveredVertexInfo,
  type InteractionMode,
  type VertexFeatureProperties,
} from "@/types/geovis";
import { createMapLayers, createMapSources } from "@/components/map/map-layers";

interface UseMapSyncOptions {
  externalMapRef?: React.MutableRefObject<maplibregl.Map | null>;
  externalMapReadyRef?: React.MutableRefObject<boolean>;
  mapContainerRef: React.RefObject<HTMLDivElement | null>;
  initialCamera: {
    center: [number, number];
    zoom: number;
    hasCustomCenter: boolean;
    hasCustomZoom: boolean;
  };
  initialProjection: { mode: MapMode; flat: FlatProjectionId };
  mapMode: MapMode;
  flatProjection: FlatProjectionId;
  isDevMode: boolean;
  multiSelectMode: boolean;
  showPolygonVertices: boolean;
  interactionMode: InteractionMode;
  pinnedDrilldown: DrilldownTarget | null;
  setPinnedDrilldown: React.Dispatch<React.SetStateAction<DrilldownTarget | null>>;
  hoverDrilldown: DrilldownTarget | null;
  setHoverDrilldown: React.Dispatch<React.SetStateAction<DrilldownTarget | null>>;
  clickDrilldown: DrilldownTarget | null;
  setClickDrilldown: React.Dispatch<React.SetStateAction<DrilldownTarget | null>>;
  selectedTargetIds: Set<string>;
  setSelectedTargetIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setFocusedCountries: (countries: string[]) => void;
  setShowCountryDropdown: (show: boolean) => void;
  countryMetaMap: Map<string, CountryMeta>;
  admMode: "auto" | AdmLevel;
  setAdmMode: (mode: "auto" | AdmLevel) => void;
  setHierarchyVersion: React.Dispatch<React.SetStateAction<number>>;
  spatialHitIndex: SpatialHitIndex;
  contextHitIndex: SpatialHitIndex;
  projectedEnvelope: FeatureCollection;
  projectedGraticule: FeatureCollection;
  projectedInteractiveFC: FeatureCollection<
    Polygon | MultiPolygon,
    InteractiveMapFeatureProperties
  >;
  projectedContextFC: FeatureCollection<
    Polygon | MultiPolygon,
    InteractiveMapFeatureProperties
  >;
  projectedVerticesFC: FeatureCollection<Point, VertexFeatureProperties>;
  isPointOverOptionsWindowRef: React.RefObject<
    (clientX: number, clientY: number) => boolean
  >;
  isDraggingWindowRef: React.RefObject<boolean>;
  handleCopyVertexDebugInfo: (v: HoveredVertexInfo) => void;
  showStarfield: boolean;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setViewportGeoBbox: React.Dispatch<
    React.SetStateAction<[number, number, number, number]>
  >;
  onCameraMove?: () => void;
  onCameraMoveEnd?: () => void;
}

export function useMapSync({
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
  externalMapRef,
  externalMapReadyRef,
  onCameraMove,
  onCameraMoveEnd,
}: UseMapSyncOptions) {
  const internalMapRef = useRef<maplibregl.Map | null>(null);
  const internalMapReadyRef = useRef<boolean>(false);
  const mapRef = externalMapRef || internalMapRef;
  const mapReadyRef = externalMapReadyRef || internalMapReadyRef;
  const cursorCoordsRef = useRef<HTMLSpanElement | null>(null);

  const onCameraMoveRef = useRef(onCameraMove);
  onCameraMoveRef.current = onCameraMove;
  const onCameraMoveEndRef = useRef(onCameraMoveEnd);
  onCameraMoveEndRef.current = onCameraMoveEnd;

  // Hover & Vertex state
  const [hoveredProps, setHoveredProps] =
    useState<InteractiveMapFeatureProperties | null>(null);
  const [hoveredVertex, setHoveredVertex] = useState<HoveredVertexInfo | null>(
    null
  );
  const hoveredVertexRef = useRef<HoveredVertexInfo | null>(null);
  hoveredVertexRef.current = hoveredVertex;
  const showPolygonVerticesRef = useRef<boolean>(showPolygonVertices);
  showPolygonVerticesRef.current = showPolygonVertices;

  // Synchronization refs for high-frequency MapLibre events
  const isDevModeRef = useRef(isDevMode);
  isDevModeRef.current = isDevMode;

  const multiSelectModeRef = useRef(multiSelectMode);
  multiSelectModeRef.current = multiSelectMode;

  const mapModeRef = useRef(mapMode);
  mapModeRef.current = mapMode;

  const flatProjectionRef = useRef(flatProjection);
  flatProjectionRef.current = flatProjection;

  const interactionModeRef = useRef<InteractionMode>(interactionMode);
  interactionModeRef.current = interactionMode;

  const pinnedDrilldownRef = useRef<DrilldownTarget | null>(pinnedDrilldown);
  pinnedDrilldownRef.current = pinnedDrilldown;

  const hoverDrilldownRef = useRef<DrilldownTarget | null>(hoverDrilldown);
  hoverDrilldownRef.current = hoverDrilldown;

  const clickDrilldownRef = useRef<DrilldownTarget | null>(clickDrilldown);
  clickDrilldownRef.current = clickDrilldown;

  const hoveredTargetIdRef = useRef<string | null>(null);
  const prevSelectedIdsRef = useRef<Set<string>>(new Set());
  const lastCursorPosRef = useRef<{ dLng: number; dLat: number } | null>(null);
  const hoverDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const spatialHitIndexRef = useRef<SpatialHitIndex>(spatialHitIndex);
  spatialHitIndexRef.current = spatialHitIndex;

  const contextHitIndexRef = useRef<SpatialHitIndex>(contextHitIndex);
  contextHitIndexRef.current = contextHitIndex;

  const handleCopyVertexDebugInfoRef = useRef(handleCopyVertexDebugInfo);
  handleCopyVertexDebugInfoRef.current = handleCopyVertexDebugInfo;

  const projectedEnvelopeRef = useRef(projectedEnvelope);
  projectedEnvelopeRef.current = projectedEnvelope;

  const projectedGraticuleRef = useRef(projectedGraticule);
  projectedGraticuleRef.current = projectedGraticule;

  const initialCameraRef = useRef(initialCamera);
  const initialProjectionRef = useRef(initialProjection);

  // Helper to update viewport geographic bounding box
  const syncViewportBounds = useCallback(
    (map: maplibregl.Map) => {
      const bounds = map.getBounds();
      const sw =
        unprojectLngLat(
          bounds.getWest(),
          bounds.getSouth(),
          mapModeRef.current,
          flatProjectionRef.current
        ) || [-180, -85];
      const ne =
        unprojectLngLat(
          bounds.getEast(),
          bounds.getNorth(),
          mapModeRef.current,
          flatProjectionRef.current
        ) || [180, 85];

      const minLng = Math.max(-180, Math.min(sw[0], ne[0]));
      const maxLng = Math.min(180, Math.max(sw[0], ne[0]));
      const minLat = Math.max(-85, Math.min(sw[1], ne[1]));
      const maxLat = Math.min(85, Math.max(sw[1], ne[1]));
      setViewportGeoBbox([minLng, minLat, maxLng, maxLat]);
    },
    [setViewportGeoBbox]
  );

  // Drill down into one or more countries
  const drillDownToCountries = useCallback(
    (shapeGroups: string[], targetLevel?: AdmLevel) => {
      const unique = Array.from(new Set(shapeGroups.filter(Boolean)));
      if (unique.length === 0) return;
      setFocusedCountries(unique);

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const sg of unique) {
        const meta = countryMetaMap.get(sg);
        if (meta) {
          const fitBbox = getCountryFitBbox(meta);
          minX = Math.min(minX, fitBbox[0]);
          minY = Math.min(minY, fitBbox[1]);
          maxX = Math.max(maxX, fitBbox[2]);
          maxY = Math.max(maxY, fitBbox[3]);
        }
      }

      if (targetLevel) {
        setAdmMode(targetLevel);
      } else if (admMode === "ADM0") {
        setAdmMode("auto");
      }

      const map = mapRef.current;
      if (map && Number.isFinite(minX)) {
        const projBounds = projectBbox(
          [minX, minY, maxX, maxY],
          mapModeRef.current,
          flatProjectionRef.current
        );
        map.fitBounds(projBounds, {
          padding: 90,
          maxZoom: targetLevel === "ADM2" ? 7.2 : 5.4,
          duration: 900,
        });
      }
    },
    [countryMetaMap, admMode, setAdmMode, setFocusedCountries]
  );

  const drillDownRef = useRef(drillDownToCountries);
  drillDownRef.current = drillDownToCountries;

  // Clear all selection & drill-down states (ESC key or clicking ocean)
  const clearAllSelection = useCallback(() => {
    setSelectedTargetIds(new Set());
    setClickDrilldown(null);
    setPinnedDrilldown(null);
    setFocusedCountries([]);
    setShowCountryDropdown(false);
    setHoveredVertex(null);

    if (
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }

    const map = mapRef.current;
    if (map && mapReadyRef.current && map.getSource("active-regions")) {
      for (const id of prevSelectedIdsRef.current) {
        try {
          map.setFeatureState(
            { source: "active-regions", id },
            { selected: false }
          );
        } catch {
          // Safe fallback
        }
      }
    }
    prevSelectedIdsRef.current = new Set();
  }, [
    setSelectedTargetIds,
    setClickDrilldown,
    setPinnedDrilldown,
    setFocusedCountries,
    setShowCountryDropdown,
  ]);

  const clearAllSelectionRef = useRef(clearAllSelection);
  clearAllSelectionRef.current = clearAllSelection;

  // Clear map hover and vertex inspection state
  const clearMapHover = useCallback(() => {
    const map = mapRef.current;
    const prevTargetId = hoveredTargetIdRef.current;
    if (
      map &&
      mapReadyRef.current &&
      prevTargetId &&
      map.getSource("active-regions")
    ) {
      try {
        map.setFeatureState(
          { source: "active-regions", id: prevTargetId },
          { hover: false }
        );
      } catch {
        // Safe fallback
      }
    }
    if (hoveredTargetIdRef.current !== null) {
      hoveredTargetIdRef.current = null;
      setHoveredProps(null);
    }
    if (hoveredVertexRef.current !== null) {
      hoveredVertexRef.current = null;
      setHoveredVertex(null);
    }
    lastCursorPosRef.current = null;
    if (hoverDebounceTimerRef.current) {
      clearTimeout(hoverDebounceTimerRef.current);
      hoverDebounceTimerRef.current = null;
    }
    if (
      interactionModeRef.current === "local-hover" ||
      interactionModeRef.current === "wide-hover"
    ) {
      if (hoverDrilldownRef.current !== null) {
        setHoverDrilldown(null);
      }
    }
    if (map && mapReadyRef.current) {
      try {
        map.getCanvas().style.cursor = isDraggingWindowRef.current
          ? "move"
          : "default";
      } catch {
        // Safe fallback
      }
    }
  }, [isDraggingWindowRef, setHoverDrilldown]);

  const syncViewportBoundsRef = useRef(syncViewportBounds);
  syncViewportBoundsRef.current = syncViewportBounds;

  const clearMapHoverRef = useRef(clearMapHover);
  clearMapHoverRef.current = clearMapHover;

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCanvasCenter = projectLngLat(
      initialCameraRef.current.center[0],
      initialCameraRef.current.center[1],
      initialProjectionRef.current.mode,
      initialProjectionRef.current.flat
    );

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      canvasContextAttributes: { alpha: true, antialias: true },
      renderWorldCopies: false,
      maxPitch: 60,
      minZoom: 0.8,
      maxZoom: 14,
      center: initialCanvasCenter,
      zoom: initialCameraRef.current.zoom,
      attributionControl: false,
      doubleClickZoom: false,
      style: {
        version: 8,
        projection: {
          type: initialProjectionRef.current.mode === "globe" ? "globe" : "mercator",
        },
        sources: createMapSources(
          projectedEnvelopeRef.current,
          projectedGraticuleRef.current
        ),
        layers: createMapLayers(),
      },
    });

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
      }),
      "bottom-right"
    );

    map.on("load", () => {
      mapReadyRef.current = true;
      setZoom(Number(map.getZoom().toFixed(2)));
      syncViewportBoundsRef.current(map);

      // Immediately ensure envelope & graticule are populated
      try {
        const envSrc = map.getSource(
          "ocean-envelope"
        ) as maplibregl.GeoJSONSource | undefined;
        if (envSrc && projectedEnvelopeRef.current) {
          envSrc.setData(projectedEnvelopeRef.current);
        }
        const gratSrc = map.getSource(
          "graticule"
        ) as maplibregl.GeoJSONSource | undefined;
        if (gratSrc && projectedGraticuleRef.current) {
          gratSrc.setData(projectedGraticuleRef.current);
        }
      } catch (err) {
        console.warn("[MapSync] Load event source init error:", err);
      }

      onCameraMoveEndRef.current?.();
    });

    const onCameraMove = () => {
      setZoom(Number(map.getZoom().toFixed(2)));
      syncViewportBoundsRef.current(map);
      onCameraMoveRef.current?.();
    };

    map.on("move", onCameraMove);
    map.on("zoom", onCameraMove);
    map.on("pitch", onCameraMove);
    map.on("rotate", onCameraMove);

    map.on("moveend", () => {
      syncViewportBoundsRef.current(map);
      onCameraMoveEndRef.current?.();
      map.triggerRepaint();
    });

    const onSourceData = (e: maplibregl.MapSourceDataEvent) => {
      if (
        e.sourceId === "active-regions" ||
        e.sourceId === "context-adm0" ||
        e.sourceId === "region-labels" ||
        e.sourceId === "polygon-vertices"
      ) {
        map.triggerRepaint();
      }
    };
    map.on("sourcedata", onSourceData);

    const onStyleData = () => {
      map.triggerRepaint();
    };
    map.on("styledata", onStyleData);

    // Ultra-fast mousemove handler using Float64Array SpatialHitIndex + GPU feature-state
    map.on("mousemove", (e) => {
      if (!mapReadyRef.current) return;
      if (isDraggingWindowRef.current) return;

      const origEvent = e.originalEvent as MouseEvent | undefined;
      const isOverWin =
        origEvent &&
        isPointOverOptionsWindowRef.current(
          origEvent.clientX,
          origEvent.clientY
        );

      if (isOverWin) {
        if (hoveredTargetIdRef.current) {
          clearMapHoverRef.current();
        }
        return;
      }

      const dLng = e.lngLat.lng;
      const dLat = e.lngLat.lat;
      lastCursorPosRef.current = { dLng, dLat };

      if (cursorCoordsRef.current) {
        const unproj = unprojectLngLat(
          dLng,
          dLat,
          mapModeRef.current,
          flatProjectionRef.current
        );
        if (unproj) {
          cursorCoordsRef.current.textContent = `${unproj[0].toFixed(2)}°, ${unproj[1].toFixed(2)}°`;
        } else {
          cursorCoordsRef.current.textContent = `${dLng.toFixed(2)}°, ${dLat.toFixed(2)}°`;
        }
      }

      // Dev mode: Vertex hover inspection on selected boundary
      let isOverVertex = false;
      if (isDevModeRef.current && showPolygonVerticesRef.current) {
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 8, e.point.y - 8],
          [e.point.x + 8, e.point.y + 8],
        ];
        const vertHits = map.queryRenderedFeatures(bbox, {
          layers: ["polygon-vertices-circle"],
        });

        if (vertHits.length > 0) {
          isOverVertex = true;
          const vProps = vertHits[0].properties as any;
          const newVInfo: HoveredVertexInfo = {
            pointId: Number(vProps.pointId),
            shapeID: String(vProps.shapeID || ""),
            shapeName: String(vProps.shapeName || ""),
            shapeGroup: String(vProps.shapeGroup || ""),
            shapeType: String(vProps.shapeType || ""),
            polyIdx: Number(vProps.polyIdx || 0),
            polyCount: Number(vProps.polyCount || 1),
            ringIdx: Number(vProps.ringIdx || 0),
            ringCount: Number(vProps.ringCount || 1),
            isHole: Boolean(vProps.isHole),
            vertexIdx: Number(vProps.vertexIdx || 0),
            ringVertexCount: Number(vProps.ringVertexCount || 0),
            rawLng: Number(vProps.rawLng || 0),
            rawLat: Number(vProps.rawLat || 0),
            prevIdx: Number(vProps.prevIdx || 0),
            prevLng: Number(vProps.prevLng || 0),
            prevLat: Number(vProps.prevLat || 0),
            nextIdx: Number(vProps.nextIdx || 0),
            nextLng: Number(vProps.nextLng || 0),
            nextLat: Number(vProps.nextLat || 0),
            distToNextDeg: Number(vProps.distToNextDeg || 0),
            isAbnormalJump: Boolean(vProps.isAbnormalJump),
            screenX: e.point.x,
            screenY: e.point.y,
          };
          if (
            !hoveredVertexRef.current ||
            hoveredVertexRef.current.pointId !== newVInfo.pointId ||
            Math.abs(hoveredVertexRef.current.screenX - newVInfo.screenX) > 2 ||
            Math.abs(hoveredVertexRef.current.screenY - newVInfo.screenY) > 2
          ) {
            setHoveredVertex(newVInfo);
          }
        } else {
          if (hoveredVertexRef.current !== null) {
            setHoveredVertex(null);
          }
        }
      } else {
        if (hoveredVertexRef.current !== null) {
          setHoveredVertex(null);
        }
      }

      const hitProps = spatialHitIndexRef.current.hitTest(dLng, dLat);

      if (hitProps) {
        map.getCanvas().style.cursor = isOverVertex ? "crosshair" : "pointer";
        const nextTargetId = hitProps.targetId;
        const prevTargetId = hoveredTargetIdRef.current;

        if (nextTargetId !== prevTargetId) {
          if (prevTargetId) {
            map.setFeatureState(
              { source: "active-regions", id: prevTargetId },
              { hover: false }
            );
          }
          map.setFeatureState(
            { source: "active-regions", id: nextTargetId },
            { hover: true }
          );
          hoveredTargetIdRef.current = nextTargetId;
          setHoveredProps(hitProps);
        }

        const activeMode = interactionModeRef.current;

        if (
          activeMode === "local-hover" ||
          activeMode === "wide-hover" ||
          activeMode === "local-click" ||
          activeMode === "wide-click"
        ) {
          const { shapeGroup } = hitProps;
          if (!getCachedCountryHierarchy(shapeGroup)) {
            loadCountryHierarchy(shapeGroup)
              .then(() => setHierarchyVersion((v) => v + 1))
              .catch((err) => console.warn(err));
          }
        }

        if (activeMode === "local-hover" || activeMode === "wide-hover") {
          const { shapeGroup, shapeID, shapeType } = hitProps;
          if (hoverDebounceTimerRef.current) {
            clearTimeout(hoverDebounceTimerRef.current);
          }

          hoverDebounceTimerRef.current = setTimeout(() => {
            if (shapeType === "ADM0") {
              if (
                hoverDrilldownRef.current?.shapeGroup !== shapeGroup ||
                hoverDrilldownRef.current?.adm1Id !== null
              ) {
                setHoverDrilldown({
                  shapeGroup,
                  adm1Id: null,
                  adm2Id: null,
                });
              }
            } else if (shapeType === "ADM1") {
              if (
                hoverDrilldownRef.current?.shapeGroup !== shapeGroup ||
                hoverDrilldownRef.current?.adm1Id !== shapeID
              ) {
                setHoverDrilldown({
                  shapeGroup,
                  adm1Id: shapeID,
                  adm2Id: null,
                });
              }
            } else if (shapeType === "ADM2") {
              if (activeMode === "wide-hover") {
                const parentAdm1 = getParentAdm1Id(shapeGroup, shapeID);
                if (
                  parentAdm1 &&
                  (hoverDrilldownRef.current?.shapeGroup !== shapeGroup ||
                    hoverDrilldownRef.current?.adm1Id !== parentAdm1)
                ) {
                  setHoverDrilldown({
                    shapeGroup,
                    adm1Id: parentAdm1,
                    adm2Id: null,
                  });
                }
              } else {
                const parentAdm1 = getParentAdm1Id(shapeGroup, shapeID);
                if (
                  hoverDrilldownRef.current?.shapeGroup !== shapeGroup ||
                  hoverDrilldownRef.current?.adm1Id !== parentAdm1
                ) {
                  setHoverDrilldown({
                    shapeGroup,
                    adm1Id: parentAdm1,
                    adm2Id: null,
                  });
                }
              }
            }
          }, 35);
        }
      } else {
        if (hoveredTargetIdRef.current) {
          map.setFeatureState(
            { source: "active-regions", id: hoveredTargetIdRef.current },
            { hover: false }
          );
          hoveredTargetIdRef.current = null;
          setHoveredProps(null);
        }

        const activeMode = interactionModeRef.current;
        if (activeMode === "local-hover" || activeMode === "wide-hover") {
          if (hoverDebounceTimerRef.current) {
            clearTimeout(hoverDebounceTimerRef.current);
          }
          hoverDebounceTimerRef.current = setTimeout(() => {
            if (hoverDrilldownRef.current !== null) {
              setHoverDrilldown(null);
            }
          }, 70);
        }

        const ctxHit = contextHitIndexRef.current.hitTest(dLng, dLat);
        if (ctxHit) {
          map.getCanvas().style.cursor = "pointer";
        } else {
          map.getCanvas().style.cursor = "grab";
        }
      }
    });

    map.on("mouseleave", () => {
      clearMapHoverRef.current();
    });

    // Click handler using SpatialHitIndex
    map.on("click", (e) => {
      if (!mapReadyRef.current) return;
      if (isDraggingWindowRef.current) return;
      const origEvent = e.originalEvent as MouseEvent | undefined;
      const isOverWin =
        origEvent &&
        isPointOverOptionsWindowRef.current(
          origEvent.clientX,
          origEvent.clientY
        );

      if (isOverWin) return;

      const dLng = e.lngLat.lng;
      const dLat = e.lngLat.lat;
      lastCursorPosRef.current = { dLng, dLat };

      if (
        isDevModeRef.current &&
        showPolygonVerticesRef.current &&
        hoveredVertexRef.current
      ) {
        handleCopyVertexDebugInfoRef.current(hoveredVertexRef.current);
        return;
      }

      const hitProps = spatialHitIndexRef.current.hitTest(dLng, dLat);
      const originalEvent = e.originalEvent as MouseEvent;
      const isAdditive =
        isDevModeRef.current &&
        (multiSelectModeRef.current ||
          originalEvent.shiftKey ||
          originalEvent.metaKey ||
          originalEvent.ctrlKey);

      const activeMode = interactionModeRef.current;

      if (!hitProps) {
        const ctxHit = contextHitIndexRef.current.hitTest(dLng, dLat);
        if (
          ctxHit &&
          ctxHit.shapeGroup &&
          (activeMode === "zoom" || activeMode === "manual")
        ) {
          drillDownRef.current([ctxHit.shapeGroup]);
          return;
        }

        clearAllSelectionRef.current();
        return;
      }

      if (isAdditive) {
        const targetId = hitProps.targetId;
        setSelectedTargetIds((prev) => {
          const next = new Set(prev);
          if (next.has(targetId)) next.delete(targetId);
          else next.add(targetId);
          return next;
        });
        return;
      }

      if (activeMode === "local-hover" || activeMode === "wide-hover") {
        const { shapeGroup, shapeID, shapeType } = hitProps;
        if (shapeType === "ADM2") {
          if (
            pinnedDrilldownRef.current?.shapeGroup === shapeGroup &&
            pinnedDrilldownRef.current?.adm2Id === shapeID
          ) {
            setPinnedDrilldown(null);
          } else {
            const parentAdm1 = getParentAdm1Id(shapeGroup, shapeID);
            setPinnedDrilldown({
              shapeGroup,
              adm1Id: parentAdm1,
              adm2Id: shapeID,
            });
          }
          return;
        } else if (shapeType === "ADM1") {
          if (
            pinnedDrilldownRef.current?.shapeGroup === shapeGroup &&
            pinnedDrilldownRef.current?.adm1Id === shapeID &&
            pinnedDrilldownRef.current?.adm2Id === null
          ) {
            setPinnedDrilldown(null);
          } else {
            setPinnedDrilldown({
              shapeGroup,
              adm1Id: shapeID,
              adm2Id: null,
            });
          }
          return;
        } else if (shapeType === "ADM0") {
          if (
            pinnedDrilldownRef.current?.shapeGroup === shapeGroup &&
            pinnedDrilldownRef.current?.adm1Id === null
          ) {
            setPinnedDrilldown(null);
          } else {
            setPinnedDrilldown({
              shapeGroup,
              adm1Id: null,
              adm2Id: null,
            });
          }
          return;
        }
      }

      if (activeMode === "local-click" || activeMode === "wide-click") {
        const { shapeGroup, shapeID, shapeType } = hitProps;
        if (shapeType === "ADM0") {
          if (clickDrilldownRef.current?.shapeGroup === shapeGroup) {
            setClickDrilldown(null);
            setSelectedTargetIds(new Set());
          } else {
            setClickDrilldown({
              shapeGroup,
              adm1Id: null,
              adm2Id: null,
            });
            setSelectedTargetIds(new Set([hitProps.targetId]));
          }
          return;
        } else if (shapeType === "ADM1") {
          if (
            clickDrilldownRef.current?.shapeGroup === shapeGroup &&
            clickDrilldownRef.current?.adm1Id === shapeID
          ) {
            setClickDrilldown({
              shapeGroup,
              adm1Id: null,
              adm2Id: null,
            });
            setSelectedTargetIds(new Set([shapeGroup]));
          } else {
            setClickDrilldown({
              shapeGroup,
              adm1Id: shapeID,
              adm2Id: null,
            });
            setSelectedTargetIds(new Set([hitProps.targetId]));
          }
          return;
        } else if (shapeType === "ADM2") {
          if (activeMode === "wide-click") {
            const parentAdm1 = getParentAdm1Id(shapeGroup, shapeID);
            if (
              parentAdm1 &&
              clickDrilldownRef.current?.adm1Id !== parentAdm1
            ) {
              setClickDrilldown({
                shapeGroup,
                adm1Id: parentAdm1,
                adm2Id: shapeID,
              });
            } else {
              setClickDrilldown((prev) =>
                prev ? { ...prev, adm2Id: shapeID } : null
              );
            }
          } else {
            setClickDrilldown((prev) =>
              prev ? { ...prev, adm2Id: shapeID } : null
            );
          }
          setSelectedTargetIds(new Set([hitProps.targetId]));
          return;
        }
      }

      const targetId = hitProps.targetId;
      setSelectedTargetIds((prev) => {
        if (prev.has(targetId) && prev.size === 1) {
          return new Set();
        }
        return new Set([targetId]);
      });
    });

    map.on("dblclick", (e) => {
      if (!mapReadyRef.current) return;
      const dLng = e.lngLat.lng;
      const dLat = e.lngLat.lat;
      const hit = spatialHitIndexRef.current.hitTest(dLng, dLat);
      if (hit && hit.shapeGroup) {
        drillDownRef.current([hit.shapeGroup]);
      } else {
        const ctxHit = contextHitIndexRef.current.hitTest(dLng, dLat);
        if (ctxHit && ctxHit.shapeGroup) {
          drillDownRef.current([ctxHit.shapeGroup]);
        }
      }
    });

    mapRef.current = map;

    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [mapContainerRef, setZoom]);

  // Sync MapLibre projection mode ("globe" vs "mercator")
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyProj = () => {
      try {
        map.setProjection({
          type: mapMode === "globe" ? "globe" : "mercator",
        });
      } catch {
        // Safe fallback
      }
    };
    if (mapReadyRef.current || map.isStyleLoaded() || map.loaded()) {
      applyProj();
    } else {
      map.once("load", applyProj);
      return () => {
        map.off("load", applyProj);
      };
    }
  }, [mapMode]);

  // Dynamic sync of space background opacity for 3D Cosmic Starfield
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const updateOpacity = () => {
      try {
        if (map.getLayer("space-background")) {
          map.setPaintProperty(
            "space-background",
            "background-opacity",
            showStarfield && mapMode === "globe" ? 0 : 1
          );
        }
      } catch {
        // Safe fallback
      }
    };
    if (mapReadyRef.current || map.isStyleLoaded() || map.loaded()) {
      updateOpacity();
    } else {
      map.once("load", updateOpacity);
      return () => {
        map.off("load", updateOpacity);
      };
    }
  }, [showStarfield, mapMode]);

  // Sync Envelope & Graticule sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applySources = () => {
      try {
        const envSrc = map.getSource(
          "ocean-envelope"
        ) as maplibregl.GeoJSONSource | undefined;
        const gratSrc = map.getSource("graticule") as
          | maplibregl.GeoJSONSource
          | undefined;
        if (envSrc) envSrc.setData(projectedEnvelope);
        if (gratSrc) gratSrc.setData(projectedGraticule);
      } catch (err) {
        console.warn("[MapSync] Error applying envelope/graticule sources:", err);
      }
    };

    if (
      (mapReadyRef.current || map.isStyleLoaded() || map.loaded()) &&
      map.getSource("ocean-envelope")
    ) {
      applySources();
    } else {
      map.once("load", applySources);
      return () => {
        map.off("load", applySources);
      };
    }
  }, [projectedEnvelope, projectedGraticule]);

  // Sync Active Regions & Context ADM0 sources, and re-apply feature-state
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyData = () => {
      const activeSrc = map.getSource("active-regions") as
        | maplibregl.GeoJSONSource
        | undefined;
      const ctxSrc = map.getSource("context-adm0") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (activeSrc) {
        const p = activeSrc.setData(projectedInteractiveFC, true);
        if (p && typeof p.then === "function") {
          p.then(() => {
            map.triggerRepaint();
          });
        }
      }
      if (ctxSrc) {
        const p = ctxSrc.setData(projectedContextFC, true);
        if (p && typeof p.then === "function") {
          p.then(() => {
            map.triggerRepaint();
          });
        }
      }
      map.triggerRepaint();

      const prevHoverId = hoveredTargetIdRef.current;
      if (lastCursorPosRef.current) {
        const { dLng, dLat } = lastCursorPosRef.current;
        const newHit = spatialHitIndex.hitTest(dLng, dLat);

        if (prevHoverId && prevHoverId !== newHit?.targetId) {
          map.setFeatureState(
            { source: "active-regions", id: prevHoverId },
            { hover: false }
          );
        }

        if (newHit) {
          map.setFeatureState(
            { source: "active-regions", id: newHit.targetId },
            { hover: true }
          );
          hoveredTargetIdRef.current = newHit.targetId;
          setHoveredProps(newHit);
          map.getCanvas().style.cursor = "pointer";
        } else {
          hoveredTargetIdRef.current = null;
          setHoveredProps(null);
          const ctxHit = contextHitIndex.hitTest(dLng, dLat);
          map.getCanvas().style.cursor = ctxHit ? "pointer" : "grab";
        }
      } else {
        if (prevHoverId) {
          map.setFeatureState(
            { source: "active-regions", id: prevHoverId },
            { hover: false }
          );
        }
        hoveredTargetIdRef.current = null;
        setHoveredProps(null);
      }

      for (const id of selectedTargetIds) {
        map.setFeatureState(
          { source: "active-regions", id },
          { selected: true }
        );
      }
    };

    if (
      (mapReadyRef.current || map.isStyleLoaded() || map.loaded()) &&
      map.getSource("active-regions")
    ) {
      applyData();
    } else {
      map.once("load", applyData);
      return () => {
        map.off("load", applyData);
      };
    }
  }, [
    projectedInteractiveFC,
    projectedContextFC,
    spatialHitIndex,
    contextHitIndex,
  ]);

  // Sync Polygon Vertices layer visibility & GeoJSON source
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyVertices = () => {
      if (map.getLayer("polygon-vertices-circle")) {
        map.setLayoutProperty(
          "polygon-vertices-circle",
          "visibility",
          isDevMode && showPolygonVertices ? "visible" : "none"
        );
      }
      const vertSrc = map.getSource("polygon-vertices") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (vertSrc) {
        const p = vertSrc.setData(projectedVerticesFC, true);
        if (p && typeof p.then === "function") {
          p.then(() => {
            map.triggerRepaint();
          });
        }
        map.triggerRepaint();
      }
    };

    if (
      (mapReadyRef.current || map.isStyleLoaded() || map.loaded()) &&
      map.getSource("polygon-vertices")
    ) {
      applyVertices();
    } else {
      map.once("load", applyVertices);
    }
  }, [isDevMode, showPolygonVertices, projectedVerticesFC]);

  // Sync Highlighted / Hovered Vertex point source
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateHoveredVertex = () => {
      const src = map.getSource("hovered-vertex") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!src) return;

      if (!hoveredVertex || !showPolygonVertices || !isDevMode) {
        src.setData(EMPTY_FC);
        return;
      }

      const [dispLng, dispLat] = projectLngLat(
        hoveredVertex.rawLng,
        hoveredVertex.rawLat,
        mapMode,
        flatProjection
      );

      src.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: hoveredVertex.pointId,
            properties: {},
            geometry: {
              type: "Point",
              coordinates: [dispLng, dispLat],
            },
          },
        ],
      });
    };

    if (
      (mapReadyRef.current || map.isStyleLoaded() || map.loaded()) &&
      map.getSource("hovered-vertex")
    ) {
      updateHoveredVertex();
    } else {
      map.once("load", updateHoveredVertex);
    }
  }, [hoveredVertex, showPolygonVertices, isDevMode, mapMode, flatProjection]);

  // Sync Selected Targets via GPU feature-state (zero setData or filter rebuild!)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applySelectionState = () => {
      if (!map.getSource("active-regions")) return;
      for (const oldId of prevSelectedIdsRef.current) {
        if (!selectedTargetIds.has(oldId)) {
          map.setFeatureState(
            { source: "active-regions", id: oldId },
            { selected: false }
          );
        }
      }
      for (const newId of selectedTargetIds) {
        if (!prevSelectedIdsRef.current.has(newId)) {
          map.setFeatureState(
            { source: "active-regions", id: newId },
            { selected: true }
          );
        }
      }
      prevSelectedIdsRef.current = new Set(selectedTargetIds);
    };

    if (
      (mapReadyRef.current || map.isStyleLoaded() || map.loaded()) &&
      map.getSource("active-regions")
    ) {
      applySelectionState();
    } else {
      map.once("load", applySelectionState);
      return () => {
        map.off("load", applySelectionState);
      };
    }
  }, [selectedTargetIds]);

  // Handle BFCache (Back-Forward Cache) restoration & WebGL context refresh
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      const map = mapRef.current;
      if (!map) return;
      map.resize();
      map.triggerRepaint();

      try {
        const envSrc = map.getSource(
          "ocean-envelope"
        ) as maplibregl.GeoJSONSource | undefined;
        if (envSrc && projectedEnvelopeRef.current) {
          envSrc.setData(projectedEnvelopeRef.current);
        }
        const gratSrc = map.getSource("graticule") as
          | maplibregl.GeoJSONSource
          | undefined;
        if (gratSrc && projectedGraticuleRef.current) {
          gratSrc.setData(projectedGraticuleRef.current);
        }
      } catch {
        // Safe fallback
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return {
    mapRef,
    mapReadyRef,
    cursorCoordsRef,
    hoveredProps,
    hoveredVertex,
    setHoveredVertex,
    hoveredTargetIdRef,
    clearAllSelection,
    clearMapHover,
    drillDownToCountries,
  };
}
