import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

export type MapMode = "globe" | "flat";
export type FlatProjectionId =
  | "equirectangular"
  | "mercator"
  | "equalEarth"
  | "naturalEarth";
export type ProjectionModeId = "globe" | FlatProjectionId;

export interface FlatProjectionInfo {
  id: FlatProjectionId;
  name: string;
  subtitle: string;
  description: string;
}

export interface ProjectionModeInfo {
  id: ProjectionModeId;
  name: string;
  shortName: string;
  subtitle: string;
  description: string;
  is3D?: boolean;
}

export const ALL_PROJECTIONS: ProjectionModeInfo[] = [
  {
    id: "globe",
    name: "3D 地球 (3D Globe)",
    shortName: "3D 地球",
    subtitle: "Spherical 3D · 擬真球體",
    description: "真實三維地球球體視角，支援自由旋轉、傾斜視角與立體視覺。",
    is3D: true,
  },
  {
    id: "equirectangular",
    name: "Equirectangular (等距圓柱投影)",
    shortName: "等距圓柱",
    subtitle: "Plate Carrée · 經緯度等距",
    description: "經線與緯線皆為等距平行直線，緯度間距完全相等，適合直接對照經緯度座標。",
  },
  {
    id: "equalEarth",
    name: "Equal Earth (等面積偽圓柱投影)",
    shortName: "Equal Earth",
    subtitle: "Equal-Area · 面積比例真實",
    description: "保持全球各區域真實相對面積比例，避免高緯度地區過度放大。",
  },
  {
    id: "naturalEarth",
    name: "Natural Earth (自然地球折衷投影)",
    shortName: "Natural Earth",
    subtitle: "Compromise · 視覺均衡",
    description: "兼具形狀與面積平衡的偽圓柱投影，高緯度經線平滑收斂。",
  },
  {
    id: "mercator",
    name: "Web Mercator (正軸等角圓柱投影)",
    shortName: "Web Mercator",
    subtitle: "Conformal · 標準網路地圖",
    description: "保持局部角度與方向正確，高緯度面積會顯著放大。",
  },
];

export const FLAT_PROJECTIONS: FlatProjectionInfo[] = [
  {
    id: "equirectangular",
    name: "Equirectangular (等距圓柱投影)",
    subtitle: "Plate Carrée · 經緯度等距",
    description: "經線與緯線皆為等距平行直線，緯度間距完全相等，適合直接對照經緯度座標。",
  },
  {
    id: "equalEarth",
    name: "Equal Earth (等面積偽圓柱投影)",
    subtitle: "Equal-Area · 面積比例真實",
    description: "保持全球各區域真實相對面積比例，避免高緯度地區過度放大。",
  },
  {
    id: "naturalEarth",
    name: "Natural Earth (自然地球折衷投影)",
    subtitle: "Compromise · 視覺均衡",
    description: "兼具形狀與面積平衡的偽圓柱投影，高緯度經線平滑收斂。",
  },
  {
    id: "mercator",
    name: "Web Mercator (正軸等角圓柱投影)",
    subtitle: "Conformal · 標準網路地圖",
    description: "保持局部角度與方向正確，高緯度面積會顯著放大。",
  },
];

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const MAX_MERCATOR_LAT = 85.05112878;

/**
 * Convert a linear Web-Mercator Y coordinate (in degrees, [-180, 180])
 * into the geographic latitude that MapLibre's Mercator projection places at Y.
 */
function mercatorYToDisplayLat(yDeg: number): number {
  const clampedY = Math.max(-179.9, Math.min(179.9, yDeg));
  const yRad = clampedY * DEG2RAD;
  const latRad = 2 * Math.atan(Math.exp(yRad)) - Math.PI / 2;
  return Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, latRad * RAD2DEG));
}

/**
 * Convert a MapLibre display latitude back into linear Web-Mercator Y (in degrees, [-180, 180]).
 */
function displayLatToMercatorY(displayLat: number): number {
  const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, displayLat));
  const phi = clamped * DEG2RAD;
  const yRad = Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return yRad * RAD2DEG;
}

// Equal Earth constants (Šavrič et al. 2018)
const EE_A1 = 1.340264;
const EE_A2 = -0.081106;
const EE_A3 = 0.000893;
const EE_A4 = 0.003796;
const EE_M = Math.sqrt(3) / 2;
// Max X at (lambda=pi, theta=0): pi * 2 / sqrt(3) / EE_A1 ~ 2.70636
const EE_SCALE = 180 / ((Math.PI / EE_M) / EE_A1);

// Natural Earth polynomial coefficients (Tom Patterson)
const NE_A0 = 0.8707;
const NE_A1 = -0.131979;
const NE_A2 = -0.013791;
const NE_A3 = 0.003971;
const NE_A4 = -0.001529;
const NE_B0 = 1.007226;
const NE_B1 = 0.015085;
const NE_B2 = -0.044475;
const NE_B3 = 0.028874;
const NE_B4 = -0.005916;
const NE_SCALE = 180 / (Math.PI * NE_A0);

/**
 * Project geographic [lng, lat] (in degrees) to MapLibre display [lng, lat]
 * for the selected mode and 2D projection.
 */
export function projectLngLat(
  lng: number,
  lat: number,
  mode: MapMode,
  flatProjection: FlatProjectionId
): [number, number] {
  const clampedLng = Math.max(-180, Math.min(180, lng));
  const clampedLat = Math.max(-90, Math.min(90, lat));

  if (mode === "globe" || flatProjection === "mercator") {
    return [
      clampedLng,
      Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, clampedLat)),
    ];
  }

  if (flatProjection === "equirectangular") {
    // In Equirectangular (Plate Carrée), screen X = lng, screen Y = lat (in degrees).
    // Map screen Y linearly through Gudermannian so MapLibre's Mercator canvas renders Y linearly!
    return [clampedLng, mercatorYToDisplayLat(clampedLat)];
  }

  if (flatProjection === "equalEarth") {
    const lam = clampedLng * DEG2RAD;
    const phi = clampedLat * DEG2RAD;
    const sinTheta = Math.max(-1, Math.min(1, EE_M * Math.sin(phi)));
    const theta = Math.asin(sinTheta);
    const theta2 = theta * theta;
    const theta6 = theta2 * theta2 * theta2;
    const denom =
      EE_A1 +
      3 * EE_A2 * theta2 +
      theta6 * (7 * EE_A3 + 9 * EE_A4 * theta2);

    const x = ((lam * Math.cos(theta)) / (EE_M * denom)) * EE_SCALE;
    const y =
      theta *
      (EE_A1 +
        EE_A2 * theta2 +
        theta6 * (EE_A3 + EE_A4 * theta2)) *
      EE_SCALE;

    return [
      Math.max(-180, Math.min(180, x)),
      mercatorYToDisplayLat(y),
    ];
  }

  if (flatProjection === "naturalEarth") {
    const lam = clampedLng * DEG2RAD;
    const phi = clampedLat * DEG2RAD;
    const phi2 = phi * phi;
    const phi4 = phi2 * phi2;

    const l =
      NE_A0 +
      phi2 * (NE_A1 + phi2 * (NE_A2 + phi4 * (NE_A3 + phi2 * NE_A4)));
    const d =
      phi *
      (NE_B0 +
        phi2 * (NE_B1 + phi4 * (NE_B2 + phi2 * (NE_B3 + phi2 * NE_B4))));

    const x = lam * l * NE_SCALE;
    const y = d * NE_SCALE;

    return [
      Math.max(-180, Math.min(180, x)),
      mercatorYToDisplayLat(y),
    ];
  }

  return [clampedLng, clampedLat];
}

/**
 * Inverse-project MapLibre display [lng, lat] back to true geographic [lng, lat].
 */
export function unprojectLngLat(
  displayLng: number,
  displayLat: number,
  mode: MapMode,
  flatProjection: FlatProjectionId
): [number, number] | null {
  if (mode === "globe" || flatProjection === "mercator") {
    return [displayLng, displayLat];
  }

  const y = displayLatToMercatorY(displayLat);
  const x = displayLng;

  if (flatProjection === "equirectangular") {
    if (Math.abs(y) > 90.5 || Math.abs(x) > 180.5) return null;
    return [
      Math.max(-180, Math.min(180, x)),
      Math.max(-90, Math.min(90, y)),
    ];
  }

  if (flatProjection === "equalEarth") {
    const yNorm = y / EE_SCALE;
    // Newton-Raphson for theta
    let theta = yNorm;
    for (let i = 0; i < 8; i++) {
      const t2 = theta * theta;
      const t6 = t2 * t2 * t2;
      const f =
        theta * (EE_A1 + EE_A2 * t2 + t6 * (EE_A3 + EE_A4 * t2)) - yNorm;
      const fp =
        EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2);
      const dt = f / fp;
      theta -= dt;
      if (Math.abs(dt) < 1e-7) break;
    }
    const sinPhi = Math.sin(theta) / EE_M;
    if (Math.abs(sinPhi) > 1.001) return null;
    const phi = Math.asin(Math.max(-1, Math.min(1, sinPhi)));
    const t2 = theta * theta;
    const t6 = t2 * t2 * t2;
    const denom =
      EE_A1 + 3 * EE_A2 * t2 + t6 * (7 * EE_A3 + 9 * EE_A4 * t2);
    const cosTheta = Math.cos(theta);
    if (Math.abs(cosTheta) < 1e-6) return [0, phi * RAD2DEG];
    const lam = ((x / EE_SCALE) * EE_M * denom) / cosTheta;
    if (Math.abs(lam) > Math.PI + 0.02) return null;
    return [
      Math.max(-180, Math.min(180, lam * RAD2DEG)),
      Math.max(-90, Math.min(90, phi * RAD2DEG)),
    ];
  }

  if (flatProjection === "naturalEarth") {
    const yNorm = y / NE_SCALE;
    let phi = yNorm;
    for (let i = 0; i < 8; i++) {
      const p2 = phi * phi;
      const p4 = p2 * p2;
      const f =
        phi *
          (NE_B0 +
            p2 * (NE_B1 + p4 * (NE_B2 + p2 * (NE_B3 + p2 * NE_B4)))) -
        yNorm;
      const fp =
        NE_B0 +
        p2 *
          (3 * NE_B1 +
            p4 * (7 * NE_B2 + p2 * (9 * NE_B3 + 11 * NE_B4 * p2)));
      const dp = f / fp;
      phi -= dp;
      if (Math.abs(dp) < 1e-7) break;
    }
    if (Math.abs(phi) > Math.PI / 2 + 0.02) return null;
    const p2 = phi * phi;
    const p4 = p2 * p2;
    const l =
      NE_A0 + p2 * (NE_A1 + p2 * (NE_A2 + p4 * (NE_A3 + p2 * NE_A4)));
    const lam = (x / NE_SCALE) / l;
    if (Math.abs(lam) > Math.PI + 0.02) return null;
    return [
      Math.max(-180, Math.min(180, lam * RAD2DEG)),
      Math.max(-90, Math.min(90, phi * RAD2DEG)),
    ];
  }

  return [displayLng, displayLat];
}

function projectRing(
  ring: Position[],
  mode: MapMode,
  flatProjection: FlatProjectionId
): Position[] {
  // For curved-meridian projections (equalEarth, naturalEarth), densify long latitude segments
  const needsSubdivision =
    mode === "flat" &&
    (flatProjection === "equalEarth" || flatProjection === "naturalEarth");

  const out: Position[] = [];
  for (let i = 0; i < ring.length; i++) {
    const [lng1, lat1] = ring[i];
    if (needsSubdivision && i > 0) {
      const [lng0, lat0] = ring[i - 1];
      const dLat = Math.abs(lat1 - lat0);
      const dLng = Math.abs(lng1 - lng0);
      if (dLat > 3 || dLng > 6) {
        const steps = Math.min(16, Math.ceil(Math.max(dLat / 2.5, dLng / 5)));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          out.push(
            projectLngLat(
              lng0 + (lng1 - lng0) * t,
              lat0 + (lat1 - lat0) * t,
              mode,
              flatProjection
            )
          );
        }
      }
    }
    out.push(projectLngLat(lng1, lat1, mode, flatProjection));
  }
  return out;
}

export function projectGeometry(
  geometry: Geometry,
  mode: MapMode,
  flatProjection: FlatProjectionId
): Geometry {
  if (mode === "globe" || flatProjection === "mercator") {
    return geometry;
  }

  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) =>
        projectRing(ring, mode, flatProjection)
      ),
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((poly) =>
        poly.map((ring) => projectRing(ring, mode, flatProjection))
      ),
    };
  }

  if (geometry.type === "LineString") {
    return {
      type: "LineString",
      coordinates: projectRing(geometry.coordinates, mode, flatProjection),
    };
  }

  if (geometry.type === "MultiLineString") {
    return {
      type: "MultiLineString",
      coordinates: geometry.coordinates.map((line) =>
        projectRing(line, mode, flatProjection)
      ),
    };
  }

  if (geometry.type === "Point") {
    return {
      type: "Point",
      coordinates: projectLngLat(
        geometry.coordinates[0],
        geometry.coordinates[1],
        mode,
        flatProjection
      ),
    };
  }

  return geometry;
}

export function projectFeatureCollection(
  fc: FeatureCollection,
  mode: MapMode,
  flatProjection: FlatProjectionId
): FeatureCollection {
  if (mode === "globe" || flatProjection === "mercator") {
    return fc;
  }
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => ({
      ...f,
      geometry: projectGeometry(f.geometry, mode, flatProjection),
    })),
  };
}

/**
 * Project a geographic bounding box [minLng, minLat, maxLng, maxLat]
 * into display coordinates for camera fitBounds.
 */
export function projectBbox(
  bbox: [number, number, number, number],
  mode: MapMode,
  flatProjection: FlatProjectionId
): [[number, number], [number, number]] {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const samplePoints: [number, number][] = [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [(minLng + maxLng) / 2, minLat],
    [(minLng + maxLng) / 2, maxLat],
  ];

  let dMinX = Infinity;
  let dMinY = Infinity;
  let dMaxX = -Infinity;
  let dMaxY = -Infinity;

  for (const [lng, lat] of samplePoints) {
    const [x, y] = projectLngLat(lng, lat, mode, flatProjection);
    if (x < dMinX) dMinX = x;
    if (y < dMinY) dMinY = y;
    if (x > dMaxX) dMaxX = x;
    if (y > dMaxY) dMaxY = y;
  }

  return [
    [dMinX, dMinY],
    [dMaxX, dMaxY],
  ];
}

/**
 * Generate a graticule (parallels & meridians) + ocean envelope polygon
 * projected into the active projection space.
 */
export function generateGraticuleAndEnvelope(
  mode: MapMode,
  flatProjection: FlatProjectionId
): {
  envelope: FeatureCollection;
  graticule: FeatureCollection;
} {
  // Outer ocean boundary polygon (-180..180, -90..90) sampled along edges
  const ring: Position[] = [];
  const step = 2;
  for (let lng = -180; lng <= 180; lng += step) ring.push([lng, -89.9]);
  for (let lat = -89.9; lat <= 89.9; lat += step) ring.push([180, lat]);
  for (let lng = 180; lng >= -180; lng -= step) ring.push([lng, 89.9]);
  for (let lat = 89.9; lat >= -89.9; lat -= step) ring.push([-180, lat]);
  ring.push([-180, -89.9]);

  const envelopeRaw: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { role: "ocean-envelope" },
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
      },
    ],
  };

  const lines: Feature[] = [];
  // Parallels every 30 degrees (and equator)
  for (let lat = -60; lat <= 60; lat += 30) {
    const coords: Position[] = [];
    for (let lng = -180; lng <= 180; lng += 5) {
      coords.push([lng, lat]);
    }
    lines.push({
      type: "Feature",
      properties: {
        kind: lat === 0 ? "equator" : "parallel",
        label: `${Math.abs(lat)}°${lat > 0 ? "N" : lat < 0 ? "S" : ""}`,
      },
      geometry: {
        type: "LineString",
        coordinates: coords,
      },
    });
  }

  // Meridians every 30 degrees (and prime meridian)
  for (let lng = -180; lng <= 180; lng += 30) {
    const coords: Position[] = [];
    for (let lat = -88; lat <= 88; lat += 2) {
      coords.push([lng, lat]);
    }
    lines.push({
      type: "Feature",
      properties: {
        kind: lng === 0 ? "prime-meridian" : "meridian",
        label: `${Math.abs(lng)}°${lng > 0 ? "E" : lng < 0 ? "W" : ""}`,
      },
      geometry: {
        type: "LineString",
        coordinates: coords,
      },
    });
  }

  const graticuleRaw: FeatureCollection = {
    type: "FeatureCollection",
    features: lines,
  };

  return {
    envelope: projectFeatureCollection(envelopeRaw, mode, flatProjection),
    graticule: projectFeatureCollection(graticuleRaw, mode, flatProjection),
  };
}
