import type { Feature, FeatureCollection, Point, Position, Polygon, MultiPolygon } from "geojson";
import {
  type AdminFeature,
  type AdmLevel,
  getCachedCountrySubdivisions,
} from "@/lib/fgb-loader";
import { COUNTRY_PRIMARY_FIT_BBOX } from "@/lib/bbox-helper";
import {
  getLabelAnchorBakedCenter,
  getLabelAnchorSpec,
  listLabelAnchorAdm1Groups,
} from "@/lib/label-anchors";
import { matchFeature } from "@/lib/target-resolver";
import { type FlatProjectionId, type MapMode, projectLngLat } from "@/lib/projections";

export type LabelType = "text" | "image" | "badge";

export interface RegionLabelConfig {
  /** Unique icon/feature ID registered in MapLibre, e.g. "label-ADM0-TWN" */
  id: string;
  /** Regional administrative target ID, e.g. "TWN", "USA", "TWN::Taipei" */
  targetId: string;
  /** Administrative hierarchy level */
  level: AdmLevel;
  /** Center anchor coordinate [longitude, latitude] in WGS84 */
  center: [number, number];
  /** Label presentation type: pure text, image icon, or composite badge (icon + text) */
  type: LabelType;
  /** Text to render (e.g. ISO3 code "TWN", "USA" for ADM0, or subdivision name for ADM1/ADM2) */
  text?: string;
  /** Image URL, data URI, or SVG for image or badge labels */
  imageUrl?: string;
  /** Country shapeGroup ISO3 (e.g. "TWN") */
  shapeGroup?: string;
  /** Human-readable region name */
  shapeName?: string;
  /** Text color (default: #ffffff) */
  textColor?: string;
  /** Background pill color (default: rgba(11, 25, 44, 0.90)) */
  bgColor?: string;
  /** Border outline color (default: rgba(56, 189, 248, 0.75)) */
  borderColor?: string;
  /** Size scale for image/icon in CSS pixels (default: 20) */
  iconSize?: number;
  /** Numeric placement priority for symbol collision detection (smaller number = placed first / higher priority) */
  sortKey?: number;
}

export interface LabelImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Computes polygon ring area using Green's theorem.
 */
export function computeRingArea(ring: Position[]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

/**
 * Computes exact geometric center-of-mass (centroid) for a polygon ring.
 */
export function computeRingCentroid(ring: Position[]): [number, number] {
  let cx = 0;
  let cy = 0;
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xnext = ring[i + 1][0];
    const ynext = ring[i + 1][1];
    const factor = xi * ynext - xnext * yi;
    cx += (xi + xnext) * factor;
    cy += (yi + ynext) * factor;
    area += factor;
  }
  area = area / 2;
  if (Math.abs(area) < 1e-7) {
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n - 1; i++) {
      sumX += ring[i][0];
      sumY += ring[i][1];
    }
    return [sumX / Math.max(1, n - 1), sumY / Math.max(1, n - 1)];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

/**
 * Largest-polygon centroid. Multi-polygons use the part with the greatest
 * ring area. Returns null when the geometry has no ring.
 */
export function computeGeometryCentroid(
  geom: Polygon | MultiPolygon | null | undefined
): [number, number] | null {
  if (!geom) return null;

  if (geom.type === "Polygon") {
    if (geom.coordinates && geom.coordinates[0]) {
      return computeRingCentroid(geom.coordinates[0]);
    }
    return null;
  }

  let maxArea = -1;
  let bestRing: Position[] | null = null;
  for (const poly of geom.coordinates) {
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;
    const area = Math.abs(computeRingArea(ring));
    if (area > maxArea) {
      maxArea = area;
      bestRing = ring;
    }
  }
  return bestRing ? computeRingCentroid(bestRing) : null;
}

/**
 * Largest-polygon centroid of a feature. An ADM0 left on its own code uses
 * this as the main landmass. Falls back to bboxStr when the geometry is empty.
 */
function largestPartCentroid(
  feature: AdminFeature | Feature<Polygon | MultiPolygon>
): [number, number] {
  const center = computeGeometryCentroid(feature.geometry);
  if (center) return center;

  const bboxStr = (feature.properties as { bboxStr?: string } | null)?.bboxStr;
  if (bboxStr) {
    try {
      const [minX, minY, maxX, maxY] = JSON.parse(bboxStr);
      return [(minX + maxX) / 2, (minY + maxY) / 2];
    } catch {
      // ignore
    }
  }

  return [0, 0];
}

const anchorMissWarned = new Set<string>();

function warnAnchorMiss(shapeGroup: string, name: string): void {
  if (anchorMissWarned.has(shapeGroup)) return;
  anchorMissWarned.add(shapeGroup);
  console.warn(
    `[label-anchors] No ADM1 named "${name}" in ${shapeGroup}. Using the baked center.`
  );
}

/**
 * ADM0 entries in LABEL_ANCHORS. Self returns null so the caller uses the
 * largest landmass. An ADM1 name uses the loaded geometry when present, and
 * the baked center until that adm1.fgb arrives.
 */
function resolveAdm0Anchor(shapeGroup: string): [number, number] | null {
  const spec = getLabelAnchorSpec(shapeGroup);
  if (!spec || spec.kind === "self") return null;

  if (spec.kind === "coord") {
    if (
      Number.isFinite(spec.lng) &&
      Number.isFinite(spec.lat) &&
      spec.lng >= -180 &&
      spec.lng <= 180 &&
      spec.lat >= -90 &&
      spec.lat <= 90
    ) {
      return [spec.lng, spec.lat];
    }
    return null;
  }

  const cached = getCachedCountrySubdivisions(shapeGroup, "ADM1");
  if (cached && cached.length > 0) {
    const feat = matchFeature(spec.name, cached);
    if (feat) {
      const center = largestPartCentroid(feat);
      if (center[0] !== 0 || center[1] !== 0) return center;
    } else {
      warnAnchorMiss(shapeGroup, spec.name);
    }
  }

  return getLabelAnchorBakedCenter(shapeGroup);
}

/**
 * True when a loaded ADM1 centroid disagrees with its baked first-frame
 * center, so label positions need to be built again.
 */
export function labelAnchorCentersDrifted(): boolean {
  let drifted = false;
  for (const group of listLabelAnchorAdm1Groups()) {
    const spec = getLabelAnchorSpec(group);
    if (!spec || spec.kind !== "adm1") continue;
    const cached = getCachedCountrySubdivisions(group, "ADM1");
    if (!cached || cached.length === 0) continue;
    const feat = matchFeature(spec.name, cached);
    if (!feat) {
      warnAnchorMiss(group, spec.name);
      continue;
    }
    const live = largestPartCentroid(feat);
    const baked = getLabelAnchorBakedCenter(group);
    if (
      !baked ||
      Math.abs(live[0] - baked[0]) > 1e-4 ||
      Math.abs(live[1] - baked[1]) > 1e-4
    ) {
      drifted = true;
    }
  }
  return drifted;
}

/**
 * Center anchor for an administrative feature.
 * Multi-polygons use the largest polygon part.
 * An ADM0 with an ADM1 or coordinate entry in LABEL_ANCHORS uses that point.
 */
export function computeFeatureCentroid(
  feature: AdminFeature | Feature<Polygon | MultiPolygon>
): [number, number] {
  const shapeGroup = (feature.properties as { shapeGroup?: string } | null)
    ?.shapeGroup;
  const shapeType = (feature.properties as { shapeType?: string } | null)
    ?.shapeType;

  if (shapeType === "ADM0" && shapeGroup) {
    const anchored = resolveAdm0Anchor(shapeGroup);
    if (anchored) return anchored;
  }

  return largestPartCentroid(feature);
}

// In-memory cache for rendered label ImageData to eliminate duplicate canvas draws
const labelImageCache = new Map<string, LabelImageData>();

export function isLabelImageCached(id: string): boolean {
  return labelImageCache.has(id);
}

export function getCachedLabelImage(id: string): LabelImageData | undefined {
  return labelImageCache.get(id);
}

/**
 * MapLibre bakes a symbol's pixel size when the bucket is first laid out, and
 * `map.updateImage` only accepts a replacement of that exact size. Image labels
 * therefore rasterize into a fixed slot so a finished download can replace the
 * placeholder texture on the next frame, without `setData` or a symbol relayout.
 */
export const LABEL_PIXEL_RATIO = 2;
const IMAGE_SLOT_ASPECT = 1.5;
const IMAGE_SLOT_PAD_CSS = 2;

const labelImageInflight = new Map<string, Promise<LabelImageData>>();
const labelBitmapInflight = new Map<string, Promise<ImageBitmap>>();

export function getImageLabelPixelSize(iconSize?: number): {
  width: number;
  height: number;
} {
  const cssH = iconSize || 20;
  const cssW = Math.round(cssH * IMAGE_SLOT_ASPECT);
  return {
    width: Math.round((cssW + IMAGE_SLOT_PAD_CSS * 2) * LABEL_PIXEL_RATIO),
    height: Math.round((cssH + IMAGE_SLOT_PAD_CSS * 2) * LABEL_PIXEL_RATIO),
  };
}

function imageSlotInnerPx(iconSize?: number): {
  pad: number;
  innerW: number;
  innerH: number;
  width: number;
  height: number;
} {
  const { width, height } = getImageLabelPixelSize(iconSize);
  const pad = IMAGE_SLOT_PAD_CSS * LABEL_PIXEL_RATIO;
  return {
    pad,
    innerW: width - pad * 2,
    innerH: height - pad * 2,
    width,
    height,
  };
}

/**
 * One in-flight decode per URL. `createImageBitmap` decodes off the main thread.
 */
export function loadLabelBitmap(url: string): Promise<ImageBitmap> {
  const existing = labelBitmapInflight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const blob = await response.blob();
    return createImageBitmap(blob);
  })();

  promise.catch(() => {
    if (labelBitmapInflight.get(url) === promise) {
      labelBitmapInflight.delete(url);
    }
  });
  labelBitmapInflight.set(url, promise);
  return promise;
}

/**
 * Renders a crisp Retina-scaled text badge (pill) to ImageData for MapLibre sprite.
 */
export function renderTextLabel(config: RegionLabelConfig): LabelImageData {
  if (typeof document === "undefined") {
    return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  }

  const pixelRatio = 2; // Crisp High-DPI display
  const text = config.text || config.targetId || "";

  const fontSize = 11;
  const paddingX = 6;
  const heightCss = 19;
  const radius = 4;

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) {
    return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  }

  measureCtx.font = `bold ${fontSize * pixelRatio}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
  const metrics = measureCtx.measureText(text);
  const textWidth = metrics.width / pixelRatio;

  const widthCss = Math.max(30, Math.round(textWidth + paddingX * 2));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(widthCss * pixelRatio);
  canvas.height = Math.round(heightCss * pixelRatio);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  }

  ctx.save();
  ctx.scale(pixelRatio, pixelRatio);

  const w = widthCss;
  const h = heightCss;
  const r = radius;

  // Draw rounded pill path
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.arcTo(w, 0, w, r, r);
  ctx.lineTo(w, h - r);
  ctx.arcTo(w, h, w - r, h, r);
  ctx.lineTo(r, h);
  ctx.arcTo(0, h, 0, h - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();

  // Background
  ctx.fillStyle = config.bgColor || "rgba(11, 25, 44, 0.90)";
  ctx.fill();

  // Border outline
  ctx.strokeStyle = config.borderColor || "rgba(56, 189, 248, 0.75)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Bold Text with subtle contrast shadow
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = config.textColor || "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  ctx.fillText(text, w / 2, h / 2 + 0.5);

  ctx.restore();

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    data: imgData.data,
  };
}

/**
 * Helper to draw crisp rounded rectangle on Canvas.
 */
function drawRoundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function readCanvasSprite(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): LabelImageData {
  const imgData = ctx.getImageData(0, 0, width, height);
  return {
    width,
    height,
    data: imgData.data,
  };
}

function createSpriteCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

function drawContainedBitmap(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const scale = Math.min(dw / bitmap.width, dh / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const x = dx + Math.round((dw - w) / 2);
  const y = dy + Math.round((dh - h) / 2);

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.drawImage(bitmap, x, y, w, h);
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
}

/**
 * Synchronous stand-in painted at the exact pixel size of the finished flag.
 */
export function renderImagePlaceholder(config: RegionLabelConfig): LabelImageData {
  const { width, height, pad, innerW, innerH } = imageSlotInnerPx(config.iconSize);
  const surface = createSpriteCanvas(width, height);
  if (!surface) {
    return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  }
  const { ctx } = surface;
  const radius = 4;
  drawRoundRectPath(ctx, pad, pad, innerW, innerH, radius);
  ctx.fillStyle = config.bgColor || "rgba(11, 25, 44, 0.88)";
  ctx.fill();
  ctx.strokeStyle = config.borderColor || "rgba(56, 189, 248, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const short = (config.shapeGroup || config.text || config.targetId || "")
    .replace(/\s+/g, "")
    .slice(0, 4);
  ctx.font = `bold ${Math.max(10, Math.round(innerH * 0.38))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = config.textColor || "#ffffff";
  ctx.fillText(short, pad + innerW / 2, pad + innerH / 2 + 0.5);

  return readCanvasSprite(ctx, width, height);
}

/**
 * Renders an image icon into the fixed flag slot.
 * The graphic keeps its aspect ratio inside the slot (letterboxed).
 */
export async function renderImageLabel(
  config: RegionLabelConfig
): Promise<LabelImageData> {
  const { width, height, pad, innerW, innerH } = imageSlotInnerPx(config.iconSize);
  if (!config.imageUrl || typeof document === "undefined") {
    return renderImagePlaceholder(config);
  }

  const bitmap = await loadLabelBitmap(config.imageUrl);
  const surface = createSpriteCanvas(width, height);
  if (!surface) {
    return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  }
  drawContainedBitmap(surface.ctx, bitmap, pad, pad, innerW, innerH);
  return readCanvasSprite(surface.ctx, width, height);
}

interface BadgeLayout {
  width: number;
  height: number;
  widthCss: number;
  heightCss: number;
  paddingX: number;
  iconSize: number;
  fontSize: number;
  iconSectionW: number;
}

/**
 * Badge pixel size is fixed from the text and the reserved icon slot, before
 * the image arrives, so the placeholder and the finished badge match.
 */
function measureBadgeLayout(config: RegionLabelConfig): BadgeLayout | null {
  if (typeof document === "undefined") return null;
  const text = config.text || "";
  const iconSize = config.iconSize || 14;
  const fontSize = 11;
  const paddingX = 6;
  const heightCss = 20;

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  if (!measureCtx) return null;

  measureCtx.font = `bold ${fontSize * LABEL_PIXEL_RATIO}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
  const textWidth = measureCtx.measureText(text).width / LABEL_PIXEL_RATIO;
  const iconSectionW = config.imageUrl ? iconSize + 4 : 0;
  const widthCss = Math.max(
    34,
    Math.round(iconSectionW + textWidth + paddingX * 2)
  );

  return {
    width: Math.round(widthCss * LABEL_PIXEL_RATIO),
    height: Math.round(heightCss * LABEL_PIXEL_RATIO),
    widthCss,
    heightCss,
    paddingX,
    iconSize,
    fontSize,
    iconSectionW,
  };
}

function paintBadge(
  config: RegionLabelConfig,
  bitmap: ImageBitmap | null
): LabelImageData {
  const layout = measureBadgeLayout(config);
  if (!layout) {
    return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  }
  const surface = createSpriteCanvas(layout.width, layout.height);
  if (!surface) {
    return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  }

  const { ctx } = surface;
  const text = config.text || "";
  const { widthCss: w, heightCss: h, paddingX, iconSize, fontSize, iconSectionW } =
    layout;
  const radius = 4;

  ctx.save();
  ctx.scale(LABEL_PIXEL_RATIO, LABEL_PIXEL_RATIO);

  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(w - radius, 0);
  ctx.arcTo(w, 0, w, radius, radius);
  ctx.lineTo(w, h - radius);
  ctx.arcTo(w, h, w - radius, h, radius);
  ctx.lineTo(radius, h);
  ctx.arcTo(0, h, 0, h - radius, radius);
  ctx.lineTo(0, radius);
  ctx.arcTo(0, 0, radius, 0, radius);
  ctx.closePath();

  ctx.fillStyle = config.bgColor || "rgba(11, 25, 44, 0.90)";
  ctx.fill();
  ctx.strokeStyle = config.borderColor || "rgba(56, 189, 248, 0.75)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  let curX = paddingX;
  if (iconSectionW > 0) {
    if (bitmap) {
      ctx.drawImage(bitmap, curX, (h - iconSize) / 2, iconSize, iconSize);
    }
    curX += iconSize + 4;
  }

  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = config.textColor || "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 3;
  ctx.fillText(text, curX, h / 2 + 0.5);
  ctx.restore();

  return readCanvasSprite(ctx, layout.width, layout.height);
}

export function renderBadgePlaceholder(config: RegionLabelConfig): LabelImageData {
  return paintBadge(config, null);
}

/**
 * Renders a composite badge (icon on left + text on right) to ImageData.
 * Canvas size does not depend on whether the icon has loaded.
 */
export async function renderBadgeLabel(
  config: RegionLabelConfig
): Promise<LabelImageData> {
  if (!config.imageUrl) return renderBadgePlaceholder(config);
  const bitmap = await loadLabelBitmap(config.imageUrl);
  return paintBadge(config, bitmap);
}

/** Sprite to register before an image or badge download finishes. */
export function renderPendingLabelSprite(config: RegionLabelConfig): LabelImageData {
  if (config.type === "image") return renderImagePlaceholder(config);
  if (config.type === "badge") return renderBadgePlaceholder(config);
  return renderTextLabel(config);
}

async function rasterizeLabel(config: RegionLabelConfig): Promise<LabelImageData> {
  if (config.type === "image" && config.imageUrl) return renderImageLabel(config);
  if (config.type === "badge" && config.imageUrl) return renderBadgeLabel(config);
  return renderTextLabel(config);
}

/**
 * Retrieves cached label ImageData or generates and caches a new one.
 * Failed downloads are not cached, so a later attempt can still succeed.
 * Callers share one in-flight promise per label id.
 */
export function getOrCreateLabelImage(
  config: RegionLabelConfig
): Promise<LabelImageData> {
  const cached = labelImageCache.get(config.id);
  if (cached) return Promise.resolve(cached);

  const inflight = labelImageInflight.get(config.id);
  if (inflight) return inflight;

  const promise = rasterizeLabel(config)
    .then((result) => {
      labelImageCache.set(config.id, result);
      return result;
    })
    .finally(() => {
      if (labelImageInflight.get(config.id) === promise) {
        labelImageInflight.delete(config.id);
      }
    });

  labelImageInflight.set(config.id, promise);
  return promise;
}

/**
 * Known disputed / non-sovereign territories in the geoBoundaries CGAZ dataset.
 * Some have official ISO 3166-1 alpha-3 codes (e.g. Falkland Islands: FLK, Palestine: PSE).
 * Non-ISO3 disputed areas (e.g. 111 Abyei, 127 Senkakus) have numeric IDs in the raw data
 * and must not be displayed as raw numbers in an ISO3 country label layer.
 */
export const DISPUTED_ADM0_MAP: Record<
  string,
  { iso3?: string; shortName: string }
> = {
  "111": { shortName: "Abyei" },
  "112": { shortName: "Aksai Chin" },
  "113": { shortName: "CH-IN" },
  "114": { shortName: "Demchok" },
  "115": { shortName: "Dragonja" },
  "116": { shortName: "Dramana" },
  "117": { iso3: "FLK", shortName: "Falklands" }, // Falkland Islands (UK)
  "118": { iso3: "PSE", shortName: "Gaza" }, // Gaza Strip
  "119": { shortName: "Kalapani" },
  "120": { shortName: "Isla Brasilera" },
  "121": { shortName: "Siachen" },
  "122": { shortName: "Koualou" },
  "123": { shortName: "Liancourt" },
  "124": { shortName: "No Man's Land" },
  "125": { shortName: "Paracel Is." },
  "126": { shortName: "Tiran Is." },
  "127": { shortName: "Senkakus" },
  "128": { shortName: "Spratly Is." },
  "129": { iso3: "PSE", shortName: "West Bank" },
};

/**
 * Computes bounding box [minLng, minLat, maxLng, maxLat] from feature geometry or metadata.
 */
export function computeFeatureBbox(
  feature: AdminFeature
): [number, number, number, number] {
  if (feature.bbox && feature.bbox.length === 4) {
    return feature.bbox as [number, number, number, number];
  }
  const geom = feature.geometry;
  if (!geom) return [-180, -90, 180, 90];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const update = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) {
      for (const pt of ring) update(pt[0], pt[1]);
    }
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      for (const ring of poly) {
        for (const pt of ring) update(pt[0], pt[1]);
      }
    }
  }

  if (!Number.isFinite(minX)) return [-180, -90, 180, 90];
  return [minX, minY, maxX, maxY];
}

/**
 * Computes an estimated geographic area score for a country/subdivision
 * based on its bounding box and latitude curvature.
 */
export function estimateAreaScore(
  bbox: [number, number, number, number]
): number {
  const dLng = Math.min(180, Math.max(0.001, bbox[2] - bbox[0]));
  const dLat = Math.max(0.001, bbox[3] - bbox[1]);
  const midLat = ((bbox[1] + bbox[3]) / 2) * (Math.PI / 180);
  return dLng * dLat * Math.max(0.1, Math.cos(midLat));
}

/**
 * Computes numeric placement priority for symbol collision detection.
 * Smaller number = placed first (higher priority).
 */
export function computeLabelSortKey(
  level: AdmLevel,
  isCsvLabel: boolean,
  bbox?: [number, number, number, number],
  explicitArea?: number
): number {
  let base = 0;
  if (level === "ADM0") {
    base = isCsvLabel ? 100 : 5000;
  } else if (level === "ADM1") {
    base = isCsvLabel ? 10000 : 20000;
  } else {
    base = isCsvLabel ? 50000 : 100000;
  }

  let area = explicitArea ?? 0;
  if (!area && bbox) {
    area = estimateAreaScore(bbox);
  }

  const logArea = Math.log10(Math.max(0.00005, area));
  const penalty = Math.round(Math.max(0, Math.min(1500, (4 - logArea) * 150)));

  return base + penalty;
}

/**
 * Default label resolver for any administrative feature (ADM0, ADM1, ADM2).
 * - ADM0: Outputs country ISO3 code (shapeGroup, e.g. "USA", "TWN", "JPN")
 * - ADM1: Outputs subdivision name (e.g. "California", "Hokkaido", "Taipei City")
 * - ADM2: Outputs district/city name
 */
export function defaultLabelResolver(
  feature: AdminFeature,
  level: AdmLevel
): RegionLabelConfig | null {
  const props = feature.properties;
  const shapeType = props.shapeType || level;
  const shapeGroup = props.shapeGroup || props.shapeID;
  const center = computeFeatureCentroid(feature);

  if (center[0] === 0 && center[1] === 0) return null;

  if (shapeType === "ADM0") {
    const isNumeric = /^\d+$/.test(shapeGroup);
    let labelText = shapeGroup.toUpperCase();

    if (isNumeric) {
      const disputed = DISPUTED_ADM0_MAP[shapeGroup];
      if (disputed?.iso3) {
        labelText = disputed.iso3;
      } else {
        // Disputed territory without an official ISO3 code (e.g. Abyei 111, Senkakus 127, Koualou 122).
        // Suppress raw numeric database IDs from appearing on the ISO3 country label layer!
        return null;
      }
    }

    const bbox =
      COUNTRY_PRIMARY_FIT_BBOX[labelText] || computeFeatureBbox(feature);
    const sortKey = computeLabelSortKey("ADM0", false, bbox);

    return {
      id: `label-ADM0-${labelText}`,
      targetId: props.shapeID || labelText,
      level: "ADM0",
      center,
      type: "text",
      text: labelText,
      shapeGroup: labelText,
      shapeName: props.shapeName,
      sortKey,
    };
  } else if (shapeType === "ADM1") {
    const id = `label-ADM1-${shapeGroup}-${props.shapeID}`;
    const bbox = computeFeatureBbox(feature);
    const sortKey = computeLabelSortKey("ADM1", false, bbox);

    return {
      id,
      targetId: props.shapeID,
      level: "ADM1",
      center,
      type: "text",
      text: props.shapeName || props.shapeID,
      shapeGroup,
      shapeName: props.shapeName,
      sortKey,
    };
  } else if (shapeType === "ADM2") {
    const id = `label-ADM2-${shapeGroup}-${props.shapeID}`;
    const bbox = computeFeatureBbox(feature);
    const sortKey = computeLabelSortKey("ADM2", false, bbox);

    return {
      id,
      targetId: props.shapeID,
      level: "ADM2",
      center,
      type: "text",
      text: props.shapeName || props.shapeID,
      shapeGroup,
      shapeName: props.shapeName,
      sortKey,
    };
  }

  return null;
}

/**
 * Projects a collection of RegionLabelConfig points into the active map projection space.
 */
export function buildProjectedLabelFC(
  labels: RegionLabelConfig[],
  mode: MapMode,
  flatProjection: FlatProjectionId
): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];

  for (const label of labels) {
    const proj = projectLngLat(
      label.center[0],
      label.center[1],
      mode,
      flatProjection
    );
    if (!Number.isFinite(proj[0]) || !Number.isFinite(proj[1])) continue;

    features.push({
      type: "Feature",
      id: label.id,
      geometry: {
        type: "Point",
        coordinates: proj,
      },
      properties: {
        iconId: label.id,
        targetId: label.targetId,
        level: label.level,
        text: label.text || "",
        shapeGroup: label.shapeGroup || "",
        shapeName: label.shapeName || "",
        sortKey: typeof label.sortKey === "number" ? label.sortKey : 500,
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
