import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AdmLevel,
  type AdminFeature,
  type CountryMeta,
  type DatasetMetadata,
  bboxesIntersect,
  getCachedCountrySubdivisions,
  loadAdm0Features,
  loadCountrySubdivisions,
  loadMetadata,
  loadMultipleCountrySubdivisions,
} from "@/lib/fgb-loader";
import {
  buildDrilldownFeaturesForCountry,
  getAllCachedCountryHierarchies,
  getCachedCountryHierarchy,
  loadCountryHierarchy,
} from "@/lib/hierarchy-manager";
import {
  type DrilldownTarget,
  type InteractionMode,
  getAutoAdmLevel,
} from "@/types/geovis";
import type { ParsedLabelDataset } from "@/lib/label-parser";
import {
  type TargetHierarchyConstraints,
  computeTargetHierarchyConstraints,
  resolveAstToUnionGroup,
} from "@/lib/label-hierarchy-resolver";
import type { RegionUnionGroup } from "@/lib/union-engine";

interface UseGeoDataOptions {
  interactionMode: InteractionMode;
  manualAdmLevel: AdmLevel;
  admMode: "auto" | AdmLevel;
  zoom: number;
  focusedCountries: string[];
  viewportGeoBbox: [number, number, number, number];
  pinnedDrilldown: DrilldownTarget | null;
  hoverDrilldown: DrilldownTarget | null;
  clickDrilldown: DrilldownTarget | null;
  hierarchyVersion: number;
  setHierarchyVersion: React.Dispatch<React.SetStateAction<number>>;
  isDevMode: boolean;
  autoFixTopology: boolean;
  showRegionLabels?: boolean;
  activeLabelDataset?: ParsedLabelDataset | null;
}

export function useGeoData({
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
  showRegionLabels = false,
  activeLabelDataset = null,
}: UseGeoDataOptions) {
  // Data loading state
  const [metadata, setMetadata] = useState<DatasetMetadata | null>(null);
  const [adm0Features, setAdm0Features] = useState<AdminFeature[]>([]);
  const [subdivisionFeatures, setSubdivisionFeatures] = useState<AdminFeature[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [loadingMessage, setLoadingMessage] = useState<string>("載入全球 ADM0 FlatGeobuf 資料中...");

  // Effective ADM level based on auto/manual mode
  const effectiveAdmLevel: AdmLevel = useMemo(() => {
    if (interactionMode === "manual") return manualAdmLevel;
    if (admMode !== "auto") return admMode;
    return getAutoAdmLevel(zoom);
  }, [interactionMode, manualAdmLevel, admMode, zoom]);

  // Target view hierarchy constraints (enforce Target entity view rules)
  const hierarchyConstraints = useMemo((): TargetHierarchyConstraints => {
    if (!showRegionLabels || !activeLabelDataset) {
      return {
        enforcedAdm0Countries: new Set<string>(),
        enforcedAdm1Countries: new Set<string>(),
        enforcedAdm2Countries: new Set<string>(),
        enforcedAdm1Kept: new Set<string>(),
        viewportLabelItems: [],
      };
    }
    return computeTargetHierarchyConstraints(
      activeLabelDataset,
      viewportGeoBbox,
      metadata
    );
  }, [showRegionLabels, activeLabelDataset, viewportGeoBbox, metadata]);


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

  // Pre-load hierarchy for active drilldown countries and enforced subdivision targets
  useEffect(() => {
    const groups = new Set<string>();
    if (pinnedDrilldown) groups.add(pinnedDrilldown.shapeGroup);
    if (hoverDrilldown) groups.add(hoverDrilldown.shapeGroup);
    if (clickDrilldown) groups.add(clickDrilldown.shapeGroup);
    for (const sg of hierarchyConstraints.enforcedAdm1Countries) groups.add(sg);
    for (const sg of hierarchyConstraints.enforcedAdm2Countries) groups.add(sg);

    const centerLng = (viewportGeoBbox[0] + viewportGeoBbox[2]) / 2;
    const centerLat = (viewportGeoBbox[1] + viewportGeoBbox[3]) / 2;

    const sortedGroups = Array.from(groups).sort((a, b) => {
      const metaA = countryMetaMap.get(a);
      const metaB = countryMetaMap.get(b);
      if (!metaA || !metaB) return 0;
      const aCx = (metaA.bbox[0] + metaA.bbox[2]) / 2;
      const aCy = (metaA.bbox[1] + metaA.bbox[3]) / 2;
      const bCx = (metaB.bbox[0] + metaB.bbox[2]) / 2;
      const bCy = (metaB.bbox[1] + metaB.bbox[3]) / 2;
      const dA = (aCx - centerLng) ** 2 + (aCy - centerLat) ** 2;
      const dB = (bCx - centerLng) ** 2 + (bCy - centerLat) ** 2;
      return dA - dB;
    });

    for (const sg of sortedGroups) {
      if (!getCachedCountryHierarchy(sg)) {
        loadCountryHierarchy(sg)
          .then(() => {
            // As each country's hierarchy downloads, trigger update immediately
            setHierarchyVersion((v) => v + 1);
          })
          .catch((err) => {
            console.warn(`Could not load hierarchy for ${sg}:`, err);
          });
      }
    }
  }, [
    pinnedDrilldown,
    hoverDrilldown,
    clickDrilldown,
    hierarchyConstraints.enforcedAdm1Countries,
    hierarchyConstraints.enforcedAdm2Countries,
    countryMetaMap,
    viewportGeoBbox,
    setHierarchyVersion,
  ]);


  // Determine which countries should load ADM1 / ADM2 subdivisions when in zoom or manual mode
  const prevActiveSubdivisionRef = useRef<string[]>([]);
  const activeSubdivisionCountries = useMemo(() => {
    if (
      interactionMode === "local-hover" ||
      interactionMode === "wide-hover" ||
      interactionMode === "local-click" ||
      interactionMode === "wide-click"
    ) {
      prevActiveSubdivisionRef.current = [];
      return [];
    }
    const targetLevel =
      interactionMode === "manual" ? manualAdmLevel : effectiveAdmLevel;
    if (targetLevel === "ADM0") {
      prevActiveSubdivisionRef.current = [];
      return [];
    }
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
    const baseList = intersecting.slice(0, maxCountries).map((c) => c.shapeGroup);

    // Rule 1: "如果原本顯示的是 Target 的下轄區域，則必須取消展開，將 Target 視為一體"
    const filtered = baseList.filter(
      (sg) => !hierarchyConstraints.enforcedAdm0Countries.has(sg)
    );

    // Rule 2: "如果原本顯示的是 Target 的母區域，則強制展開母區域，將 Target 顯示出來"
    for (const sg of hierarchyConstraints.enforcedAdm1Countries) {
      if (!filtered.includes(sg)) filtered.push(sg);
    }
    for (const sg of hierarchyConstraints.enforcedAdm2Countries) {
      if (!filtered.includes(sg)) filtered.push(sg);
    }

    const prev = prevActiveSubdivisionRef.current;
    if (
      prev.length === filtered.length &&
      prev.every((v, i) => v === filtered[i])
    ) {
      return prev;
    }
    prevActiveSubdivisionRef.current = filtered;
    return filtered;
  }, [
    interactionMode,
    manualAdmLevel,
    effectiveAdmLevel,
    focusedCountries,
    metadata,
    viewportGeoBbox,
    hierarchyConstraints,
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

  // Session cache of downloaded subdivisions by level and country
  const accumulatedSubdivisionsRef = useRef<{
    ADM1: Map<string, AdminFeature[]>;
    ADM2: Map<string, AdminFeature[]>;
  }>({
    ADM1: new Map(),
    ADM2: new Map(),
  });

  // Load ADM1 / ADM2 subdivisions when activeSubdivisionCountries or effectiveAdmLevel changes
  useEffect(() => {
    let cancelled = false;
    if (effectiveAdmLevel === "ADM0") {
      setSubdivisionFeatures([]);
      return;
    }

    const subLevel: "ADM1" | "ADM2" = effectiveAdmLevel;
    const cacheMap = accumulatedSubdivisionsRef.current[subLevel];

    // Pre-populate with already cached subdivisions from memory
    for (const code of activeSubdivisionCountries) {
      if (!cacheMap.has(code)) {
        const cached = getCachedCountrySubdivisions(code, subLevel);
        if (cached && cached.length > 0) {
          cacheMap.set(code, cached);
        }
      }
    }

    // Immediately display everything accumulated in session cache (0ms instant display)
    if (cacheMap.size > 0 && !cancelled) {
      setSubdivisionFeatures(Array.from(cacheMap.values()).flat());
    }

    if (activeSubdivisionCountries.length === 0) {
      return;
    }

    async function fetchSubdivisions() {
      const centerLng = (viewportGeoBbox[0] + viewportGeoBbox[2]) / 2;
      const centerLat = (viewportGeoBbox[1] + viewportGeoBbox[3]) / 2;

      // Filter to only countries that are not yet loaded in cacheMap
      const pendingCountries = activeSubdivisionCountries.filter(
        (code) => !cacheMap.has(code) || cacheMap.get(code)!.length === 0
      );

      if (pendingCountries.length === 0) {
        setIsLoadingData(false);
        setLoadingMessage("");
        return;
      }

      setIsLoadingData(true);
      setLoadingMessage(
        `載入 ${pendingCountries.slice(0, 4).join(", ")}${
          pendingCountries.length > 4 ? "..." : ""
        } 的 ${subLevel} (.fgb)...`
      );

      // Sort pending countries: closest to viewport center first
      pendingCountries.sort((a, b) => {
        const metaA = countryMetaMap.get(a);
        const metaB = countryMetaMap.get(b);
        if (!metaA || !metaB) return 0;
        const aCx = (metaA.bbox[0] + metaA.bbox[2]) / 2;
        const aCy = (metaA.bbox[1] + metaA.bbox[3]) / 2;
        const bCx = (metaB.bbox[0] + metaB.bbox[2]) / 2;
        const bCy = (metaB.bbox[1] + metaB.bbox[3]) / 2;
        const dA = (aCx - centerLng) ** 2 + (aCy - centerLat) ** 2;
        const dB = (bCx - centerLng) ** 2 + (bCy - centerLat) ** 2;
        return dA - dB;
      });

      // Progressive concurrent download worker pool (concurrency: 4)
      // "如果是要下載的去先下載這些，下載好的先顯示出來，不要等全部下載好"
      let queueIdx = 0;
      const concurrency = Math.min(4, pendingCountries.length);

      const workers = Array.from({ length: concurrency }, async () => {
        while (queueIdx < pendingCountries.length && !cancelled) {
          const code = pendingCountries[queueIdx++];
          if (!code || cancelled) break;

          try {
            const countryFeats = await loadCountrySubdivisions(code, subLevel);
            if (cancelled) break;

            if (countryFeats.length > 0) {
              cacheMap.set(code, countryFeats);
            } else {
              // Fallback for missing subdivisions so country doesn't vanish
              if (subLevel === "ADM2") {
                const adm1Fallback = await loadCountrySubdivisions(code, "ADM1");
                if (adm1Fallback.length > 0) {
                  cacheMap.set(code, adm1Fallback);
                } else {
                  const adm0Fallback = adm0Features.filter(
                    (f) => f.properties.shapeGroup === code
                  );
                  cacheMap.set(code, adm0Fallback);
                }
              } else {
                const adm0Fallback = adm0Features.filter(
                  (f) => f.properties.shapeGroup === code
                );
                cacheMap.set(code, adm0Fallback);
              }
            }

            if (!cancelled) {
              // Immediately display each country's subdivisions as soon as downloaded!
              setSubdivisionFeatures(Array.from(cacheMap.values()).flat());
            }
          } catch (err) {
            console.warn(`[useGeoData] Failed to load subdivisions for ${code}:`, err);
          }
        }
      });

      try {
        await Promise.all(workers);
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
  }, [
    effectiveAdmLevel,
    activeSubdivisionCountries,
    adm0Features,
    countryMetaMap,
    viewportGeoBbox,
  ]);

  // Pre-mapped base ADM0 features with base role to preserve reference stability across camera moves
  const baseAdm0WithRole = useMemo(
    () =>
      adm0Features.map((f) => ({
        ...f,
        properties: { ...f.properties, drilldownRole: "base" as const },
      })),
    [adm0Features]
  );

  // Active raw features for the current level / mode
  const activeRawFeatures: AdminFeature[] = useMemo(() => {
    if (adm0Features.length === 0) return [];

    let rawFeatures: AdminFeature[] = [];

    if (interactionMode === "manual") {
      if (manualAdmLevel === "ADM0") {
        rawFeatures = baseAdm0WithRole;
      } else {
        const loadedSubCountrySet = new Set<string>();
        for (const f of subdivisionFeatures) {
          if (f.properties?.shapeGroup) {
            loadedSubCountrySet.add(f.properties.shapeGroup);
          }
        }
        const subFeats = subdivisionFeatures.map((f) => ({
          ...f,
          properties: { ...f.properties, drilldownRole: "base" as const },
        }));
        const baseAdm0 = adm0Features
          .filter((f) => !loadedSubCountrySet.has(f.properties.shapeGroup))
          .map((f) => ({
            ...f,
            properties: { ...f.properties, drilldownRole: "base" as const },
          }));
        rawFeatures = [...baseAdm0, ...subFeats];
      }
    } else if (interactionMode === "zoom") {
      if (effectiveAdmLevel === "ADM0") {
        rawFeatures = baseAdm0WithRole;
      } else {
        const loadedSubCountrySet = new Set<string>();
        for (const f of subdivisionFeatures) {
          if (f.properties?.shapeGroup) {
            loadedSubCountrySet.add(f.properties.shapeGroup);
          }
        }
        const subFeats = subdivisionFeatures.map((f) => ({
          ...f,
          properties: { ...f.properties, drilldownRole: "base" as const },
        }));
        const baseAdm0 = adm0Features
          .filter((f) => !loadedSubCountrySet.has(f.properties.shapeGroup))
          .map((f) => ({
            ...f,
            properties: { ...f.properties, drilldownRole: "base" as const },
          }));
        rawFeatures = [...baseAdm0, ...subFeats];
      }
    } else if (
      interactionMode === "local-click" ||
      interactionMode === "wide-click"
    ) {
      const scope = interactionMode === "wide-click" ? "wide" : "local";
      if (!clickDrilldown) {
        rawFeatures = baseAdm0WithRole;
      } else {
        const { shapeGroup, adm1Id } = clickDrilldown;
        const hierarchy = getCachedCountryHierarchy(shapeGroup);
        if (!hierarchy) {
          rawFeatures = adm0Features.map((f) => ({
            ...f,
            properties: { ...f.properties, drilldownRole: "base" as const },
          }));
        } else {
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

          rawFeatures = [...otherCountries, ...countryFeats];
        }
      }
    } else {
      // interactionMode === "local-hover" || interactionMode === "wide-hover"
      const scope = interactionMode === "wide-hover" ? "wide" : "local";
      const pinnedGroup = pinnedDrilldown?.shapeGroup || null;
      const hoverGroup = hoverDrilldown?.shapeGroup || null;

      if (!pinnedGroup && !hoverGroup) {
        rawFeatures = baseAdm0WithRole;
      } else {
        const result: AdminFeature[] = [];
        const expandedGroups = new Set<string>();
        if (pinnedGroup) expandedGroups.add(pinnedGroup);
        if (hoverGroup) expandedGroups.add(hoverGroup);

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
        rawFeatures = result;
      }
    }

    let finalFeatures = rawFeatures;

    // Rule 1: Target is ADM0: "如果原本顯示的是 Target 的下轄區域，則必須取消展開，將 Target 視為一體"
    if (hierarchyConstraints.enforcedAdm0Countries.size > 0) {
      const adm0Set = hierarchyConstraints.enforcedAdm0Countries;
      finalFeatures = finalFeatures.filter(
        (f) => !adm0Set.has(f.properties.shapeGroup)
      );
      for (const sg of adm0Set) {
        const adm0Feat = adm0Features.find(
          (f) => f.properties.shapeGroup === sg
        );
        if (adm0Feat) {
          finalFeatures.push({
            ...adm0Feat,
            properties: { ...adm0Feat.properties, drilldownRole: "base" as const },
          });
        }
      }
    }

    // Rule 2: Target is ADM1: "如果原本顯示的是 Target 的母區域，則強制展開母區域，將 Target 顯示出來"
    if (hierarchyConstraints.enforcedAdm1Countries.size > 0) {
      const adm1Set = hierarchyConstraints.enforcedAdm1Countries;
      finalFeatures = finalFeatures.filter(
        (f) =>
          !(
            adm1Set.has(f.properties.shapeGroup) &&
            f.properties.shapeType === "ADM0"
          )
      );
      for (const sg of adm1Set) {
        const hasSubdivisions = finalFeatures.some(
          (f) =>
            f.properties.shapeGroup === sg && f.properties.shapeType !== "ADM0"
        );
        if (!hasSubdivisions) {
          const hierarchy = getCachedCountryHierarchy(sg);
          if (hierarchy && hierarchy.adm1Features.length > 0) {
            finalFeatures.push(
              ...hierarchy.adm1Features.map((f) => ({
                ...f,
                properties: { ...f.properties, drilldownRole: "base" as const },
              }))
            );
          }
        }
      }
    }

    // Rule 3: Target is ADM2: "如果原本顯示的是 Target 的母區域，則強制展開母區域，將 Target 顯示出來"
    if (hierarchyConstraints.enforcedAdm2Countries.size > 0) {
      const adm2Set = hierarchyConstraints.enforcedAdm2Countries;
      for (const sg of adm2Set) {
        const hierarchy = getCachedCountryHierarchy(sg);
        if (hierarchy && hierarchy.adm2Features.length > 0) {
          finalFeatures = finalFeatures.filter(
            (f) => f.properties.shapeGroup !== sg
          );
          finalFeatures.push(
            ...hierarchy.adm2Features.map((f) => ({
              ...f,
              properties: { ...f.properties, drilldownRole: "base" as const },
            }))
          );
        }
      }
    }

    return finalFeatures;
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
    hierarchyConstraints,
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
    const loadedSubCountrySet = new Set<string>();
    for (const f of subdivisionFeatures) {
      if (f.properties?.shapeGroup) {
        loadedSubCountrySet.add(f.properties.shapeGroup);
      }
    }
    return adm0Features.filter(
      (f) => !loadedSubCountrySet.has(f.properties.shapeGroup)
    );
  }, [
    interactionMode,
    manualAdmLevel,
    effectiveAdmLevel,
    adm0Features,
    subdivisionFeatures,
  ]);

  // Active raw features with optional dev-mode autoFixTopology toggle (defaults to clean untangled geometry)
  const effectiveActiveRawFeatures = useMemo(() => {
    if (!isDevMode || autoFixTopology) {
      return activeRawFeatures;
    }
    return activeRawFeatures.map((f) =>
      f.rawGeometry ? { ...f, geometry: f.rawGeometry } : f
    );
  }, [isDevMode, autoFixTopology, activeRawFeatures]);

  const effectiveContextAdm0Features = useMemo(() => {
    if (!isDevMode || autoFixTopology) {
      return contextAdm0Features;
    }
    return contextAdm0Features.map((f) =>
      f.rawGeometry ? { ...f, geometry: f.rawGeometry } : f
    );
  }, [isDevMode, autoFixTopology, contextAdm0Features]);

  // Index raw features by shapeID for quick lookup
  const rawFeaturesById = useMemo(() => {
    const map = new Map<string, AdminFeature>();
    for (const f of adm0Features) map.set(f.properties.shapeID, f);
    for (const f of subdivisionFeatures) map.set(f.properties.shapeID, f);
    for (const f of activeRawFeatures) map.set(f.properties.shapeID, f);
    for (const h of getAllCachedCountryHierarchies()) {
      for (const f of h.adm1Features) map.set(f.properties.shapeID, f);
      for (const f of h.adm2Features) map.set(f.properties.shapeID, f);
    }
    return map;
  }, [adm0Features, subdivisionFeatures, activeRawFeatures, hierarchyVersion]);

  // Union groups defined in the active label dataset (e.g. A|B or (A|B)||(C|D))
  const datasetUnionGroups = useMemo((): RegionUnionGroup[] => {
    if (!showRegionLabels || !activeLabelDataset) return [];
    const groups: RegionUnionGroup[] = [];
    for (const item of activeLabelDataset.items) {
      const grp = resolveAstToUnionGroup(item, rawFeaturesById, countryMetaMap);
      if (grp) groups.push(grp);
    }
    return groups;
  }, [
    showRegionLabels,
    activeLabelDataset,
    rawFeaturesById,
    countryMetaMap,
  ]);

  return {
    metadata,
    adm0Features,
    subdivisionFeatures,
    isLoadingData,
    loadingMessage,
    effectiveAdmLevel,
    countryMetaMap,
    activeSubdivisionCountries,
    activeRawFeatures,
    effectiveActiveRawFeatures,
    effectiveContextAdm0Features,
    rawFeaturesById,
    datasetUnionGroups,
    hierarchyConstraints,
  };
}
