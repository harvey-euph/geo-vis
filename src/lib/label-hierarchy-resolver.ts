/**
 * label-hierarchy-resolver.ts
 *
 * Implements:
 * 1. View hierarchy enforcement rules for active label targets:
 *    - If sub-regions of a Target are currently shown, cancels expansion to treat Target as a whole.
 *    - If a parent region of a Target is currently shown, forces parent expansion so Target is displayed.
 * 2. Union engine resolution for AST target expressions:
 *    - Dissolves boundary for '|'
 *    - Groups for '||'
 *    - Evaluates nested expressions e.g. (A|B)||(C|D)
 * 3. Generation of projected RegionLabelConfig items from parsed CSV datasets.
 */

import type { MultiPolygon, Polygon } from "geojson";
import type { AdmLevel, AdminFeature, CountryMeta, DatasetMetadata } from "./fgb-loader";
import { bboxesIntersect, parseBbox } from "./fgb-loader";
import {
  type CountrySubdivisionHierarchy,
  getCachedCountryHierarchy,
  loadCountryHierarchy,
} from "./hierarchy-manager";
import {
  type ParsedLabelDataset,
  type ParsedLabelItem,
  type TargetAstNode,
  extractAtomicTargets,
} from "./label-parser";
import {
  type RegionLabelConfig,
  computeFeatureCentroid,
  computeRingCentroid,
  computeLabelSortKey,
  computeFeatureBbox,
} from "./label-manager";
import { COUNTRY_PRIMARY_FIT_BBOX } from "./bbox-helper";
import {
  type RegionUnionGroup,
  computeCombinedBbox,
  computeDissolvedGeometry,
} from "./union-engine";
import { matchCountry, matchFeature, TARGET_ALIASES } from "./target-resolver";

export interface TargetHierarchyConstraints {
  /** Countries that must remain as a single ADM0 feature (no subdivision drilldown) */
  enforcedAdm0Countries: Set<string>;
  /** Countries that must expand to ADM1 so targets appear */
  enforcedAdm1Countries: Set<string>;
  /** Countries that must expand to ADM2 so targets appear */
  enforcedAdm2Countries: Set<string>;
  /** Specific ADM1 shapeIDs that must not expand to ADM2 */
  enforcedAdm1Kept: Set<string>;
  /** Label items that intersect current viewport */
  viewportLabelItems: ParsedLabelItem[];
}

/**
 * Normalizes an atomic target string, expanding any aliases (e.g. HKG -> CHN::Hong Kong).
 */
export function normalizeTargetSpec(spec: string): string {
  const trimmed = (spec || "").trim();
  const upper = trimmed.toUpperCase();
  if (TARGET_ALIASES[upper]) {
    return TARGET_ALIASES[upper];
  }
  const parts = trimmed.split("::").map((p) => p.trim());
  if (parts.length > 0 && TARGET_ALIASES[parts[0].toUpperCase()]) {
    const aliasParts = TARGET_ALIASES[parts[0].toUpperCase()].split("::");
    return [...aliasParts, ...parts.slice(1)].join("::");
  }
  return trimmed;
}

/**
 * Parses target level and country shapeGroup from an atomic target spec.
 */
export function getTargetSpecLevel(
  spec: string,
  countryMetaMap: Map<string, CountryMeta>
): {
  countryCode: string | null;
  level: AdmLevel;
  parts: string[];
} {
  const norm = normalizeTargetSpec(spec);
  const parts = norm.split("::").map((p) => p.trim());
  if (parts.length === 0) {
    return { countryCode: null, level: "ADM0", parts: [] };
  }

  // Find country
  const cMeta = matchCountry(parts[0], Array.from(countryMetaMap.values()));
  const countryCode = cMeta ? cMeta.shapeGroup : parts[0].toUpperCase();

  if (parts.length === 1) {
    return { countryCode, level: "ADM0", parts };
  } else if (parts.length === 2) {
    return { countryCode, level: "ADM1", parts };
  } else {
    return { countryCode, level: "ADM2", parts };
  }
}

/**
 * Computes hierarchy view enforcement constraints for all active label targets in viewport:
 * 1. If Target is ADM0: country must be collapsed to ADM0 ("取消展開，將 Target 視為一體")
 * 2. If Target is ADM1: country must be expanded to ADM1 ("強制展開母區域，將 Target 顯示出來")
 *    and that ADM1 must not expand to ADM2 ("取消展開，將 Target 視為一體")
 * 3. If Target is ADM2: country and ADM1 must expand to ADM2 ("強制展開母區域，將 Target 顯示出來")
 */
export function computeTargetHierarchyConstraints(
  dataset: ParsedLabelDataset | null,
  viewportGeoBbox: [number, number, number, number],
  metadata: DatasetMetadata | null
): TargetHierarchyConstraints {
  const enforcedAdm0Countries = new Set<string>();
  const enforcedAdm1Countries = new Set<string>();
  const enforcedAdm2Countries = new Set<string>();
  const enforcedAdm1Kept = new Set<string>();
  if (!dataset || dataset.items.length === 0 || !metadata) {
    return {
      enforcedAdm0Countries,
      enforcedAdm1Countries,
      enforcedAdm2Countries,
      enforcedAdm1Kept,
      viewportLabelItems: [],
    };
  }

  const countryMetaMap = new Map<string, CountryMeta>();
  for (const c of metadata.countries) {
    countryMetaMap.set(c.shapeGroup, c);
  }

  const centerLng = (viewportGeoBbox[0] + viewportGeoBbox[2]) / 2;
  const centerLat = (viewportGeoBbox[1] + viewportGeoBbox[3]) / 2;

  const viewportItemSet = new Set<ParsedLabelItem>();

  for (const item of dataset.items) {
    const atomicList = item.atomicTargets;
    let itemInViewport = false;

    for (const spec of atomicList) {
      const { countryCode, level, parts } = getTargetSpecLevel(
        spec,
        countryMetaMap
      );
      if (!countryCode) continue;

      const cMeta = countryMetaMap.get(countryCode);
      if (!cMeta) continue;

      // Track viewport intersection using country bbox
      if (bboxesIntersect(cMeta.bbox, viewportGeoBbox)) {
        itemInViewport = true;
      }

      const hasExplicitSubdivision = spec.includes("::");

      // Global hierarchy constraint rules apply to all targets in the dataset:
      if (level === "ADM0") {
        enforcedAdm0Countries.add(countryCode);
      } else if (level === "ADM1") {
        if (hasExplicitSubdivision) {
          enforcedAdm1Countries.add(countryCode);
        } else {
          // Top-level alias without '::' (e.g. HKG or PRI): do not expand parent country
          enforcedAdm0Countries.add(countryCode);
        }
        if (parts[1]) {
          enforcedAdm1Kept.add(parts[1].toLowerCase());
        }
      } else if (level === "ADM2") {
        if (hasExplicitSubdivision) {
          enforcedAdm2Countries.add(countryCode);
          enforcedAdm1Countries.add(countryCode);
        } else {
          enforcedAdm0Countries.add(countryCode);
        }
      }
    }

    if (itemInViewport) {
      viewportItemSet.add(item);
    }
  }

  // Keep viewportLabelItems in stable dataset order to prevent churning label configs during map drag
  const viewportLabelItems = dataset.items.filter((item) =>
    viewportItemSet.has(item)
  );

  // Rule 1: An ADM0 constraint takes absolute precedence for keeping a whole country unified ("將 Target 視為一體")
  for (const c of enforcedAdm0Countries) {
    enforcedAdm1Countries.delete(c);
    enforcedAdm2Countries.delete(c);
  }

  return {
    enforcedAdm0Countries,
    enforcedAdm1Countries,
    enforcedAdm2Countries,
    enforcedAdm1Kept,
    viewportLabelItems,
  };
}

/**
 * Resolves an AST node into union groups (dissolved or grouped).
 * Handles (A|B)||(C|D) by dissolving (A|B) into Part 1, (C|D) into Part 2,
 * and grouping them together under a single logical union group.
 */
export function resolveAstToUnionGroup(
  item: ParsedLabelItem,
  rawFeaturesById: Map<string, AdminFeature>,
  countryMetaMap: Map<string, CountryMeta>
): RegionUnionGroup | null {
  const ast = item.targetAst;
  if (ast.type === "single") return null;

  const atomicTargets = item.atomicTargets;
  const matchedFeatures: AdminFeature[] = [];

  for (const spec of atomicTargets) {
    const norm = normalizeTargetSpec(spec);
    const parts = norm.split("::").map((p) => p.trim());
    const country = matchCountry(parts[0], Array.from(countryMetaMap.values()));
    if (!country) continue;

    if (parts.length === 1) {
      // ADM0
      const f = rawFeaturesById.get(country.shapeID);
      if (f) matchedFeatures.push(f);
    } else {
      // ADM1 or ADM2
      const hierarchy = getCachedCountryHierarchy(country.shapeGroup);
      if (hierarchy) {
        if (parts.length === 2) {
          const adm1 = matchFeature(parts[1], hierarchy.adm1Features);
          if (adm1) matchedFeatures.push(adm1);
        } else {
          const adm2 = matchFeature(parts[2], hierarchy.adm2Features);
          if (adm2) matchedFeatures.push(adm2);
        }
      }
    }
  }

  if (matchedFeatures.length < 2) return null;

  const memberIds = matchedFeatures.map((f) => f.properties.shapeID);
  const memberNames = matchedFeatures.map((f) => f.properties.shapeName);
  const shapeGroups = Array.from(
    new Set(matchedFeatures.map((f) => f.properties.shapeGroup))
  );
  const admLevel = matchedFeatures[0].properties.shapeType || "ADM0";
  const name =
    item.labelDef.text || item.labelDef.alt || item.rawTarget;

  if (ast.type === "dissolve") {
    // Pure dissolved union (eliminate boundary)
    const dissolvedGeom = computeDissolvedGeometry(matchedFeatures);
    if (!dissolvedGeom) return null;

    return {
      id: `union-${item.id}`,
      name,
      admLevel,
      memberIds,
      memberNames,
      shapeGroups,
      mode: "dissolved",
      color: "#38bdf8",
      dissolvedGeometry: dissolvedGeom,
    };
  }

  // Logical Group (grouped union: A||B or (A|B)||(C|D))
  // If children contain dissolve, resolve child dissolved geometry
  let combinedDissolvedGeom: MultiPolygon | Polygon | undefined = undefined;
  try {
    combinedDissolvedGeom = computeDissolvedGeometry(matchedFeatures) || undefined;
  } catch {
    // Fallback to grouped without precomputed dissolve
  }

  return {
    id: `union-${item.id}`,
    name,
    admLevel,
    memberIds,
    memberNames,
    shapeGroups,
    mode: "grouped",
    color: "#38bdf8",
    dissolvedGeometry: combinedDissolvedGeom,
  };
}

export const TERRITORY_FALLBACK_CENTROIDS: Record<string, [number, number]> = {
  HKG: [114.1694, 22.3193], // Hong Kong
  MAC: [113.5439, 22.1987], // Macau
  PRI: [-66.5901, 18.2208], // Puerto Rico
  NCL: [165.618, -20.9043], // New Caledonia
  ATF: [69.3486, -49.3948], // French Southern Lands (Kerguelen)
  FLK: [-59.5293, -51.7523], // Falkland Islands
  PSE: [35.2332, 31.9522], // Palestine
  GUM: [144.7937, 13.4443], // Guam
  VIR: [-64.8963, 18.3358], // US Virgin Islands
  ASM: [-170.1322, -14.271], // American Samoa
  BMU: [-64.7574, 32.3078], // Bermuda
  CYM: [-81.2546, 19.3133], // Cayman Islands
  GIB: [-5.3536, 36.1408], // Gibraltar
  GRL: [-42.6043, 71.7069], // Greenland
  FRO: [-6.9118, 61.8926], // Faroe Islands
  ABW: [-69.9683, 12.5211], // Aruba
  CUW: [-68.99, 12.1696], // Curacao
  SXM: [-63.0548, 18.0425], // Sint Maarten
};

/**
 * Builds active RegionLabelConfig list from parsed label dataset items in the viewport.
 */
export function buildDatasetLabelConfigs(
  items: ParsedLabelItem[],
  rawFeaturesById: Map<string, AdminFeature>,
  unionGroups: RegionUnionGroup[],
  countryMetaMap: Map<string, CountryMeta>,
  datasetImageSize = 22
): RegionLabelConfig[] {
  const configs: RegionLabelConfig[] = [];
  const unionMap = new Map<string, RegionUnionGroup>();
  for (const ug of unionGroups) {
    unionMap.set(ug.id, ug);
  }

  for (const item of items) {
    const unionGroup = unionMap.get(`union-${item.id}`);

    if (unionGroup) {
      // 1. Label anchored to union group centroid
      let center: [number, number] = [0, 0];
      if (unionGroup.dissolvedGeometry) {
        center = computeGeometryCentroid(unionGroup.dissolvedGeometry);
      }
      if (center[0] === 0 && center[1] === 0) {
        // Fallback to combined bbox center
        const present = unionGroup.memberIds
          .map((id) => rawFeaturesById.get(id))
          .filter((x): x is AdminFeature => Boolean(x));
        if (present.length > 0) {
          const b = computeCombinedBbox(present);
          center = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
        }
      }

      if (center[0] !== 0 || center[1] !== 0) {
        configs.push({
          id: `label-union-${item.id}`,
          targetId: unionGroup.id,
          level: unionGroup.admLevel,
          center,
          type: item.labelDef.type,
          text: item.labelDef.text,
          imageUrl: item.labelDef.imageUrl,
          shapeGroup: unionGroup.shapeGroups.join(", "),
          shapeName: unionGroup.name,
          iconSize: datasetImageSize,
          sortKey: 50,
        });
      }
      continue;
    }

    // 2. Single target label
    const norm = normalizeTargetSpec(item.rawTarget);
    const parts = norm.split("::").map((p) => p.trim());
    const country = matchCountry(parts[0], Array.from(countryMetaMap.values()));
    if (!country) continue;

    let targetFeature: AdminFeature | null = null;
    let level: AdmLevel = "ADM0";

    if (parts.length === 1) {
      targetFeature =
        rawFeaturesById.get(country.shapeID) ||
        rawFeaturesById.get(country.shapeGroup) ||
        null;
      level = "ADM0";
    } else {
      const hierarchy = getCachedCountryHierarchy(country.shapeGroup);
      if (hierarchy) {
        if (parts.length === 2) {
          targetFeature = matchFeature(parts[1], hierarchy.adm1Features);
          level = "ADM1";
        } else {
          targetFeature = matchFeature(parts[2], hierarchy.adm2Features);
          level = "ADM2";
        }
      }
    }

    let center: [number, number] = [0, 0];
    const upperTarget = item.rawTarget.trim().toUpperCase();
    if (TERRITORY_FALLBACK_CENTROIDS[upperTarget]) {
      center = TERRITORY_FALLBACK_CENTROIDS[upperTarget];
    } else if (targetFeature) {
      center = computeFeatureCentroid(targetFeature);
    }
    // Fallback to country bbox center if targetFeature geometry is not yet present
    if (center[0] === 0 && center[1] === 0 && country.bbox) {
      center = [
        (country.bbox[0] + country.bbox[2]) / 2,
        (country.bbox[1] + country.bbox[3]) / 2,
      ];
    }

    let bbox = COUNTRY_PRIMARY_FIT_BBOX[upperTarget] || country.bbox;
    if (targetFeature && !COUNTRY_PRIMARY_FIT_BBOX[upperTarget]) {
      const featBbox = computeFeatureBbox(targetFeature);
      if (featBbox) bbox = featBbox;
    }
    const sortKey = computeLabelSortKey(level, true, bbox);

    if (center[0] !== 0 || center[1] !== 0) {
      const targetId = TERRITORY_FALLBACK_CENTROIDS[upperTarget]
        ? upperTarget
        : (targetFeature?.properties.shapeID || country.shapeID);
      const shapeGroup = TERRITORY_FALLBACK_CENTROIDS[upperTarget]
        ? upperTarget
        : (targetFeature?.properties.shapeGroup || country.shapeGroup);

      configs.push({
        id: `label-item-${item.id}`,
        targetId,
        level,
        center,
        type: item.labelDef.type,
        text:
          item.labelDef.text ||
          item.labelDef.alt ||
          targetFeature?.properties.shapeName ||
          country.shapeName,
        imageUrl: item.labelDef.imageUrl,
        shapeGroup,
        shapeName:
          targetFeature?.properties.shapeName || country.shapeName,
        iconSize: datasetImageSize,
        sortKey,
      });
    }
  }

  return configs;
}

/**
 * Computes centroid for arbitrary MultiPolygon or Polygon geometry.
 */
function computeGeometryCentroid(geom: Polygon | MultiPolygon): [number, number] {
  if (geom.type === "Polygon") {
    if (!geom.coordinates || geom.coordinates.length === 0) return [0, 0];
    return computeRingCentroid(geom.coordinates[0]);
  }
  if (geom.type === "MultiPolygon") {
    if (!geom.coordinates || geom.coordinates.length === 0) return [0, 0];
    // Find largest polygon part
    let maxArea = -1;
    let bestCentroid: [number, number] = [0, 0];
    for (const poly of geom.coordinates) {
      if (poly.length === 0) continue;
      const c = computeRingCentroid(poly[0]);
      // Approximate area
      let area = 0;
      const ring = poly[0];
      for (let i = 0; i < ring.length - 1; i++) {
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      }
      area = Math.abs(area);
      if (area > maxArea) {
        maxArea = area;
        bestCentroid = c;
      }
    }
    return bestCentroid;
  }
  return [0, 0];
}
