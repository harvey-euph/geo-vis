import { useMemo } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from "geojson";
import type { InteractiveMapFeatureProperties } from "@/lib/union-engine";
import {
  type DrilldownTarget,
  EMPTY_FC,
  type VertexFeatureProperties,
} from "@/types/geovis";

interface UsePolygonVerticesOptions {
  isDevMode: boolean;
  showPolygonVertices: boolean;
  projectedInteractiveFC: FeatureCollection<
    Polygon | MultiPolygon,
    InteractiveMapFeatureProperties
  >;
  interactiveUnprojectedFC: FeatureCollection<
    Polygon | MultiPolygon,
    InteractiveMapFeatureProperties
  >;
  selectedTargetIds: Set<string>;
  clickDrilldown: DrilldownTarget | null;
  pinnedDrilldown: DrilldownTarget | null;
}

export function usePolygonVertices({
  isDevMode,
  showPolygonVertices,
  projectedInteractiveFC,
  interactiveUnprojectedFC,
  selectedTargetIds,
  clickDrilldown,
  pinnedDrilldown,
}: UsePolygonVerticesOptions): FeatureCollection<Point, VertexFeatureProperties> {
  return useMemo((): FeatureCollection<Point, VertexFeatureProperties> => {
    if (!isDevMode || !showPolygonVertices) {
      return EMPTY_FC as FeatureCollection<Point, VertexFeatureProperties>;
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
}
