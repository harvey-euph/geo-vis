"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import {
  type AdminFeature,
  type AdmLevel,
  type CountryMeta,
  loadCountrySubdivisions,
} from "@/lib/fgb-loader";
import { listLabelAnchorAdm1Groups } from "@/lib/label-anchors";
import { type FlatProjectionId, type MapMode } from "@/lib/projections";
import {
  type LabelImageData,
  type RegionLabelConfig,
  LABEL_PIXEL_RATIO,
  buildProjectedLabelFC,
  defaultLabelResolver,
  getOrCreateLabelImage,
  getCachedLabelImage,
  isLabelImageCached,
  labelAnchorCentersDrifted,
  renderPendingLabelSprite,
  renderTextLabel,
} from "@/lib/label-manager";
import type { ParsedLabelDataset } from "@/lib/label-parser";
import { buildDatasetLabelConfigs } from "@/lib/label-hierarchy-resolver";
import type { RegionUnionGroup } from "@/lib/union-engine";
import { EMPTY_FC } from "@/types/geovis";

/**
 * Visible hemisphere first, then off-screen front side, then the back of the globe.
 * Mutates `queue` in place so in-flight workers keep the new order for items not yet taken.
 */
function prioritizeLabelDownloads(
  map: maplibregl.Map,
  queue: RegionLabelConfig[],
  mapMode: MapMode
) {
  if (queue.length < 2) return;
  try {
    const center = map.getCenter();
    const container = map.getContainer();
    const screenW = container?.clientWidth || 800;
    const screenH = container?.clientHeight || 600;
    const halfW = screenW / 2;
    const halfH = screenH / 2;
    const centerLngRad = (center.lng * Math.PI) / 180;
    const centerLatRad = (center.lat * Math.PI) / 180;
    const projection = map.getProjection?.() as { type?: string } | undefined;
    const isGlobe = mapMode === "globe" || projection?.type === "globe";
    const margin = 60;

    const rank = (config: RegionLabelConfig) => {
      let cosTheta = 1;
      let isFront = true;
      if (isGlobe) {
        const lngRad = (config.center[0] * Math.PI) / 180;
        const latRad = (config.center[1] * Math.PI) / 180;
        cosTheta =
          Math.sin(centerLatRad) * Math.sin(latRad) +
          Math.cos(centerLatRad) *
            Math.cos(latRad) *
            Math.cos(lngRad - centerLngRad);
        isFront = cosTheta >= 0.1;
      }

      let inScreen = false;
      let screenDist = Number.POSITIVE_INFINITY;
      if (isFront) {
        try {
          const pt = map.project(config.center);
          inScreen =
            pt.x >= -margin &&
            pt.x <= screenW + margin &&
            pt.y >= -margin &&
            pt.y <= screenH + margin;
          screenDist = (pt.x - halfW) ** 2 + (pt.y - halfH) ** 2;
        } catch {
          inScreen = false;
        }
      }

      return {
        tier: isFront ? (inScreen ? 0 : 1) : 2,
        screenDist,
        cosTheta,
      };
    };

    const ranked = queue.map((config) => ({ config, ...rank(config) }));
    ranked.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.tier < 2) return a.screenDist - b.screenDist;
      return b.cosTheta - a.cosTheta;
    });
    for (let i = 0; i < ranked.length; i++) queue[i] = ranked[i].config;
  } catch (err) {
    console.warn("[RegionLabels] prioritize error:", err);
  }
}

interface UseRegionLabelsOptions {
  mapRef: React.RefObject<maplibregl.Map | null>;
  mapReadyRef: React.RefObject<boolean>;
  showRegionLabels: boolean;
  showIso3Labels?: boolean;
  adm0Features: AdminFeature[];
  effectiveActiveRawFeatures: AdminFeature[];
  effectiveAdmLevel: AdmLevel;
  mapMode: MapMode;
  flatProjection: FlatProjectionId;
  activeLabelDataset?: ParsedLabelDataset | null;
  unionGroups?: RegionUnionGroup[];
  countryMetaMap?: Map<string, CountryMeta>;
  rawFeaturesById?: Map<string, AdminFeature>;
}

export function useRegionLabels({
  mapRef,
  mapReadyRef,
  showRegionLabels,
  showIso3Labels = false,
  adm0Features,
  effectiveActiveRawFeatures,
  effectiveAdmLevel,
  mapMode,
  flatProjection,
  activeLabelDataset,
  unionGroups = [],
  countryMetaMap,
  rawFeaturesById,
}: UseRegionLabelsOptions) {
  // Bumped only when a loaded ADM1 anchor disagrees with its baked center.
  const [labelAnchorEpoch, setLabelAnchorEpoch] = useState(0);

  useEffect(() => {
    const groups = listLabelAnchorAdm1Groups();
    if (groups.length === 0) return;
    let cancelled = false;
    void Promise.all(
      groups.map((group) => loadCountrySubdivisions(group, "ADM1"))
    ).then(() => {
      if (cancelled) return;
      if (labelAnchorCentersDrifted()) setLabelAnchorEpoch((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 1. Generate active label configs combining CSV dataset labels + ISO3 code fallback
  const labelConfigs = useMemo((): RegionLabelConfig[] => {
    // ADM1 anchors are remeasured after their fgbs load.
    void labelAnchorEpoch;
    if (!showRegionLabels && !showIso3Labels) return [];

    const csvConfigs: RegionLabelConfig[] = [];
    const coveredFeatureIds = new Set<string>();
    const coveredCountries = new Set<string>();

    // Step A: Custom CSV label dataset (e.g. flags.csv with national flags / custom labels)
    if (
      activeLabelDataset &&
      activeLabelDataset.items.length > 0 &&
      countryMetaMap &&
      rawFeaturesById
    ) {
      // Build configs for all items in the dataset so they remain persistently cached and ready
      const items = activeLabelDataset.items;

      const imgSize = activeLabelDataset.metadata.imageSize
        ? Math.round(activeLabelDataset.metadata.imageSize * 22)
        : 22;

      const built = buildDatasetLabelConfigs(
        items,
        rawFeaturesById,
        unionGroups,
        countryMetaMap,
        imgSize
      );

      csvConfigs.push(...built);

      // Track all features and countries covered by the CSV label
      for (const cfg of built) {
        if (cfg.targetId) coveredFeatureIds.add(cfg.targetId);
        if (cfg.shapeGroup && cfg.level === "ADM0") {
          coveredCountries.add(cfg.shapeGroup);
        }
      }

      // Track atomic targets and union groups
      for (const item of activeLabelDataset.items) {
        for (const spec of item.atomicTargets) {
          const norm = spec.trim().toUpperCase();
          if (!norm.includes("::")) {
            coveredCountries.add(norm);
          }
        }
      }

      for (const ug of unionGroups) {
        if (ug.id.startsWith("union-")) {
          for (const mId of ug.memberIds) {
            coveredFeatureIds.add(mId);
          }
          if (ug.admLevel === "ADM0") {
            for (const sg of ug.shapeGroups) {
              coveredCountries.add(sg);
            }
          }
        }
      }
    }

    // Step B: ISO3 Code Labels (Special Mechanism)
    // "然後當開啟 ISO3 代碼的時候，如果開啟的 csv label 沒有指向那個地方，那就顯示 ISO3 代碼"
    const isoConfigs: RegionLabelConfig[] = [];
    if (showIso3Labels) {
      if (effectiveAdmLevel === "ADM0") {
        // Global ADM0 view: display ISO3 labels for countries not covered by CSV label
        const sourceFeatures =
          adm0Features.length > 0 ? adm0Features : effectiveActiveRawFeatures;

        for (const f of sourceFeatures) {
          const shapeGroup = f.properties?.shapeGroup;
          const shapeID = f.properties?.shapeID;
          if (
            (shapeID && coveredFeatureIds.has(shapeID)) ||
            (shapeGroup && coveredCountries.has(shapeGroup))
          ) {
            continue; // CSV label already points to this region!
          }

          const cfg = defaultLabelResolver(f, "ADM0");
          if (cfg) isoConfigs.push(cfg);
        }
      } else {
        // Drilled down to ADM1 or ADM2:
        // 1. Active subdivisions
        for (const f of effectiveActiveRawFeatures) {
          const shapeID = f.properties?.shapeID;
          const shapeGroup = f.properties?.shapeGroup;
          const shapeName = f.properties?.shapeName;
          const subKey =
            shapeGroup && shapeName
              ? `${shapeGroup}::${shapeName.toLowerCase()}`
              : "";

          if (
            (shapeID && coveredFeatureIds.has(shapeID)) ||
            (subKey && coveredFeatureIds.has(subKey)) ||
            (f.properties?.shapeType === "ADM0" &&
              shapeGroup &&
              coveredCountries.has(shapeGroup))
          ) {
            continue; // Covered by CSV label
          }

          const cfg = defaultLabelResolver(f, effectiveAdmLevel);
          if (cfg) isoConfigs.push(cfg);
        }

        // 2. Context ADM0 countries in background
        const activeCountryGroups = new Set<string>();
        for (const f of effectiveActiveRawFeatures) {
          if (f.properties?.shapeGroup) {
            activeCountryGroups.add(f.properties.shapeGroup);
          }
        }

        const contextAdm0Features = adm0Features.filter(
          (f) => !activeCountryGroups.has(f.properties?.shapeGroup)
        );

        for (const f of contextAdm0Features) {
          const shapeGroup = f.properties?.shapeGroup;
          const shapeID = f.properties?.shapeID;
          if (
            (shapeID && coveredFeatureIds.has(shapeID)) ||
            (shapeGroup && coveredCountries.has(shapeGroup))
          ) {
            continue;
          }

          const cfg = defaultLabelResolver(f, "ADM0");
          if (cfg) isoConfigs.push(cfg);
        }
      }
    }

    return [...csvConfigs, ...isoConfigs];
  }, [
    showRegionLabels,
    showIso3Labels,
    activeLabelDataset,
    countryMetaMap,
    rawFeaturesById,
    unionGroups,
    adm0Features,
    effectiveActiveRawFeatures,
    effectiveAdmLevel,
    labelAnchorEpoch,
  ]);

  // 2. Build GeoJSON FeatureCollection projected into active map mode / projection space
  const projectedLabelFC = useMemo(() => {
    if (
      (!showRegionLabels && !showIso3Labels) ||
      labelConfigs.length === 0
    ) {
      return EMPTY_FC;
    }
    return buildProjectedLabelFC(labelConfigs, mapMode, flatProjection);
  }, [showRegionLabels, showIso3Labels, labelConfigs, mapMode, flatProjection]);

  const runIdRef = useRef(0);

  // 3. Register sprites, then swap in each image the moment its download finishes.
  //    iconId stays on label.id. MapLibre updateImage replaces pixels in place
  //    when the replacement has the same dimensions, so no setData is required.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!showRegionLabels && !showIso3Labels) return;

    const runId = ++runIdRef.current;
    let stopped = false;

    const publishImage = (id: string, image: LabelImageData) => {
      if (runIdRef.current !== runId) return;
      const current = mapRef.current;
      if (!current || !current.hasImage(id)) return;
      const existing = current.getImage(id);
      if (
        existing.data.width !== image.width ||
        existing.data.height !== image.height
      ) {
        console.warn(
          `[RegionLabels] Skip sprite swap for ${id}: size ${existing.data.width}x${existing.data.height} vs ${image.width}x${image.height}`
        );
        return;
      }
      current.updateImage(id, {
        width: image.width,
        height: image.height,
        data: image.data,
      });
      current.triggerRepaint();
    };

    const installSprite = (id: string, image: LabelImageData) => {
      if (!map.hasImage(id)) {
        map.addImage(id, image, { pixelRatio: LABEL_PIXEL_RATIO });
        return;
      }
      const existing = map.getImage(id);
      if (
        existing.data.width !== image.width ||
        existing.data.height !== image.height
      ) {
        map.removeImage(id);
        map.addImage(id, image, { pixelRatio: LABEL_PIXEL_RATIO });
        return;
      }
      const cached = getCachedLabelImage(id);
      if (cached) {
        map.updateImage(id, {
          width: cached.width,
          height: cached.height,
          data: cached.data,
        });
      }
    };

    const registerSprites = () => {
      for (const config of labelConfigs) {
        try {
          if (config.type === "text") {
            if (!map.hasImage(config.id)) {
              map.addImage(config.id, renderTextLabel(config), {
                pixelRatio: LABEL_PIXEL_RATIO,
              });
            }
            continue;
          }
          const cached = getCachedLabelImage(config.id);
          installSprite(config.id, cached ?? renderPendingLabelSprite(config));
        } catch (err) {
          console.warn(`[RegionLabels] Sprite register failed ${config.id}:`, err);
        }
      }
    };

    const pending = labelConfigs.filter(
      (config) =>
        (config.type === "image" || config.type === "badge") &&
        Boolean(config.imageUrl) &&
        !isLabelImageCached(config.id)
    );
    prioritizeLabelDownloads(map, pending, mapMode);

    const queue = pending;
    // Flag files are tiny and the host is HTTP/2. A short pool leaves on-screen
    // icons waiting behind the cap; 32 covers a globe view in the first wave
    // without opening an unbounded number of decodes for a huge dataset.
    const concurrency = Math.min(32, queue.length);

    const worker = async () => {
      while (!stopped) {
        const config = queue.shift();
        if (!config) return;
        try {
          const image = await getOrCreateLabelImage(config);
          publishImage(config.id, image);
        } catch (err) {
          console.warn(`[RegionLabels] Failed downloading ${config.id}:`, err);
        }
      }
    };

    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    const onMove = () => {
      if (stopped || queue.length === 0) return;
      if (moveTimer) return;
      moveTimer = setTimeout(() => {
        moveTimer = null;
        if (!stopped && queue.length > 0) {
          prioritizeLabelDownloads(map, queue, mapMode);
        }
      }, 150);
    };

    let started = false;
    const start = () => {
      if (stopped || started) return;
      if (!map.isStyleLoaded() && !map.loaded()) {
        map.once("load", start);
        return;
      }
      started = true;
      map.on("move", onMove);
      // Fetches begin before placeholder canvases, and the first await yields
      // so registerSprites() still finishes before any sprite swap.
      if (concurrency > 0) {
        void Promise.all(Array.from({ length: concurrency }, () => worker()));
      }
      registerSprites();
    };

    start();

    return () => {
      stopped = true;
      if (moveTimer) clearTimeout(moveTimer);
      map.off("load", start);
      map.off("move", onMove);
    };
  }, [mapRef, mapReadyRef, showRegionLabels, showIso3Labels, labelConfigs, mapMode]);

  // 4. Push projected anchor points once per geometry/projection change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let stopped = false;

    const applyData = () => {
      if (stopped) return;
      if (!map.isStyleLoaded() && !map.loaded()) {
        map.once("load", applyData);
        return;
      }
      const src = map.getSource("region-labels") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      const visible = (showRegionLabels || showIso3Labels) && labelConfigs.length > 0;
      if (map.getLayer("region-labels-symbol")) {
        map.setLayoutProperty(
          "region-labels-symbol",
          "visibility",
          visible ? "visible" : "none"
        );
      }
      src.setData(visible ? projectedLabelFC : EMPTY_FC);
    };

    applyData();

    return () => {
      stopped = true;
      map.off("load", applyData);
    };
  }, [
    mapRef,
    mapReadyRef,
    showRegionLabels,
    showIso3Labels,
    labelConfigs.length,
    projectedLabelFC,
  ]);

  return {
    labelConfigs,
    projectedLabelFC,
  };
}
