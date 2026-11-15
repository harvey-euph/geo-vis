import { useMemo, useRef } from "react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { AdminFeature } from "@/lib/fgb-loader";
import {
  type InteractiveMapFeatureProperties,
  type RegionUnionGroup,
  buildInteractiveFeatureCollection,
} from "@/lib/union-engine";
import {
  type FlatProjectionId,
  type MapMode,
  generateGraticuleAndEnvelope,
  projectFeatureCollection,
} from "@/lib/projections";
import { SpatialHitIndex } from "@/lib/spatial-index";

interface UseInteractiveLayersOptions {
  effectiveActiveRawFeatures: AdminFeature[];
  unionGroups: RegionUnionGroup[];
  isDevMode: boolean;
  effectiveContextAdm0Features: AdminFeature[];
  mapMode: MapMode;
  flatProjection: FlatProjectionId;
  selectedCountryGroups?: Set<string>;
}

export function useInteractiveLayers({
  effectiveActiveRawFeatures,
  unionGroups,
  isDevMode,
  effectiveContextAdm0Features,
  mapMode,
  flatProjection,
  selectedCountryGroups,
}: UseInteractiveLayersOptions) {
  // Use all active union groups (including CSV label union expressions and dev toolbar groups)
  const effectiveUnionGroups = unionGroups;

  // Build interactive FeatureCollection (decoupled from hover/selection so setData is never called on hover/click!)
  const interactiveUnprojectedFC = useMemo(() => {
    return buildInteractiveFeatureCollection(
      effectiveActiveRawFeatures,
      effectiveUnionGroups,
      null,
      new Set(),
      undefined,
      selectedCountryGroups
    );
  }, [effectiveActiveRawFeatures, effectiveUnionGroups, selectedCountryGroups]);

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

  return {
    effectiveUnionGroups,
    interactiveUnprojectedFC,
    projectedInteractiveFC,
    projectedContextFC,
    spatialHitIndex,
    spatialHitIndexRef,
    contextHitIndex,
    contextHitIndexRef,
    projectedEnvelope,
    projectedGraticule,
  };
}
