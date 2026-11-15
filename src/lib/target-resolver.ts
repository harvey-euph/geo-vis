import type { AdminFeature, AdmLevel, CountryMeta } from "./fgb-loader";
import { getCountryFitBbox, getFeatureFitBbox, parseBbox } from "./fgb-loader";
import {
  type CountrySubdivisionHierarchy,
  loadCountryHierarchy,
} from "./hierarchy-manager";

export interface DrilldownTarget {
  shapeGroup: string;
  adm1Id: string | null;
  adm2Id: string | null;
}

export interface ResolvedTarget {
  rawQuery: string;
  shapeGroup: string;
  shapeID: string;
  shapeName: string;
  shapeType: AdmLevel;
  bbox: [number, number, number, number];
  targetId: string;
  drilldown: DrilldownTarget | null;
}

export const TARGET_ALIASES: Record<string, string> = {
  HKG: "CHN::Hong Kong Special Administrative Region",
  HK: "CHN::Hong Kong Special Administrative Region",
  MAC: "CHN::Macau Special Administrative Region",
  MO: "CHN::Macau Special Administrative Region",
  PRI: "USA::Puerto Rico",
  PR: "USA::Puerto Rico",
  FLK: "117",
  FK: "117",
  PSE: "118",
  PS: "118",
  ATF: "FRA",
  TF: "FRA",
  NCL: "FRA",
  NC: "FRA",
};

export function normalizeKey(str: string): string {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Format a name or ID for URL target parameters by converting all spaces to underscores '_'.
 * Prevents '%20' from appearing in URLs.
 * e.g. "Hsinchu County" -> "Hsinchu_County"
 */
export function formatTargetSegment(nameOrId: string): string {
  return (nameOrId || "").trim().replace(/\s+/g, "_");
}

/**
 * Parse a target query segment from URL by converting underscores '_' to spaces ' '.
 * e.g. "Hsinchu_County" -> "Hsinchu County"
 */
export function parseTargetSegment(query: string): string {
  return (query || "").trim().replace(/_+/g, " ");
}

/**
 * Match a country from metadata.json by shapeGroup, shapeID, shapeName, or slug.
 * Supports underscores '_' representing spaces ' ' (e.g. "United_States" -> "United States").
 */
export function matchCountry(
  query: string,
  countries: CountryMeta[]
): CountryMeta | null {
  if (!query || countries.length === 0) return null;
  const qTrim = query.trim();
  const qLower = qTrim.toLowerCase();
  const qSpaces = qTrim.replace(/_+/g, " ").toLowerCase();
  const qNorm = normalizeKey(query);

  // 1. Exact shapeGroup match (e.g. "TWN", "USA", "JPN")
  let match = countries.find(
    (c) => c.shapeGroup.toLowerCase() === qLower
  );
  if (match) return match;

  // 2. Exact shapeID match (e.g. "ADM0_TWN")
  match = countries.find((c) => c.shapeID.toLowerCase() === qLower);
  if (match) return match;

  // 3. Exact shapeName match with underscores converted to spaces (e.g. "United_States" -> "United States")
  match = countries.find((c) => c.shapeName.toLowerCase() === qSpaces);
  if (match) return match;

  // 4. Exact shapeName match (e.g. "Taiwan", "United States")
  match = countries.find((c) => c.shapeName.toLowerCase() === qLower);
  if (match) return match;

  // 5. Normalized shapeName or shapeGroup match
  match = countries.find(
    (c) =>
      normalizeKey(c.shapeName) === qNorm ||
      normalizeKey(c.shapeGroup) === qNorm
  );
  if (match) return match;

  // 6. Prefix or substring match on shapeName
  match = countries.find(
    (c) =>
      normalizeKey(c.shapeName).startsWith(qNorm) ||
      normalizeKey(c.shapeName).includes(qNorm)
  );
  return match || null;
}

/**
 * Match an ADM1 or ADM2 feature by shapeID, shapeName, or slug.
 * Supports underscores '_' representing spaces ' ' (e.g. "Hsinchu_County" -> "Hsinchu County").
 */
export function matchFeature(
  query: string,
  features: AdminFeature[]
): AdminFeature | null {
  if (!query || features.length === 0) return null;
  const qTrim = query.trim();
  const qLower = qTrim.toLowerCase();
  const qSpaces = qTrim.replace(/_+/g, " ").toLowerCase();
  const qNorm = normalizeKey(query);

  // 1. Exact shapeID match
  let match = features.find((f) => f.properties.shapeID === qTrim);
  if (match) return match;

  // 2. Case-insensitive shapeID match
  match = features.find(
    (f) => f.properties.shapeID.toLowerCase() === qLower
  );
  if (match) return match;

  // 3. Exact shapeName match with underscores converted to spaces (e.g. "Hsinchu_County" -> "Hsinchu County")
  match = features.find(
    (f) => f.properties.shapeName.toLowerCase() === qSpaces
  );
  if (match) return match;

  // 4. Exact shapeName match (case-insensitive)
  match = features.find(
    (f) => f.properties.shapeName.toLowerCase() === qLower
  );
  if (match) return match;

  // 5. Normalized shapeName match (ignores spaces, hyphens, underscores)
  match = features.find(
    (f) => normalizeKey(f.properties.shapeName) === qNorm
  );
  if (match) return match;

  // 6. Prefix or substring match on shapeName
  match = features.find(
    (f) =>
      normalizeKey(f.properties.shapeName).startsWith(qNorm) ||
      normalizeKey(f.properties.shapeName).includes(qNorm)
  );
  return match || null;
}

/**
 * Resolve a single target specification formatted as:
 * ADM0[::ADM1][::ADM2]
 *
 * Examples:
 * - "TWN" -> ADM0 Taiwan
 * - "TWN::Hsinchu County" -> ADM1 Hsinchu County
 * - "TWN::Hsinchu County::Zhubei City" -> ADM2 Zhubei City
 * - "TWN::Zhubei City" -> ADM2 Zhubei City (auto-resolves parent ADM1)
 * - "USA::California" -> ADM1 California
 */
export async function resolveSingleTarget(
  spec: string,
  countries: CountryMeta[]
): Promise<ResolvedTarget | null> {
  if (!spec || !spec.trim()) return null;

  // Check full spec alias first (e.g. "HKG" -> "CHN::Hong Kong Special Administrative Region")
  const upperSpec = spec.trim().toUpperCase();
  const effectiveSpec = TARGET_ALIASES[upperSpec] || spec.trim();

  // Split by "::"
  const rawParts = effectiveSpec.split("::").map((p) => p.trim());
  const parts: string[] = [];
  for (const p of rawParts) {
    if (p) parts.push(p);
  }
  if (parts.length === 0) return null;

  // Part 0: ADM0 Country
  const country = matchCountry(parts[0], countries);
  if (!country) {
    console.warn(
      `[TargetResolver] No country matched for query: "${parts[0]}"`
    );
    return null;
  }

  // Case 1: ADM0 only (e.g. "TWN" or "Taiwan")
  if (parts.length === 1) {
    return {
      rawQuery: spec,
      shapeGroup: country.shapeGroup,
      shapeID: country.shapeID,
      shapeName: country.shapeName,
      shapeType: "ADM0",
      bbox: getCountryFitBbox(country),
      targetId: country.shapeID,
      drilldown: {
        shapeGroup: country.shapeGroup,
        adm1Id: null,
        adm2Id: null,
      },
    };
  }

  // Load subdivisions hierarchy for country
  let hierarchy: CountrySubdivisionHierarchy;
  try {
    hierarchy = await loadCountryHierarchy(country.shapeGroup);
  } catch (err) {
    console.warn(
      `[TargetResolver] Failed to load subdivisions for ${country.shapeGroup}:`,
      err
    );
    return {
      rawQuery: spec,
      shapeGroup: country.shapeGroup,
      shapeID: country.shapeID,
      shapeName: country.shapeName,
      shapeType: "ADM0",
      bbox: getCountryFitBbox(country),
      targetId: country.shapeID,
      drilldown: {
        shapeGroup: country.shapeGroup,
        adm1Id: null,
        adm2Id: null,
      },
    };
  }

  // Case 2: parts.length === 2 (e.g. "TWN::Hsinchu County" or "TWN::Zhubei City")
  if (parts.length === 2) {
    const subQuery = parts[1];

    // Check ADM1 first
    const adm1Match = matchFeature(subQuery, hierarchy.adm1Features);
    if (adm1Match) {
      const bbox = getFeatureFitBbox(adm1Match, getCountryFitBbox(country));
      return {
        rawQuery: spec,
        shapeGroup: country.shapeGroup,
        shapeID: adm1Match.properties.shapeID,
        shapeName: adm1Match.properties.shapeName,
        shapeType: "ADM1",
        bbox,
        targetId: adm1Match.properties.shapeID,
        drilldown: {
          shapeGroup: country.shapeGroup,
          adm1Id: adm1Match.properties.shapeID,
          adm2Id: null,
        },
      };
    }

    // Check ADM2 (e.g. user jumped straight to ADM2)
    const adm2Match = matchFeature(subQuery, hierarchy.adm2Features);
    if (adm2Match) {
      const parentAdm1 =
        hierarchy.adm2ToAdm1.get(adm2Match.properties.shapeID) || null;
      const bbox = getFeatureFitBbox(adm2Match, getCountryFitBbox(country));
      return {
        rawQuery: spec,
        shapeGroup: country.shapeGroup,
        shapeID: adm2Match.properties.shapeID,
        shapeName: adm2Match.properties.shapeName,
        shapeType: "ADM2",
        bbox,
        targetId: adm2Match.properties.shapeID,
        drilldown: {
          shapeGroup: country.shapeGroup,
          adm1Id: parentAdm1,
          adm2Id: adm2Match.properties.shapeID,
        },
      };
    }

    console.warn(
      `[TargetResolver] Subregion "${subQuery}" not found in country ${country.shapeGroup}`
    );
    return {
      rawQuery: spec,
      shapeGroup: country.shapeGroup,
      shapeID: country.shapeID,
      shapeName: country.shapeName,
      shapeType: "ADM0",
      bbox: getCountryFitBbox(country),
      targetId: country.shapeID,
      drilldown: {
        shapeGroup: country.shapeGroup,
        adm1Id: null,
        adm2Id: null,
      },
    };
  }

  // Case 3: parts.length >= 3 (e.g. "TWN::Hsinchu County::Zhubei City")
  const adm1Query = parts[1];
  const adm2Query = parts[2];

  const adm1Match = matchFeature(adm1Query, hierarchy.adm1Features);

  let adm2Match: AdminFeature | null = null;
  if (adm1Match) {
    const children =
      hierarchy.adm1ToAdm2.get(adm1Match.properties.shapeID) || [];
    adm2Match = matchFeature(adm2Query, children);
  }
  if (!adm2Match) {
    adm2Match = matchFeature(adm2Query, hierarchy.adm2Features);
  }

  if (adm2Match) {
    const parentAdm1 =
      hierarchy.adm2ToAdm1.get(adm2Match.properties.shapeID) ||
      (adm1Match ? adm1Match.properties.shapeID : null);
    const bbox = getFeatureFitBbox(adm2Match, getCountryFitBbox(country));
    return {
      rawQuery: spec,
      shapeGroup: country.shapeGroup,
      shapeID: adm2Match.properties.shapeID,
      shapeName: adm2Match.properties.shapeName,
      shapeType: "ADM2",
      bbox,
      targetId: adm2Match.properties.shapeID,
      drilldown: {
        shapeGroup: country.shapeGroup,
        adm1Id: parentAdm1,
        adm2Id: adm2Match.properties.shapeID,
      },
    };
  }

  // If ADM2 not matched but ADM1 matched
  if (adm1Match) {
    const bbox = getFeatureFitBbox(adm1Match, getCountryFitBbox(country));
    return {
      rawQuery: spec,
      shapeGroup: country.shapeGroup,
      shapeID: adm1Match.properties.shapeID,
      shapeName: adm1Match.properties.shapeName,
      shapeType: "ADM1",
      bbox,
      targetId: adm1Match.properties.shapeID,
      drilldown: {
        shapeGroup: country.shapeGroup,
        adm1Id: adm1Match.properties.shapeID,
        adm2Id: null,
      },
    };
  }

  // Fallback to ADM0
  return {
    rawQuery: spec,
    shapeGroup: country.shapeGroup,
    shapeID: country.shapeID,
    shapeName: country.shapeName,
    shapeType: "ADM0",
    bbox: getCountryFitBbox(country),
    targetId: country.shapeID,
    drilldown: {
      shapeGroup: country.shapeGroup,
      adm1Id: null,
      adm2Id: null,
    },
  };
}

/**
 * Resolve a single target specification from URL parameter:
 * e.g. "TWN", "TWN::Hsinchu_County", or "TWN::Hsinchu_County::Zhubei_City"
 */
export async function resolveUrlTarget(
  targetParam: string,
  countries: CountryMeta[]
): Promise<ResolvedTarget | null> {
  if (!targetParam || !targetParam.trim()) return null;
  const cleanSpec = targetParam.split(",")[0].trim();
  if (!cleanSpec) return null;
  return resolveSingleTarget(cleanSpec, countries);
}
