import type { AdmLevel } from "./fgb-loader";
import type { CountryMeta } from "./fgb-loader";
import type { DrilldownTarget } from "@/types/geovis";

/**
 * Configuration schema for country capital and its administrative hierarchy.
 */
export interface CountryCapitalConfig {
  /** English name of the capital city itself (e.g. "Kampala", "Taipei", "Washington, D.C.", "Tokyo") */
  capitalCity: string;
  /** Chinese name of the capital city (e.g. "坎帕拉", "台北", "華盛頓特區", "東京") */
  capitalCityZh: string;
  /**
   * The ADM1 subdivision(s) that are either the capital itself
   * OR the ADM1 region that the capital belongs to (e.g. "Central Region" for Uganda, "Ontario" for Canada, "England" for UK)
   */
  adm1: string[];
  /**
   * Optional ADM2 subdivision name(s) if the capital is a specific district at ADM2 level
   * (e.g. "Kampala" for Uganda, "Ottawa" for Canada, "Greater London" for UK, "Roma" for Italy)
   */
  adm2?: string[];
}

/**
 * Global Mapping of ADM0 Country Codes (shapeGroup) to Capital Info.
 * Supports:
 * 1. Capital itself as ADM1 (e.g. Taipei in Taiwan, DC in USA, Tokyo in Japan, Berlin in Germany)
 * 2. ADM1 region that the capital belongs to (e.g. Central Region for Kampala in Uganda, Ontario for Ottawa in Canada, England for London in UK)
 * 3. Specific ADM2 district for the capital city when drilled down (e.g. Kampala in Uganda, Greater London in UK)
 */
export const CAPITAL_MAP: Record<string, CountryCapitalConfig> = {
  // East Asia
  TWN: {
    capitalCity: "Taipei",
    capitalCityZh: "台北",
    adm1: ["Taipei"],
    adm2: ["Taipei"],
  },
  JPN: {
    capitalCity: "Tokyo",
    capitalCityZh: "東京",
    adm1: ["Tokyo"],
  },
  CHN: {
    capitalCity: "Beijing",
    capitalCityZh: "北京",
    adm1: ["Beijing Municipality", "Beijing"],
  },
  KOR: {
    capitalCity: "Seoul",
    capitalCityZh: "首爾",
    adm1: ["Seoul"],
  },
  PRK: {
    capitalCity: "Pyongyang",
    capitalCityZh: "平壤",
    adm1: ["Pyongyang"],
  },
  MNG: {
    capitalCity: "Ulaanbaatar",
    capitalCityZh: "烏蘭巴托",
    adm1: ["Ulaanbaatar"],
  },

  // North America
  USA: {
    capitalCity: "Washington, D.C.",
    capitalCityZh: "華盛頓特區",
    adm1: ["District of Columbia"],
    adm2: ["District of Columbia", "Washington"],
  },
  CAN: {
    capitalCity: "Ottawa",
    capitalCityZh: "渥太華",
    adm1: ["Ontario"], // Capital belongs to Ontario at ADM1
    adm2: ["Ottawa"],
  },
  MEX: {
    capitalCity: "Mexico City",
    capitalCityZh: "墨西哥城",
    adm1: ["Distrito Federal"],
  },

  // Western & Southern Europe
  GBR: {
    capitalCity: "London",
    capitalCityZh: "倫敦",
    adm1: ["England"], // Capital belongs to England at ADM1
    adm2: ["Greater London", "London"],
  },
  FRA: {
    capitalCity: "Paris",
    capitalCityZh: "巴黎",
    adm1: ["Île-de-France", "Ile-de-France"],
    adm2: ["Paris"],
  },
  DEU: {
    capitalCity: "Berlin",
    capitalCityZh: "柏林",
    adm1: ["Berlin"],
  },
  ITA: {
    capitalCity: "Rome",
    capitalCityZh: "羅馬",
    adm1: ["Centro", "Lazio"], // Capital belongs to Centro at ADM1
    adm2: ["Roma", "Rome"],
  },
  ESP: {
    capitalCity: "Madrid",
    capitalCityZh: "馬德里",
    adm1: ["Comunidad de Madrid", "Madrid"],
  },
  PRT: {
    capitalCity: "Lisbon",
    capitalCityZh: "里斯本",
    adm1: ["LISBOA", "Lisbon"],
  },
  NLD: {
    capitalCity: "Amsterdam",
    capitalCityZh: "阿姆斯特丹",
    adm1: ["Noord-Holland"], // Capital belongs to North Holland at ADM1
    adm2: ["Amsterdam"],
  },
  BEL: {
    capitalCity: "Brussels",
    capitalCityZh: "布魯塞爾",
    adm1: ["Brussels Hoofdstedelijk", "Brussels"],
  },
  CHE: {
    capitalCity: "Bern",
    capitalCityZh: "伯恩",
    adm1: ["Bern"],
  },
  AUT: {
    capitalCity: "Vienna",
    capitalCityZh: "維也納",
    adm1: ["Wien", "Vienna"],
  },
  IRL: {
    capitalCity: "Dublin",
    capitalCityZh: "都柏林",
    adm1: ["Leinster"], // Capital belongs to Leinster at ADM1
    adm2: ["Dublin"],
  },
  GRC: {
    capitalCity: "Athens",
    capitalCityZh: "雅典",
    adm1: ["Attica"],
    adm2: ["Central Athens", "Athens"],
  },
  CYP: {
    capitalCity: "Nicosia",
    capitalCityZh: "尼古西亞",
    adm1: ["Nicosia"],
  },

  // Northern Europe
  SWE: {
    capitalCity: "Stockholm",
    capitalCityZh: "斯德哥爾摩",
    adm1: ["Stockholms län", "Stockholm"],
    adm2: ["Stockholm"],
  },
  NOR: {
    capitalCity: "Oslo",
    capitalCityZh: "奧斯陸",
    adm1: ["Oslo"],
  },
  DNK: {
    capitalCity: "Copenhagen",
    capitalCityZh: "哥本哈根",
    adm1: ["Hovedstaden"],
    adm2: ["København", "Copenhagen"],
  },
  FIN: {
    capitalCity: "Helsinki",
    capitalCityZh: "赫爾辛基",
    adm1: ["Uusimaa"],
    adm2: ["Helsinki"],
  },
  ISL: {
    capitalCity: "Reykjavik",
    capitalCityZh: "雷克雅維克",
    adm1: ["Capital Region"],
    adm2: ["Reykjavík", "Reykjavik"],
  },

  // Eastern & Central Europe
  RUS: {
    capitalCity: "Moscow",
    capitalCityZh: "莫斯科",
    adm1: ["Moscow"],
  },
  UKR: {
    capitalCity: "Kyiv",
    capitalCityZh: "基輔",
    adm1: ["Kyiv"],
  },
  POL: {
    capitalCity: "Warsaw",
    capitalCityZh: "華沙",
    adm1: ["Masovian Voivodeship"],
    adm2: ["Warszawa", "Warsaw"],
  },
  CZE: {
    capitalCity: "Prague",
    capitalCityZh: "布拉格",
    adm1: ["Hlavní město Praha", "Praha", "Prague"],
  },
  SVK: {
    capitalCity: "Bratislava",
    capitalCityZh: "布拉提斯拉瓦",
    adm1: ["Bratislavský kraj", "Bratislava"],
  },
  HUN: {
    capitalCity: "Budapest",
    capitalCityZh: "布達佩斯",
    adm1: ["Pest"],
    adm2: ["Budapest"],
  },
  ROU: {
    capitalCity: "Bucharest",
    capitalCityZh: "布加勒斯特",
    adm1: ["BUCURESTI", "Bucuresti"],
  },
  BGR: {
    capitalCity: "Sofia",
    capitalCityZh: "索菲亞",
    adm1: ["Sofia"],
  },
  BLR: {
    capitalCity: "Minsk",
    capitalCityZh: "明斯克",
    adm1: ["Minsk"],
  },
  HRV: {
    capitalCity: "Zagreb",
    capitalCityZh: "札格瑞布",
    adm1: ["Zagreb"],
  },
  SRB: {
    capitalCity: "Belgrade",
    capitalCityZh: "貝爾格勒",
    adm1: ["Belgrade", "Grad Beograd"],
  },
  BIH: {
    capitalCity: "Sarajevo",
    capitalCityZh: "塞拉耶佛",
    adm1: ["Federation of Bosnia and Herzegovina", "Sarajevo"],
    adm2: ["Sarajevo"],
  },
  ALB: {
    capitalCity: "Tirana",
    capitalCityZh: "地拉那",
    adm1: ["Tirana", "Tiranë"],
  },
  MKD: {
    capitalCity: "Skopje",
    capitalCityZh: "史高比耶",
    adm1: ["Skopje"],
  },
  MNE: {
    capitalCity: "Podgorica",
    capitalCityZh: "波德里查",
    adm1: ["Podgorica"],
  },
  SVN: {
    capitalCity: "Ljubljana",
    capitalCityZh: "盧布爾雅那",
    adm1: ["Zahodna Slovenija"],
    adm2: ["Ljubljana"],
  },
  EST: {
    capitalCity: "Tallinn",
    capitalCityZh: "塔林",
    adm1: ["Harju", "Tallinn"],
    adm2: ["Tallinn"],
  },
  LVA: {
    capitalCity: "Riga",
    capitalCityZh: "里加",
    adm1: ["Rīga", "Riga"],
  },
  LTU: {
    capitalCity: "Vilnius",
    capitalCityZh: "維爾紐斯",
    adm1: ["Vilnius"],
  },
  MDA: {
    capitalCity: "Chisinau",
    capitalCityZh: "基希納烏",
    adm1: ["Chisinau"],
  },

  // Africa
  UGA: {
    capitalCity: "Kampala",
    capitalCityZh: "坎帕拉",
    adm1: ["Central Region", "Central"], // Kampala belongs to Central Region at ADM1
    adm2: ["Kampala"],
  },
  ZAF: {
    capitalCity: "Pretoria",
    capitalCityZh: "普勒托利亞",
    adm1: ["Gauteng"],
    adm2: ["City of Tshwane", "Pretoria"],
  },
  EGY: {
    capitalCity: "Cairo",
    capitalCityZh: "開羅",
    adm1: ["Cairo Governorate", "Cairo"],
  },
  NGA: {
    capitalCity: "Abuja",
    capitalCityZh: "阿布札",
    adm1: ["Abuja Federal Capital Territory", "Federal Capital Territory"],
    adm2: ["Abuja", "Municipal Area Council"],
  },
  KEN: {
    capitalCity: "Nairobi",
    capitalCityZh: "奈洛比",
    adm1: ["Nairobi"],
  },
  ETH: {
    capitalCity: "Addis Ababa",
    capitalCityZh: "阿迪斯阿貝巴",
    adm1: ["Addis Ababa"],
  },
  MAR: {
    capitalCity: "Rabat",
    capitalCityZh: "拉巴特",
    adm1: ["Rabat-Salé-Kénitra", "Rabat"],
    adm2: ["Rabat"],
  },
  DZA: {
    capitalCity: "Algiers",
    capitalCityZh: "阿爾及爾",
    adm1: ["Algiers"],
  },
  TUN: {
    capitalCity: "Tunis",
    capitalCityZh: "突尼斯",
    adm1: ["Tunis"],
  },
  GHA: {
    capitalCity: "Accra",
    capitalCityZh: "阿克拉",
    adm1: ["Greater Accra"],
    adm2: ["Accra Metropolitan", "Accra"],
  },
  CIV: {
    capitalCity: "Yamoussoukro",
    capitalCityZh: "雅穆索戈",
    adm1: ["Yamoussoukro", "Abidjan"],
  },
  SEN: {
    capitalCity: "Dakar",
    capitalCityZh: "達喀爾",
    adm1: ["Dakar"],
  },
  CMR: {
    capitalCity: "Yaounde",
    capitalCityZh: "雅溫得",
    adm1: ["Centre"],
    adm2: ["Mfoundi", "Yaounde"],
  },
  TZA: {
    capitalCity: "Dodoma",
    capitalCityZh: "多多馬",
    adm1: ["Dodoma", "Dar es Salaam"],
  },
  ZMB: {
    capitalCity: "Lusaka",
    capitalCityZh: "路沙卡",
    adm1: ["Lusaka"],
  },
  ZWE: {
    capitalCity: "Harare",
    capitalCityZh: "哈拉雷",
    adm1: ["Harare"],
  },
  MOZ: {
    capitalCity: "Maputo",
    capitalCityZh: "馬布多",
    adm1: ["Maputo"],
  },
  MDG: {
    capitalCity: "Antananarivo",
    capitalCityZh: "塔那那利佛",
    adm1: ["Analamanga"],
    adm2: ["Antananarivo"],
  },

  // Oceania
  AUS: {
    capitalCity: "Canberra",
    capitalCityZh: "坎培拉",
    adm1: ["Australian Capital Territory"],
    adm2: ["Canberra"],
  },
  NZL: {
    capitalCity: "Wellington",
    capitalCityZh: "威靈頓",
    adm1: ["Wellington Region", "Wellington"],
    adm2: ["Wellington City", "Wellington"],
  },
  FJI: {
    capitalCity: "Suva",
    capitalCityZh: "蘇瓦",
    adm1: ["Central"],
    adm2: ["Suva"],
  },
  PNG: {
    capitalCity: "Port Moresby",
    capitalCityZh: "莫士比港",
    adm1: ["National Capital District"],
  },

  // Southeast & South Asia
  IND: {
    capitalCity: "New Delhi",
    capitalCityZh: "新德里",
    adm1: ["Delhi"],
    adm2: ["New Delhi", "Delhi"],
  },
  IDN: {
    capitalCity: "Jakarta",
    capitalCityZh: "雅加達",
    adm1: ["Jakarta Special Capital Region", "Jakarta"],
  },
  THA: {
    capitalCity: "Bangkok",
    capitalCityZh: "曼谷",
    adm1: ["Bangkok"],
  },
  VNM: {
    capitalCity: "Hanoi",
    capitalCityZh: "河內",
    adm1: ["Hà Nội", "Ha Noi"],
  },
  PHL: {
    capitalCity: "Manila",
    capitalCityZh: "馬尼拉",
    adm1: ["NCR"], // National Capital Region
    adm2: ["Manila"],
  },
  MYS: {
    capitalCity: "Kuala Lumpur",
    capitalCityZh: "吉隆坡",
    adm1: ["Kuala Lumpur"],
  },
  SGP: {
    capitalCity: "Singapore",
    capitalCityZh: "新加坡",
    adm1: ["CENTRAL REGION"],
  },
  PAK: {
    capitalCity: "Islamabad",
    capitalCityZh: "伊斯蘭瑪巴德",
    adm1: ["Islamabad Capital Territory", "Islamabad"],
  },
  BGD: {
    capitalCity: "Dhaka",
    capitalCityZh: "達卡",
    adm1: ["Dhaka"],
  },
  NPL: {
    capitalCity: "Kathmandu",
    capitalCityZh: "加德滿都",
    adm1: ["Bagmati"],
    adm2: ["Kathmandu"],
  },
  LKA: {
    capitalCity: "Colombo",
    capitalCityZh: "可倫坡",
    adm1: ["Western"],
    adm2: ["Colombo"],
  },
  KHM: {
    capitalCity: "Phnom Penh",
    capitalCityZh: "金邊",
    adm1: ["Phnom Penh"],
  },
  LAO: {
    capitalCity: "Vientiane",
    capitalCityZh: "永珍",
    adm1: ["Vientiane"],
  },
  MMR: {
    capitalCity: "Naypyidaw",
    capitalCityZh: "奈比多",
    adm1: ["Naypyidaw", "Nay Pyi Taw"],
  },
  AFG: {
    capitalCity: "Kabul",
    capitalCityZh: "喀布爾",
    adm1: ["Kabul"],
  },

  // Central Asia & Caucasus
  KAZ: {
    capitalCity: "Astana",
    capitalCityZh: "阿斯塔納",
    adm1: ["Astana", "Nur-Sultan"],
  },
  UZB: {
    capitalCity: "Tashkent",
    capitalCityZh: "塔什干",
    adm1: ["Tashkent"],
  },
  AZE: {
    capitalCity: "Baku",
    capitalCityZh: "巴庫",
    adm1: ["Baku", "Contiguous Azerbaijan"],
  },
  ARM: {
    capitalCity: "Yerevan",
    capitalCityZh: "葉里溫",
    adm1: ["Yerevan"],
  },
  GEO: {
    capitalCity: "Tbilisi",
    capitalCityZh: "第比利斯",
    adm1: ["Tbilisi"],
  },

  // Middle East
  SAU: {
    capitalCity: "Riyadh",
    capitalCityZh: "利雅德",
    adm1: ["Riyadh Region", "Riyadh"],
  },
  TUR: {
    capitalCity: "Ankara",
    capitalCityZh: "安卡拉",
    adm1: ["Ankara"],
  },
  ARE: {
    capitalCity: "Abu Dhabi",
    capitalCityZh: "阿布達比",
    adm1: ["Abu Dhabi"],
  },
  QAT: {
    capitalCity: "Doha",
    capitalCityZh: "杜哈",
    adm1: ["Doha", "Ad Dawhah"],
  },
  ISR: {
    capitalCity: "Jerusalem",
    capitalCityZh: "耶路撒冷",
    adm1: ["Jerusalem"],
  },
  JOR: {
    capitalCity: "Amman",
    capitalCityZh: "安曼",
    adm1: ["Amman"],
  },
  IRQ: {
    capitalCity: "Baghdad",
    capitalCityZh: "巴格達",
    adm1: ["Baghdad"],
  },
  IRN: {
    capitalCity: "Tehran",
    capitalCityZh: "德黑蘭",
    adm1: ["Tehran"],
  },
  KWT: {
    capitalCity: "Kuwait City",
    capitalCityZh: "科威特城",
    adm1: ["Al Asimah"],
  },
  BHR: {
    capitalCity: "Manama",
    capitalCityZh: "麥納瑪",
    adm1: ["Capital"],
  },
  OMN: {
    capitalCity: "Muscat",
    capitalCityZh: "馬斯喀特",
    adm1: ["Muscat"],
  },
  YEM: {
    capitalCity: "Sanaa",
    capitalCityZh: "沙那",
    adm1: ["Sanʿaʾ", "Sanaa", "Amanat Al Asimah"],
  },
  LBN: {
    capitalCity: "Beirut",
    capitalCityZh: "貝魯特",
    adm1: ["Beyrouth", "Beirut"],
  },

  // South America
  BRA: {
    capitalCity: "Brasilia",
    capitalCityZh: "巴西利亞",
    adm1: ["Distrito Federal"],
    adm2: ["Brasilia"],
  },
  ARG: {
    capitalCity: "Buenos Aires",
    capitalCityZh: "布宜諾斯艾利斯",
    adm1: ["Buenos Aires"],
    adm2: ["Ciudad de Buenos Aires"],
  },
  COL: {
    capitalCity: "Bogota",
    capitalCityZh: "波哥大",
    adm1: ["Bogota D.C.", "Bogota"],
    adm2: ["Bogotá, D.C."],
  },
  PER: {
    capitalCity: "Lima",
    capitalCityZh: "利馬",
    adm1: ["Lima"],
    adm2: ["Lima"],
  },
  CHL: {
    capitalCity: "Santiago",
    capitalCityZh: "聖地牙哥",
    adm1: ["RegiÃ³n Metropolitana de Santiago", "Región Metropolitana de Santiago", "Santiago"],
    adm2: ["Santiago"],
  },
  ECU: {
    capitalCity: "Quito",
    capitalCityZh: "基多",
    adm1: ["Pichincha"], // Quito belongs to Pichincha at ADM1
    adm2: ["Quito"],
  },
  VEN: {
    capitalCity: "Caracas",
    capitalCityZh: "卡拉卡斯",
    adm1: ["Distrito Capital"],
    adm2: ["Caracas", "Libertador"],
  },
  BOL: {
    capitalCity: "La Paz / Sucre",
    capitalCityZh: "拉巴斯 / 蘇克雷",
    adm1: ["La Paz", "Chuquisaca"],
    adm2: ["La Paz", "Sucre"],
  },
  URY: {
    capitalCity: "Montevideo",
    capitalCityZh: "蒙特維多",
    adm1: ["Montevideo"],
  },
  PRY: {
    capitalCity: "Asuncion",
    capitalCityZh: "亞松森",
    adm1: ["ASUNCION"],
  },

  // Central America & Caribbean
  CUB: {
    capitalCity: "Havana",
    capitalCityZh: "哈瓦那",
    adm1: ["Havana"],
  },
  DOM: {
    capitalCity: "Santo Domingo",
    capitalCityZh: "聖多明哥",
    adm1: ["Distrito Nacional"],
    adm2: ["Santo Domingo"],
  },
  GTM: {
    capitalCity: "Guatemala City",
    capitalCityZh: "瓜地馬拉市",
    adm1: ["Guatemala"],
  },
  HND: {
    capitalCity: "Tegucigalpa",
    capitalCityZh: "德古斯加巴",
    adm1: ["Francisco Morazán"],
    adm2: ["Distrito Central", "Tegucigalpa"],
  },
  SLV: {
    capitalCity: "San Salvador",
    capitalCityZh: "聖薩爾瓦多",
    adm1: ["San Salvador"],
  },
  NIC: {
    capitalCity: "Managua",
    capitalCityZh: "馬拿瓜",
    adm1: ["Managua"],
  },
  CRI: {
    capitalCity: "San Jose",
    capitalCityZh: "聖荷西",
    adm1: ["San José", "San Jose"],
  },
  PAN: {
    capitalCity: "Panama City",
    capitalCityZh: "巴拿馬城",
    adm1: ["Panamá", "Panama"],
  },
  HTI: {
    capitalCity: "Port-au-Prince",
    capitalCityZh: "太子港",
    adm1: ["Ouest"],
    adm2: ["Port-au-Prince"],
  },
  JAM: {
    capitalCity: "Kingston",
    capitalCityZh: "金斯敦",
    adm1: ["Kingston"],
  },
  TTO: {
    capitalCity: "Port of Spain",
    capitalCityZh: "西班牙港",
    adm1: ["Port of Spain"],
  },
};

/**
 * Normalize a geographic name for resilient comparison.
 * Strips accents, punctuation, and converts to lowercase.
 */
function normalizeName(str: string): string {
  return (str || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Checks whether an administrative feature (ADM1 or ADM2) represents the capital
 * OR the ADM1 region that the capital belongs to (e.g. Uganda's Central Region).
 *
 * @param shapeGroup The ADM0 ISO3 country code (e.g. "UGA", "TWN", "USA")
 * @param shapeType The level ("ADM1" or "ADM2")
 * @param shapeName The name of the subdivision (e.g. "Central Region", "Kampala", "Taipei")
 * @param shapeID Optional unique shapeID for direct ID matching
 */
export function isCapitalFeature(
  shapeGroup: string,
  shapeType: AdmLevel,
  shapeName: string,
  shapeID?: string
): boolean {
  if (!shapeGroup || (!shapeName && !shapeID)) return false;

  const config = CAPITAL_MAP[shapeGroup];
  if (!config) return false;

  const normName = normalizeName(shapeName);
  const normId = shapeID ? normalizeName(shapeID) : "";

  const matchesList = (list: string[]): boolean => {
    for (const item of list) {
      const normCand = normalizeName(item);
      if (!normCand) continue;

      // 1. Exact normalized match
      if (normName === normCand) return true;
      if (normId && normId === normCand) return true;

      // 2. Suffix match (e.g. "Central Region" matches "Central", "Beijing Municipality" matches "Beijing")
      const strippedName = normName.replace(
        /(city|municipality|governorate|specialcapitalregion|region)$/,
        ""
      );
      const strippedCand = normCand.replace(
        /(city|municipality|governorate|specialcapitalregion|region)$/,
        ""
      );
      if (strippedName && strippedName === strippedCand) return true;
    }
    return false;
  };

  if (shapeType === "ADM1") {
    // 1. Check against ADM1 list (capital or capital's enclosing region)
    if (matchesList(config.adm1)) return true;
    // 2. Direct match against capital city name
    if (matchesList([config.capitalCity])) return true;
    return false;
  }

  if (shapeType === "ADM2") {
    // 1. Check against ADM2 list if defined
    if (config.adm2 && matchesList(config.adm2)) return true;
    // 2. Direct match against capital city name (e.g. "Kampala" in Uganda)
    if (matchesList([config.capitalCity])) return true;
    return false;
  }

  return false;
}

/**
 * Get display badge info for LeftHudInspector.
 * Returns whether it is the capital city itself or the enclosing ADM1 region.
 */
export function getCapitalBadgeInfo(
  shapeGroup: string,
  shapeType: AdmLevel,
  shapeName: string,
  shapeID?: string
): { isCapital: boolean; isRegion: boolean; label: string } | null {
  const config = CAPITAL_MAP[shapeGroup];
  if (!config) return null;
  if (!isCapitalFeature(shapeGroup, shapeType, shapeName, shapeID)) return null;

  const cityLabel = config.capitalCityZh
    ? `${config.capitalCityZh} (${config.capitalCity})`
    : config.capitalCity;

  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const isCityDirectMatch =
    norm(shapeName) === norm(config.capitalCity) ||
    (config.adm2 && config.adm2.some((a) => norm(shapeName) === norm(a)));

  if (shapeType === "ADM1" && !isCityDirectMatch) {
    return {
      isCapital: true,
      isRegion: true,
      label: `首都所屬區域 (${cityLabel})`,
    };
  }

  return {
    isCapital: true,
    isRegion: false,
    label: `國家首都 (${cityLabel})`,
  };
}

/**
 * Determines which country codes currently have their ADM0 level selected
 * (i.e. clicked, drilled down to country, or selected as target, without an active sub-region).
 */
export function getSelectedCountryGroups(
  clickDrilldown: DrilldownTarget | null,
  pinnedDrilldown: DrilldownTarget | null,
  selectedTargetIds: Set<string>,
  countryMetaMap: Map<string, CountryMeta>
): Set<string> {
  const groups = new Set<string>();

  // 1. clickDrilldown has shapeGroup and no sub-regions selected (ADM0 level)
  if (clickDrilldown?.shapeGroup && !clickDrilldown.adm1Id) {
    groups.add(clickDrilldown.shapeGroup);
  }

  // 2. pinnedDrilldown has shapeGroup and no sub-regions selected
  if (pinnedDrilldown?.shapeGroup && !pinnedDrilldown.adm1Id) {
    groups.add(pinnedDrilldown.shapeGroup);
  }

  // 3. selectedTargetIds contains an ADM0 target
  for (const id of selectedTargetIds) {
    if (countryMetaMap.has(id)) {
      groups.add(id);
    } else if (id.startsWith("ADM0_")) {
      const code = id.replace("ADM0_", "");
      if (countryMetaMap.has(code)) {
        groups.add(code);
      }
    }
  }

  return groups;
}
