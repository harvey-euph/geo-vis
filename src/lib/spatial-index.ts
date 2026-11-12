import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import type {
  InteractiveMapFeature,
  InteractiveMapFeatureProperties,
} from "./union-engine";

function pointInRing(x: number, y: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(
  x: number,
  y: number,
  rings: Position[][]
): boolean {
  if (rings.length === 0) return false;
  // Must be inside exterior ring
  if (!pointInRing(x, y, rings[0])) return false;
  // Must not be inside any interior hole ring
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(x, y, rings[i])) return false;
  }
  return true;
}

export function pointInGeometry(
  x: number,
  y: number,
  geom: Polygon | MultiPolygon
): boolean {
  if (geom.type === "Polygon") {
    return pointInPolygonCoords(x, y, geom.coordinates);
  }
  if (geom.type === "MultiPolygon") {
    for (let i = 0; i < geom.coordinates.length; i++) {
      if (pointInPolygonCoords(x, y, geom.coordinates[i])) {
        return true;
      }
    }
  }
  return false;
}

export class SpatialHitIndex {
  private features: InteractiveMapFeature[];
  private bboxes: Float64Array;
  private lastHitIdx: number = -1;

  constructor(
    fc: FeatureCollection<Polygon | MultiPolygon, InteractiveMapFeatureProperties>
  ) {
    this.features = fc.features;
    const n = this.features.length;
    this.bboxes = new Float64Array(n * 4);

    for (let i = 0; i < n; i++) {
      const geom = this.features[i].geometry;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      if (geom.type === "Polygon") {
        const ring = geom.coordinates[0];
        if (ring) {
          for (let k = 0; k < ring.length; k++) {
            const x = ring[k][0];
            const y = ring[k][1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      } else if (geom.type === "MultiPolygon") {
        const polys = geom.coordinates;
        for (let p = 0; p < polys.length; p++) {
          const ring = polys[p][0];
          if (!ring) continue;
          for (let k = 0; k < ring.length; k++) {
            const x = ring[k][0];
            const y = ring[k][1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      const offset = i * 4;
      this.bboxes[offset] = minX;
      this.bboxes[offset + 1] = minY;
      this.bboxes[offset + 2] = maxX;
      this.bboxes[offset + 3] = maxY;
    }
  }

  /**
   * Fast O(1)-amortized hit test in display coordinates (lng, lat).
   * Checks the previously hovered feature first before scanning the flat Float64Array bbox table.
   */
  public hitTest(
    x: number,
    y: number
  ): InteractiveMapFeatureProperties | null {
    const n = this.features.length;
    if (n === 0) return null;

    // 1. Fast path: check last hit feature first (succeeds on ~85% of mousemove events!)
    if (this.lastHitIdx >= 0 && this.lastHitIdx < n) {
      const off = this.lastHitIdx * 4;
      if (
        x >= this.bboxes[off] &&
        x <= this.bboxes[off + 2] &&
        y >= this.bboxes[off + 1] &&
        y <= this.bboxes[off + 3]
      ) {
        if (pointInGeometry(x, y, this.features[this.lastHitIdx].geometry)) {
          return this.features[this.lastHitIdx].properties;
        }
      }
    }

    // 2. Scan flat Float64Array bounding boxes
    for (let i = 0; i < n; i++) {
      if (i === this.lastHitIdx) continue;
      const off = i * 4;
      if (
        x >= this.bboxes[off] &&
        x <= this.bboxes[off + 2] &&
        y >= this.bboxes[off + 1] &&
        y <= this.bboxes[off + 3]
      ) {
        if (pointInGeometry(x, y, this.features[i].geometry)) {
          this.lastHitIdx = i;
          return this.features[i].properties;
        }
      }
    }

    this.lastHitIdx = -1;
    return null;
  }
}
