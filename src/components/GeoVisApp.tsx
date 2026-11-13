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
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";
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
  MousePointerClick,
  Pin,
  Sliders,
  CircleDot,
  Check,
  Copy,
  GripHorizontal,
  RotateCcw,
  Orbit,
  Share2,
} from "lucide-react";

import { formatTargetSegment, resolveUrlTarget } from "@/lib/target-resolver";

import { renderCelestialSphere } from "@/lib/starfield";
import {
  ALL_PROJECTIONS,
  FLAT_PROJECTIONS,
  type FlatProjectionId,
  type MapMode,
  type ProjectionModeId,
  generateGraticuleAndEnvelope,
  projectBbox,
  projectFeatureCollection,
  projectLngLat,
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
import {
  buildDrilldownFeaturesForCountry,
  getCachedCountryHierarchy,
  getParentAdm1Id,
  loadCountryHierarchy,
} from "@/lib/hierarchy-manager";

export type InteractionMode =
  | "local-hover"
  | "wide-hover"
  | "local-click"
  | "wide-click"
  | "zoom"
  | "manual";

export interface DrilldownTarget {
  shapeGroup: string;
  adm1Id: string | null;
  adm2Id: string | null;
}

export interface HoveredVertexInfo {
  pointId: number;
  shapeID: string;
  shapeName: string;
  shapeGroup: string;
  shapeType: string;
  polyIdx: number;
  polyCount: number;
  ringIdx: number;
  ringCount: number;
  isHole: boolean;
  vertexIdx: number;
  ringVertexCount: number;
  rawLng: number;
  rawLat: number;
  prevIdx: number;
  prevLng: number;
  prevLat: number;
  nextIdx: number;
  nextLng: number;
  nextLat: number;
  distToNextDeg: number;
  isAbnormalJump: boolean;
  screenX: number;
  screenY: number;
}

export interface VertexFeatureProperties {
  pointId: number;
  shapeID: string;
  shapeName: string;
  shapeGroup: string;
  shapeType: string;
  polyIdx: number;
  polyCount: number;
  ringIdx: number;
  ringCount: number;
  isHole: boolean;
  vertexIdx: number;
  ringVertexCount: number;
  rawLng: number;
  rawLat: number;
  prevIdx: number;
  prevLng: number;
  prevLat: number;
  nextIdx: number;
  nextLng: number;
  nextLat: number;
  distToNextDeg: number;
  isAbnormalJump: boolean;
}


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

  // URL Initialization: Projection Mode (proj={globe|equirectangular|equalEarth|naturalEarth|mercator})
  const initialProjection = useMemo((): {
    mode: MapMode;
    flat: FlatProjectionId;
  } => {
    const p = searchParams.get("proj")?.toLowerCase().trim();
    if (p === "globe") return { mode: "globe", flat: "equirectangular" };
    if (p === "equirectangular") return { mode: "flat", flat: "equirectangular" };
    if (p === "equalearth" || p === "equal-earth" || p === "equal_earth") {
      return { mode: "flat", flat: "equalEarth" };
    }
    if (p === "naturalearth" || p === "natural-earth" || p === "natural_earth") {
      return { mode: "flat", flat: "naturalEarth" };
    }
    if (p === "mercator") return { mode: "flat", flat: "mercator" };
    // Default is 3D Globe
    return { mode: "globe", flat: "equirectangular" };
  }, [searchParams]);

  // URL Initialization: Camera Center & Zoom ratio (lat={}&lon={}&ratio={})
  const initialCamera = useMemo((): {
    center: [number, number];
    zoom: number;
    hasCustomCenter: boolean;
    hasCustomZoom: boolean;
  } => {
    const latStr = searchParams.get("lat");
    const lonStr = searchParams.get("lon") ?? searchParams.get("lng");
    const ratioStr = searchParams.get("ratio") ?? searchParams.get("zoom");

    const lat = latStr !== null ? parseFloat(latStr) : NaN;
    const lon = lonStr !== null ? parseFloat(lonStr) : NaN;
    const ratio = ratioStr !== null ? parseFloat(ratioStr) : NaN;

    const hasCustomCenter =
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180;
    const hasCustomZoom = Number.isFinite(ratio) && ratio >= 0.5 && ratio <= 16;

    const lng = hasCustomCenter ? lon : 15;
    const lt = hasCustomCenter ? lat : 20;
    const z = hasCustomZoom ? Math.max(0.8, Math.min(14, ratio)) : 1.8;

    return {
      center: [lng, lt],
      zoom: z,
      hasCustomCenter,
      hasCustomZoom,
    };
  }, [searchParams]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef<boolean>(false);

  // Projection & Map Mode state: DEFAULT TO 3D GLOBE OR URL PROJECTION
  const [mapMode, setMapMode] = useState<MapMode>(initialProjection.mode);
  const [flatProjection, setFlatProjection] = useState<FlatProjectionId>(
    initialProjection.flat
  );

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

  // Camera & Cursor state (initialized from URL if present)
  const [zoom, setZoom] = useState<number>(initialCamera.zoom);
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

  // Interaction Mode & Drilldown state
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("wide-click");
  const [manualAdmLevel, setManualAdmLevel] = useState<AdmLevel>("ADM0");
  const [showPolygonVertices, setShowPolygonVertices] =
    useState<boolean>(false);
  const [autoFixTopology, setAutoFixTopology] = useState<boolean>(true);

  // 3D Cosmic Starfield state (Star labels & Atmosphere glow disabled by default)
  const [showStarfield, setShowStarfield] = useState<boolean>(true);
  const [showStarLabels, setShowStarLabels] = useState<boolean>(false);
  const [showMilkyWay, setShowMilkyWay] = useState<boolean>(true);
  const [showAtmosphereGlow, setShowAtmosphereGlow] = useState<boolean>(false);
  const starfieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const starfieldRafRef = useRef<number>(0);

  // Floating Options Window state
  const [showOptionsWindow, setShowOptionsWindow] = useState<boolean>(false);
  const showOptionsWindowRef = useRef<boolean>(showOptionsWindow);
  showOptionsWindowRef.current = showOptionsWindow;
  const optionsWindowRef = useRef<HTMLDivElement | null>(null);
  const [windowPos, setWindowPos] = useState<{ x: number; y: number }>({
    x: 16,
    y: 76,
  });
  const windowPosRef = useRef<{ x: number; y: number }>({ x: 16, y: 76 });
  const isDraggingWindowRef = useRef<boolean>(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    winX: number;
    winY: number;
  }>({ mouseX: 0, mouseY: 0, winX: 16, winY: 76 });
  const clearMapHoverRef = useRef<() => void>(() => {});
  const isPointOverOptionsWindowRef = useRef<
    (clientX: number, clientY: number) => boolean
  >(() => false);

  const resetWindowPos = useCallback(() => {
    const defaultPos = { x: 16, y: 76 };
    windowPosRef.current = defaultPos;
    setWindowPos(defaultPos);
    if (optionsWindowRef.current) {
      optionsWindowRef.current.style.transform = `translate3d(${defaultPos.x}px, ${defaultPos.y}px, 0)`;
    }
  }, []);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.stopPropagation();
      e.preventDefault();

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }

      isDraggingWindowRef.current = true;
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        winX: windowPosRef.current.x,
        winY: windowPosRef.current.y,
      };

      if (mapContainerRef.current) {
        mapContainerRef.current.style.pointerEvents = "none";
      }

      clearMapHoverRef.current?.();
      document.body.style.userSelect = "none";
      document.body.style.cursor = "move";
    },
    []
  );

  const handleHeaderPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingWindowRef.current) return;
      e.stopPropagation();

      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;

      const newX = Math.max(
        10,
        Math.min(
          window.innerWidth - 380,
          dragStartRef.current.winX + dx
        )
      );
      const newY = Math.max(
        10,
        Math.min(
          window.innerHeight - 150,
          dragStartRef.current.winY + dy
        )
      );

      windowPosRef.current = { x: newX, y: newY };
      if (optionsWindowRef.current) {
        optionsWindowRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
      }
    },
    []
  );

  const handleHeaderPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingWindowRef.current) return;
      e.stopPropagation();

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Safe fallback
      }

      if (mapContainerRef.current) {
        mapContainerRef.current.style.pointerEvents = "";
      }

      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setWindowPos({ ...windowPosRef.current });

      setTimeout(() => {
        isDraggingWindowRef.current = false;
      }, 60);
    },
    []
  );
  const [pinnedDrilldown, setPinnedDrilldown] =
    useState<DrilldownTarget | null>(null);
  const [hoverDrilldown, setHoverDrilldown] =
    useState<DrilldownTarget | null>(null);
  const [clickDrilldown, setClickDrilldown] =
    useState<DrilldownTarget | null>(null);
  const [hierarchyVersion, setHierarchyVersion] = useState<number>(0);

  const interactionModeRef = useRef<InteractionMode>(interactionMode);
  interactionModeRef.current = interactionMode;
  const pinnedDrilldownRef = useRef<DrilldownTarget | null>(pinnedDrilldown);
  pinnedDrilldownRef.current = pinnedDrilldown;
  const hoverDrilldownRef = useRef<DrilldownTarget | null>(hoverDrilldown);
  hoverDrilldownRef.current = hoverDrilldown;
  const clickDrilldownRef = useRef<DrilldownTarget | null>(clickDrilldown);
  clickDrilldownRef.current = clickDrilldown;
  const hoverDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Polygon Vertex Inspection & Hover state (Dev mode)
  const [hoveredVertex, setHoveredVertex] = useState<HoveredVertexInfo | null>(
    null
  );
  const hoveredVertexRef = useRef<HoveredVertexInfo | null>(null);
  hoveredVertexRef.current = hoveredVertex;
  const showPolygonVerticesRef = useRef<boolean>(showPolygonVertices);
  showPolygonVerticesRef.current = showPolygonVertices;

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
  const handleCopyVertexDebugInfoRef = useRef(handleCopyVertexDebugInfo);
  handleCopyVertexDebugInfoRef.current = handleCopyVertexDebugInfo;

  // Pre-load hierarchy for active drilldown countries
  useEffect(() => {
    const groups = new Set<string>();
    if (pinnedDrilldown) groups.add(pinnedDrilldown.shapeGroup);
    if (hoverDrilldown) groups.add(hoverDrilldown.shapeGroup);
    if (clickDrilldown) groups.add(clickDrilldown.shapeGroup);

    for (const sg of groups) {
      if (!getCachedCountryHierarchy(sg)) {
        loadCountryHierarchy(sg)
          .then(() => {
            setHierarchyVersion((v) => v + 1);
          })
          .catch((err) => {
            console.warn(`Could not load hierarchy for ${sg}:`, err);
          });
      }
    }
  }, [pinnedDrilldown, hoverDrilldown, clickDrilldown]);

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
    if (interactionMode === "manual") return manualAdmLevel;
    if (admMode !== "auto") return admMode;
    return getAutoAdmLevel(zoom);
  }, [interactionMode, manualAdmLevel, admMode, zoom]);

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

  // Determine which countries should load ADM1 / ADM2 subdivisions when in zoom or manual mode
  const activeSubdivisionCountries = useMemo(() => {
    if (
      interactionMode === "local-hover" ||
      interactionMode === "wide-hover" ||
      interactionMode === "local-click" ||
      interactionMode === "wide-click"
    ) {
      return [];
    }
    const targetLevel =
      interactionMode === "manual" ? manualAdmLevel : effectiveAdmLevel;
    if (targetLevel === "ADM0") return [];
    if (focusedCountries.length > 0) {
      return focusedCountries;
    }
    if (!metadata) return [];

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

    const maxCountries = targetLevel === "ADM1" ? 12 : 6;
    return intersecting.slice(0, maxCountries).map((c) => c.shapeGroup);
  }, [
    interactionMode,
    manualAdmLevel,
    effectiveAdmLevel,
    focusedCountries,
    metadata,
    viewportGeoBbox,
  ]);

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

  // Active raw features for the current level / mode
  const activeRawFeatures: AdminFeature[] = useMemo(() => {
    if (adm0Features.length === 0) return [];

    if (interactionMode === "manual") {
      if (manualAdmLevel === "ADM0") {
        return adm0Features.map((f) => ({
          ...f,
          properties: { ...f.properties, drilldownRole: "base" as const },
        }));
      }
      const activeSubSet = new Set(activeSubdivisionCountries);
      const subFeats = subdivisionFeatures.map((f) => ({
        ...f,
        properties: { ...f.properties, drilldownRole: "base" as const },
      }));
      const baseAdm0 = adm0Features
        .filter((f) => !activeSubSet.has(f.properties.shapeGroup))
        .map((f) => ({
          ...f,
          properties: { ...f.properties, drilldownRole: "base" as const },
        }));
      return [...baseAdm0, ...subFeats];
    }

    if (interactionMode === "zoom") {
      if (effectiveAdmLevel === "ADM0") {
        return adm0Features.map((f) => ({
          ...f,
          properties: { ...f.properties, drilldownRole: "base" as const },
        }));
      }
      const activeSubSet = new Set(activeSubdivisionCountries);
      const subFeats = subdivisionFeatures.map((f) => ({
        ...f,
        properties: { ...f.properties, drilldownRole: "base" as const },
      }));
      const baseAdm0 = adm0Features
        .filter((f) => !activeSubSet.has(f.properties.shapeGroup))
        .map((f) => ({
          ...f,
          properties: { ...f.properties, drilldownRole: "base" as const },
        }));
      return [...baseAdm0, ...subFeats];
    }

    if (interactionMode === "local-click" || interactionMode === "wide-click") {
      const scope = interactionMode === "wide-click" ? "wide" : "local";
      if (!clickDrilldown) {
        return adm0Features.map((f) => ({
          ...f,
          properties: { ...f.properties, drilldownRole: "base" as const },
        }));
      }

      const { shapeGroup, adm1Id } = clickDrilldown;
      const hierarchy = getCachedCountryHierarchy(shapeGroup);
      if (!hierarchy) {
        return adm0Features.map((f) => ({
          ...f,
          properties: { ...f.properties, drilldownRole: "base" as const },
        }));
      }

      const expandedMap = new Map<string, "clicked" | "hovered">();
      if (adm1Id) {
        expandedMap.set(adm1Id, "clicked");
      }

      const countryFeats = buildDrilldownFeaturesForCountry(
        hierarchy,
        expandedMap,
        "clicked",
        scope
      );

      const otherCountries = adm0Features
        .filter((f) => f.properties.shapeGroup !== shapeGroup)
        .map((f) => ({
          ...f,
          properties: { ...f.properties, drilldownRole: "base" as const },
        }));

      return [...otherCountries, ...countryFeats];
    }

    // interactionMode === "local-hover" || interactionMode === "wide-hover"
    const scope = interactionMode === "wide-hover" ? "wide" : "local";
    const pinnedGroup = pinnedDrilldown?.shapeGroup || null;
    const hoverGroup = hoverDrilldown?.shapeGroup || null;

    if (!pinnedGroup && !hoverGroup) {
      return adm0Features.map((f) => ({
        ...f,
        properties: { ...f.properties, drilldownRole: "base" as const },
      }));
    }

    const result: AdminFeature[] = [];
    const expandedGroups = new Set<string>();
    if (pinnedGroup) expandedGroups.add(pinnedGroup);
    if (hoverGroup) expandedGroups.add(hoverGroup);

    // Untouched base ADM0 countries
    for (const f of adm0Features) {
      if (!expandedGroups.has(f.properties.shapeGroup)) {
        result.push({
          ...f,
          properties: { ...f.properties, drilldownRole: "base" },
        });
      }
    }

    if (pinnedGroup && hoverGroup && pinnedGroup === hoverGroup) {
      const hierarchy = getCachedCountryHierarchy(pinnedGroup);
      if (hierarchy) {
        const expandedMap = new Map<string, "clicked" | "hovered">();
        if (pinnedDrilldown?.adm1Id) {
          expandedMap.set(pinnedDrilldown.adm1Id, "clicked");
        }
        if (hoverDrilldown?.adm1Id) {
          expandedMap.set(hoverDrilldown.adm1Id, "hovered");
        }
        const countryFeats = buildDrilldownFeaturesForCountry(
          hierarchy,
          expandedMap,
          "clicked",
          scope
        );
        result.push(...countryFeats);
      } else {
        const f = adm0Features.find(
          (c) => c.properties.shapeGroup === pinnedGroup
        );
        if (f) result.push(f);
      }
    } else {
      if (pinnedGroup) {
        const hierarchy = getCachedCountryHierarchy(pinnedGroup);
        if (hierarchy) {
          const expandedMap = new Map<string, "clicked" | "hovered">();
          if (pinnedDrilldown?.adm1Id) {
            expandedMap.set(pinnedDrilldown.adm1Id, "clicked");
          }
          const countryFeats = buildDrilldownFeaturesForCountry(
            hierarchy,
            expandedMap,
            "clicked",
            scope
          );
          result.push(...countryFeats);
        } else {
          const f = adm0Features.find(
            (c) => c.properties.shapeGroup === pinnedGroup
          );
          if (f) result.push(f);
        }
      }

      if (hoverGroup) {
        const hierarchy = getCachedCountryHierarchy(hoverGroup);
        if (hierarchy) {
          const expandedMap = new Map<string, "clicked" | "hovered">();
          if (hoverDrilldown?.adm1Id) {
            expandedMap.set(hoverDrilldown.adm1Id, "hovered");
          }
          const countryFeats = buildDrilldownFeaturesForCountry(
            hierarchy,
            expandedMap,
            "hovered",
            scope
          );
          result.push(...countryFeats);
        } else {
          const f = adm0Features.find(
            (c) => c.properties.shapeGroup === hoverGroup
          );
          if (f) result.push(f);
        }
      }
    }

    return result;
  }, [
    adm0Features,
    subdivisionFeatures,
    activeSubdivisionCountries,
    interactionMode,
    manualAdmLevel,
    effectiveAdmLevel,
    pinnedDrilldown,
    hoverDrilldown,
    clickDrilldown,
    hierarchyVersion,
  ]);

  // Background context ADM0 features (used only in zoom/manual mode for non-viewport countries)
  const contextAdm0Features: AdminFeature[] = useMemo(() => {
    if (
      interactionMode === "local-hover" ||
      interactionMode === "wide-hover" ||
      interactionMode === "local-click" ||
      interactionMode === "wide-click"
    ) {
      return [];
    }
    const targetLevel =
      interactionMode === "manual" ? manualAdmLevel : effectiveAdmLevel;
    if (targetLevel === "ADM0" || adm0Features.length === 0) {
      return [];
    }
    const activeSet = new Set(activeSubdivisionCountries);
    return adm0Features.filter((f) => !activeSet.has(f.properties.shapeGroup));
  }, [
    interactionMode,
    manualAdmLevel,
    effectiveAdmLevel,
    adm0Features,
    activeSubdivisionCountries,
  ]);

  const effectiveUnionGroups = useMemo(
    () => (isDevMode ? unionGroups : []),
    [isDevMode, unionGroups]
  );

  // Active raw features with optional dev-mode autoFixTopology toggle (defaults to clean untangled geometry)
  const effectiveActiveRawFeatures = useMemo(() => {
    if (!isDevMode || autoFixTopology) {
      return activeRawFeatures;
    }
    return activeRawFeatures.map((f) =>
      f.rawGeometry ? { ...f, geometry: f.rawGeometry } : f
    );
  }, [activeRawFeatures, isDevMode, autoFixTopology]);

  const effectiveContextAdm0Features = useMemo(() => {
    if (!isDevMode || autoFixTopology) {
      return contextAdm0Features;
    }
    return contextAdm0Features.map((f) =>
      f.rawGeometry ? { ...f, geometry: f.rawGeometry } : f
    );
  }, [contextAdm0Features, isDevMode, autoFixTopology]);

  // Build interactive FeatureCollection (decoupled from hover/selection so setData is never called on hover/click!)
  const interactiveUnprojectedFC = useMemo(() => {
    return buildInteractiveFeatureCollection(
      effectiveActiveRawFeatures,
      effectiveUnionGroups,
      null,
      new Set()
    );
  }, [effectiveActiveRawFeatures, effectiveUnionGroups]);

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
      features: effectiveContextAdm0Features,
    };
    return projectFeatureCollection(
      rawContextFC,
      mapMode,
      flatProjection
    ) as FeatureCollection<Polygon | MultiPolygon, InteractiveMapFeatureProperties>;
  }, [effectiveContextAdm0Features, mapMode, flatProjection]);

  // Dev Mode: Extract polygon vertex coordinates ONLY for selected regions
  const projectedVerticesFC = useMemo((): FeatureCollection => {
    if (!isDevMode || !showPolygonVertices) {
      return EMPTY_FC;
    }

    const isFeatureSelected = (
      props: InteractiveMapFeatureProperties
    ): boolean => {
      const { targetId, shapeID, shapeGroup, drilldownRole } = props;

      // 1. Direct targetId / shapeID selection (Dev mode / manual mode / zoom click / union)
      if (selectedTargetIds.has(targetId) || selectedTargetIds.has(shapeID)) {
        return true;
      }

      // 2. Click drill-down mode
      if (clickDrilldown) {
        if (clickDrilldown.adm2Id) {
          return shapeID === clickDrilldown.adm2Id;
        }
        if (clickDrilldown.adm1Id) {
          return (
            drilldownRole === "clicked" &&
            shapeGroup === clickDrilldown.shapeGroup
          );
        }
        if (shapeGroup === clickDrilldown.shapeGroup) {
          return (
            drilldownRole === "clicked" ||
            !drilldownRole ||
            drilldownRole === "base"
          );
        }
      }

      // 3. Hover pinned drill-down mode
      if (pinnedDrilldown) {
        if (pinnedDrilldown.adm2Id) {
          return shapeID === pinnedDrilldown.adm2Id;
        }
        if (pinnedDrilldown.adm1Id) {
          return (
            drilldownRole === "clicked" &&
            shapeGroup === pinnedDrilldown.shapeGroup
          );
        }
        if (shapeGroup === pinnedDrilldown.shapeGroup) {
          return (
            drilldownRole === "clicked" ||
            !drilldownRole ||
            drilldownRole === "base"
          );
        }
      }

      return false;
    };

    const points: Array<Feature<Point, VertexFeatureProperties>> = [];
    let pId = 0;

    for (let fIdx = 0; fIdx < projectedInteractiveFC.features.length; fIdx++) {
      const projFeat = projectedInteractiveFC.features[fIdx];
      const rawFeat = interactiveUnprojectedFC.features[fIdx];
      if (!projFeat || !rawFeat) continue;

      if (!isFeatureSelected(projFeat.properties)) {
        continue;
      }

      const { shapeID, shapeName, shapeGroup, shapeType } = projFeat.properties;
      const projGeom = projFeat.geometry;
      const rawGeom = rawFeat.geometry;
      if (!projGeom || !rawGeom) continue;

      const processRing = (
        projRing: Position[],
        rawRing: Position[],
        polyIdx: number,
        polyCount: number,
        ringIdx: number,
        ringCount: number
      ) => {
        const isClosed =
          rawRing.length > 1 &&
          rawRing[0][0] === rawRing[rawRing.length - 1][0] &&
          rawRing[0][1] === rawRing[rawRing.length - 1][1];
        const N = isClosed ? rawRing.length - 1 : rawRing.length;
        if (N <= 0) return;

        for (let v = 0; v < N; v++) {
          const rawPt = rawRing[v];
          const projPt = projRing[v];
          if (
            !rawPt ||
            !projPt ||
            !Number.isFinite(rawPt[0]) ||
            !Number.isFinite(rawPt[1]) ||
            !Number.isFinite(projPt[0]) ||
            !Number.isFinite(projPt[1])
          ) {
            continue;
          }

          const rawLng = rawPt[0];
          const rawLat = rawPt[1];

          const prevIdx = (v - 1 + N) % N;
          const prevRawPt = rawRing[prevIdx];
          const prevLng = prevRawPt ? prevRawPt[0] : rawLng;
          const prevLat = prevRawPt ? prevRawPt[1] : rawLat;

          const nextIdx = (v + 1) % N;
          const nextRawPt = rawRing[nextIdx];
          const nextLng = nextRawPt ? nextRawPt[0] : rawLng;
          const nextLat = nextRawPt ? nextRawPt[1] : rawLat;

          const distToNextDeg = Math.hypot(nextLng - rawLng, nextLat - rawLat);
          const isAbnormalJump = distToNextDeg > 2.0;

          points.push({
            type: "Feature",
            id: ++pId,
            properties: {
              pointId: pId,
              shapeID,
              shapeName,
              shapeGroup,
              shapeType,
              polyIdx,
              polyCount,
              ringIdx,
              ringCount,
              isHole: ringIdx > 0,
              vertexIdx: v,
              ringVertexCount: N,
              rawLng,
              rawLat,
              prevIdx,
              prevLng,
              prevLat,
              nextIdx,
              nextLng,
              nextLat,
              distToNextDeg,
              isAbnormalJump,
            },
            geometry: {
              type: "Point",
              coordinates: [projPt[0], projPt[1]],
            },
          });
        }
      };

      if (projGeom.type === "Polygon" && rawGeom.type === "Polygon") {
        const ringCount = projGeom.coordinates.length;
        for (let r = 0; r < ringCount; r++) {
          processRing(
            projGeom.coordinates[r],
            rawGeom.coordinates[r],
            0,
            1,
            r,
            ringCount
          );
        }
      } else if (
        projGeom.type === "MultiPolygon" &&
        rawGeom.type === "MultiPolygon"
      ) {
        const polyCount = projGeom.coordinates.length;
        for (let p = 0; p < polyCount; p++) {
          const pRings = projGeom.coordinates[p];
          const rRings = rawGeom.coordinates[p];
          const ringCount = pRings.length;
          for (let r = 0; r < ringCount; r++) {
            processRing(pRings[r], rRings[r], p, polyCount, r, ringCount);
          }
        }
      }
    }

    return {
      type: "FeatureCollection",
      features: points,
    };
  }, [
    isDevMode,
    showPolygonVertices,
    projectedInteractiveFC,
    interactiveUnprojectedFC,
    selectedTargetIds,
    clickDrilldown,
    pinnedDrilldown,
  ]);

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
  const lastCursorPosRef = useRef<{ dLng: number; dLat: number } | null>(null);

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
  }, []);

  const clearAllSelectionRef = useRef(clearAllSelection);
  clearAllSelectionRef.current = clearAllSelection;

  // Occlusion helper: check if client coordinate is within Options Window
  const isPointOverOptionsWindow = useCallback(
    (clientX: number, clientY: number) => {
      if (!showOptionsWindowRef.current || !optionsWindowRef.current) return false;
      const rect = optionsWindowRef.current.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    },
    []
  );
  isPointOverOptionsWindowRef.current = isPointOverOptionsWindow;

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
  }, []);
  clearMapHoverRef.current = clearMapHover;

  // URL Target Initializer: Single target ADM0[::ADM1][::ADM2]
  const targetInitializedRef = useRef<boolean>(false);
  useEffect(() => {
    if (!metadata || targetInitializedRef.current) return;
    const targetParam = searchParams.get("target");
    if (!targetParam) return;
    targetInitializedRef.current = true;

    resolveUrlTarget(targetParam, metadata.countries)
      .then((resolved) => {
        if (!resolved) return;

        setSelectedTargetIds(new Set([resolved.targetId]));

        if (resolved.drilldown) {
          setClickDrilldown(resolved.drilldown);
          setHierarchyVersion((v) => v + 1);
        }

        // Auto-fit camera to target bbox only when explicit lat/lon is not provided in URL
        if (!initialCamera.hasCustomCenter && resolved.bbox) {
          const map = mapRef.current;
          if (map && Number.isFinite(resolved.bbox[0])) {
            const projBounds = projectBbox(
              resolved.bbox,
              mapModeRef.current,
              flatProjectionRef.current
            );
            const maxZoom =
              resolved.shapeType === "ADM2"
                ? 8.5
                : resolved.shapeType === "ADM1"
                ? 6.5
                : 5.0;
            const padding = resolved.shapeType === "ADM2" ? 70 : 90;
            const fit = () => {
              try {
                map.fitBounds(projBounds, {
                  padding,
                  duration: 900,
                  maxZoom,
                });
              } catch (err) {
                console.warn("[TargetResolver] Failed to fit bounds:", err);
              }
            };
            if (mapReadyRef.current) {
              fit();
            } else {
              map.once("load", fit);
            }
          }
        }
      })
      .catch((err) => {
        console.warn("[TargetResolver] Error resolving target:", err);
      });
  }, [metadata, searchParams, initialCamera.hasCustomCenter]);

  // Initialize MapLibre GL instance
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCanvasCenter = projectLngLat(
      initialCamera.center[0],
      initialCamera.center[1],
      initialProjection.mode,
      initialProjection.flat
    );

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      canvasContextAttributes: { alpha: true, antialias: true },
      renderWorldCopies: false,
      maxPitch: 60,
      minZoom: 0.8,
      maxZoom: 14,
      center: initialCanvasCenter,
      zoom: initialCamera.zoom,
      attributionControl: false,
      doubleClickZoom: false,
      style: {
        version: 8,
        projection: {
          type: initialProjection.mode === "globe" ? "globe" : "mercator",
        },
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
          "polygon-vertices": {
            type: "geojson",
            data: EMPTY_FC,
          },
          "hovered-vertex": {
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
              "background-opacity": 0,
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
                [
                  "case",
                  ["==", ["get", "drilldownRole"], "hovered"],
                  "#a855f7",
                  ["==", ["get", "drilldownRole"], "clicked"],
                  "#10b981",
                  ["==", ["get", "drilldownRole"], "wide-context"],
                  "#38bdf8",
                  "#0284c7",
                ],
                ["boolean", ["feature-state", "selected"], false],
                "#38bdf8",
                ["==", ["get", "unionMode"], "dissolved"],
                ["to-color", ["get", "groupColor"], "#f59e0b"],
                ["==", ["get", "unionMode"], "grouped"],
                ["to-color", ["get", "groupColor"], "#10b981"],
                // Clicked / Pinned center: Emerald / Teal
                ["==", ["get", "drilldownRole"], "clicked"],
                [
                  "case",
                  ["==", ["get", "shapeType"], "ADM2"],
                  "#042f2e",
                  ["==", ["get", "shapeType"], "ADM1"],
                  "#064e3b",
                  "#0f766e",
                ],
                // Hovered center: Violet / Purple
                ["==", ["get", "drilldownRole"], "hovered"],
                [
                  "case",
                  ["==", ["get", "shapeType"], "ADM2"],
                  "#3b0764",
                  ["==", ["get", "shapeType"], "ADM1"],
                  "#312e81",
                  "#4338ca",
                ],
                // Wide context ADM2: Dark slate
                ["==", ["get", "drilldownRole"], "wide-context"],
                "#0f172a",
                // Base colors:
                ["==", ["get", "shapeType"], "ADM0"],
                "#1e293b",
                ["==", ["get", "shapeType"], "ADM1"],
                "#172554",
                "#1e1b4b",
              ],
              "fill-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                0.85,
                ["boolean", ["feature-state", "selected"], false],
                0.75,
                ["==", ["get", "unionMode"], "dissolved"],
                0.55,
                ["==", ["get", "unionMode"], "grouped"],
                0.42,
                ["==", ["get", "drilldownRole"], "wide-context"],
                0.65,
                0.8,
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
                ["==", ["get", "drilldownRole"], "clicked"],
                [
                  "case",
                  ["==", ["get", "shapeType"], "ADM2"],
                  "#14b8a6",
                  ["==", ["get", "shapeType"], "ADM1"],
                  "#10b981",
                  "#059669",
                ],
                ["==", ["get", "drilldownRole"], "hovered"],
                [
                  "case",
                  ["==", ["get", "shapeType"], "ADM2"],
                  "#c084fc",
                  ["==", ["get", "shapeType"], "ADM1"],
                  "#818cf8",
                  "#a855f7",
                ],
                ["==", ["get", "drilldownRole"], "wide-context"],
                "#334155",
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
                ["==", ["get", "drilldownRole"], "clicked"],
                [
                  "case",
                  ["==", ["get", "shapeType"], "ADM2"],
                  0.75,
                  ["==", ["get", "shapeType"], "ADM1"],
                  1.2,
                  1.4,
                ],
                ["==", ["get", "drilldownRole"], "hovered"],
                [
                  "case",
                  ["==", ["get", "shapeType"], "ADM2"],
                  0.75,
                  ["==", ["get", "shapeType"], "ADM1"],
                  1.2,
                  1.4,
                ],
                ["==", ["get", "drilldownRole"], "wide-context"],
                0.5,
                ["==", ["get", "shapeType"], "ADM0"],
                0.9,
                ["==", ["get", "shapeType"], "ADM1"],
                0.75,
                0.55,
              ],
              "line-opacity": 0.9,
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
              "line-color": [
                "case",
                ["==", ["get", "drilldownRole"], "clicked"],
                "#6ee7b7",
                ["==", ["get", "drilldownRole"], "hovered"],
                "#f0abfc",
                ["==", ["get", "drilldownRole"], "wide-context"],
                "#38bdf8",
                "#f8fafc",
              ],
              "line-width": 2.2,
              "line-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                1,
                0,
              ],
            },
          },
          // Dev Mode: Polygon Vertices (points)
          {
            id: "polygon-vertices-circle",
            type: "circle",
            source: "polygon-vertices",
            layout: {
              visibility: "none",
            },
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                2,
                4,
                3.5,
                7,
                4.8,
                10,
                6,
                14,
                7.5,
              ],
              "circle-color": [
                "case",
                ["boolean", ["get", "isAbnormalJump"], false],
                "#f43f5e",
                "#38bdf8",
              ],
              "circle-stroke-width": 1.2,
              "circle-stroke-color": [
                "case",
                ["boolean", ["get", "isAbnormalJump"], false],
                "#ffe4e6",
                "#ffffff",
              ],
              "circle-opacity": 0.95,
            },
          },
          // Highlighted / Hovered Vertex Glow
          {
            id: "hovered-vertex-glow",
            type: "circle",
            source: "hovered-vertex",
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                8,
                6,
                14,
                12,
                20,
              ],
              "circle-color": "#f59e0b",
              "circle-opacity": 0.5,
              "circle-blur": 0.6,
            },
          },
          // Highlighted / Hovered Vertex Dot
          {
            id: "hovered-vertex-circle",
            type: "circle",
            source: "hovered-vertex",
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                1,
                4,
                6,
                6,
                12,
                8,
              ],
              "circle-color": "#fbbf24",
              "circle-stroke-width": 2.5,
              "circle-stroke-color": "#ffffff",
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
      if (isDraggingWindowRef.current) {
        if (hoveredTargetIdRef.current !== null || hoveredVertexRef.current !== null) {
          clearMapHoverRef.current?.();
        }
        if (cursorCoordsRef.current) {
          cursorCoordsRef.current.textContent = "-- , --";
        }
        return;
      }

      const origEvent = e.originalEvent as MouseEvent | undefined;
      const isOverWin =
        origEvent &&
        isPointOverOptionsWindowRef.current(origEvent.clientX, origEvent.clientY);

      if (isOverWin) {
        if (hoveredTargetIdRef.current !== null || hoveredVertexRef.current !== null) {
          clearMapHoverRef.current?.();
        }
        if (cursorCoordsRef.current) {
          cursorCoordsRef.current.textContent = "-- , --";
        }
        return;
      }

      const dLng = e.lngLat.lng;
      const dLat = e.lngLat.lat;
      lastCursorPosRef.current = { dLng, dLat };

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

        // Preload country hierarchy on hover in hover or click modes for instant clicks
        const currentMode = interactionModeRef.current;
        const isHoverMode =
          currentMode === "local-hover" || currentMode === "wide-hover";
        const isClickMode =
          currentMode === "local-click" || currentMode === "wide-click";

        if (isHoverMode || isClickMode) {
          const { shapeGroup } = hitProps;
          const cachedH = getCachedCountryHierarchy(shapeGroup);
          if (!cachedH) {
            loadCountryHierarchy(shapeGroup)
              .then(() => setHierarchyVersion((v) => v + 1))
              .catch((err) => console.warn(err));
          }
        }

        // Handle hover drill-down on mouse move
        if (isHoverMode) {
          const { shapeGroup, shapeID, shapeType } = hitProps;

          if (shapeType === "ADM0") {
            if (hoverDrilldownRef.current?.shapeGroup !== shapeGroup) {
              if (hoverDebounceTimerRef.current) {
                clearTimeout(hoverDebounceTimerRef.current);
              }
              setHoverDrilldown({ shapeGroup, adm1Id: null, adm2Id: null });
            }
          } else if (shapeType === "ADM1") {
            if (
              hoverDrilldownRef.current?.shapeGroup === shapeGroup &&
              hoverDrilldownRef.current?.adm1Id !== shapeID
            ) {
              if (hoverDebounceTimerRef.current) {
                clearTimeout(hoverDebounceTimerRef.current);
              }
              hoverDebounceTimerRef.current = setTimeout(() => {
                setHoverDrilldown({ shapeGroup, adm1Id: shapeID, adm2Id: null });
              }, 70);
            } else if (hoverDrilldownRef.current?.shapeGroup !== shapeGroup) {
              setHoverDrilldown({ shapeGroup, adm1Id: shapeID, adm2Id: null });
            }
          } else if (shapeType === "ADM2") {
            const parentAdm1 = getParentAdm1Id(shapeGroup, shapeID);
            if (currentMode === "wide-hover") {
              if (
                hoverDrilldownRef.current?.shapeGroup === shapeGroup &&
                parentAdm1 &&
                hoverDrilldownRef.current?.adm1Id !== parentAdm1
              ) {
                // In wide-hover, as mouse moves across ADM1 borders, update the active ADM1 highlight!
                setHoverDrilldown({
                  shapeGroup,
                  adm1Id: parentAdm1,
                  adm2Id: shapeID,
                });
              } else if (
                hoverDrilldownRef.current?.shapeGroup === shapeGroup &&
                hoverDrilldownRef.current?.adm2Id !== shapeID
              ) {
                hoverDrilldownRef.current = {
                  shapeGroup,
                  adm1Id: parentAdm1 || hoverDrilldownRef.current.adm1Id,
                  adm2Id: shapeID,
                };
              }
            } else {
              // local-hover
              if (
                hoverDrilldownRef.current?.shapeGroup === shapeGroup &&
                hoverDrilldownRef.current?.adm2Id !== shapeID
              ) {
                hoverDrilldownRef.current = {
                  shapeGroup,
                  adm1Id: parentAdm1 || hoverDrilldownRef.current.adm1Id,
                  adm2Id: shapeID,
                };
              }
            }
          }
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

        // If in hover mode and cursor left land:
        if (
          interactionModeRef.current === "local-hover" ||
          interactionModeRef.current === "wide-hover"
        ) {
          if (hoverDrilldownRef.current !== null) {
            if (hoverDebounceTimerRef.current) {
              clearTimeout(hoverDebounceTimerRef.current);
            }
            hoverDebounceTimerRef.current = setTimeout(() => {
              setHoverDrilldown(null);
            }, 90);
          }
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
      setHoveredVertex(null);
      lastCursorPosRef.current = null;
      if (
        interactionModeRef.current === "local-hover" ||
        interactionModeRef.current === "wide-hover"
      ) {
        if (hoverDebounceTimerRef.current) {
          clearTimeout(hoverDebounceTimerRef.current);
        }
        setHoverDrilldown(null);
      }
    });

    // Click handler using SpatialHitIndex
    map.on("click", (e) => {
      if (!mapReadyRef.current) return;
      if (isDraggingWindowRef.current) {
        return;
      }
      const origEvent = e.originalEvent as MouseEvent | undefined;
      const isOverWin =
        origEvent &&
        isPointOverOptionsWindowRef.current(origEvent.clientX, origEvent.clientY);

      if (isOverWin) {
        return;
      }

      const dLng = e.lngLat.lng;
      const dLat = e.lngLat.lat;
      lastCursorPosRef.current = { dLng, dLat };

      // Clicked on a polygon vertex in dev mode: copy debug info to clipboard
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

      // Clicked on ocean / background: cancel all selection states
      if (!hitProps) {
        // If in zoom or manual mode, check if clicked a background context ADM0 country
        const ctxHit = contextHitIndexRef.current.hitTest(dLng, dLat);
        if (
          ctxHit &&
          ctxHit.shapeGroup &&
          (activeMode === "zoom" || activeMode === "manual")
        ) {
          drillDownRef.current([ctxHit.shapeGroup]);
          return;
        }

        // Ocean click: clear all selection states
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
        return;
      }

      if (activeMode === "local-click" || activeMode === "wide-click") {
        const { shapeGroup, shapeID, shapeType } = hitProps;
        if (shapeType === "ADM0") {
          loadCountryHierarchy(shapeGroup)
            .then(() => setHierarchyVersion((v) => v + 1))
            .catch((err) => console.warn(err));
          setClickDrilldown({
            shapeGroup,
            adm1Id: null,
            adm2Id: null,
          });
          setSelectedTargetIds(new Set([hitProps.targetId]));
          return;
        } else if (shapeType === "ADM1") {
          if (clickDrilldownRef.current?.adm1Id === shapeID) {
            setClickDrilldown({
              shapeGroup,
              adm1Id: null,
              adm2Id: null,
            });
            setSelectedTargetIds(new Set());
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
              // In wide-click, clicking an ADM2 of another ADM1 updates the active ADM1 highlight!
              setClickDrilldown({
                shapeGroup,
                adm1Id: parentAdm1,
                adm2Id: shapeID,
              });
              setSelectedTargetIds(new Set([hitProps.targetId]));
              return;
            }
          }
          setClickDrilldown((prev) =>
            prev
              ? {
                  ...prev,
                  adm2Id: prev.adm2Id === shapeID ? null : shapeID,
                }
              : null
          );
          setSelectedTargetIds((prev) => {
            if (prev.size === 1 && prev.has(hitProps.targetId)) return new Set();
            return new Set([hitProps.targetId]);
          });
          return;
        }
        return;
      }

      // Default behavior for "zoom" and "manual"
      const targetId = hitProps.targetId;
      setSelectedTargetIds((prev) => {
        if (prev.size === 1 && prev.has(targetId)) {
          return new Set();
        }
        return new Set([targetId]);
      });
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
    if (mapReadyRef.current) {
      updateOpacity();
    } else {
      map.once("load", updateOpacity);
      return () => {
        map.off("load", updateOpacity);
      };
    }
  }, [showStarfield, mapMode]);

  // Render loop for 3D Cosmic Starfield background (RAF 60/120 FPS synchronized with camera)
  useEffect(() => {
    if (!showStarfield || mapMode !== "globe") {
      if (starfieldRafRef.current) {
        cancelAnimationFrame(starfieldRafRef.current);
        starfieldRafRef.current = 0;
      }
      return;
    }

    let active = true;

    const renderLoop = (timeMs: number) => {
      if (!active) return;
      const map = mapRef.current;
      const canvas = starfieldCanvasRef.current;
      if (map && canvas) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(width * dpr);
        const targetH = Math.round(height * dpr);

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          const center = map.getCenter();
          const bearing = map.getBearing();
          const pitch = map.getPitch();
          const zoom = map.getZoom();

          renderCelestialSphere(
            ctx,
            width,
            height,
            center.lng,
            center.lat,
            bearing,
            pitch,
            zoom,
            {
              showLabels: showStarLabels,
              showMilkyWay,
              showAtmosphereGlow,
              timeMs,
            }
          );

          ctx.restore();
        }
      }
      starfieldRafRef.current = requestAnimationFrame(renderLoop);
    };

    starfieldRafRef.current = requestAnimationFrame(renderLoop);

    return () => {
      active = false;
      if (starfieldRafRef.current) {
        cancelAnimationFrame(starfieldRafRef.current);
        starfieldRafRef.current = 0;
      }
    };
  }, [
    showStarfield,
    showStarLabels,
    showMilkyWay,
    showAtmosphereGlow,
    mapMode,
  ]);

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

      // Synchronize hover state using current cursor position so it updates even when cursor does not move
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
        vertSrc.setData(projectedVerticesFC);
      }
    };

    if (mapReadyRef.current && map.getSource("polygon-vertices")) {
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

    if (mapReadyRef.current && map.getSource("hovered-vertex")) {
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
    for (const f of activeRawFeatures) map.set(f.properties.shapeID, f);
    return map;
  }, [adm0Features, subdivisionFeatures, activeRawFeatures]);

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

  // Generate target string for URL sharing: spaces are always converted to '_' to avoid '%20'
  const currentShareTargetString = useMemo(() => {
    if (clickDrilldown) {
      const country = clickDrilldown.shapeGroup;
      const adm1Feat = clickDrilldown.adm1Id
        ? rawFeaturesById.get(clickDrilldown.adm1Id)
        : null;
      const adm1Name = adm1Feat?.properties.shapeName || clickDrilldown.adm1Id;
      const adm2Feat = clickDrilldown.adm2Id
        ? rawFeaturesById.get(clickDrilldown.adm2Id)
        : null;
      const adm2Name = adm2Feat?.properties.shapeName || clickDrilldown.adm2Id;

      if (adm2Name) {
        if (adm1Name) {
          return `${country}::${formatTargetSegment(adm1Name)}::${formatTargetSegment(adm2Name)}`;
        }
        return `${country}::${formatTargetSegment(adm2Name)}`;
      }
      if (adm1Name) {
        return `${country}::${formatTargetSegment(adm1Name)}`;
      }
      return country;
    }

    if (selectedTargetIds.size > 0) {
      const firstId = Array.from(selectedTargetIds)[0];
      const feat = rawFeaturesById.get(firstId);
      if (feat) {
        const country = feat.properties.shapeGroup;
        const name = formatTargetSegment(feat.properties.shapeName);
        if (feat.properties.shapeType === "ADM0") {
          return country;
        }
        return `${country}::${name}`;
      }
      return formatTargetSegment(firstId);
    }

    return "TWN::Hsinchu_County";
  }, [clickDrilldown, selectedTargetIds, rawFeaturesById]);

  // Copy shareable URL with current projection, camera, and target state (converting spaces to '_')
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const handleCopyShareUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.origin + window.location.pathname);

    if (currentProjectionId !== "globe") {
      url.searchParams.set("proj", currentProjectionId);
    }
    if (isDevMode) {
      url.searchParams.set("dev", "true");
    }

    if (currentShareTargetString && (clickDrilldown || selectedTargetIds.size > 0)) {
      url.searchParams.set("target", currentShareTargetString);
    }

    const map = mapRef.current;
    if (map) {
      const center = map.getCenter();
      const geoCenter =
        unprojectLngLat(
          center.lng,
          center.lat,
          mapModeRef.current,
          flatProjectionRef.current
        ) || [center.lng, center.lat];
      url.searchParams.set("lat", geoCenter[1].toFixed(4));
      url.searchParams.set("lon", geoCenter[0].toFixed(4));
      url.searchParams.set("ratio", map.getZoom().toFixed(2));
    }

    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  }, [currentProjectionId, isDevMode, currentShareTargetString, clickDrilldown, selectedTargetIds]);

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

  // Global Keyboard shortcuts: ESC to clear all selection states; 'u' for union cycle (Dev Mode)
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
  }, [clearAllSelection, isDevMode, selectionAnalysis, handleCycleUnionState]);

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
      ALL_PROJECTIONS.find((p) => p.id === currentProjectionId) ||
      ALL_PROJECTIONS[0],
    [currentProjectionId]
  );

  const canCycleUnion =
    selectionAnalysis.activeGroup !== null ||
    selectionAnalysis.resolvedMemberIds.length >= 2;

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

      {/* FLOATING OPTIONS WINDOW */}
      {showOptionsWindow && (
        <div
          ref={optionsWindowRef}
          style={{
            transform: `translate3d(${windowPosRef.current.x}px, ${windowPosRef.current.y}px, 0)`,
            left: 0,
            top: 0,
            willChange: "transform",
          }}
          onMouseEnter={clearMapHover}
          onMouseMove={(e) => {
            e.stopPropagation();
            if (hoveredTargetIdRef.current) {
              clearMapHover();
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
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={handleHeaderPointerUp}
            onPointerCancel={handleHeaderPointerUp}
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
                onClick={resetWindowPos}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                title="重設視窗位置至左上角"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowOptionsWindow(false)}
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
                      onClick={() => handleSelectProjection(proj.id)}
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
                        showMilkyWay
                          ? "bg-indigo-500/30 text-indigo-200 ring-1 ring-indigo-400/50"
                          : "bg-slate-800/80 text-slate-400 hover:text-white"
                      }`}
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
                        showAtmosphereGlow
                          ? "bg-indigo-500/30 text-indigo-200 ring-1 ring-indigo-400/50"
                          : "bg-slate-800/80 text-slate-400 hover:text-white"
                      }`}
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
                      {currentShareTargetString}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyShareUrl}
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
              onClick={() => setShowOptionsWindow(false)}
              className="rounded-lg bg-slate-800 px-3 py-1 font-medium text-slate-200 hover:bg-slate-700 transition"
            >
              完成
            </button>
          </div>
        </div>
      )}

      {/* TOP NAVIGATION & CONTROL BAR */}
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
            <button
              type="button"
              onClick={() => {
                clearAllSelection();
                setAdmMode("auto");
                mapRef.current?.flyTo({
                  center: [15, 20],
                  zoom: 1.8,
                  duration: 800,
                });
              }}
              className={`rounded-lg px-2 py-1 transition ${
                !pinnedDrilldown &&
                !hoverDrilldown &&
                !clickDrilldown &&
                focusedCountries.length === 0
                  ? "bg-slate-800 text-sky-300 font-medium"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              全球視角
            </button>

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

      {/* FLOATING INTERACTIVE UNION CYCLE BAR (Bottom Center — Dev Mode Only) */}
      {isDevMode && (
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

              {/* Polygon Vertices (Point) toggle */}
              <button
                type="button"
                onClick={() => setShowPolygonVertices((v) => !v)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                  showPolygonVertices
                    ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50 shadow-sm"
                    : "bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
                title="開啟/關閉所有多邊形幾何頂點 (Polygon Point) 顯示 (快捷鍵 P)"
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
                  {showPolygonVertices && ` · Points: ${projectedVerticesFC.features.length}`}
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
                      onClick={() => handleCopyVertexDebugInfo(hoveredVertex)}
                      className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/30 ring-1 ring-amber-500/40 transition"
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
            <span>{activeProjectionInfo.name}</span>
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
