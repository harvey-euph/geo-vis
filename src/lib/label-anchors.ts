/**
 * Where each ADM0 label sits.
 *
 * Edit the value. Three forms:
 * - `AFG` — this ADM0 has no placement issue. The label sits on the
 *   largest landmass polygon's centroid.
 * - `NOR::Innlandet` — sit on that ADM1's largest-polygon centroid.
 *   `NOR/Innlandet` is accepted too.
 * - `179.21,-8.52` — explicit WGS84 longitude, latitude.
 *   The same form is used for flag codes that are not ADM0 rows, such as `HKG`.
 *
 * A self entry is the country's own shapeGroup. The camera fit box in
 * bbox-helper is only for framing and is not a label anchor.
 *
 * ADM1 entries keep a baked center so the first frame is right before
 * that country's adm1.fgb loads. After it loads, the named ADM1 is
 * measured again, so changing the name moves the label. Update the
 * baked center when you change an ADM1 name if the first frame should
 * already match.
 */
export const LABEL_ANCHORS: Record<string, string> = {
  "111": "111",
  "112": "112",
  "113": "113",
  "114": "114",
  "115": "115",
  "116": "116",
  "117": "117",
  "118": "118",
  "119": "119",
  "120": "120",
  "121": "121",
  "122": "122",
  "123": "123",
  "124": "124",
  "125": "125",
  "126": "126",
  "127": "127",
  "128": "128",
  "129": "129",
  AFG: "AFG",
  AGO: "AGO",
  ALB: "ALB",
  AND: "AND",
  ARE: "ARE",
  ARG: "ARG",
  ARM: "ARM",
  ATA: "ATA",
  ATG: "ATG",
  AUS: "AUS",
  AUT: "AUT",
  AZE: "AZE",
  BDI: "BDI",
  BEL: "BEL",
  BEN: "BEN",
  BFA: "BFA",
  BGD: "BGD",
  BGR: "BGR",
  BHR: "BHR",
  BHS: "BHS",
  BIH: "BIH",
  BLR: "BLR",
  BLZ: "BLZ",
  BOL: "BOL",
  BRA: "BRA",
  BRB: "BRB",
  BRN: "BRN",
  BTN: "BTN",
  BWA: "BWA",
  CAF: "CAF",
  CAN: "CAN",
  CHE: "CHE",
  CHL: "CHL",
  CHN: "CHN",
  CIV: "CIV",
  CMR: "CMR",
  COD: "COD",
  COG: "COG",
  COL: "COL",
  COM: "COM",
  CPV: "CPV",
  CRI: "CRI",
  CUB: "CUB",
  CYP: "CYP",
  CZE: "CZE",
  DEU: "DEU",
  DJI: "DJI",
  DMA: "DMA",
  DNK: "DNK",
  DOM: "DOM",
  DZA: "DZA",
  ECU: "ECU",
  EGY: "EGY",
  ERI: "ERI",
  ESH: "ESH",
  ESP: "ESP",
  EST: "EST",
  ETH: "ETH",
  FIN: "FIN",
  FJI: "FJI",
  FRA: "FRA",
  FSM: "FSM",
  GAB: "GAB",
  GBR: "GBR",
  GEO: "GEO",
  GHA: "GHA",
  GIN: "GIN",
  GMB: "GMB",
  GNB: "GNB",
  GNQ: "GNQ",
  GRC: "GRC",
  GRD: "GRD",
  // Same ice-sheet point the Greenland flag already used.
  GRL: "-42.6043,71.7069",
  GTM: "GTM",
  GUY: "GUY",
  HND: "HND",
  // Largest-part centroid sits on the Bosnia border. This county is the interior of the main body.
  HRV: "HRV::Bjelovar-Bilogora",
  // Largest-part centroid is on the Gulf of Gonâve shore. Artibonite is the central interior.
  HTI: "HTI::Artibonite Department",
  HUN: "HUN",
  IDN: "IDN",
  IND: "IND",
  IRL: "IRL",
  IRN: "IRN",
  IRQ: "IRQ",
  ISL: "ISL",
  // Largest-part centroid falls outside the polygon. The Negev is the bulk of the land.
  ISR: "ISR::Southern District",
  ITA: "ITA",
  JAM: "JAM",
  JOR: "JOR",
  JPN: "JPN",
  KAZ: "KAZ",
  KEN: "KEN",
  KGZ: "KGZ",
  KHM: "KHM",
  KIR: "KIR",
  KNA: "KNA",
  KOR: "KOR",
  KWT: "KWT",
  LAO: "LAO",
  LBN: "LBN",
  LBR: "LBR",
  LBY: "LBY",
  LCA: "LCA",
  LIE: "LIE",
  LKA: "LKA",
  LSO: "LSO",
  LTU: "LTU",
  LUX: "LUX",
  LVA: "LVA",
  MAR: "MAR",
  MCO: "MCO",
  MDA: "MDA",
  MDG: "MDG",
  MDV: "MDV",
  MEX: "MEX",
  // Atoll centroid falls in the lagoon. Majuro's centroid is on land.
  MHL: "MHL::Majuro",
  MKD: "MKD",
  MLI: "MLI",
  MLT: "MLT",
  MMR: "MMR",
  MNE: "MNE",
  MNG: "MNG",
  MOZ: "MOZ",
  MRT: "MRT",
  MUS: "MUS",
  MWI: "MWI",
  MYS: "MYS",
  NAM: "NAM",
  NER: "NER",
  NGA: "NGA",
  NIC: "NIC",
  NLD: "NLD",
  // Mainland centroid is about 15 km from Sweden, so the icon reads as Sweden. Innlandet is the interior of the thick south.
  NOR: "NOR::Innlandet",
  NPL: "NPL",
  NRU: "NRU",
  NZL: "NZL",
  OMN: "OMN",
  PAK: "PAK",
  PAN: "PAN",
  PER: "PER",
  PHL: "PHL",
  PLW: "PLW",
  PNG: "PNG",
  POL: "POL",
  PRK: "PRK",
  PRT: "PRT",
  PRY: "PRY",
  QAT: "QAT",
  ROU: "ROU",
  RUS: "RUS",
  RWA: "RWA",
  SAU: "SAU",
  SDN: "SDN",
  SEN: "SEN",
  SGP: "SGP",
  SLB: "SLB",
  SLE: "SLE",
  SLV: "SLV",
  SMR: "SMR",
  // Largest-part centroid falls outside the polygon. Galgaduud is the central interior.
  SOM: "SOM::Galgaduud",
  SRB: "SRB",
  SSD: "SSD",
  STP: "STP",
  SUR: "SUR",
  SVK: "SVK",
  SVN: "SVN",
  SWE: "SWE",
  SWZ: "SWZ",
  SYC: "SYC",
  SYR: "SYR",
  TCD: "TCD",
  TGO: "TGO",
  THA: "THA",
  // Largest-part centroid is pinched on the border. These districts sit in the main west.
  TJK: "TJK::Districts of Republican Subordination",
  TKM: "TKM",
  TLS: "TLS",
  TON: "TON",
  TTO: "TTO",
  TUN: "TUN",
  TUR: "TUR",
  // No ADM1 centroid lands on an island. This point is on Funafuti.
  TUV: "179.21,-8.52",
  TWN: "TWN",
  TZA: "TZA",
  UGA: "UGA",
  UKR: "UKR",
  URY: "URY",
  USA: "USA",
  UZB: "UZB",
  VAT: "VAT",
  VCT: "VCT",
  VEN: "VEN",
  // Area centroid falls in the sea off the central coast. Quảng Trị is the on-land point at that latitude.
  VNM: "VNM::Quảng Trị",
  VUT: "VUT",
  WSM: "WSM",
  XKX: "XKX",
  YEM: "YEM",
  ZAF: "ZAF",
  ZMB: "ZMB",
  ZWE: "ZWE",
  // Flag codes that alias into another country. Not ADM0 rows.
  ATF: "69.3486,-49.3948",
  FLK: "-59.5293,-51.7523",
  HKG: "114.1694,22.3193",
  MAC: "113.5439,22.1987",
  NCL: "165.618,-20.9043",
  PRI: "-66.5901,18.2208",
  PSE: "35.2332,31.9522",
};

/**
 * First-frame center for ADM1 anchors, keyed by ADM0 shapeGroup.
 * Same largest-ring centroid that computeFeatureCentroid uses once the
 * ADM1 geometry is loaded. Coordinate anchors are parsed from the value
 * and do not need an entry here.
 */
export const LABEL_ANCHOR_BAKED_CENTERS: Record<string, [number, number]> = {
  HRV: [16.98897, 45.73974],
  HTI: [-72.56725, 19.33207],
  ISR: [34.87155, 30.83591],
  MHL: [171.26080, 7.06240],
  NOR: [10.42717, 61.44409],
  SOM: [46.76894, 5.10774],
  TJK: [70.13930, 38.89242],
  VNM: [106.93836, 16.73856],
};

export type LabelAnchorSpec =
  | { kind: "self" }
  | { kind: "adm1"; name: string }
  | { kind: "coord"; lng: number; lat: number };

const COORD_RE = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;

export function parseLabelAnchor(raw: string): LabelAnchorSpec {
  const text = raw.trim().replace(/^["']|["']$/g, "");
  const coord = COORD_RE.exec(text);
  if (coord) {
    return { kind: "coord", lng: Number(coord[1]), lat: Number(coord[2]) };
  }
  const sep = text.includes("::") ? "::" : text.includes("/") ? "/" : "";
  if (sep) {
    const name = text.split(sep).slice(1).join(sep).trim();
    if (name) return { kind: "adm1", name };
  }
  return { kind: "self" };
}

export function getLabelAnchorSpec(shapeGroup: string): LabelAnchorSpec | null {
  const raw = LABEL_ANCHORS[shapeGroup];
  if (!raw) return null;
  return parseLabelAnchor(raw);
}

/** Coordinate anchor, or null when the entry is missing, self, or an ADM1 name. */
export function getLabelAnchorCoord(key: string): [number, number] | null {
  const spec = getLabelAnchorSpec(key);
  if (!spec || spec.kind !== "coord") return null;
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

export function getLabelAnchorBakedCenter(
  shapeGroup: string
): [number, number] | null {
  return LABEL_ANCHOR_BAKED_CENTERS[shapeGroup] ?? null;
}

/** ADM0 shapeGroups whose anchor is an ADM1 name. */
export function listLabelAnchorAdm1Groups(): string[] {
  const groups: string[] = [];
  for (const [group, raw] of Object.entries(LABEL_ANCHORS)) {
    if (parseLabelAnchor(raw).kind === "adm1") groups.push(group);
  }
  return groups;
}
