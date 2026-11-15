import type { MultiPolygon, Polygon, Position } from "geojson";

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

/** Exterior ring contains the point, and no hole does. */
export function pointInPolygonCoords(
  x: number,
  y: number,
  rings: Position[][]
): boolean {
  if (rings.length === 0) return false;
  if (!pointInRing(x, y, rings[0])) return false;
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
  for (let i = 0; i < geom.coordinates.length; i++) {
    if (pointInPolygonCoords(x, y, geom.coordinates[i])) return true;
  }
  return false;
}
