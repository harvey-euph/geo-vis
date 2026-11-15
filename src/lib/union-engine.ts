import polygonClipping from "polygon-clipping";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { AdmLevel, AdminFeature } from "./fgb-loader";
import { isCapitalFeature } from "./capital-manager";

export type UnionCycleState = "separated" | "grouped" | "dissolved";

export interface RegionUnionGroup {
  id: string;
  name: string;
  admLevel: AdmLevel;
  memberIds: string[];
  memberNames: string[];
  shapeGroups: string[];
  mode: "grouped" | "dissolved";
  color: string;
  dissolvedGeometry?: MultiPolygon | Polygon;
}

export interface InteractiveMapFeatureProperties {
  /** Unique feature ID for rendering */
  featureKey: string;
  /** Interactive target ID (either shapeID for separated, or group.id for grouped/dissolved) */
  targetId: string;
  /** Original shapeID of this polygon (or group.id if dissolved) */
  shapeID: string;
  shapeName: string;
  shapeGroup: string;
  shapeType: AdmLevel;
  adm0Name: string;
  unionMode: UnionCycleState;
  groupId: string;
  groupName: string;
  groupColor: string;
  memberCount: number;
  memberNamesStr: string;
  bboxStr: string;
  isHovered: boolean;
  isSelected: boolean;
  drilldownRole?: "base" | "clicked" | "hovered" | "wide-context";
  isCapital?: boolean;
}

export type InteractiveMapFeature = Feature<
  Polygon | MultiPolygon,
  InteractiveMapFeatureProperties
>;

export const GROUP_PALETTE = [
  "#f59e0b", // Amber
  "#10b981", // Emerald
  "#ec4899", // Pink
  "#8b5cf6", // Violet
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#84cc16", // Lime
];

function snapRing(ring: number[][]): [number, number][] {
  return ring.map((pt) => [
    Math.round(pt[0] * 10000) / 10000,
    Math.round(pt[1] * 10000) / 10000,
  ]);
}

function ringUnsignedArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
}

/**
 * Align near-coincident vertices and T-junctions across the selected features
 * so straight-line optimized polygons dissolve without micro-gaps.
 */
function alignFeaturesForUnion(
  features: AdminFeature[],
  snapTol = 0.018
): polygonClipping.Geom[] {
  const canonicalPoints: [number, number][] = [];

  function canonicalizePoint(pt: number[]): [number, number] {
    const x = Math.round(pt[0] * 10000) / 10000;
    const y = Math.round(pt[1] * 10000) / 10000;
    for (const cp of canonicalPoints) {
      if (Math.hypot(cp[0] - x, cp[1] - y) <= snapTol) {
        return cp;
      }
    }
    const next: [number, number] = [x, y];
    canonicalPoints.push(next);
    return next;
  }

  // First pass: canonicalize all existing vertices
  const rawGeoms: [number, number][][][][] = features
    .filter((f) => f && f.geometry)
    .map((f) => {
      const polys =
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : f.geometry.coordinates;
      return polys.map((poly) =>
        poly.map((ring) => {
          const snapped = ring.map(canonicalizePoint);
          if (snapped.length > 0) {
            snapped[snapped.length - 1] = snapped[0];
          }
          return snapped;
        })
      );
    });

  // Second pass: insert T-junction vertices that lie within snapTol of a straight segment
  return rawGeoms.map((polyList) =>
    polyList.map((poly) =>
      poly.map((ring) => {
        const out: [number, number][] = [];
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i];
          const b = ring[i + 1];
          out.push(a);

          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const lenSq = dx * dx + dy * dy;
          if (lenSq < 1e-8) continue;

          const minX = Math.min(a[0], b[0]) - snapTol;
          const maxX = Math.max(a[0], b[0]) + snapTol;
          const minY = Math.min(a[1], b[1]) - snapTol;
          const maxY = Math.max(a[1], b[1]) + snapTol;

          const splits: { t: number; pt: [number, number] }[] = [];
          for (const cp of canonicalPoints) {
            if (cp[0] < minX || cp[0] > maxX || cp[1] < minY || cp[1] > maxY) {
              continue;
            }
            if (
              (cp[0] === a[0] && cp[1] === a[1]) ||
              (cp[0] === b[0] && cp[1] === b[1])
            ) {
              continue;
            }
            const t = ((cp[0] - a[0]) * dx + (cp[1] - a[1]) * dy) / lenSq;
            if (t <= 0.005 || t >= 0.995) continue;
            const projX = a[0] + t * dx;
            const projY = a[1] + t * dy;
            const dist = Math.hypot(cp[0] - projX, cp[1] - projY);
            if (dist <= snapTol) {
              splits.push({ t, pt: cp });
            }
          }

          if (splits.length > 0) {
            splits.sort((u, v) => u.t - v.t);
            for (const s of splits) {
              out.push(s.pt);
            }
          }
        }
        if (out.length > 0) {
          out.push(out[0]);
        }
        return snapRing(out);
      })
    )
  );
}

/**
 * Perform geometric union (dissolve) of multiple AdminFeature geometries,
 * eliminating shared internal borders.
 */
export function computeDissolvedGeometry(
  features: AdminFeature[]
): MultiPolygon | Polygon | undefined {
  if (features.length === 0) return undefined;
  if (features.length === 1) return features[0].geometry;

  try {
    const geoms = alignFeaturesForUnion(features);
    if (geoms.length === 0) return undefined;
    const [first, ...rest] = geoms;
    const unioned = polygonClipping.union(first, ...rest);

    // Filter out tiny micro-sliver interior holes caused by historical survey discrepancies
    const cleaned = unioned.map((poly) =>
      poly.filter((ring, idx) => idx === 0 || ringUnsignedArea(ring) > 0.002)
    );

    if (cleaned.length === 1) {
      return {
        type: "Polygon",
        coordinates: cleaned[0],
      };
    }
    return {
      type: "MultiPolygon",
      coordinates: cleaned,
    };
  } catch (err) {
    console.warn("Polygon union fallback to MultiPolygon:", err);
    const allPolys: number[][][][] = [];
    for (const f of features) {
      if (f.geometry.type === "Polygon") {
        allPolys.push(f.geometry.coordinates);
      } else if (f.geometry.type === "MultiPolygon") {
        allPolys.push(...f.geometry.coordinates);
      }
    }
    return {
      type: "MultiPolygon",
      coordinates: allPolys,
    };
  }
}

export function computeCombinedBbox(features: AdminFeature[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const feat of features) {
    const geom = feat.geometry;
    const polys =
      geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    for (const poly of polys) {
      for (const ring of poly) {
        for (const pt of ring) {
          if (pt[0] < minX) minX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] > maxY) maxY = pt[1];
        }
      }
    }
  }

  if (!Number.isFinite(minX)) return [-180, -85, 180, 85];
  return [minX, minY, maxX, maxY];
}

/**
 * Build interactive FeatureCollection combining raw features and active union groups
 * (both "grouped" logical unions and "dissolved" geometric unions).
 */
export function buildInteractiveFeatureCollection(
  rawFeatures: AdminFeature[],
  groups: RegionUnionGroup[],
  hoveredTargetId: string | null = null,
  selectedTargetIds: Set<string> = new Set(),
  featureRoles?: Map<string, "base" | "clicked" | "hovered" | "wide-context">,
  selectedCountryGroups: Set<string> = new Set()
): FeatureCollection<Polygon | MultiPolygon, InteractiveMapFeatureProperties> {
  // Map member shapeID -> group
  const memberToGroup = new Map<string, RegionUnionGroup>();
  for (const g of groups) {
    for (const mId of g.memberIds) {
      memberToGroup.set(mId, g);
    }
  }

  // Index raw features by shapeID for dissolved geometry assembly
  const rawById = new Map<string, AdminFeature>();
  for (const f of rawFeatures) {
    rawById.set(f.properties.shapeID, f);
  }

  const outFeatures: InteractiveMapFeature[] = [];
  const emittedDissolvedGroups = new Set<string>();

  for (const f of rawFeatures) {
    const { shapeID, shapeName, shapeGroup, shapeType, adm0Name, bboxStr } =
      f.properties;
    const group = memberToGroup.get(shapeID);
    const role: "base" | "clicked" | "hovered" | "wide-context" =
      featureRoles?.get(shapeID) ||
      (f.properties as any).drilldownRole ||
      "base";

    const isCapital =
      selectedCountryGroups.has(shapeGroup) &&
      isCapitalFeature(shapeGroup, shapeType, shapeName, shapeID);

    if (!group) {
      // Standard separated region
      const targetId = shapeID;
      outFeatures.push({
        type: "Feature",
        properties: {
          featureKey: shapeID,
          targetId,
          shapeID,
          shapeName,
          shapeGroup,
          shapeType,
          adm0Name,
          unionMode: "separated",
          groupId: "",
          groupName: "",
          groupColor: "#38bdf8",
          memberCount: 1,
          memberNamesStr: shapeName,
          bboxStr: bboxStr || "[-180,-85,180,85]",
          isHovered: hoveredTargetId === targetId,
          isSelected: selectedTargetIds.has(targetId),
          drilldownRole: role,
          isCapital,
        },
        geometry: f.geometry,
      });
      continue;
    }

    if (group.mode === "grouped") {
      // Logical Group: keep individual polygon geometry & internal borders,
      // but bind targetId = group.id so hovering/clicking any member highlights the whole group!
      const targetId = group.id;
      const presentMembers = group.memberIds
        .map((id) => rawById.get(id))
        .filter((x): x is AdminFeature => Boolean(x));
      const combinedBbox = computeCombinedBbox(presentMembers);

      outFeatures.push({
        type: "Feature",
        properties: {
          featureKey: `${group.id}__${shapeID}`,
          targetId,
          shapeID,
          shapeName: group.name,
          shapeGroup: group.shapeGroups.join(", "),
          shapeType,
          adm0Name: `${shapeName} (${adm0Name})`,
          unionMode: "grouped",
          groupId: group.id,
          groupName: group.name,
          groupColor: group.color,
          memberCount: group.memberIds.length,
          memberNamesStr: group.memberNames.join("、"),
          bboxStr: JSON.stringify(combinedBbox),
          isHovered: hoveredTargetId === targetId,
          isSelected: selectedTargetIds.has(targetId),
          drilldownRole: role,
          isCapital,
        },
        geometry: f.geometry,
      });
    } else if (group.mode === "dissolved") {
      // Geometric Dissolve: emit a single merged polygon for the entire group
      if (emittedDissolvedGroups.has(group.id)) continue;
      emittedDissolvedGroups.add(group.id);

      const presentMembers = group.memberIds
        .map((id) => rawById.get(id))
        .filter((x): x is AdminFeature => Boolean(x));
      if (presentMembers.length === 0) continue;

      const dissolvedGeom =
        group.dissolvedGeometry || computeDissolvedGeometry(presentMembers);
      if (!dissolvedGeom) continue;
      group.dissolvedGeometry = dissolvedGeom;

      const combinedBbox = computeCombinedBbox(presentMembers);
      const targetId = group.id;

      outFeatures.push({
        type: "Feature",
        properties: {
          featureKey: group.id,
          targetId,
          shapeID: group.id,
          shapeName: group.name,
          shapeGroup: group.shapeGroups.join(", "),
          shapeType: group.admLevel,
          adm0Name: `${group.memberNames.length} 個區域幾何合併`,
          unionMode: "dissolved",
          groupId: group.id,
          groupName: group.name,
          groupColor: group.color,
          memberCount: group.memberIds.length,
          memberNamesStr: group.memberNames.join("、"),
          bboxStr: JSON.stringify(combinedBbox),
          isHovered: hoveredTargetId === targetId,
          isSelected: selectedTargetIds.has(targetId),
          drilldownRole: "base",
          isCapital: false,
        },
        geometry: dissolvedGeom,
      });
    }
  }

  return {
    type: "FeatureCollection",
    features: outFeatures,
  };
}

export interface PresetUnionTemplate {
  id: string;
  label: string;
  description: string;
  admLevel: AdmLevel;
  shapeIDs: string[];
}

export const PRESET_UNIONS: PresetUnionTemplate[] = [
  {
    id: "preset_nordic",
    label: "北歐五國 (Nordic Union)",
    description: "挪威、瑞典、芬蘭、丹麥、冰島",
    admLevel: "ADM0",
    shapeIDs: ["ADM0_NOR", "ADM0_SWE", "ADM0_FIN", "ADM0_DNK", "ADM0_ISL"],
  },
  {
    id: "preset_benelux",
    label: "荷比盧聯盟 (Benelux)",
    description: "比利時、荷蘭、盧森堡",
    admLevel: "ADM0",
    shapeIDs: ["ADM0_BEL", "ADM0_NLD", "ADM0_LUX"],
  },
  {
    id: "preset_iberia",
    label: "伊比利半島 (Iberian Peninsula)",
    description: "西班牙、葡萄牙",
    admLevel: "ADM0",
    shapeIDs: ["ADM0_ESP", "ADM0_PRT"],
  },
  {
    id: "preset_baltic",
    label: "波羅的海三國 (Baltic States)",
    description: "愛沙尼亞、拉脫維亞、立陶宛",
    admLevel: "ADM0",
    shapeIDs: ["ADM0_EST", "ADM0_LVA", "ADM0_LTU"],
  },
];
