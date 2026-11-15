import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type maplibregl from "maplibre-gl";
import type { DatasetMetadata, AdminFeature } from "@/lib/fgb-loader";
import { formatTargetSegment, resolveUrlTarget } from "@/lib/target-resolver";
import {
  getParentAdm1Id,
  getSubdivisionFeatureById,
  isRawShapeId,
} from "@/lib/hierarchy-manager";
import {
  type FlatProjectionId,
  type MapMode,
  type ProjectionModeId,
  projectBbox,
  projectLngLat,
  unprojectLngLat,
} from "@/lib/projections";
import type { DrilldownTarget } from "@/types/geovis";

interface UseUrlStateOptions {
  metadata: DatasetMetadata | null;
  mapRef: React.RefObject<maplibregl.Map | null>;
  mapReadyRef: React.RefObject<boolean>;
  mapModeRef: React.RefObject<MapMode>;
  flatProjectionRef: React.RefObject<FlatProjectionId>;
  setSelectedTargetIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setClickDrilldown: React.Dispatch<React.SetStateAction<DrilldownTarget | null>>;
  setHierarchyVersion: React.Dispatch<React.SetStateAction<number>>;
  currentProjectionId: ProjectionModeId;
  isDevMode: boolean;
  clickDrilldown: DrilldownTarget | null;
  selectedTargetIds: Set<string>;
  rawFeaturesById: Map<string, AdminFeature>;
  setFocusedCountries?: (countries: string[]) => void;
  setMapMode?: (mode: MapMode) => void;
  setFlatProjection?: (flat: FlatProjectionId) => void;
}

export function useUrlState({
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
}: UseUrlStateOptions) {
  const searchParams = useSearchParams();

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

  // Generate target string for URL sharing: spaces are always converted to '_' to avoid '%20'
  const currentTargetString = useMemo((): string | null => {
    if (clickDrilldown) {
      const country = clickDrilldown.shapeGroup;
      const adm1Feat = clickDrilldown.adm1Id
        ? rawFeaturesById.get(clickDrilldown.adm1Id) ||
          getSubdivisionFeatureById(clickDrilldown.adm1Id)
        : null;
      const rawAdm1Name =
        adm1Feat?.properties.shapeName ||
        (clickDrilldown.adm1Id && !isRawShapeId(clickDrilldown.adm1Id)
          ? clickDrilldown.adm1Id
          : null);
      const adm1Name = rawAdm1Name ? formatTargetSegment(rawAdm1Name) : null;

      const adm2Feat = clickDrilldown.adm2Id
        ? rawFeaturesById.get(clickDrilldown.adm2Id) ||
          getSubdivisionFeatureById(clickDrilldown.adm2Id)
        : null;
      const rawAdm2Name =
        adm2Feat?.properties.shapeName ||
        (clickDrilldown.adm2Id && !isRawShapeId(clickDrilldown.adm2Id)
          ? clickDrilldown.adm2Id
          : null);
      const adm2Name = rawAdm2Name ? formatTargetSegment(rawAdm2Name) : null;

      if (adm2Name) {
        if (adm1Name) {
          return `${country}::${adm1Name}::${adm2Name}`;
        }
        return `${country}::${adm2Name}`;
      }
      if (adm1Name) {
        return `${country}::${adm1Name}`;
      }
      return country;
    }

    if (selectedTargetIds.size > 0) {
      const firstId = Array.from(selectedTargetIds)[0];
      const feat =
        rawFeaturesById.get(firstId) || getSubdivisionFeatureById(firstId);
      if (feat) {
        const country = feat.properties.shapeGroup;
        const name = formatTargetSegment(feat.properties.shapeName);
        if (feat.properties.shapeType === "ADM0") {
          return country;
        }
        if (feat.properties.shapeType === "ADM2") {
          const parentAdm1Id = getParentAdm1Id(country, feat.properties.shapeID);
          const parentAdm1Feat = parentAdm1Id
            ? rawFeaturesById.get(parentAdm1Id) ||
              getSubdivisionFeatureById(parentAdm1Id)
            : null;
          const parentAdm1Name = parentAdm1Feat?.properties.shapeName;
          if (parentAdm1Name && !isRawShapeId(parentAdm1Name)) {
            return `${country}::${formatTargetSegment(parentAdm1Name)}::${name}`;
          }
        }
        return `${country}::${name}`;
      }
      if (firstId.startsWith("ADM0_")) {
        return firstId.replace("ADM0_", "");
      }
      if (!isRawShapeId(firstId)) {
        return formatTargetSegment(firstId);
      }
    }

    return null;
  }, [clickDrilldown, selectedTargetIds, rawFeaturesById]);

  const currentShareTargetString = currentTargetString || "";

  // Copy shareable URL with current projection, camera, and target state
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

    if (currentTargetString) {
      url.searchParams.set("target", currentTargetString);
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

    // Keep colons ':' clean without %3A in share URL
    const cleanUrl = url.toString().replace(/%3A/gi, ":");
    navigator.clipboard.writeText(cleanUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  }, [
    currentProjectionId,
    isDevMode,
    currentTargetString,
    mapRef,
    mapModeRef,
    flatProjectionRef,
  ]);

  // URL Target Initializer: Single target ADM0[::ADM1][::ADM2]
  const targetInitializedRef = useRef<boolean>(false);
  const isReadyForWritebackRef = useRef<boolean>(false);

  // Maintain active target ref so target is NEVER dropped while any selection is active
  const resolvedTargetStringRef = useRef<string | null>(
    searchParams.get("target")
  );

  const currentTargetStringRef = useRef<string | null>(currentTargetString);
  currentTargetStringRef.current = currentTargetString;

  if (currentTargetString) {
    resolvedTargetStringRef.current = currentTargetString;
  }

  const selectedTargetIdsRef = useRef<Set<string>>(selectedTargetIds);
  selectedTargetIdsRef.current = selectedTargetIds;

  const clickDrilldownRef = useRef<DrilldownTarget | null>(clickDrilldown);
  clickDrilldownRef.current = clickDrilldown;

  const currentProjectionIdRef = useRef<ProjectionModeId>(currentProjectionId);
  currentProjectionIdRef.current = currentProjectionId;

  const isDevModeRef = useRef<boolean>(isDevMode);
  isDevModeRef.current = isDevMode;

  // Clear target ref when user explicitly clears selection
  useEffect(() => {
    if (selectedTargetIds.size === 0 && !clickDrilldown) {
      resolvedTargetStringRef.current = null;
    }
  }, [selectedTargetIds, clickDrilldown]);

  // Debounced URL writeback function (Ref-based to eliminate stale closure bugs)
  const writebackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const writebackUrl = useCallback(() => {
    if (typeof window === "undefined" || !isReadyForWritebackRef.current) return;
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    try {
      const url = new URL(window.location.href);

      // 1. Projection
      const proj = currentProjectionIdRef.current;
      if (proj && proj !== "globe") {
        url.searchParams.set("proj", proj);
      } else {
        url.searchParams.delete("proj");
      }

      // 2. Dev mode
      if (isDevModeRef.current) {
        url.searchParams.set("dev", "true");
      } else {
        url.searchParams.delete("dev");
      }

      // 3. Center coordinates (WGS84 unprojected) & Ratio (Zoom)
      const center = map.getCenter();
      const geoCenter =
        unprojectLngLat(
          center.lng,
          center.lat,
          mapModeRef.current,
          flatProjectionRef.current
        ) || [center.lng, center.lat];

      if (Number.isFinite(geoCenter[0]) && Number.isFinite(geoCenter[1])) {
        url.searchParams.set("lat", geoCenter[1].toFixed(4));
        url.searchParams.set("lon", geoCenter[0].toFixed(4));
      }
      const zoomVal = map.getZoom();
      if (Number.isFinite(zoomVal)) {
        url.searchParams.set("ratio", zoomVal.toFixed(2));
      }

      // 4. Selected target: target 只要在有 selected 的情況就不該掉
      const hasSelection =
        selectedTargetIdsRef.current.size > 0 ||
        Boolean(clickDrilldownRef.current) ||
        Boolean(resolvedTargetStringRef.current);

      let targetToWrite =
        currentTargetStringRef.current ||
        resolvedTargetStringRef.current ||
        (selectedTargetIdsRef.current.size > 0
          ? Array.from(selectedTargetIdsRef.current)[0].replace(/^ADM0_/, "")
          : null);

      if (targetToWrite && isRawShapeId(targetToWrite)) {
        // Try to resolve shapeId to human-readable name
        const feat = getSubdivisionFeatureById(targetToWrite);
        if (feat) {
          const country = feat.properties.shapeGroup;
          const name = formatTargetSegment(feat.properties.shapeName);
          if (feat.properties.shapeType === "ADM0") {
            targetToWrite = country;
          } else if (feat.properties.shapeType === "ADM1") {
            targetToWrite = `${country}::${name}`;
          } else if (feat.properties.shapeType === "ADM2") {
            const parentAdm1Id = getParentAdm1Id(country, feat.properties.shapeID);
            const parentAdm1Feat = parentAdm1Id
              ? getSubdivisionFeatureById(parentAdm1Id)
              : null;
            const parentName = parentAdm1Feat?.properties.shapeName;
            if (parentName && !isRawShapeId(parentName)) {
              targetToWrite = `${country}::${formatTargetSegment(parentName)}::${name}`;
            } else {
              targetToWrite = `${country}::${name}`;
            }
          }
        }
      }

      if (hasSelection && targetToWrite && !isRawShapeId(targetToWrite)) {
        url.searchParams.set("target", targetToWrite);
      } else if (!hasSelection) {
        url.searchParams.delete("target");
      }

      // Keep ':' literal in browser address bar (never encode to %3A)
      const rawSearch = url.search.replace(/%3A/gi, ":");
      const newUrl = url.pathname + rawSearch;
      const currentUrl = (
        window.location.pathname + window.location.search
      ).replace(/%3A/gi, ":");

      if (newUrl !== currentUrl) {
        window.history.replaceState(window.history.state, "", newUrl);
      }
    } catch {
      // Safe fallback
    }
  }, [mapRef, mapReadyRef, mapModeRef, flatProjectionRef]);

  const writebackUrlRef = useRef(writebackUrl);
  writebackUrlRef.current = writebackUrl;

  const scheduleWriteback = useCallback((delayMs = 200) => {
    if (writebackTimerRef.current) {
      clearTimeout(writebackTimerRef.current);
    }
    writebackTimerRef.current = setTimeout(() => {
      writebackUrlRef.current();
    }, delayMs);
  }, []);

  // Initialize from URL target
  useEffect(() => {
    if (!metadata) return;
    const targetParam = searchParams.get("target");

    // If no target in URL on initial load, apply custom coordinates if present, then enable writeback
    if (!targetParam) {
      if (initialCamera.hasCustomCenter) {
        const moveToCustomCoordinates = () => {
          const map = mapRef.current;
          if (!map) {
            setTimeout(moveToCustomCoordinates, 50);
            return;
          }
          const canvasCenter = projectLngLat(
            initialCamera.center[0],
            initialCamera.center[1],
            mapModeRef.current,
            flatProjectionRef.current
          );
          const move = () => {
            try {
              map.jumpTo({
                center: canvasCenter,
                zoom: initialCamera.zoom,
              });
            } catch (err) {
              console.warn("[UrlState] Failed to jump to coordinates:", err);
            } finally {
              setTimeout(() => {
                isReadyForWritebackRef.current = true;
                scheduleWriteback(100);
              }, 200);
            }
          };
          if (mapReadyRef.current) {
            move();
          } else {
            map.once("load", move);
          }
        };
        moveToCustomCoordinates();
      } else {
        isReadyForWritebackRef.current = true;
        scheduleWriteback(300);
      }
      return;
    }

    if (targetInitializedRef.current) return;
    targetInitializedRef.current = true;

    resolveUrlTarget(targetParam, metadata.countries)
      .then((resolved) => {
        if (!resolved) {
          isReadyForWritebackRef.current = true;
          return;
        }

        // Always select the target
        setSelectedTargetIds(new Set([resolved.targetId]));

        if (resolved.drilldown) {
          setClickDrilldown(resolved.drilldown);
          setHierarchyVersion((v) => v + 1);
        }
        setFocusedCountries?.([resolved.shapeGroup]);

        resolvedTargetStringRef.current =
          resolved.shapeType === "ADM0"
            ? resolved.shapeGroup
            : targetParam;

        if (initialCamera.hasCustomCenter) {
          // 有座標：select target 並且移動到指定座標
          const moveToCustomCoordinates = () => {
            const map = mapRef.current;
            if (!map) {
              setTimeout(moveToCustomCoordinates, 50);
              return;
            }
            const canvasCenter = projectLngLat(
              initialCamera.center[0],
              initialCamera.center[1],
              mapModeRef.current,
              flatProjectionRef.current
            );
            const targetZoom = initialCamera.hasCustomZoom
              ? initialCamera.zoom
              : resolved.shapeType === "ADM2"
              ? 8.5
              : resolved.shapeType === "ADM1"
              ? 6.5
              : 5.0;

            const move = () => {
              try {
                map.jumpTo({
                  center: canvasCenter,
                  zoom: targetZoom,
                });
              } catch (err) {
                console.warn("[UrlState] Failed to jump to coordinates:", err);
              } finally {
                setTimeout(() => {
                  isReadyForWritebackRef.current = true;
                  scheduleWriteback(100);
                }, 300);
              }
            };

            if (mapReadyRef.current) {
              move();
            } else {
              map.once("load", move);
            }
          };
          moveToCustomCoordinates();
        } else if (resolved.bbox) {
          // 只有 target (無指定座標)：跳動到 target 的座標 (fitBounds)
          const fitTarget = () => {
            const map = mapRef.current;
            if (!map) {
              setTimeout(fitTarget, 50);
              return;
            }
            if (Number.isFinite(resolved.bbox[0])) {
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
                } finally {
                  // Wait for fitBounds animation to settle before enabling live writeback
                  setTimeout(() => {
                    isReadyForWritebackRef.current = true;
                    scheduleWriteback(100);
                  }, 950);
                }
              };
              if (mapReadyRef.current) {
                fit();
              } else {
                map.once("load", fit);
              }
            } else {
              isReadyForWritebackRef.current = true;
            }
          };
          fitTarget();
        } else {
          isReadyForWritebackRef.current = true;
          scheduleWriteback(200);
        }
      })
      .catch((err) => {
        console.warn("[TargetResolver] Error resolving target:", err);
        isReadyForWritebackRef.current = true;
      });
  }, [
    metadata,
    searchParams,
    initialCamera.hasCustomCenter,
    initialCamera.hasCustomZoom,
    initialCamera.center,
    initialCamera.zoom,
    mapRef,
    mapReadyRef,
    mapModeRef,
    flatProjectionRef,
    setSelectedTargetIds,
    setClickDrilldown,
    setFocusedCountries,
    setHierarchyVersion,
    scheduleWriteback,
  ]);

  // Listen to map camera movements for live URL writeback (debounced)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onMove = () => {
      scheduleWriteback(300);
    };

    const onMoveEnd = () => {
      scheduleWriteback(100);
    };

    map.on("move", onMove);
    map.on("moveend", onMoveEnd);

    return () => {
      map.off("move", onMove);
      map.off("moveend", onMoveEnd);
      if (writebackTimerRef.current) {
        clearTimeout(writebackTimerRef.current);
      }
    };
  }, [mapRef, scheduleWriteback]);

  // Synchronize URL when selected target or projection changes
  useEffect(() => {
    scheduleWriteback(120);
  }, [currentTargetString, currentProjectionId, scheduleWriteback]);

  const popstateSeqRef = useRef<number>(0);
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;

  // Handle browser Back / Forward history navigation (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const seq = ++popstateSeqRef.current;

      // Cancel pending writeback to prevent overwriting historical URL
      if (writebackTimerRef.current) {
        clearTimeout(writebackTimerRef.current);
        writebackTimerRef.current = null;
      }
      isReadyForWritebackRef.current = false;

      const url = new URL(window.location.href);
      const params = url.searchParams;

      // 1. Projection Mode
      const projParam = params.get("proj")?.toLowerCase().trim();
      let newMode: MapMode = "globe";
      let newFlat: FlatProjectionId = "equirectangular";
      if (projParam === "globe" || !projParam) {
        newMode = "globe";
        newFlat = "equirectangular";
      } else if (projParam === "equirectangular") {
        newMode = "flat";
        newFlat = "equirectangular";
      } else if (
        projParam === "equalearth" ||
        projParam === "equal-earth" ||
        projParam === "equal_earth"
      ) {
        newMode = "flat";
        newFlat = "equalEarth";
      } else if (
        projParam === "naturalearth" ||
        projParam === "natural-earth" ||
        projParam === "natural_earth"
      ) {
        newMode = "flat";
        newFlat = "naturalEarth";
      } else if (projParam === "mercator") {
        newMode = "flat";
        newFlat = "mercator";
      }

      if (setMapMode) setMapMode(newMode);
      if (setFlatProjection) setFlatProjection(newFlat);

      // 2. Camera params
      const latStr = params.get("lat");
      const lonStr = params.get("lon") ?? params.get("lng");
      const ratioStr = params.get("ratio") ?? params.get("zoom");
      const lat = latStr !== null ? parseFloat(latStr) : NaN;
      const lon = lonStr !== null ? parseFloat(lonStr) : NaN;
      const ratio = ratioStr !== null ? parseFloat(ratioStr) : NaN;
      const hasCoords =
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= -90 &&
        lat <= 90 &&
        lon >= -180 &&
        lon <= 180;
      const hasRatio = Number.isFinite(ratio) && ratio >= 0.5 && ratio <= 16;

      // 3. Target resolution
      const targetParam = params.get("target");
      const currentMeta = metadataRef.current;

      if (targetParam && currentMeta) {
        resolvedTargetStringRef.current = targetParam;
        resolveUrlTarget(targetParam, currentMeta.countries)
          .then((resolved) => {
            if (seq !== popstateSeqRef.current) return;
            if (!resolved) {
              isReadyForWritebackRef.current = true;
              return;
            }

            setSelectedTargetIds(new Set([resolved.targetId]));
            if (resolved.drilldown) {
              setClickDrilldown(resolved.drilldown);
              setHierarchyVersion((v) => v + 1);
            } else {
              setClickDrilldown(null);
            }
            setFocusedCountries?.([resolved.shapeGroup]);

            const map = mapRef.current;
            if (map) {
              if (hasCoords) {
                const canvasCenter = projectLngLat(lon, lat, newMode, newFlat);
                const targetZ = hasRatio
                  ? ratio
                  : resolved.shapeType === "ADM2"
                  ? 8.5
                  : resolved.shapeType === "ADM1"
                  ? 6.5
                  : 5.0;
                try {
                  map.jumpTo({ center: canvasCenter, zoom: targetZ });
                } catch {
                  // Safe fallback
                }
                setTimeout(() => {
                  if (seq === popstateSeqRef.current) {
                    isReadyForWritebackRef.current = true;
                  }
                }, 300);
              } else if (resolved.bbox && Number.isFinite(resolved.bbox[0])) {
                const projBounds = projectBbox(resolved.bbox, newMode, newFlat);
                const maxZoom =
                  resolved.shapeType === "ADM2"
                    ? 8.5
                    : resolved.shapeType === "ADM1"
                    ? 6.5
                    : 5.0;
                const padding = resolved.shapeType === "ADM2" ? 70 : 90;
                try {
                  map.fitBounds(projBounds, {
                    padding,
                    duration: 800,
                    maxZoom,
                  });
                } catch {
                  // Safe fallback
                }
                setTimeout(() => {
                  if (seq === popstateSeqRef.current) {
                    isReadyForWritebackRef.current = true;
                  }
                }, 850);
              } else {
                isReadyForWritebackRef.current = true;
              }
            } else {
              isReadyForWritebackRef.current = true;
            }
          })
          .catch(() => {
            if (seq === popstateSeqRef.current) {
              isReadyForWritebackRef.current = true;
            }
          });
      } else {
        // No target in historical URL: clear selection!
        resolvedTargetStringRef.current = null;
        setSelectedTargetIds(new Set());
        setClickDrilldown(null);
        setFocusedCountries?.([]);

        const map = mapRef.current;
        if (map && hasCoords) {
          const canvasCenter = projectLngLat(lon, lat, newMode, newFlat);
          const targetZ = hasRatio ? ratio : map.getZoom();
          try {
            map.jumpTo({ center: canvasCenter, zoom: targetZ });
          } catch {
            // Safe fallback
          }
        }
        setTimeout(() => {
          if (seq === popstateSeqRef.current) {
            isReadyForWritebackRef.current = true;
          }
        }, 300);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [
    mapRef,
    setSelectedTargetIds,
    setClickDrilldown,
    setHierarchyVersion,
    setFocusedCountries,
    setMapMode,
    setFlatProjection,
  ]);

  return {
    initialProjection,
    initialCamera,
    currentShareTargetString,
    currentTargetString,
    copiedUrl,
    handleCopyShareUrl,
    scheduleWriteback,
    writebackUrl,
  };
}
