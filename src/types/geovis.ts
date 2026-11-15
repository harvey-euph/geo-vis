import type { FeatureCollection } from "geojson";
import type { AdminFeature, AdmLevel } from "@/lib/fgb-loader";
import type { RegionUnionGroup, UnionCycleState } from "@/lib/union-engine";

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

export interface SelectionAnalysisResult {
  state: "none" | "single-group" | "multi-separated" | "single-separated";
  cycleState: UnionCycleState;
  activeGroup: RegionUnionGroup | null;
  resolvedMemberIds: string[];
  resolvedFeatures: AdminFeature[];
}

export const EMPTY_FC: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export const ADM1_ZOOM_THRESHOLD = 3.8;
export const ADM2_ZOOM_THRESHOLD = 6.2;

export function getAutoAdmLevel(zoom: number): AdmLevel {
  if (zoom >= ADM2_ZOOM_THRESHOLD) return "ADM2";
  if (zoom >= ADM1_ZOOM_THRESHOLD) return "ADM1";
  return "ADM0";
}
