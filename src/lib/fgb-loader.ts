import { geojson as fgbGeojson } from "flatgeobuf";
import type { Feature, MultiPolygon, Polygon } from "geojson";

export type AdmLevel = "ADM0" | "ADM1" | "ADM2";

export interface AdminFeatureProperties {
  shapeID: string;
  shapeGroup: string;
  shapeName: string;
  shapeType: AdmLevel;
  adm0Name: string;
  bboxStr?: string;
}

export type AdminFeature = Feature<Polygon | MultiPolygon, AdminFeatureProperties>;

export interface CountryMeta {
  shapeGroup: string;
  shapeName: string;
  shapeID: string;
  bbox: [number, number, number, number];
  adm1Count: number;
  adm2Count: number;
}

export interface DatasetMetadata {
  generatedAt: string;
  counts: {
    ADM0: number;
    ADM1: number;
    ADM2: number;
  };
  countries: CountryMeta[];
}

let metadataCache: DatasetMetadata | null = null;
let adm0Cache: AdminFeature[] | null = null;
const adm1ByCountryCache = new Map<string, AdminFeature[]>();
const adm2ByCountryCache = new Map<string, AdminFeature[]>();
const inFlightRequests = new Map<string, Promise<AdminFeature[]>>();

async function deserializeFgbUrl(url: string): Promise<AdminFeature[]> {
  const versionTag = metadataCache?.generatedAt
    ? `?v=${encodeURIComponent(metadataCache.generatedAt)}`
    : "";
  const response = await fetch(`${url}${versionTag}`, { cache: "no-cache" });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  const features: AdminFeature[] = [];
  const iter = fgbGeojson.deserialize(buffer) as AsyncIterable<AdminFeature>;
  for await (const feat of iter) {
    if (feat && feat.geometry) {
      features.push(feat);
    }
  }
  return features;
}

export async function loadMetadata(): Promise<DatasetMetadata> {
  if (metadataCache) return metadataCache;
  const res = await fetch("/data/metadata.json", { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Failed to load metadata.json: ${res.status}`);
  }
  metadataCache = (await res.json()) as DatasetMetadata;
  return metadataCache;
}

export async function loadAdm0Features(): Promise<AdminFeature[]> {
  if (adm0Cache) return adm0Cache;
  const key = "adm0_all";
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key)!;
  }
  const promise = deserializeFgbUrl("/data/adm0.fgb").then((feats) => {
    adm0Cache = feats;
    inFlightRequests.delete(key);
    return feats;
  });
  inFlightRequests.set(key, promise);
  return promise;
}

export async function loadCountrySubdivisions(
  shapeGroup: string,
  level: "ADM1" | "ADM2"
): Promise<AdminFeature[]> {
  const cache = level === "ADM1" ? adm1ByCountryCache : adm2ByCountryCache;
  if (cache.has(shapeGroup)) {
    return cache.get(shapeGroup)!;
  }

  const key = `${level}_${shapeGroup}`;
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key)!;
  }

  const fileName = level === "ADM1" ? "adm1.fgb" : "adm2.fgb";
  const url = `/data/by-country/${encodeURIComponent(shapeGroup)}/${fileName}`;

  const promise = deserializeFgbUrl(url)
    .then((feats) => {
      cache.set(shapeGroup, feats);
      inFlightRequests.delete(key);
      return feats;
    })
    .catch((err) => {
      console.warn(`Could not load ${url}:`, err);
      inFlightRequests.delete(key);
      cache.set(shapeGroup, []);
      return [];
    });

  inFlightRequests.set(key, promise);
  return promise;
}

export async function loadMultipleCountrySubdivisions(
  shapeGroups: string[],
  level: "ADM1" | "ADM2"
): Promise<AdminFeature[]> {
  const uniqueGroups = Array.from(new Set(shapeGroups));
  const results = await Promise.all(
    uniqueGroups.map((sg) => loadCountrySubdivisions(sg, level))
  );
  return results.flat();
}

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

export function bboxesIntersect(
  a: [number, number, number, number],
  b: [number, number, number, number]
): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}
