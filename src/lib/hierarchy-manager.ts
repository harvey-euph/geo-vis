import {
  type AdminFeature,
  loadCountrySubdivisions,
  parseBbox,
} from "./fgb-loader";
import type { Position } from "geojson";

export interface CountrySubdivisionHierarchy {
  shapeGroup: string;
  adm1Features: AdminFeature[];
  adm2Features: AdminFeature[];
  adm1ToAdm2: Map<string, AdminFeature[]>;
  adm2ToAdm1: Map<string, string>;
}

const hierarchyCache = new Map<string, CountrySubdivisionHierarchy>();
const inFlightHierarchy = new Map<string, Promise<CountrySubdivisionHierarchy>>();

function pointInPolygonCoords(
  x: number,
  y: number,
  rings: Position[][]
): boolean {
  if (rings.length === 0) return false;
  const exterior = rings[0];
  let inside = false;
  for (let i = 0, j = exterior.length - 1; i < exterior.length; j = i++) {
    const xi = exterior[i][0];
    const yi = exterior[i][1];
    const xj = exterior[j][0];
    const yj = exterior[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  if (!inside) return false;
  for (let r = 1; r < rings.length; r++) {
    const hole = rings[r];
    let inHole = false;
    for (let i = 0, j = hole.length - 1; i < hole.length; j = i++) {
      const xi = hole[i][0];
      const yi = hole[i][1];
      const xj = hole[j][0];
      const yj = hole[j][1];
      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inHole = !inHole;
    }
    if (inHole) return false;
  }
  return true;
}

function getRepresentativePoint(geom: AdminFeature["geometry"]): [number, number] {
  if (!geom || !geom.coordinates) return [0, 0];
  const ring =
    geom.type === "Polygon"
      ? geom.coordinates[0]
      : geom.coordinates[0] && geom.coordinates[0][0]
        ? geom.coordinates[0][0]
        : [];
  if (!ring || ring.length === 0) return [0, 0];
  let sumX = 0;
  let sumY = 0;
  const n = Math.max(1, ring.length - 1);
  for (let i = 0; i < n; i++) {
    sumX += ring[i][0];
    sumY += ring[i][1];
  }
  return [sumX / n, sumY / n];
}

export function getCachedCountryHierarchy(
  shapeGroup: string
): CountrySubdivisionHierarchy | null {
  return hierarchyCache.get(shapeGroup) || null;
}

export async function loadCountryHierarchy(
  shapeGroup: string
): Promise<CountrySubdivisionHierarchy> {
  const existing = hierarchyCache.get(shapeGroup);
  if (existing) return existing;

  const inFlight = inFlightHierarchy.get(shapeGroup);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const [adm1, adm2] = await Promise.all([
        loadCountrySubdivisions(shapeGroup, "ADM1"),
        loadCountrySubdivisions(shapeGroup, "ADM2"),
      ]);

      const adm1ToAdm2 = new Map<string, AdminFeature[]>();
      const adm2ToAdm1 = new Map<string, string>();

      for (const a1 of adm1) {
        adm1ToAdm2.set(a1.properties.shapeID, []);
      }

      if (adm2.length > 0 && adm1.length > 0) {
        const adm1Bboxes = adm1.map((feat) => {
          const b = parseBbox(feat.properties.bboxStr);
          return {
            id: feat.properties.shapeID,
            feat,
            minX: b[0],
            minY: b[1],
            maxX: b[2],
            maxY: b[3],
            cx: (b[0] + b[2]) / 2,
            cy: (b[1] + b[3]) / 2,
          };
        });

        for (const a2 of adm2) {
          const a2Id = a2.properties.shapeID;
          const pt = getRepresentativePoint(a2.geometry);
          let matchedAdm1Id: string | null = null;

          // 1. Precise point-in-polygon test with bbox pre-check
          for (const b of adm1Bboxes) {
            if (
              pt[0] >= b.minX &&
              pt[0] <= b.maxX &&
              pt[1] >= b.minY &&
              pt[1] <= b.maxY
            ) {
              const geom = b.feat.geometry;
              const polys =
                geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
              for (const p of polys) {
                if (pointInPolygonCoords(pt[0], pt[1], p)) {
                  matchedAdm1Id = b.id;
                  break;
                }
              }
              if (matchedAdm1Id) break;
            }
          }

          // 2. Fallback to nearest ADM1 center for edge islands / jagged coasts
          if (!matchedAdm1Id) {
            let bestDist = Infinity;
            for (const b of adm1Bboxes) {
              const d = (b.cx - pt[0]) ** 2 + (b.cy - pt[1]) ** 2;
              if (d < bestDist) {
                bestDist = d;
                matchedAdm1Id = b.id;
              }
            }
          }

          if (matchedAdm1Id) {
            adm2ToAdm1.set(a2Id, matchedAdm1Id);
            const list = adm1ToAdm2.get(matchedAdm1Id);
            if (list) {
              list.push(a2);
            } else {
              adm1ToAdm2.set(matchedAdm1Id, [a2]);
            }
          }
        }
      }

      const hierarchy: CountrySubdivisionHierarchy = {
        shapeGroup,
        adm1Features: adm1,
        adm2Features: adm2,
        adm1ToAdm2,
        adm2ToAdm1,
      };

      hierarchyCache.set(shapeGroup, hierarchy);
      inFlightHierarchy.delete(shapeGroup);
      return hierarchy;
    } catch (err) {
      inFlightHierarchy.delete(shapeGroup);
      throw err;
    }
  })();

  inFlightHierarchy.set(shapeGroup, promise);
  return promise;
}

export function getParentAdm1Id(
  shapeGroup: string,
  adm2Id: string
): string | null {
  const h = hierarchyCache.get(shapeGroup);
  if (!h) return null;
  return h.adm2ToAdm1.get(adm2Id) || null;
}

export function buildDrilldownFeaturesForCountry(
  hierarchy: CountrySubdivisionHierarchy,
  expandedAdm1Map: Map<string, "clicked" | "hovered">,
  defaultRole: "clicked" | "hovered",
  scope: "local" | "wide" = "local"
): AdminFeature[] {
  const result: AdminFeature[] = [];

  // When scope is "wide" and an ADM1 is active:
  // The ENTIRE country expands into all of its ADM2 features!
  // The ADM2s belonging to the focused ADM1(s) get their specific role ("clicked" or "hovered"),
  // and all other ADM2s in the country get role "wide-context".
  if (
    scope === "wide" &&
    expandedAdm1Map.size > 0 &&
    hierarchy.adm2Features.length > 0
  ) {
    const coveredAdm1Ids = new Set<string>();

    for (const a2 of hierarchy.adm2Features) {
      const a2Id = a2.properties.shapeID;
      const parentAdm1Id = hierarchy.adm2ToAdm1.get(a2Id);
      const roleForThisAdm2 =
        parentAdm1Id && expandedAdm1Map.has(parentAdm1Id)
          ? expandedAdm1Map.get(parentAdm1Id)!
          : ("wide-context" as const);

      if (parentAdm1Id) coveredAdm1Ids.add(parentAdm1Id);

      result.push({
        ...a2,
        properties: {
          ...a2.properties,
          drilldownRole: roleForThisAdm2,
        },
      });
    }

    // Fallback for any ADM1 with 0 ADM2 children
    for (const adm1 of hierarchy.adm1Features) {
      const adm1Id = adm1.properties.shapeID;
      if (!coveredAdm1Ids.has(adm1Id)) {
        const role = expandedAdm1Map.has(adm1Id)
          ? expandedAdm1Map.get(adm1Id)!
          : ("wide-context" as const);
        result.push({
          ...adm1,
          properties: {
            ...adm1.properties,
            drilldownRole: role,
          },
        });
      }
    }

    return result;
  }

  // "local" scope: Only the ADM1s in expandedAdm1Map expand to ADM2; all other ADM1s stay as ADM1
  for (const adm1 of hierarchy.adm1Features) {
    const adm1Id = adm1.properties.shapeID;
    const roleForAdm1 = expandedAdm1Map.get(adm1Id);

    if (roleForAdm1) {
      const adm2List = hierarchy.adm1ToAdm2.get(adm1Id);
      if (adm2List && adm2List.length > 0) {
        for (const a2 of adm2List) {
          result.push({
            ...a2,
            properties: {
              ...a2.properties,
              drilldownRole: roleForAdm1,
            },
          });
        }
      } else {
        result.push({
          ...adm1,
          properties: {
            ...adm1.properties,
            drilldownRole: roleForAdm1,
          },
        });
      }
    } else {
      result.push({
        ...adm1,
        properties: {
          ...adm1.properties,
          drilldownRole: defaultRole,
        },
      });
    }
  }

  return result;
}

