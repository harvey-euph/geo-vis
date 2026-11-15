import type { MultiPolygon, Polygon } from "geojson";
import type { AdminFeature, CountryMeta } from "./fgb-loader";

/**
 * Curated primary landmass bounding boxes [minLng, minLat, maxLng, maxLat]
 * for countries whose raw bounding box crosses the 180° antimeridian or contains
 * remote overseas territories spanning across oceans or into other hemispheres.
 *
 * This ensures that camera fitBounds focuses on the country's primary landmass
 * rather than zooming out to 1.0 and centering on Algeria / the Atlantic Ocean.
 */
export const COUNTRY_PRIMARY_FIT_BBOX: Record<
  string,
  [number, number, number, number]
> = {
  // United States: Contiguous United States (CONUS)
  USA: [-124.74, 24.5, -66.95, 49.38],
  // Russia: Mainland Russia (western border to 180° meridian, excluding Chukotka antimeridian wrap)
  RUS: [27.3, 41.18, 180.0, 77.72],
  // France: Metropolitan France (excluding French Guiana, Reunion, French Polynesia)
  FRA: [-5.15, 41.33, 9.56, 51.09],
  // United Kingdom: Great Britain + Northern Ireland (excluding Falklands, South Georgia, etc.)
  GBR: [-8.18, 49.95, 1.77, 58.67],
  // New Zealand: North Island & South Island (excluding Chatham Islands & Kermadec)
  NZL: [166.4, -47.3, 178.6, -34.4],
  // Norway: Mainland Norway (excluding Bouvet Island at -54°S and Svalbard)
  NOR: [4.5, 57.98, 31.06, 71.18],
  // Netherlands: European Netherlands (excluding Caribbean Netherlands / Aruba / Curacao)
  NLD: [3.35, 50.75, 7.23, 53.55],
  // Fiji: Main islands (Viti Levu & Vanua Levu)
  FJI: [177.0, -18.4, 180.0, -16.0],
  // Kiribati: Gilbert Islands
  KIR: [172.8, -1.5, 177.0, 3.5],
};

/**
 * Parse a bounding box string (e.g. "[-120, 20, -80, 50]") into a 4-element number tuple.
 */
export function parseBbox(
  bboxStr: string | undefined,
  fallback: [number, number, number, number] = [-180, -85, 180, 85]
): [number, number, number, number] {
  if (!bboxStr) return fallback;
  try {
    const parsed = JSON.parse(bboxStr);
    if (Array.isArray(parsed) && parsed.length === 4) {
      return [
        Number(parsed[0]),
        Number(parsed[1]),
        Number(parsed[2]),
        Number(parsed[3]),
      ];
    }
  } catch {
    // ignore
  }
  return fallback;
}

/**
 * Computes the bounding box [minLng, minLat, maxLng, maxLat]
 * of the single largest polygon by bounding box area in a Polygon or MultiPolygon geometry.
 */
export function computeLargestPolygonBbox(
  geom: Polygon | MultiPolygon
): [number, number, number, number] | null {
  const polys =
    geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  if (!polys || polys.length === 0) return null;

  let largestArea = -1;
  let bestBbox: [number, number, number, number] | null = null;

  for (const poly of polys) {
    if (!poly || !poly[0] || poly[0].length === 0) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of poly[0]) {
      const x = pt[0];
      const y = pt[1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;
    if (area > largestArea) {
      largestArea = area;
      bestBbox = [minX, minY, maxX, maxY];
    }
  }

  return bestBbox;
}

/**
 * Get the optimal camera fit bounding box for an ADM0 country.
 * Prioritizes the curated COUNTRY_PRIMARY_FIT_BBOX, then checks if the country crosses
 * the 180° antimeridian or spans > 180°, falling back to the largest polygon bbox
 * or the default country.bbox.
 */
export function getCountryFitBbox(
  country: CountryMeta | string,
  rawFeature?: AdminFeature
): [number, number, number, number] {
  const shapeGroup =
    typeof country === "string" ? country : country.shapeGroup;

  // 1. Check curated primary fit bbox table
  if (COUNTRY_PRIMARY_FIT_BBOX[shapeGroup]) {
    return COUNTRY_PRIMARY_FIT_BBOX[shapeGroup];
  }

  // 2. If feature geometry is supplied and country crosses 180 or spans > 180
  if (rawFeature && rawFeature.geometry) {
    const defaultBbox =
      typeof country !== "string" ? country.bbox : undefined;
    const spanX = defaultBbox ? defaultBbox[2] - defaultBbox[0] : 0;
    if (
      spanX > 180 ||
      (defaultBbox && defaultBbox[0] < -160 && defaultBbox[2] > 160)
    ) {
      const largest = computeLargestPolygonBbox(rawFeature.geometry);
      if (largest) return largest;
    }
  }

  // 3. Return country.bbox if CountryMeta object provided
  if (typeof country !== "string" && Array.isArray(country.bbox)) {
    return country.bbox;
  }

  // 4. Fallback to global bounds
  return [-180, -85, 180, 85];
}

/**
 * Get the optimal camera fit bounding box for any AdminFeature (ADM0, ADM1, ADM2).
 * Handles antimeridian crossing and overseas territories gracefully.
 */
export function getFeatureFitBbox(
  feature: AdminFeature,
  fallback: [number, number, number, number] = [-180, -85, 180, 85]
): [number, number, number, number] {
  if (feature.properties.shapeType === "ADM0") {
    return getCountryFitBbox(feature.properties.shapeGroup, feature);
  }

  const rawBbox = parseBbox(feature.properties.bboxStr, fallback);
  const spanX = rawBbox[2] - rawBbox[0];

  // If feature crosses the 180° antimeridian (span > 180 or wraps -180/180)
  if (spanX > 180 || (rawBbox[0] < -160 && rawBbox[2] > 160)) {
    if (feature.geometry) {
      const largest = computeLargestPolygonBbox(feature.geometry);
      if (largest && largest[2] - largest[0] <= 180) {
        return largest;
      }
    }
  }

  return rawBbox;
}
