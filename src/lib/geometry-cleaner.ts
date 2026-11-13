import type { Feature, Geometry, MultiPolygon, Polygon, Position } from "geojson";

/**
 * 2D Cross product / CCW test.
 * Returns > 0 if A->B->C turns counter-clockwise, < 0 if clockwise, 0 if collinear.
 */
export function ccw(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): number {
  return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
}

/**
 * Strict segment intersection test between AB and CD.
 * Returns true if segment AB strictly crosses segment CD.
 */
export function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const ccw1 = ccw(ax, ay, bx, by, cx, cy);
  const ccw2 = ccw(ax, ay, bx, by, dx, dy);
  const ccw3 = ccw(cx, cy, dx, dy, ax, ay);
  const ccw4 = ccw(cx, cy, dx, dy, bx, by);

  return (
    ((ccw1 > 0 && ccw2 < 0) || (ccw1 < 0 && ccw2 > 0)) &&
    ((ccw3 > 0 && ccw4 < 0) || (ccw3 < 0 && ccw4 > 0))
  );
}

/**
 * Untangles local self-intersecting bowties (2-opt heuristic) within a sliding window.
 * Eliminates inverted loops, backtracks, and crossings in polygon rings while preserving geographical shape.
 */
export function untangleRing(
  ring: Position[],
  maxWindow: number = 15,
  maxPasses: number = 6
): { pts: Position[]; untangledCount: number } {
  const len = ring.length;
  if (len < 5) {
    return { pts: ring, untangledCount: 0 };
  }

  const pts: Position[] = ring.map((p) => [p[0], p[1]]);
  const isClosed =
    pts[0][0] === pts[len - 1][0] && pts[0][1] === pts[len - 1][1];
  const N = isClosed ? len - 1 : len;

  let untangledCount = 0;
  let changed = true;
  let pass = 0;

  while (changed && pass < maxPasses) {
    changed = false;
    pass++;

    for (let i = 0; i < N - 2; i++) {
      const ax = pts[i][0];
      const ay = pts[i][1];
      const bx = pts[i + 1][0];
      const by = pts[i + 1][1];
      const maxJ = Math.min(N - 1, i + maxWindow);

      for (let j = i + 2; j < maxJ; j++) {
        // Skip closing segment connection to beginning
        if (i === 0 && j === N - 1) continue;

        const cx = pts[j][0];
        const cy = pts[j][1];
        const dx = pts[j + 1][0];
        const dy = pts[j + 1][1];

        if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) {
          // 2-opt untangle: reverse subsegment from i + 1 to j
          let left = i + 1;
          let right = j;
          while (left < right) {
            const tmp = pts[left];
            pts[left] = pts[right];
            pts[right] = tmp;
            left++;
            right--;
          }
          untangledCount++;
          changed = true;
          i = j; // Advance past the reversed region
          break;
        }
      }
    }
  }

  if (isClosed) {
    pts[pts.length - 1] = [pts[0][0], pts[0][1]];
  }

  return { pts, untangledCount };
}

/**
 * Clean a Polygon or MultiPolygon geometry by resolving all local self-intersections.
 */
export function cleanPolygonGeometry<G extends Polygon | MultiPolygon>(
  geometry: G,
  maxWindow: number = 15
): G {
  if (geometry.type === "Polygon") {
    const coordinates = geometry.coordinates.map(
      (ring) => untangleRing(ring, maxWindow).pts
    );
    return {
      ...geometry,
      coordinates,
    };
  }

  if (geometry.type === "MultiPolygon") {
    const coordinates = geometry.coordinates.map((poly) =>
      poly.map((ring) => untangleRing(ring, maxWindow).pts)
    );
    return {
      ...geometry,
      coordinates,
    };
  }

  return geometry;
}

/**
 * Clean a GeoJSON feature's polygon geometry.
 */
export function cleanFeature<F extends Feature<Polygon | MultiPolygon>>(
  feature: F,
  maxWindow: number = 15
): F {
  if (!feature.geometry) return feature;
  return {
    ...feature,
    geometry: cleanPolygonGeometry(feature.geometry, maxWindow),
  };
}

/**
 * Clean an array of GeoJSON features.
 */
export function cleanFeatures<F extends Feature<Polygon | MultiPolygon>>(
  features: F[],
  maxWindow: number = 15
): F[] {
  return features.map((f) => cleanFeature(f, maxWindow));
}
