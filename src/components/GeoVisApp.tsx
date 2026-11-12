"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import {
  Globe,
  Map as MapIcon,
  Layers,
  Combine,
  GitMerge,
  Ungroup,
  RefreshCw,
  ZoomIn,
  Search,
  ChevronRight,
  CheckSquare,
  Square,
  Sparkles,
  Info,
  Trash2,
  Compass,
  Terminal,
  X,
} from "lucide-react";

import {
  FLAT_PROJECTIONS,
  type FlatProjectionId,
  type MapMode,
  generateGraticuleAndEnvelope,
  projectBbox,
  projectFeatureCollection,
  unprojectLngLat,
} from "@/lib/projections";
import {
  type AdmLevel,
  type AdminFeature,
  type CountryMeta,
  type DatasetMetadata,
  bboxesIntersect,
  loadAdm0Features,
  loadMultipleCountrySubdivisions,
  loadMetadata,
  parseBbox,
} from "@/lib/fgb-loader";
import {
  GROUP_PALETTE,
  type InteractiveMapFeatureProperties,
  PRESET_UNIONS,
  type PresetUnionTemplate,
  type RegionUnionGroup,
  type UnionCycleState,
  buildInteractiveFeatureCollection,
  computeDissolvedGeometry,
} from "@/lib/union-engine";
import { SpatialHitIndex } from "@/lib/spatial-index";

const EMPTY_FC: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const ADM1_ZOOM_THRESHOLD = 3.8;
const ADM2_ZOOM_THRESHOLD = 6.2;

function getAutoAdmLevel(zoom: number): AdmLevel {
  if (zoom >= ADM2_ZOOM_THRESHOLD) return "ADM2";
  if (zoom >= ADM1_ZOOM_THRESHOLD) return "ADM1";
  return "ADM0";
}

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
  const [mapMode, setMapMode] = useState<MapMode>("flat");
  const [flatProjection, setFlatProjection] =
    useState<FlatProjectionId>("equirectangular");

  // Camera & Cursor state
  const [zoom, setZoom] = useState<number>(1.8);
  const cursorCoordsRef = useRef<HTMLSpanElement | null>(null);
  const [viewportGeoBbox, setViewportGeoBbox] = useState<
    [number, number, number, number]
  >([-180, -85, 180, 85]);

  // ADM Level & Drill-down state
  const [admMode, setAdmMode] = useState<"auto" | AdmLevel>("auto");
  const [focusedCountries, setFocusedCountries] = useState<string[]>([]);
  const [countrySearch, setCountrySearch] = useState<string>("");
  const [showCountryDropdown, setShowCountryDropdown] =
    useState<boolean>(false);

  // Data loading state
  const [metadata, setMetadata] = useState<DatasetMetadata | null>(null);
  const [adm0Features, setAdm0Features] = useState<AdminFeature[]>([]);
  const [subdivisionFeatures, setSubdivisionFeatures] = useState<
    AdminFeature[]
  >([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [loadingMessage, setLoadingMessage] =
    useState<string>("載入全球 ADM0 FlatGeobuf 資料中...");

  // Hover, Selection & Union state
  const [hoveredProps, setHoveredProps] =
    useState<InteractiveMapFeatureProperties | null>(null);
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(
    new Set()
  );
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);
  const [unionGroups, setUnionGroups] = useState<RegionUnionGroup[]>([]);
  const [colorIndex, setColorIndex] = useState<number>(0);

  // Effective ADM level based on auto/manual mode
  const effectiveAdmLevel: AdmLevel = useMemo(() => {
    if (admMode !== "auto") return admMode;
    return getAutoAdmLevel(zoom);
  }, [admMode, zoom]);

  // Map country code -> CountryMeta
  const countryMetaMap = useMemo(() => {
    const map = new Map<string, CountryMeta>();
    if (metadata) {
      for (const c of metadata.countries) {
        map.set(c.shapeGroup, c);
      }
    }
    return map;
  }, [metadata]);

  // Determine which countries should load ADM1 / ADM2 subdivisions when effectiveAdmLevel > ADM0
  const activeSubdivisionCountries = useMemo(() => {
    if (effectiveAdmLevel === "ADM0") return [];
    if (focusedCountries.length > 0) {
      return focusedCountries;
    }
    if (!metadata) return [];

    // Viewport auto-switch mode: find countries intersecting viewportGeoBbox,
    // prioritized by proximity to viewport center so we don't overload at low-medium zoom
    const centerLng = (viewportGeoBbox[0] + viewportGeoBbox[2]) / 2;
    const centerLat = (viewportGeoBbox[1] + viewportGeoBbox[3]) / 2;

    const intersecting = metadata.countries.filter((c) =>
      bboxesIntersect(c.bbox, viewportGeoBbox)
    );

    intersecting.sort((a, b) => {
      const aCx = (a.bbox[0] + a.bbox[2]) / 2;
      const aCy = (a.bbox[1] + a.bbox[3]) / 2;
      const bCx = (b.bbox[0] + b.bbox[2]) / 2;
      const bCy = (b.bbox[1] + b.bbox[3]) / 2;
      const dA = (aCx - centerLng) ** 2 + (aCy - centerLat) ** 2;
      const dB = (bCx - centerLng) ** 2 + (bCy - centerLat) ** 2;
      return dA - dB;
    });

    const maxCountries = effectiveAdmLevel === "ADM1" ? 12 : 6;
    return intersecting.slice(0, maxCountries).map((c) => c.shapeGroup);
  }, [effectiveAdmLevel, focusedCountries, metadata, viewportGeoBbox]);

  // Initial load of metadata.json and adm0.fgb
  useEffect(() => {
    let cancelled = false;
    async function initData() {
      try {
        setIsLoadingData(true);
        setLoadingMessage("讀取 FlatGeobuf (adm0.fgb) 與國家索引...");
        const [meta, adm0] = await Promise.all([
          loadMetadata(),
          loadAdm0Features(),
        ]);
        if (cancelled) return;
        setMetadata(meta);
        setAdm0Features(adm0);
      } catch (err) {
        console.error("Failed to initialize geo data:", err);
      } finally {
        if (!cancelled) {
          setIsLoadingData(false);
          setLoadingMessage("");
        }
      }
    }
    initData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load ADM1 / ADM2 subdivisions when activeSubdivisionCountries or effectiveAdmLevel changes
  useEffect(() => {
    let cancelled = false;
    if (
      effectiveAdmLevel === "ADM0" ||
      activeSubdivisionCountries.length === 0
    ) {
      setSubdivisionFeatures([]);
      return;
    }

    const subLevel: "ADM1" | "ADM2" = effectiveAdmLevel;

    async function fetchSubdivisions() {
      setIsLoadingData(true);
      setLoadingMessage(
        `載入 ${activeSubdivisionCountries.slice(0, 4).join(", ")}${
          activeSubdivisionCountries.length > 4 ? "..." : ""
        } 的 ${subLevel} (.fgb)...`
      );
      try {
        const feats = await loadMultipleCountrySubdivisions(
          activeSubdivisionCountries,
          subLevel
        );
        if (cancelled) return;

        // If any country has 0 features at ADM2 (or ADM1), gracefully fall back so no country vanishes
        const coveredGroups = new Set(
          feats.map((f) => f.properties.shapeGroup)
        );
        const missingGroups = activeSubdivisionCountries.filter(
          (sg) => !coveredGroups.has(sg)
        );

        let fallbackFeats: AdminFeature[] = [];
        if (missingGroups.length > 0) {
          if (subLevel === "ADM2") {
            const adm1Fallback = await loadMultipleCountrySubdivisions(
              missingGroups,
              "ADM1"
            );
            const stillMissing = new Set(
              missingGroups.filter(
                (sg) =>
                  !adm1Fallback.some((f) => f.properties.shapeGroup === sg)
              )
            );
            const adm0Fallback = adm0Features.filter((f) =>
              stillMissing.has(f.properties.shapeGroup)
            );
            fallbackFeats = [...adm1Fallback, ...adm0Fallback];
          } else {
            fallbackFeats = adm0Features.filter((f) =>
              missingGroups.includes(f.properties.shapeGroup)
            );
          }
        }

        if (!cancelled) {
          setSubdivisionFeatures([...feats, ...fallbackFeats]);
        }
      } catch (err) {
        console.error("Error loading subdivisions:", err);
      } finally {
        if (!cancelled) {
          setIsLoadingData(false);
          setLoadingMessage("");
        }
      }
    }

    fetchSubdivisions();
    return () => {
      cancelled = true;
    };
  }, [effectiveAdmLevel, activeSubdivisionCountries, adm0Features]);

  // Active raw features for the current level (with generous viewport culling at ADM2 to keep feature count snappy)
  const activeRawFeatures: AdminFeature[] = useMemo(() => {
    if (effectiveAdmLevel === "ADM0") {
      return adm0Features;
    }
    if (
      effectiveAdmLevel === "ADM2" &&
      subdivisionFeatures.length > 600
    ) {
      const pad = 4.5;
      const paddedViewport: [number, number, number, number] = [
        viewportGeoBbox[0] - pad,
        viewportGeoBbox[1] - pad,
        viewportGeoBbox[2] + pad,
        viewportGeoBbox[3] + pad,
      ];
      const groupMemberIds = new Set<string>();
      for (const g of unionGroups) {
        for (const m of g.memberIds) groupMemberIds.add(m);
      }
      return subdivisionFeatures.filter((f) => {
        if (groupMemberIds.has(f.properties.shapeID)) return true;
        const b = parseBbox(f.properties.bboxStr);
        return bboxesIntersect(b, paddedViewport);
      });
    }
    return subdivisionFeatures;
  }, [
    effectiveAdmLevel,
    adm0Features,
    subdivisionFeatures,
    viewportGeoBbox,
    unionGroups,
  ]);

  // Background context ADM0 features (countries NOT currently expanded into ADM1/ADM2)
  const contextAdm0Features: AdminFeature[] = useMemo(() => {
    if (effectiveAdmLevel === "ADM0" || adm0Features.length === 0) {
      return [];
    }
    const activeSet = new Set(activeSubdivisionCountries);
    return adm0Features.filter((f) => !activeSet.has(f.properties.shapeGroup));
  }, [effectiveAdmLevel, adm0Features, activeSubdivisionCountries]);

  const effectiveUnionGroups = useMemo(
    () => (isDevMode ? unionGroups : []),
    [isDevMode, unionGroups]
  );

  // Build interactive FeatureCollection (decoupled from hover/selection so setData is never called on hover/click!)
  const interactiveUnprojectedFC = useMemo(() => {
    return buildInteractiveFeatureCollection(
      activeRawFeatures,
      effectiveUnionGroups,
      null,
      new Set()
    );
  }, [activeRawFeatures, effectiveUnionGroups]);

  // Project interactive features into current mapMode + flatProjection
  const projectedInteractiveFC = useMemo(() => {
    return projectFeatureCollection(
      interactiveUnprojectedFC,
      mapMode,
      flatProjection
    ) as FeatureCollection<Polygon | MultiPolygon, InteractiveMapFeatureProperties>;
  }, [interactiveUnprojectedFC, mapMode, flatProjection]);

  // Project background context ADM0 features
  const projectedContextFC = useMemo(() => {
    const rawContextFC: FeatureCollection = {
      type: "FeatureCollection",
      features: contextAdm0Features,
    };
    return projectFeatureCollection(
      rawContextFC,
      mapMode,
      flatProjection
    ) as FeatureCollection<Polygon | MultiPolygon, InteractiveMapFeatureProperties>;
  }, [contextAdm0Features, mapMode, flatProjection]);

  // Build O(1)-amortized Float64Array Spatial Hit Index for instant hover & click hit-testing
  const spatialHitIndex = useMemo(
    () => new SpatialHitIndex(projectedInteractiveFC),
    [projectedInteractiveFC]
  );
  const spatialHitIndexRef = useRef<SpatialHitIndex>(spatialHitIndex);
  spatialHitIndexRef.current = spatialHitIndex;

  const contextHitIndex = useMemo(
    () => new SpatialHitIndex(projectedContextFC),
    [projectedContextFC]
  );
  const contextHitIndexRef = useRef<SpatialHitIndex>(contextHitIndex);
  contextHitIndexRef.current = contextHitIndex;

  // Graticule & Ocean Envelope in current projection
  const { envelope: projectedEnvelope, graticule: projectedGraticule } =
    useMemo(() => {
      return generateGraticuleAndEnvelope(mapMode, flatProjection);
    }, [mapMode, flatProjection]);

  // Keep refs for event handlers inside MapLibre
  const isDevModeRef = useRef(isDevMode);
  isDevModeRef.current = isDevMode;

  const multiSelectModeRef = useRef(multiSelectMode);
  multiSelectModeRef.current = multiSelectMode;

  const mapModeRef = useRef(mapMode);
  mapModeRef.current = mapMode;

  const flatProjectionRef = useRef(flatProjection);
  flatProjectionRef.current = flatProjection;

  const hoveredTargetIdRef = useRef<string | null>(null);
  const prevSelectedIdsRef = useRef<Set<string>>(new Set());

  // Helper to update viewport geographic bounding box
  const syncViewportBounds = useCallback((map: maplibregl.Map) => {
    const bounds = map.getBounds();
    const sw = unprojectLngLat(
      bounds.getWest(),
      bounds.getSouth(),
      mapModeRef.current,
      flatProjectionRef.current
    ) || [-180, -85];
    const ne = unprojectLngLat(
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
  }, []);

  // Drill down into one or more countries
  const drillDownToCountries = useCallback(
    (shapeGroups: string[], targetLevel?: AdmLevel) => {
      const unique = Array.from(new Set(shapeGroups.filter(Boolean)));
      if (unique.length === 0) return;
      setFocusedCountries(unique);

      // Compute combined bbox of these countries from metadata
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const sg of unique) {
        const meta = countryMetaMap.get(sg);
        if (meta) {
          minX = Math.min(minX, meta.bbox[0]);
          minY = Math.min(minY, meta.bbox[1]);
          maxX = Math.max(maxX, meta.bbox[2]);
          maxY = Math.max(maxY, meta.bbox[3]);
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
    [countryMetaMap, admMode]
  );

  const drillDownRef = useRef(drillDownToCountries);
  drillDownRef.current = drillDownToCountries;

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      renderWorldCopies: false,
      maxPitch: 60,
      minZoom: 0.8,
      maxZoom: 14,
      center: [15, 20],
      zoom: 1.8,
      attributionControl: false,
      doubleClickZoom: false,
      style: {
        version: 8,
        projection: { type: "mercator" },
        sources: {
          "ocean-envelope": {
            type: "geojson",
            data: EMPTY_FC,
          },
          graticule: {
            type: "geojson",
            data: EMPTY_FC,
          },
          "context-adm0": {
            type: "geojson",
            data: EMPTY_FC,
          },
          "active-regions": {
            type: "geojson",
            data: EMPTY_FC,
            promoteId: "targetId",
          },
        },
        layers: [
          {
            id: "space-background",
            type: "background",
            paint: {
              "background-color": "#050914",
            },
          },
          {
            id: "ocean-fill",
            type: "fill",
            source: "ocean-envelope",
            paint: {
              "fill-color": "#0b192c",
              "fill-opacity": 0.95,
            },
          },
          {
            id: "ocean-outline",
            type: "line",
            source: "ocean-envelope",
            paint: {
              "line-color": "#1e3a5f",
              "line-width": 1.5,
            },
          },
          {
            id: "graticule-lines",
            type: "line",
            source: "graticule",
            paint: {
              "line-color": [
                "match",
                ["get", "kind"],
                "equator",
                "#38bdf8",
                "prime-meridian",
                "#38bdf8",
                "#1e293b",
              ],
              "line-width": [
                "match",
                ["get", "kind"],
                "equator",
                1.1,
                "prime-meridian",
                1.1,
                0.6,
              ],
              "line-opacity": [
                "match",
                ["get", "kind"],
                "equator",
                0.45,
                "prime-meridian",
                0.45,
                0.55,
              ],
              "line-dasharray": [2, 2],
            },
          },
          // Context ADM0 layer when zoomed into ADM1/ADM2
          {
            id: "context-adm0-fill",
            type: "fill",
            source: "context-adm0",
            paint: {
              "fill-color": "#0f172a",
              "fill-opacity": 0.65,
            },
          },
          {
            id: "context-adm0-line",
            type: "line",
            source: "context-adm0",
            paint: {
              "line-color": "#334155",
              "line-width": 0.8,
              "line-opacity": 0.6,
            },
          },
          // Active Interactive Regions Fill (uses GPU feature-state for zero-latency hover & selection!)
          {
            id: "regions-fill",
            type: "fill",
            source: "active-regions",
            paint: {
              "fill-color": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                "#7dd3fc",
                ["boolean", ["feature-state", "selected"], false],
                "#38bdf8",
                ["==", ["get", "unionMode"], "dissolved"],
                ["to-color", ["get", "groupColor"], "#f59e0b"],
                ["==", ["get", "unionMode"], "grouped"],
                ["to-color", ["get", "groupColor"], "#10b981"],
                ["==", ["get", "shapeType"], "ADM0"],
                "#1e293b",
                ["==", ["get", "shapeType"], "ADM1"],
                "#172554",
                "#1e1b4b",
              ],
              "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                0.78,
                ["boolean", ["feature-state", "selected"], false],
                0.7,
                ["==", ["get", "unionMode"], "dissolved"],
                0.55,
                ["==", ["get", "unionMode"], "grouped"],
                0.42,
                0.78,
              ],
            },
          },
          // Base border lines
          {
            id: "regions-line",
            type: "line",
            source: "active-regions",
            paint: {
              "line-color": [
                "case",
                ["==", ["get", "unionMode"], "dissolved"],
                ["to-color", ["get", "groupColor"], "#fbbf24"],
                ["==", ["get", "unionMode"], "grouped"],
                ["to-color", ["get", "groupColor"], "#34d399"],
                ["==", ["get", "shapeType"], "ADM0"],
                "#475569",
                ["==", ["get", "shapeType"], "ADM1"],
                "#3b82f6",
                "#6366f1",
              ],
              "line-width": [
                "case",
                ["==", ["get", "unionMode"], "dissolved"],
                2.2,
                ["==", ["get", "unionMode"], "grouped"],
                1.4,
                ["==", ["get", "shapeType"], "ADM0"],
                0.9,
                ["==", ["get", "shapeType"], "ADM1"],
                0.75,
                0.55,
              ],
              "line-opacity": 0.85,
            },
          },
          // GPU feature-state Selected outline (no CPU filter rebuilds!)
          {
            id: "regions-selected-line",
            type: "line",
            source: "active-regions",
            paint: {
              "line-color": "#38bdf8",
              "line-width": 2.4,
              "line-opacity": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                1,
                0,
              ],
            },
          },
          // GPU feature-state Hover outline (no CPU filter rebuilds!)
          {
            id: "regions-hover-line",
            type: "line",
            source: "active-regions",
            paint: {
              "line-color": "#f8fafc",
              "line-width": 2.2,
              "line-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                1,
                0,
              ],
            },
          },
        ],
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
      syncViewportBounds(map);
    });

    map.on("moveend", () => {
      setZoom(Number(map.getZoom().toFixed(2)));
      syncViewportBounds(map);
    });

    // Ultra-fast mousemove handler using Float64Array SpatialHitIndex + GPU feature-state
    map.on("mousemove", (e) => {
      const dLng = e.lngLat.lng;
      const dLat = e.lngLat.lat;

      const unproj = unprojectLngLat(
        dLng,
        dLat,
        mapModeRef.current,
        flatProjectionRef.current
      );
      if (cursorCoordsRef.current) {
        cursorCoordsRef.current.textContent = unproj
          ? `${unproj[1].toFixed(2)}°, ${unproj[0].toFixed(2)}°`
          : "-- , --";
      }

      if (!mapReadyRef.current || !map.getSource("active-regions")) {
        return;
      }

      const hitProps = spatialHitIndexRef.current.hitTest(dLng, dLat);

      if (hitProps) {
        map.getCanvas().style.cursor = "pointer";
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
      } else {
        const ctxHit = contextHitIndexRef.current.hitTest(dLng, dLat);
        map.getCanvas().style.cursor = ctxHit ? "pointer" : "grab";

        const prevTargetId = hoveredTargetIdRef.current;
        if (prevTargetId !== null) {
          map.setFeatureState(
            { source: "active-regions", id: prevTargetId },
            { hover: false }
          );
          hoveredTargetIdRef.current = null;
          setHoveredProps(null);
        }
      }
    });

    map.getCanvas().addEventListener("mouseleave", () => {
      const prevTargetId = hoveredTargetIdRef.current;
      if (prevTargetId && mapReadyRef.current && map.getSource("active-regions")) {
        map.setFeatureState(
          { source: "active-regions", id: prevTargetId },
          { hover: false }
        );
      }
      hoveredTargetIdRef.current = null;
      setHoveredProps(null);
    });

    // Click handler using SpatialHitIndex
    map.on("click", (e) => {
      if (!mapReadyRef.current) return;
      const dLng = e.lngLat.lng;
      const dLat = e.lngLat.lat;

      const hitProps = spatialHitIndexRef.current.hitTest(dLng, dLat);
      if (hitProps) {
        const targetId = hitProps.targetId;
        const originalEvent = e.originalEvent as MouseEvent;
        const isAdditive =
          isDevModeRef.current &&
          (multiSelectModeRef.current ||
            originalEvent.shiftKey ||
            originalEvent.metaKey ||
            originalEvent.ctrlKey);

        setSelectedTargetIds((prev) => {
          const next = new Set(isAdditive ? prev : []);
          if (isAdditive && next.has(targetId)) {
            next.delete(targetId);
          } else if (!isAdditive && prev.size === 1 && prev.has(targetId)) {
            next.delete(targetId);
          } else {
            next.add(targetId);
          }
          return next;
        });
        return;
      }

      // Check if user clicked a background context ADM0 country while zoomed in
      const ctxHit = contextHitIndexRef.current.hitTest(dLng, dLat);
      if (ctxHit && ctxHit.shapeGroup) {
        drillDownRef.current([ctxHit.shapeGroup]);
        return;
      }

      // Clicked empty ocean: clear selection unless in dev additive mode
      if (!(isDevModeRef.current && multiSelectModeRef.current)) {
        setSelectedTargetIds(new Set());
      }
    });

    // Double-click handler for instant country / subdivision drill-down
    map.on("dblclick", (e) => {
      if (!mapReadyRef.current) return;
      const dLng = e.lngLat.lng;
      const dLat = e.lngLat.lat;

      const hitProps =
        spatialHitIndexRef.current.hitTest(dLng, dLat) ||
        contextHitIndexRef.current.hitTest(dLng, dLat);

      if (hitProps) {
        const sgRaw = String(hitProps.shapeGroup || "");
        const sgs = sgRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const currentType = hitProps.shapeType as AdmLevel | undefined;
        const nextLevel: AdmLevel =
          currentType === "ADM0"
            ? "ADM1"
            : currentType === "ADM1"
              ? "ADM2"
              : "ADM2";
        if (sgs.length > 0) {
          drillDownRef.current(sgs, nextLevel);
        }
      }
    });

    mapRef.current = map;

    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [syncViewportBounds]);

  // Sync MapLibre projection mode ("globe" vs "mercator")
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyProj = () => {
      map.setProjection({
        type: mapMode === "globe" ? "globe" : "mercator",
      });
    };
    if (mapReadyRef.current) {
      applyProj();
    } else {
      map.once("load", applyProj);
      return () => {
        map.off("load", applyProj);
      };
    }
  }, [mapMode]);

  // Sync Envelope & Graticule sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applySources = () => {
      const envSrc = map.getSource(
        "ocean-envelope"
      ) as maplibregl.GeoJSONSource | undefined;
      const gratSrc = map.getSource("graticule") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (envSrc) envSrc.setData(projectedEnvelope);
      if (gratSrc) gratSrc.setData(projectedGraticule);
    };

    if (mapReadyRef.current && map.getSource("ocean-envelope")) {
      applySources();
    } else {
      map.on("load", applySources);
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
      if (activeSrc) activeSrc.setData(projectedInteractiveFC);
      if (ctxSrc) ctxSrc.setData(projectedContextFC);

      // Re-apply current hover & selected feature-states after source data update
      if (hoveredTargetIdRef.current) {
        map.setFeatureState(
          { source: "active-regions", id: hoveredTargetIdRef.current },
          { hover: true }
        );
      }
      for (const id of prevSelectedIdsRef.current) {
        map.setFeatureState(
          { source: "active-regions", id },
          { selected: true }
        );
      }
    };

    if (mapReadyRef.current && map.getSource("active-regions")) {
      applyData();
    } else {
      map.on("load", applyData);
      return () => {
        map.off("load", applyData);
      };
    }
  }, [projectedInteractiveFC, projectedContextFC]);

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

    if (mapReadyRef.current && map.getSource("active-regions")) {
      applySelectionState();
    } else {
      map.on("load", applySelectionState);
      return () => {
        map.off("load", applySelectionState);
      };
    }
  }, [selectedTargetIds]);

  // Index raw features by shapeID for quick lookup
  const rawFeaturesById = useMemo(() => {
    const map = new Map<string, AdminFeature>();
    for (const f of adm0Features) map.set(f.properties.shapeID, f);
    for (const f of subdivisionFeatures) map.set(f.properties.shapeID, f);
    return map;
  }, [adm0Features, subdivisionFeatures]);

  // Resolve what is currently selected: either a single existing group, or multiple items
  const selectionAnalysis = useMemo(() => {
    const selectedIds = Array.from(selectedTargetIds);
    if (selectedIds.length === 0) {
      return {
        state: "none" as const,
        cycleState: "separated" as UnionCycleState,
        activeGroup: null as RegionUnionGroup | null,
        resolvedMemberIds: [] as string[],
        resolvedFeatures: [] as AdminFeature[],
      };
    }

    // Check if a single existing union group is selected
    if (selectedIds.length === 1) {
      const existingGroup = unionGroups.find((g) => g.id === selectedIds[0]);
      if (existingGroup) {
        const feats = existingGroup.memberIds
          .map((id) => rawFeaturesById.get(id))
          .filter((x): x is AdminFeature => Boolean(x));
        return {
          state: "single-group" as const,
          cycleState: existingGroup.mode as UnionCycleState,
          activeGroup: existingGroup,
          resolvedMemberIds: existingGroup.memberIds,
          resolvedFeatures: feats,
        };
      }
    }

    // Collect all underlying member shapeIDs across selected items (whether separated or groups)
    const memberIdSet = new Set<string>();
    for (const id of selectedIds) {
      const grp = unionGroups.find((g) => g.id === id);
      if (grp) {
        for (const mId of grp.memberIds) memberIdSet.add(mId);
      } else {
        memberIdSet.add(id);
      }
    }

    const resolvedMemberIds = Array.from(memberIdSet);
    const resolvedFeatures = resolvedMemberIds
      .map((id) => rawFeaturesById.get(id))
      .filter((x): x is AdminFeature => Boolean(x));

    return {
      state:
        resolvedMemberIds.length >= 2
          ? ("multi-separated" as const)
          : ("single-separated" as const),
      cycleState: "separated" as UnionCycleState,
      activeGroup: null as RegionUnionGroup | null,
      resolvedMemberIds,
      resolvedFeatures,
    };
  }, [selectedTargetIds, unionGroups, rawFeaturesById]);

  /**
   * Core interactive cycle handler required by user:
   * selected items: [Separated -> Grouped (Logical Union) -> Dissolved (Geometric Union) -> Separated]
   */
  const handleCycleUnionState = useCallback(
    (forcedTargetState?: UnionCycleState) => {
      const { cycleState, activeGroup, resolvedMemberIds, resolvedFeatures } =
        selectionAnalysis;

      const nextState: UnionCycleState =
        forcedTargetState ||
        (cycleState === "separated"
          ? "grouped"
          : cycleState === "grouped"
            ? "dissolved"
            : "separated");

      if (nextState === cycleState) return;

      // Transition TO "grouped" (from separated or dissolved)
      if (nextState === "grouped") {
        if (activeGroup) {
          setUnionGroups((prev) =>
            prev.map((g) =>
              g.id === activeGroup.id ? { ...g, mode: "grouped" } : g
            )
          );
          return;
        }
        if (resolvedMemberIds.length < 2) return;

        const newGroupId = `union_${Date.now()}`;
        const memberNames = resolvedFeatures.map(
          (f) => f.properties.shapeName
        );
        const shapeGroups = Array.from(
          new Set(resolvedFeatures.map((f) => f.properties.shapeGroup))
        );
        const color = GROUP_PALETTE[colorIndex % GROUP_PALETTE.length];
        setColorIndex((c) => c + 1);

        const shortLabel =
          memberNames.length <= 3
            ? memberNames.join(" + ")
            : `${memberNames.slice(0, 2).join(" + ")} 等 ${memberNames.length} 區`;

        const newGroup: RegionUnionGroup = {
          id: newGroupId,
          name: shortLabel,
          admLevel: effectiveAdmLevel,
          memberIds: resolvedMemberIds,
          memberNames,
          shapeGroups,
          mode: "grouped",
          color,
        };

        // Remove any old overlapping groups and add the new group
        setUnionGroups((prev) => [
          ...prev.filter(
            (g) => !g.memberIds.some((m) => resolvedMemberIds.includes(m))
          ),
          newGroup,
        ]);
        setSelectedTargetIds(new Set([newGroupId]));
        return;
      }

      // Transition TO "dissolved" (Geometric Union eliminating internal borders)
      if (nextState === "dissolved") {
        if (activeGroup) {
          const dissolvedGeometry = computeDissolvedGeometry(resolvedFeatures);
          setUnionGroups((prev) =>
            prev.map((g) =>
              g.id === activeGroup.id
                ? { ...g, mode: "dissolved", dissolvedGeometry }
                : g
            )
          );
          return;
        }
        if (resolvedMemberIds.length < 2) return;

        const newGroupId = `union_${Date.now()}`;
        const memberNames = resolvedFeatures.map(
          (f) => f.properties.shapeName
        );
        const shapeGroups = Array.from(
          new Set(resolvedFeatures.map((f) => f.properties.shapeGroup))
        );
        const color = GROUP_PALETTE[colorIndex % GROUP_PALETTE.length];
        setColorIndex((c) => c + 1);

        const shortLabel =
          memberNames.length <= 3
            ? memberNames.join(" + ")
            : `${memberNames.slice(0, 2).join(" + ")} 等 ${memberNames.length} 區`;

        const dissolvedGeometry = computeDissolvedGeometry(resolvedFeatures);

        const newGroup: RegionUnionGroup = {
          id: newGroupId,
          name: shortLabel,
          admLevel: effectiveAdmLevel,
          memberIds: resolvedMemberIds,
          memberNames,
          shapeGroups,
          mode: "dissolved",
          color,
          dissolvedGeometry,
        };

        setUnionGroups((prev) => [
          ...prev.filter(
            (g) => !g.memberIds.some((m) => resolvedMemberIds.includes(m))
          ),
          newGroup,
        ]);
        setSelectedTargetIds(new Set([newGroupId]));
        return;
      }

      // Transition TO "separated" (Un-group back into individual selected regions)
      if (nextState === "separated") {
        if (activeGroup) {
          const restoredIds = new Set(activeGroup.memberIds);
          setUnionGroups((prev) =>
            prev.filter((g) => g.id !== activeGroup.id)
          );
          setSelectedTargetIds(restoredIds);
        }
      }
    },
    [selectionAnalysis, colorIndex, effectiveAdmLevel]
  );

  // Keyboard shortcut 'u' or 'U' to cycle union state on selected items (Dev Mode only)
  useEffect(() => {
    if (!isDevMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "u" || e.key === "U") {
        if (
          selectionAnalysis.activeGroup ||
          selectionAnalysis.resolvedMemberIds.length >= 2
        ) {
          e.preventDefault();
          handleCycleUnionState();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDevMode, selectionAnalysis, handleCycleUnionState]);

  // Apply a preset union template
  const handleApplyPresetUnion = useCallback(
    (preset: PresetUnionTemplate) => {
      setAdmMode("ADM0");
      setFocusedCountries([]);

      const feats = preset.shapeIDs
        .map((id) => rawFeaturesById.get(id))
        .filter((x): x is AdminFeature => Boolean(x));
      if (feats.length < 2) return;

      const existing = unionGroups.find((g) => g.id === preset.id);
      const nextMode: "grouped" | "dissolved" =
        existing?.mode === "grouped" ? "dissolved" : "grouped";

      const color =
        existing?.color || GROUP_PALETTE[colorIndex % GROUP_PALETTE.length];
      if (!existing) setColorIndex((c) => c + 1);

      const dissolvedGeometry =
        nextMode === "dissolved" ? computeDissolvedGeometry(feats) : undefined;

      const newGroup: RegionUnionGroup = {
        id: preset.id,
        name: preset.label,
        admLevel: "ADM0",
        memberIds: preset.shapeIDs,
        memberNames: feats.map((f) => f.properties.shapeName),
        shapeGroups: feats.map((f) => f.properties.shapeGroup),
        mode: nextMode,
        color,
        dissolvedGeometry,
      };

      setUnionGroups((prev) => [
        ...prev.filter(
          (g) =>
            g.id !== preset.id &&
            !g.memberIds.some((m) => preset.shapeIDs.includes(m))
        ),
        newGroup,
      ]);
      setSelectedTargetIds(new Set([preset.id]));

      // Fit camera to the preset union
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const f of feats) {
        const b = parseBbox(f.properties.bboxStr);
        minX = Math.min(minX, b[0]);
        minY = Math.min(minY, b[1]);
        maxX = Math.max(maxX, b[2]);
        maxY = Math.max(maxY, b[3]);
      }
      if (mapRef.current && Number.isFinite(minX)) {
        const projBounds = projectBbox(
          [minX, minY, maxX, maxY],
          mapMode,
          flatProjection
        );
        mapRef.current.fitBounds(projBounds, {
          padding: 100,
          maxZoom: 3.5,
          duration: 850,
        });
      }
    },
    [rawFeaturesById, unionGroups, colorIndex, mapMode, flatProjection]
  );

  // Filtered country list for search bar
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
      FLAT_PROJECTIONS.find((p) => p.id === flatProjection) ||
      FLAT_PROJECTIONS[0],
    [flatProjection]
  );

  const canCycleUnion =
    selectionAnalysis.activeGroup !== null ||
    selectionAnalysis.resolvedMemberIds.length >= 2;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#050914] text-slate-100 select-none">
      {/* MapLibre Canvas Container */}
      <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

      {/* TOP NAVIGATION & CONTROL BAR */}
      <header className="pointer-events-none absolute top-3 left-3 right-3 z-20 flex flex-wrap items-start justify-between gap-3">
        {/* Left: Brand + Mode & Projection Switcher */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/85 p-2 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 px-2.5 py-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/40">
              <Compass className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold tracking-wide text-white">
                  Geo-Vis
                </h1>
                {isDevMode && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300 ring-1 ring-emerald-500/40">
                    <Terminal className="h-2.5 w-2.5" />
                    DEV
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">
                FlatGeobuf · Multi-Projection
              </p>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-700/70" />

          {/* 2D Flat vs 3D Globe Toggle */}
          <div className="flex rounded-xl bg-slate-950/80 p-1 ring-1 ring-slate-800">
            <button
              type="button"
              onClick={() => setMapMode("flat")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                mapMode === "flat"
                  ? "bg-sky-500 text-slate-950 shadow-sm font-semibold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              平面地圖 (2D)
            </button>
            <button
              type="button"
              onClick={() => setMapMode("globe")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                mapMode === "globe"
                  ? "bg-sky-500 text-slate-950 shadow-sm font-semibold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Globe className="h-3.5 w-3.5" />
              地球球體 (3D Globe)
            </button>
          </div>

          {/* 2D Projection Selector (Active when in Flat Mode) */}
          {mapMode === "flat" && (
            <div className="flex items-center gap-1 rounded-xl bg-slate-950/80 p-1 ring-1 ring-slate-800">
              {FLAT_PROJECTIONS.map((proj) => {
                const active = flatProjection === proj.id;
                return (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => setFlatProjection(proj.id)}
                    title={`${proj.name} — ${proj.description}`}
                    className={`rounded-lg px-2.5 py-1.5 text-xs transition ${
                      active
                        ? "bg-indigo-500/90 text-white font-semibold shadow-sm"
                        : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                    }`}
                  >
                    {proj.id === "equirectangular"
                      ? "等距圓柱 (緯度等距)"
                      : proj.id === "equalEarth"
                        ? "Equal Earth"
                        : proj.id === "naturalEarth"
                          ? "Natural Earth"
                          : "Mercator"}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Center: ADM Level Controller & Drill-down Breadcrumb */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/85 p-2 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-1.5 px-2 text-xs text-slate-300">
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span className="font-medium">ADM 層級:</span>
          </div>

          <div className="flex rounded-xl bg-slate-950/80 p-1 ring-1 ring-slate-800">
            {(["auto", "ADM0", "ADM1", "ADM2"] as const).map((lvl) => {
              const isSelected = admMode === lvl;
              const isEffective =
                lvl !== "auto" && effectiveAdmLevel === lvl && admMode === "auto";
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setAdmMode(lvl)}
                  className={`relative rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    isSelected
                      ? "bg-sky-500 text-slate-950 font-semibold"
                      : isEffective
                        ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50"
                        : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {lvl === "auto" ? `自動 (${effectiveAdmLevel})` : lvl}
                </button>
              );
            })}
          </div>

          <div className="h-5 w-px bg-slate-700/70" />

          {/* Drill-down Breadcrumb */}
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setFocusedCountries([]);
                setAdmMode("auto");
                mapRef.current?.flyTo({
                  center: [15, 20],
                  zoom: 1.8,
                  duration: 800,
                });
              }}
              className={`rounded-lg px-2 py-1 transition ${
                focusedCountries.length === 0
                  ? "bg-slate-800 text-sky-300 font-medium"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              全球視角
            </button>

            {focusedCountries.length > 0 && (
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

      {/* FLOATING INTERACTIVE UNION CYCLE BAR (Bottom Center — Dev Mode Only) */}
      {isDevMode ? (
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
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
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

              <div className="h-5 w-px bg-slate-700/70" />

              {/* 3-State Union Cycle Indicator & Direct Switcher: [Separated -> Grouped -> Dissolved -> Separated] */}
              <div className="flex items-center gap-1 rounded-xl bg-slate-950/90 p-1 ring-1 ring-slate-800">
                <button
                  type="button"
                  disabled={!canCycleUnion}
                  onClick={() => handleCycleUnionState("separated")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition ${
                    selectionAnalysis.cycleState === "separated" && canCycleUnion
                      ? "bg-slate-700 text-white font-semibold"
                      : "text-slate-400 hover:text-slate-200 disabled:opacity-40"
                  }`}
                >
                  <Ungroup className="h-3.5 w-3.5" />
                  1. Separated (獨立)
                </button>

                <ChevronRight className="h-3 w-3 text-slate-600" />

                <button
                  type="button"
                  disabled={!canCycleUnion}
                  onClick={() => handleCycleUnionState("grouped")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition ${
                    selectionAnalysis.cycleState === "grouped"
                      ? "bg-emerald-500 text-slate-950 font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200 disabled:opacity-40"
                  }`}
                >
                  <Combine className="h-3.5 w-3.5" />
                  2. Grouped (邏輯群組連動)
                </button>

                <ChevronRight className="h-3 w-3 text-slate-600" />

                <button
                  type="button"
                  disabled={!canCycleUnion}
                  onClick={() => handleCycleUnionState("dissolved")}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition ${
                    selectionAnalysis.cycleState === "dissolved"
                      ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200 disabled:opacity-40"
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
                onClick={() => handleCycleUnionState()}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:from-sky-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-35"
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
                      drillDownToCountries(
                        sgs,
                        effectiveAdmLevel === "ADM0" ? "ADM1" : "ADM2"
                      );
                    }}
                    className="flex items-center gap-1 rounded-md bg-sky-500/20 px-2 py-0.5 text-sky-300 ring-1 ring-sky-500/40 hover:bg-sky-500/30"
                  >
                    <ZoomIn className="h-3 w-3" />
                    下鑽所選區域至{" "}
                    {effectiveAdmLevel === "ADM0" ? "ADM1" : "ADM2"}
                  </button>
                )}

              {selectedTargetIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTargetIds(new Set())}
                  className="text-slate-400 underline hover:text-slate-200"
                >
                  取消選取
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        selectionAnalysis.resolvedFeatures.length > 0 && (
          <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
            <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/90 px-4 py-2.5 text-xs text-slate-200 shadow-2xl backdrop-blur-xl">
              <span>
                已選取:{" "}
                <strong className="text-sky-300">
                  {selectionAnalysis.resolvedFeatures[0]?.properties.shapeName}
                </strong>
              </span>
              {effectiveAdmLevel !== "ADM2" && (
                <button
                  type="button"
                  onClick={() => {
                    const sgs = selectionAnalysis.resolvedFeatures.map(
                      (f) => f.properties.shapeGroup
                    );
                    drillDownToCountries(
                      sgs,
                      effectiveAdmLevel === "ADM0" ? "ADM1" : "ADM2"
                    );
                  }}
                  className="flex items-center gap-1 rounded-lg bg-sky-500/20 px-2.5 py-1 text-sky-300 ring-1 ring-sky-500/40 hover:bg-sky-500/30"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                  下鑽至 {effectiveAdmLevel === "ADM0" ? "ADM1" : "ADM2"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedTargetIds(new Set())}
                className="text-slate-400 underline hover:text-slate-200"
              >
                取消選取
              </button>
            </div>
          </div>
        )
      )}

      {/* LEFT HUD: HOVER INSPECTOR & PROJECTION INFO */}
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
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
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

              <p className="text-xs text-slate-300">
                所屬國家:{" "}
                <span className="font-medium text-slate-100">
                  {hoveredProps.adm0Name} ({hoveredProps.shapeGroup})
                </span>
              </p>

              {isDevMode && (
                <p className="font-mono text-[10px] text-emerald-300/90">
                  ID: {hoveredProps.targetId} · Features:{" "}
                  {projectedInteractiveFC.features.length}
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

              <div className="pt-1 text-[10px] text-slate-400">
                {isDevMode
                  ? "點擊選取 · Shift+點擊多選 · 雙擊下鑽行政區"
                  : "點擊選取 · 雙擊下鑽行政區"}
              </div>
            </div>
          ) : (
            <div className="py-3 text-xs text-slate-400">
              將滑鼠移至地圖上的國家或行政區以檢視資訊；雙擊任意國家可下鑽至該國 ADM1 / ADM2 行政區。
            </div>
          )}

          {/* Cursor coordinates & projection footer */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2 text-[11px] text-slate-400">
            <span>
              {mapMode === "globe"
                ? "3D 地球球體 (Globe)"
                : activeProjectionInfo.name.split(" ")[0]}
            </span>
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

      {/* RIGHT SIDEBAR: DEV MODE TOOLS (UNION MANAGER & PRESETS) */}
      {isDevMode && (
        <aside className="pointer-events-none absolute top-20 right-3 z-10 flex max-h-[calc(100vh-11rem)] w-80 flex-col gap-3">
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-emerald-500/40 bg-slate-900/85 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-800 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h3 className="text-xs font-bold tracking-wide text-white">
                  多區域 Union 與群組管理
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  DEV
                </span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                  {unionGroups.length} 個群組
                </span>
              </div>
            </div>

            <div className="overflow-y-auto p-3 space-y-3">
              {/* Active Union Groups List */}
              {unionGroups.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400">
                    已建立的 Union 目標 (點擊可選取或切換模式)
                  </div>
                  {unionGroups.map((grp) => {
                    const isSel = selectedTargetIds.has(grp.id);
                    return (
                      <div
                        key={grp.id}
                        onClick={() => setSelectedTargetIds(new Set([grp.id]))}
                        className={`cursor-pointer rounded-xl border p-2.5 transition ${
                          isSel
                            ? "border-sky-500/80 bg-sky-500/10"
                            : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: grp.color }}
                            />
                            <span className="truncate text-xs font-semibold text-white">
                              {grp.name}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUnionGroups((prev) =>
                                prev.filter((g) => g.id !== grp.id)
                              );
                              setSelectedTargetIds((prev) => {
                                const next = new Set(prev);
                                next.delete(grp.id);
                                return next;
                              });
                            }}
                            title="解散此群組"
                            className="rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="mt-1.5 text-[11px] text-slate-400 line-clamp-2">
                          成員 ({grp.memberIds.length}):{" "}
                          {grp.memberNames.join("、")}
                        </div>

                        {/* Per-group cycle buttons */}
                        <div className="mt-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUnionGroups((prev) =>
                                prev.map((g) =>
                                  g.id === grp.id
                                    ? { ...g, mode: "grouped" }
                                    : g
                                )
                              );
                              setSelectedTargetIds(new Set([grp.id]));
                            }}
                            className={`flex-1 rounded-md py-1 text-[10px] font-medium transition ${
                              grp.mode === "grouped"
                                ? "bg-emerald-500 text-slate-950 font-semibold"
                                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            邏輯群組 (Grouped)
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const feats = grp.memberIds
                                .map((id) => rawFeaturesById.get(id))
                                .filter((x): x is AdminFeature => Boolean(x));
                              const dissolvedGeometry =
                                grp.dissolvedGeometry ||
                                computeDissolvedGeometry(feats);
                              setUnionGroups((prev) =>
                                prev.map((g) =>
                                  g.id === grp.id
                                    ? {
                                        ...g,
                                        mode: "dissolved",
                                        dissolvedGeometry,
                                      }
                                    : g
                                )
                              );
                              setSelectedTargetIds(new Set([grp.id]));
                            }}
                            className={`flex-1 rounded-md py-1 text-[10px] font-medium transition ${
                              grp.mode === "dissolved"
                                ? "bg-amber-500 text-slate-950 font-semibold"
                                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                          >
                            幾何合併 (Dissolved)
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 font-medium text-slate-300 mb-1">
                    <Info className="h-3.5 w-3.5 text-sky-400" />
                    如何建立多區域 Union？
                  </div>
                  <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                    <li>
                      開啟下方「多選模式」或按住{" "}
                      <kbd className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">
                        Shift
                      </kbd>{" "}
                      點擊多個國家/行政區。
                    </li>
                    <li>
                      點擊下方「循環切換狀態 (快捷鍵 U)」，即可在{" "}
                      <span className="text-emerald-300">
                        Grouped (邏輯群組連動)
                      </span>{" "}
                      $\rightarrow${" "}
                      <span className="text-amber-300">
                        Dissolved (幾何合併消界)
                      </span>{" "}
                      $\rightarrow${" "}
                      <span className="text-slate-200">Separated (獨立)</span>{" "}
                      間切換！
                    </li>
                  </ol>
                </div>
              )}

              {/* Preset Union Templates */}
              <div className="pt-1">
                <div className="mb-1.5 text-[11px] font-semibold text-slate-400">
                  快速範例 Union (點擊建立 / 再次點擊切換幾何消界)
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {PRESET_UNIONS.map((preset) => {
                    const existing = unionGroups.find(
                      (g) => g.id === preset.id
                    );
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPresetUnion(preset)}
                        className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-left text-xs transition hover:border-slate-700 hover:bg-slate-800/60"
                      >
                        <div>
                          <div className="font-medium text-slate-200">
                            {preset.label}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {preset.description}
                          </div>
                        </div>
                        <span
                          className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            existing?.mode === "dissolved"
                              ? "bg-amber-500/20 text-amber-300"
                              : existing?.mode === "grouped"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {existing?.mode === "dissolved"
                            ? "已幾何合併"
                            : existing?.mode === "grouped"
                              ? "邏輯群組中"
                              : "套用"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
