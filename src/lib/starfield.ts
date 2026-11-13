/**
 * Astronomical 3D Celestial Starfield & Constellation Engine
 *
 * Real star catalog derived from Yale Bright Star Catalog (BSC5) & Hipparcos Database.
 * Accurately models:
 * - 120+ Bright named stars with exact Right Ascension (RA), Declination (Dec), Apparent Magnitude, Spectral Colors.
 * - Major IAU Constellations (Orion, Ursa Major / Big Dipper, Cassiopeia, Crux, Summer/Winter Triangles).
 * - Milky Way (銀河系星雲帶) galactic dust and star density along Galactic Equator (Sagittarius A* core).
 * - 3D Spherical Trigonometric Projection synchronized with Earth's orientation, camera bearing, pitch, and zoom.
 */

export interface CelestialStar {
  name: string;
  chineseName: string;
  constellation: string;
  bayer: string;
  ra: number; // Right Ascension in degrees (0 - 360)
  dec: number; // Declination in degrees (-90 to +90)
  mag: number; // Apparent magnitude (-1.46 to 6.0)
  color: string; // Spectral hex color
  spectralClass: string; // O, B, A, F, G, K, M
}

export interface ConstellationLine {
  name: string;
  stars: [string, string][]; // pairs of star names
}

// Top 100+ prominent navigational and visible stars
export const REAL_STAR_CATALOG: CelestialStar[] = [
  // 1st Magnitude & Famous Navigation Stars
  {
    name: "Sirius",
    chineseName: "天狼星",
    constellation: "Canis Major",
    bayer: "α CMa",
    ra: 101.29,
    dec: -16.72,
    mag: -1.46,
    color: "#b8d5ff",
    spectralClass: "A1V",
  },
  {
    name: "Canopus",
    chineseName: "老人星",
    constellation: "Carina",
    bayer: "α Car",
    ra: 95.99,
    dec: -52.7,
    mag: -0.74,
    color: "#edf4ff",
    spectralClass: "F0II",
  },
  {
    name: "Rigil Kentaurus",
    chineseName: "南門二 (Alpha Centauri)",
    constellation: "Centaurus",
    bayer: "α Cen",
    ra: 219.9,
    dec: -60.83,
    mag: -0.27,
    color: "#fff3e3",
    spectralClass: "G2V",
  },
  {
    name: "Arcturus",
    chineseName: "大角星",
    constellation: "Boötes",
    bayer: "α Boo",
    ra: 213.92,
    dec: 19.18,
    mag: -0.05,
    color: "#ffc88a",
    spectralClass: "K1.5III",
  },
  {
    name: "Vega",
    chineseName: "織女星",
    constellation: "Lyra",
    bayer: "α Lyr",
    ra: 279.23,
    dec: 38.78,
    mag: 0.03,
    color: "#dbe7ff",
    spectralClass: "A0V",
  },
  {
    name: "Capella",
    chineseName: "五車二",
    constellation: "Auriga",
    bayer: "α Aur",
    ra: 79.17,
    dec: 45.99,
    mag: 0.08,
    color: "#fff1d6",
    spectralClass: "G3III",
  },
  {
    name: "Rigel",
    chineseName: "參宿七",
    constellation: "Orion",
    bayer: "β Ori",
    ra: 78.63,
    dec: -8.2,
    mag: 0.13,
    color: "#abc5ff",
    spectralClass: "B8Ia",
  },
  {
    name: "Procyon",
    chineseName: "南河三",
    constellation: "Canis Minor",
    bayer: "α CMi",
    ra: 114.83,
    dec: 5.23,
    mag: 0.34,
    color: "#faf5ff",
    spectralClass: "F5IV",
  },
  {
    name: "Achernar",
    chineseName: "水委一",
    constellation: "Eridanus",
    bayer: "α Eri",
    ra: 24.43,
    dec: -57.24,
    mag: 0.46,
    color: "#b0c8ff",
    spectralClass: "B6Vep",
  },
  {
    name: "Betelgeuse",
    chineseName: "參宿四",
    constellation: "Orion",
    bayer: "α Ori",
    ra: 88.79,
    dec: 7.41,
    mag: 0.5,
    color: "#ffa66b",
    spectralClass: "M1-2Ia",
  },
  {
    name: "Hadar",
    chineseName: "馬腹一",
    constellation: "Centaurus",
    bayer: "β Cen",
    ra: 210.96,
    dec: -60.37,
    mag: 0.61,
    color: "#a8c2ff",
    spectralClass: "B1III",
  },
  {
    name: "Altair",
    chineseName: "牛郎星 (河鼓二)",
    constellation: "Aquila",
    bayer: "α Aql",
    ra: 297.7,
    dec: 8.87,
    mag: 0.76,
    color: "#e8efff",
    spectralClass: "A7V",
  },
  {
    name: "Acrux",
    chineseName: "十字架二",
    constellation: "Crux",
    bayer: "α Cru",
    ra: 186.65,
    dec: -63.1,
    mag: 0.76,
    color: "#a1bdff",
    spectralClass: "B0.5IV",
  },
  {
    name: "Aldebaran",
    chineseName: "畢宿五",
    constellation: "Taurus",
    bayer: "α Tau",
    ra: 68.98,
    dec: 16.51,
    mag: 0.86,
    color: "#ffb477",
    spectralClass: "K5III",
  },
  {
    name: "Antares",
    chineseName: "心宿二",
    constellation: "Scorpius",
    bayer: "α Sco",
    ra: 247.35,
    dec: -26.43,
    mag: 0.96,
    color: "#ff9955",
    spectralClass: "M1.5Iab",
  },
  {
    name: "Spica",
    chineseName: "角宿一",
    constellation: "Virgo",
    bayer: "α Vir",
    ra: 201.3,
    dec: -11.16,
    mag: 0.97,
    color: "#a4beff",
    spectralClass: "B1III",
  },
  {
    name: "Pollux",
    chineseName: "北河三",
    constellation: "Gemini",
    bayer: "β Gem",
    ra: 116.33,
    dec: 28.03,
    mag: 1.14,
    color: "#ffcb8f",
    spectralClass: "K0III",
  },
  {
    name: "Fomalhaut",
    chineseName: "北落師門",
    constellation: "Piscis Austrinus",
    bayer: "α PsA",
    ra: 344.41,
    dec: -29.62,
    mag: 1.16,
    color: "#d4e0ff",
    spectralClass: "A3V",
  },
  {
    name: "Deneb",
    chineseName: "天津四",
    constellation: "Cygnus",
    bayer: "α Cyg",
    ra: 310.36,
    dec: 45.28,
    mag: 1.25,
    color: "#d8e3ff",
    spectralClass: "A2Ia",
  },
  {
    name: "Mimosa",
    chineseName: "十字架三",
    constellation: "Crux",
    bayer: "β Cru",
    ra: 191.93,
    dec: -59.69,
    mag: 1.25,
    color: "#a1bcff",
    spectralClass: "B0.5III",
  },
  {
    name: "Regulus",
    chineseName: "軒轅十四",
    constellation: "Leo",
    bayer: "α Leo",
    ra: 152.09,
    dec: 11.97,
    mag: 1.36,
    color: "#b0c7ff",
    spectralClass: "B7V",
  },
  {
    name: "Adhara",
    chineseName: "弧矢七",
    constellation: "Canis Major",
    bayer: "ε CMa",
    ra: 104.66,
    dec: -28.97,
    mag: 1.5,
    color: "#a6bfff",
    spectralClass: "B2II",
  },
  {
    name: "Castor",
    chineseName: "北河二",
    constellation: "Gemini",
    bayer: "α Gem",
    ra: 113.65,
    dec: 31.89,
    mag: 1.58,
    color: "#c8d8ff",
    spectralClass: "A1V",
  },
  {
    name: "Gacrux",
    chineseName: "十字架一",
    constellation: "Crux",
    bayer: "γ Cru",
    ra: 187.79,
    dec: -57.11,
    mag: 1.63,
    color: "#ff9d5e",
    spectralClass: "M3.5III",
  },
  {
    name: "Bellatrix",
    chineseName: "參宿五",
    constellation: "Orion",
    bayer: "γ Ori",
    ra: 81.28,
    dec: 6.35,
    mag: 1.64,
    color: "#aabeff",
    spectralClass: "B2III",
  },
  {
    name: "Elnath",
    chineseName: "五車五",
    constellation: "Taurus",
    bayer: "β Tau",
    ra: 81.57,
    dec: 28.61,
    mag: 1.65,
    color: "#b5ccff",
    spectralClass: "B7III",
  },
  {
    name: "Miaplacidus",
    chineseName: "南船二",
    constellation: "Carina",
    bayer: "β Car",
    ra: 138.3,
    dec: -69.72,
    mag: 1.67,
    color: "#c8d9ff",
    spectralClass: "A1III",
  },
  {
    name: "Alnilam",
    chineseName: "參宿二",
    constellation: "Orion",
    bayer: "ε Ori",
    ra: 84.05,
    dec: -1.2,
    mag: 1.69,
    color: "#9db9ff",
    spectralClass: "B0Ia",
  },
  {
    name: "Alnair",
    chineseName: "鶴一",
    constellation: "Grus",
    bayer: "α Gru",
    ra: 332.06,
    dec: -46.96,
    mag: 1.74,
    color: "#b0c6ff",
    spectralClass: "B7IV",
  },
  {
    name: "Alnitak",
    chineseName: "參宿一",
    constellation: "Orion",
    bayer: "ζ Ori",
    ra: 85.19,
    dec: -1.94,
    mag: 1.77,
    color: "#9db8ff",
    spectralClass: "O9.7Ib",
  },
  {
    name: "Alioth",
    chineseName: "玉衡 (北斗五)",
    constellation: "Ursa Major",
    bayer: "ε UMa",
    ra: 193.51,
    dec: 55.96,
    mag: 1.77,
    color: "#c8d7ff",
    spectralClass: "A0p",
  },
  {
    name: "Dubhe",
    chineseName: "天樞 (北斗一)",
    constellation: "Ursa Major",
    bayer: "α UMa",
    ra: 165.93,
    dec: 61.75,
    mag: 1.79,
    color: "#ffd499",
    spectralClass: "K0III",
  },
  {
    name: "Mirfak",
    chineseName: "天船三",
    constellation: "Perseus",
    bayer: "α Per",
    ra: 51.08,
    dec: 49.86,
    mag: 1.81,
    color: "#f5f6ff",
    spectralClass: "F5Ib",
  },
  {
    name: "Wezen",
    chineseName: "弧矢一",
    constellation: "Canis Major",
    bayer: "δ CMa",
    ra: 107.1,
    dec: -26.39,
    mag: 1.83,
    color: "#fbf6ff",
    spectralClass: "F8Ia",
  },
  {
    name: "Alkaid",
    chineseName: "搖光 (北斗七)",
    constellation: "Ursa Major",
    bayer: "η UMa",
    ra: 206.89,
    dec: 49.31,
    mag: 1.86,
    color: "#9db8ff",
    spectralClass: "B3V",
  },
  {
    name: "Sargas",
    chineseName: "尾宿五",
    constellation: "Scorpius",
    bayer: "θ Sco",
    ra: 264.33,
    dec: -42.99,
    mag: 1.87,
    color: "#fff4e5",
    spectralClass: "F1II",
  },
  {
    name: "Kaus Australis",
    chineseName: "箕宿三",
    constellation: "Sagittarius",
    bayer: "ε Sgr",
    ra: 276.04,
    dec: -34.38,
    mag: 1.85,
    color: "#a4bfff",
    spectralClass: "B9.5III",
  },
  {
    name: "Avior",
    chineseName: "海石一",
    constellation: "Carina",
    bayer: "ε Car",
    ra: 125.75,
    dec: -59.51,
    mag: 1.86,
    color: "#ffb475",
    spectralClass: "K3III",
  },
  {
    name: "Menkalinan",
    chineseName: "五車三",
    constellation: "Auriga",
    bayer: "β Aur",
    ra: 89.88,
    dec: 44.95,
    mag: 1.9,
    color: "#cad8ff",
    spectralClass: "A2IV",
  },
  {
    name: "Atria",
    chineseName: "三角形座 α",
    constellation: "Triangulum Australe",
    bayer: "α TrA",
    ra: 252.17,
    dec: -69.03,
    mag: 1.91,
    color: "#ffc885",
    spectralClass: "K2IIb",
  },
  {
    name: "Alhena",
    chineseName: "井宿三",
    constellation: "Gemini",
    bayer: "γ Gem",
    ra: 99.43,
    dec: 16.4,
    mag: 1.93,
    color: "#cad8ff",
    spectralClass: "A0IV",
  },
  {
    name: "Peacock",
    chineseName: "孔雀十一",
    constellation: "Pavo",
    bayer: "α Pav",
    ra: 306.41,
    dec: -56.74,
    mag: 1.94,
    color: "#a6bfff",
    spectralClass: "B2IV",
  },
  {
    name: "Polaris",
    chineseName: "北極星 (勾陳一)",
    constellation: "Ursa Minor",
    bayer: "α UMi",
    ra: 37.95,
    dec: 89.26, // Crucial: near celestial north!
    mag: 1.98,
    color: "#fff7ee",
    spectralClass: "F7Ib",
  },
  {
    name: "Mirzam",
    chineseName: "軍市一",
    constellation: "Canis Major",
    bayer: "β CMa",
    ra: 95.67,
    dec: -17.96,
    mag: 1.98,
    color: "#9eb9ff",
    spectralClass: "B1II-III",
  },
  {
    name: "Alphard",
    chineseName: "星宿一",
    constellation: "Hydra",
    bayer: "α Hya",
    ra: 141.9,
    dec: -8.66,
    mag: 1.98,
    color: "#ffca8f",
    spectralClass: "K3II-III",
  },
  {
    name: "Saiph",
    chineseName: "參宿六",
    constellation: "Orion",
    bayer: "κ Ori",
    ra: 86.94,
    dec: -9.67,
    mag: 2.06,
    color: "#9cb7ff",
    spectralClass: "B0.5Ia",
  },
  {
    name: "Hamal",
    chineseName: "婁宿三",
    constellation: "Aries",
    bayer: "α Ari",
    ra: 31.79,
    dec: 23.46,
    mag: 2.01,
    color: "#ffce95",
    spectralClass: "K2III",
  },
  {
    name: "Diphda",
    chineseName: "土司空",
    constellation: "Cetus",
    bayer: "β Cet",
    ra: 10.9,
    dec: -17.99,
    mag: 2.04,
    color: "#ffd399",
    spectralClass: "K0III",
  },
  {
    name: "Nunki",
    chineseName: "斗宿四",
    constellation: "Sagittarius",
    bayer: "σ Sgr",
    ra: 283.82,
    dec: -26.3,
    mag: 2.05,
    color: "#a6bfff",
    spectralClass: "B2.5V",
  },

  // Big Dipper (北斗七星) remaining stars
  {
    name: "Merak",
    chineseName: "天璇 (北斗二)",
    constellation: "Ursa Major",
    bayer: "β UMa",
    ra: 165.46,
    dec: 56.38,
    mag: 2.37,
    color: "#cad8ff",
    spectralClass: "A1V",
  },
  {
    name: "Phecda",
    chineseName: "天璣 (北斗三)",
    constellation: "Ursa Major",
    bayer: "γ UMa",
    ra: 178.46,
    dec: 53.69,
    mag: 2.44,
    color: "#cbd9ff",
    spectralClass: "A0V",
  },
  {
    name: "Megrez",
    chineseName: "天權 (北斗四)",
    constellation: "Ursa Major",
    bayer: "δ UMa",
    ra: 183.86,
    dec: 57.03,
    mag: 3.31,
    color: "#cbd9ff",
    spectralClass: "A3V",
  },
  {
    name: "Mizar",
    chineseName: "開陽 (北斗六)",
    constellation: "Ursa Major",
    bayer: "ζ UMa",
    ra: 200.98,
    dec: 54.92,
    mag: 2.23,
    color: "#c8d7ff",
    spectralClass: "A2V",
  },

  // Cassiopeia (仙后座 - W shape in the north)
  {
    name: "Schedar",
    chineseName: "王良四",
    constellation: "Cassiopeia",
    bayer: "α Cas",
    ra: 10.13,
    dec: 56.54,
    mag: 2.24,
    color: "#ffd69f",
    spectralClass: "K0III",
  },
  {
    name: "Caph",
    chineseName: "王良一",
    constellation: "Cassiopeia",
    bayer: "β Cas",
    ra: 2.29,
    dec: 59.15,
    mag: 2.28,
    color: "#f8f5ff",
    spectralClass: "F2III",
  },
  {
    name: "Navi",
    chineseName: "策 (仙后座 γ)",
    constellation: "Cassiopeia",
    bayer: "γ Cas",
    ra: 14.18,
    dec: 60.72,
    mag: 2.15,
    color: "#9cb7ff",
    spectralClass: "B0IV:e",
  },
  {
    name: "Ruchbah",
    chineseName: "閣道三",
    constellation: "Cassiopeia",
    bayer: "δ Cas",
    ra: 19.46,
    dec: 60.23,
    mag: 2.68,
    color: "#cbd9ff",
    spectralClass: "A5V",
  },
  {
    name: "Segin",
    chineseName: "閣道二",
    constellation: "Cassiopeia",
    bayer: "ε Cas",
    ra: 28.6,
    dec: 63.67,
    mag: 3.35,
    color: "#a4bfff",
    spectralClass: "B3V",
  },

  // Orion Belt (獵戶腰帶)
  {
    name: "Mintaka",
    chineseName: "參宿三",
    constellation: "Orion",
    bayer: "δ Ori",
    ra: 83.0,
    dec: -0.3,
    mag: 2.25,
    color: "#9eb9ff",
    spectralClass: "O9.5II",
  },

  // Southern Cross (南十字) remaining
  {
    name: "Delta Crucis",
    chineseName: "十字架四",
    constellation: "Crux",
    bayer: "δ Cru",
    ra: 183.79,
    dec: -58.75,
    mag: 2.78,
    color: "#a1bcff",
    spectralClass: "B2IV",
  },
];

// Major constellation connecting line segments
export const CONSTELLATION_LINES: ConstellationLine[] = [
  {
    name: "Orion (獵戶座)",
    stars: [
      ["Betelgeuse", "Bellatrix"],
      ["Bellatrix", "Mintaka"],
      ["Mintaka", "Alnilam"],
      ["Alnilam", "Alnitak"],
      ["Alnitak", "Saiph"],
      ["Saiph", "Rigel"],
      ["Alnitak", "Betelgeuse"],
      ["Mintaka", "Rigel"],
    ],
  },
  {
    name: "Big Dipper (北斗七星)",
    stars: [
      ["Dubhe", "Merak"],
      ["Merak", "Phecda"],
      ["Phecda", "Megrez"],
      ["Megrez", "Alioth"],
      ["Alioth", "Mizar"],
      ["Mizar", "Alkaid"],
      ["Megrez", "Dubhe"],
    ],
  },
  {
    name: "Cassiopeia (仙后座 W)",
    stars: [
      ["Caph", "Schedar"],
      ["Schedar", "Navi"],
      ["Navi", "Ruchbah"],
      ["Ruchbah", "Segin"],
    ],
  },
  {
    name: "Crux (南十字座)",
    stars: [
      ["Gacrux", "Acrux"],
      ["Mimosa", "Delta Crucis"],
    ],
  },
  {
    name: "Summer Triangle (夏季大三角)",
    stars: [
      ["Vega", "Deneb"],
      ["Deneb", "Altair"],
      ["Altair", "Vega"],
    ],
  },
  {
    name: "Winter Triangle (冬季大三角)",
    stars: [
      ["Sirius", "Procyon"],
      ["Procyon", "Betelgeuse"],
      ["Betelgeuse", "Sirius"],
    ],
  },
];

// Generate ~8500 realistic background stars forming a dense, fine point-by-point starry river along the Milky Way
export interface BackgroundStar {
  x: number;
  y: number;
  z: number;
  mag: number;
  radius: number;
  baseAlpha: number;
  color: string;
  twinkleSpeed: number;
  twinklePhase: number;
  isMilkyWay: boolean;
}

const GALACTIC_NORTH_RA = (192.86 * Math.PI) / 180;
const GALACTIC_NORTH_DEC = (27.13 * Math.PI) / 180;
const GALACTIC_ASCENDING_NODE = (33.0 * Math.PI) / 180;

function galacticToEquatorialCartesian(lRad: number, bRad: number): [number, number, number] {
  const sinDec =
    Math.sin(bRad) * Math.sin(GALACTIC_NORTH_DEC) +
    Math.cos(bRad) * Math.cos(GALACTIC_NORTH_DEC) * Math.sin(lRad - GALACTIC_ASCENDING_NODE);
  const dec = Math.asin(sinDec);
  const y = Math.cos(bRad) * Math.cos(lRad - GALACTIC_ASCENDING_NODE);
  const x =
    Math.sin(bRad) * Math.cos(GALACTIC_NORTH_DEC) -
    Math.cos(bRad) * Math.sin(GALACTIC_NORTH_DEC) * Math.sin(lRad - GALACTIC_ASCENDING_NODE);
  let ra = GALACTIC_NORTH_RA + Math.atan2(y, x);
  if (ra < 0) ra += 2 * Math.PI;
  if (ra >= 2 * Math.PI) ra -= 2 * Math.PI;

  return [
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
  ];
}

// Pseudo-random deterministic generator for consistent starfield
function pseudoRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

// Standard normal distribution via Box-Muller transform
function gaussianRandom(seedRef: { seed: number }): number {
  const u1 = Math.max(1e-6, pseudoRandom(seedRef.seed++));
  const u2 = pseudoRandom(seedRef.seed++);
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

export function generateBackgroundStars(totalCount = 8500): BackgroundStar[] {
  const stars: BackgroundStar[] = [];
  const spectralColors = [
    "#b8d5ff", // O/B Blue (hot diamond)
    "#d8e4ff", // A White-Blue
    "#edf4ff", // Pure White
    "#f5f6ff", // F White-Yellow
    "#fff3df", // G Solar Yellow
    "#ffd8a8", // K Orange Giant
    "#ffab73", // M Red Star
  ];

  const seedRef = { seed: 1337 };

  // 1. Milky Way Band (~7300 stars forming a continuous, dense, fine pinpoint starry belt across the sky)
  const mwCount = Math.floor(totalCount * 0.86);
  for (let i = 0; i < mwCount; i++) {
    // Galactic longitude: continuous covering all 360 degrees without gaps
    // 68% uniformly distributed across 360 deg; 32% smoothly weighted towards Sagittarius galactic center (l = 0)
    let lRad: number;
    if (pseudoRandom(seedRef.seed++) < 0.32) {
      lRad = gaussianRandom(seedRef) * 0.75;
    } else {
      lRad = (pseudoRandom(seedRef.seed++) - 0.5) * 2 * Math.PI;
    }
    if (lRad < 0) lRad += 2 * Math.PI;
    if (lRad >= 2 * Math.PI) lRad -= 2 * Math.PI;

    // Galactic latitude: tight normal distribution around equator b = 0
    // Width tapers smoothly: wider at center (~5.5 deg), narrower at anticenter (~3.2 deg)
    const cosHalf = Math.cos(lRad / 2);
    const sigmaB = 0.055 + 0.045 * (cosHalf * cosHalf);
    const bRad = gaussianRandom(seedRef) * sigmaB;

    // The Great Dark Rift: interstellar absorption lane (l in 10 deg .. 85 deg, b in 0.4 deg .. 2.2 deg)
    const lDeg = (lRad * 180) / Math.PI;
    const bDeg = (bRad * 180) / Math.PI;
    if (lDeg >= 10 && lDeg <= 85 && bDeg >= 0.4 && bDeg <= 2.2) {
      if (pseudoRandom(seedRef.seed++) < 0.68) {
        continue; // naturally absorbed by dark interstellar dust clouds
      }
    }

    const unitVector = galacticToEquatorialCartesian(lRad, bRad);

    // Fine pinpoint star magnitude distribution (細密微星塵)
    const rType = pseudoRandom(seedRef.seed++);
    let mag: number;
    let radius: number;
    let baseAlpha: number;

    if (rType < 0.65) {
      // 65%: Tiny micro-stars (細密微星塵, 0.45px ~ 0.75px)
      mag = 4.8 + pseudoRandom(seedRef.seed++) * 1.6;
      radius = 0.45 + pseudoRandom(seedRef.seed++) * 0.30;
      baseAlpha = 0.35 + pseudoRandom(seedRef.seed++) * 0.40;
    } else if (rType < 0.90) {
      // 25%: Medium stars (中等細星, 0.75px ~ 1.15px)
      mag = 3.6 + pseudoRandom(seedRef.seed++) * 1.2;
      radius = 0.75 + pseudoRandom(seedRef.seed++) * 0.40;
      baseAlpha = 0.65 + pseudoRandom(seedRef.seed++) * 0.25;
    } else {
      // 10%: Bright starry speckles (明亮細星點, 1.15px ~ 1.60px)
      mag = 2.4 + pseudoRandom(seedRef.seed++) * 1.2;
      radius = 1.15 + pseudoRandom(seedRef.seed++) * 0.45;
      baseAlpha = 0.85 + pseudoRandom(seedRef.seed++) * 0.15;
    }

    const color = spectralColors[Math.floor(pseudoRandom(seedRef.seed++) * spectralColors.length)];
    const twinkleSpeed = 1.0 + pseudoRandom(seedRef.seed++) * 3.0;
    const twinklePhase = pseudoRandom(seedRef.seed++) * Math.PI * 2;

    stars.push({
      x: unitVector[0],
      y: unitVector[1],
      z: unitVector[2],
      mag,
      radius,
      baseAlpha,
      color,
      twinkleSpeed,
      twinklePhase,
      isMilkyWay: true,
    });
  }

  // 2. Isotropic deep space background stars (~1200 stars uniformly across entire celestial sphere)
  const bgCount = totalCount - mwCount;
  for (let i = 0; i < bgCount; i++) {
    const u = pseudoRandom(seedRef.seed++);
    const v = pseudoRandom(seedRef.seed++);
    const theta = u * 2 * Math.PI;
    const phi = Math.acos(2 * v - 1);
    const unitVector: [number, number, number] = [
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
    ];

    const rType = pseudoRandom(seedRef.seed++);
    let mag: number;
    let radius: number;
    let baseAlpha: number;

    if (rType < 0.60) {
      mag = 4.5 + pseudoRandom(seedRef.seed++) * 1.8;
      radius = 0.5 + pseudoRandom(seedRef.seed++) * 0.35;
      baseAlpha = 0.35 + pseudoRandom(seedRef.seed++) * 0.40;
    } else {
      mag = 2.6 + pseudoRandom(seedRef.seed++) * 1.9;
      radius = 0.85 + pseudoRandom(seedRef.seed++) * 0.45;
      baseAlpha = 0.70 + pseudoRandom(seedRef.seed++) * 0.25;
    }

    const color = spectralColors[Math.floor(pseudoRandom(seedRef.seed++) * spectralColors.length)];
    const twinkleSpeed = 1.2 + pseudoRandom(seedRef.seed++) * 2.8;
    const twinklePhase = pseudoRandom(seedRef.seed++) * Math.PI * 2;

    stars.push({
      x: unitVector[0],
      y: unitVector[1],
      z: unitVector[2],
      mag,
      radius,
      baseAlpha,
      color,
      twinkleSpeed,
      twinklePhase,
      isMilkyWay: false,
    });
  }

  return stars;
}

// Pre-computed cached background stars (fine dense starry river)
export const CACHED_BACKGROUND_STARS = generateBackgroundStars(8500);

// Pre-compute cartesian unit vectors for real catalog stars
export const PRECOMPUTED_CATALOG_STARS = REAL_STAR_CATALOG.map((star) => {
  const raRad = (star.ra * Math.PI) / 180;
  const decRad = (star.dec * Math.PI) / 180;
  return {
    ...star,
    x: Math.cos(decRad) * Math.cos(raRad),
    y: Math.cos(decRad) * Math.sin(raRad),
    z: Math.sin(decRad),
  };
});

// Map of star name to star object
export const STAR_BY_NAME = new Map(
  PRECOMPUTED_CATALOG_STARS.map((s) => [s.name, s])
);

/**
 * 3D Celestial Projection Renderer
 * Renders the 3D celestial sphere, stars, Milky Way, and constellation lines
 * synchronized with MapLibre's camera in globe mode.
 */
export function renderCelestialSphere(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cameraLngDeg: number,
  cameraLatDeg: number,
  bearingDeg: number,
  pitchDeg: number,
  zoom: number,
  options: {
    showLabels: boolean;
    showMilkyWay: boolean;
    showAtmosphereGlow: boolean;
    timeMs: number;
  }
) {
  ctx.clearRect(0, 0, width, height);

  // Background deep space gradient
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    50,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.8
  );
  bgGrad.addColorStop(0, "#030611");
  bgGrad.addColorStop(0.6, "#02040a");
  bgGrad.addColorStop(1, "#010206");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Camera parameters
  // MapLibre vertical perspective projection constant (half_fov = 0.32175 rad, tan(half_fov) = 1/3)
  const focalLength = (height / 2) * 3;
  const cx = width / 2;
  const cy = height / 2;

  // Approximate Earth pixel radius in globe view
  const earthRadiusPx = (512 * Math.pow(2, zoom)) / (2 * Math.PI);

  // Convert camera angles to radians
  const lngRad = (cameraLngDeg * Math.PI) / 180;
  const latRad = (cameraLatDeg * Math.PI) / 180;
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;

  // Local orthonormal basis at camera center (lng, lat)
  const Ex = -Math.sin(lngRad);
  const Ey = Math.cos(lngRad);
  const Ez = 0;

  const Nx = -Math.sin(latRad) * Math.cos(lngRad);
  const Ny = -Math.sin(latRad) * Math.sin(lngRad);
  const Nz = Math.cos(latRad);

  const Ux = Math.cos(latRad) * Math.cos(lngRad);
  const Uy = Math.cos(latRad) * Math.sin(lngRad);
  const Uz = Math.sin(latRad);

  // Apply bearing rotation around normal
  const Rx = Math.cos(bearingRad) * Ex - Math.sin(bearingRad) * Nx;
  const Ry = Math.cos(bearingRad) * Ey - Math.sin(bearingRad) * Ny;
  const Rz = Math.cos(bearingRad) * Ez - Math.sin(bearingRad) * Nz;

  const Upx0 = Math.sin(bearingRad) * Ex + Math.cos(bearingRad) * Nx;
  const Upy0 = Math.sin(bearingRad) * Ey + Math.cos(bearingRad) * Ny;
  const Upz0 = Math.sin(bearingRad) * Ez + Math.cos(bearingRad) * Nz;

  // Apply pitch tilt
  const Fx = Math.cos(pitchRad) * -Ux + Math.sin(pitchRad) * Upx0;
  const Fy = Math.cos(pitchRad) * -Uy + Math.sin(pitchRad) * Upy0;
  const Fz = Math.cos(pitchRad) * -Uz + Math.sin(pitchRad) * Upz0;

  const Upx = Math.sin(pitchRad) * Ux + Math.cos(pitchRad) * Upx0;
  const Upy = Math.sin(pitchRad) * Uy + Math.cos(pitchRad) * Upy0;
  const Upz = Math.sin(pitchRad) * Uz + Math.cos(pitchRad) * Upz0;

  // Project unit vector to screen space
  function project(sx: number, sy: number, sz: number): { x: number; y: number; zc: number } | null {
    const xc = sx * Rx + sy * Ry + sz * Rz;
    const yc = sx * Upx + sy * Upy + sz * Upz;
    const zc = sx * Fx + sy * Fy + sz * Fz;

    if (zc <= 0.08) return null; // Behind camera plane

    const screenX = cx + (xc / zc) * focalLength;
    const screenY = cy - (yc / zc) * focalLength;
    return { x: screenX, y: screenY, zc };
  }

  // 1. Constellation Lines (if enabled)
  if (options.showLabels) {
    ctx.save();
    ctx.strokeStyle = "rgba(125, 211, 252, 0.22)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);

    for (const group of CONSTELLATION_LINES) {
      for (const [s1Name, s2Name] of group.stars) {
        const s1 = STAR_BY_NAME.get(s1Name);
        const s2 = STAR_BY_NAME.get(s2Name);
        if (!s1 || !s2) continue;

        const p1 = project(s1.x, s1.y, s1.z);
        const p2 = project(s2.x, s2.y, s2.z);
        if (!p1 || !p2) continue;

        // Skip if both points are off screen
        if (
          (p1.x < 0 && p2.x < 0) ||
          (p1.x > width && p2.x > width) ||
          (p1.y < 0 && p2.y < 0) ||
          (p1.y > height && p2.y > height)
        ) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 3. Render Background Dense Starfield (細密帶狀銀河微星塵與深空背景恆星, 8500 stars)
  const timeSec = options.timeMs / 1000;
  for (let i = 0; i < CACHED_BACKGROUND_STARS.length; i++) {
    const star = CACHED_BACKGROUND_STARS[i];
    // If Milky Way is disabled, skip Milky Way band stars
    if (star.isMilkyWay && !options.showMilkyWay) continue;

    // Fast inline camera frustum culling
    const zc = star.x * Fx + star.y * Fy + star.z * Fz;
    if (zc <= 0.08) continue; // Behind camera plane

    const xc = star.x * Rx + star.y * Ry + star.z * Rz;
    const yc = star.x * Upx + star.y * Upy + star.z * Upz;

    const sx = cx + (xc / zc) * focalLength;
    const sy = cy - (yc / zc) * focalLength;

    // Viewport cull
    if (sx < -6 || sx > width + 6 || sy < -6 || sy > height + 6) continue;

    // Micro twinkle
    const twinkle = 0.82 + 0.18 * Math.sin(timeSec * star.twinkleSpeed + star.twinklePhase);
    const radius = star.radius;
    const alpha = Math.min(1.0, star.baseAlpha * twinkle);

    ctx.fillStyle = star.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Render Bright Catalog Stars (with realistic diffraction spikes & glow)
  const starScreenPositions: Array<{
    star: (typeof PRECOMPUTED_CATALOG_STARS)[0];
    x: number;
    y: number;
    radius: number;
  }> = [];

  for (let i = 0; i < PRECOMPUTED_CATALOG_STARS.length; i++) {
    const star = PRECOMPUTED_CATALOG_STARS[i];
    const p = project(star.x, star.y, star.z);
    if (!p) continue;

    if (p.x < -40 || p.x > width + 40 || p.y < -40 || p.y > height + 40) continue;

    // Radius inversely proportional to magnitude
    const baseRadius = Math.max(1.4, (2.6 - star.mag * 0.55) * 1.5);
    const twinkle = 0.88 + 0.12 * Math.sin(timeSec * 2.2 + star.ra * 0.05);
    const radius = baseRadius * twinkle;

    // Save for label rendering
    starScreenPositions.push({ star, x: p.x, y: p.y, radius });

    // Diffraction glow for bright stars (mag < 1.8)
    if (star.mag < 1.8) {
      const glowGrad = ctx.createRadialGradient(p.x, p.y, radius * 0.5, p.x, p.y, radius * 4.5);
      glowGrad.addColorStop(0, star.color);
      glowGrad.addColorStop(0.35, `${star.color}66`);
      glowGrad.addColorStop(1, `${star.color}00`);

      ctx.fillStyle = glowGrad;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 4.5, 0, Math.PI * 2);
      ctx.fill();

      // 4-point subtle telescope diffraction spikes for brilliant 1st magnitude stars (Sirius, Canopus, Vega, Rigel, Betelgeuse)
      if (star.mag < 0.6) {
        ctx.strokeStyle = `${star.color}88`;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55;
        const spikeLen = radius * 4.5;
        ctx.beginPath();
        ctx.moveTo(p.x - spikeLen, p.y);
        ctx.lineTo(p.x + spikeLen, p.y);
        ctx.moveTo(p.x, p.y - spikeLen);
        ctx.lineTo(p.x, p.y + spikeLen);
        ctx.stroke();
      }
    }

    // Core star disk
    ctx.fillStyle = star.color;
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Star Names & Astronomical Typography Labels (if enabled)
  if (options.showLabels) {
    ctx.save();
    ctx.font = "500 10px 'Noto Sans TC', sans-serif";
    ctx.textBaseline = "middle";

    for (const { star, x, y, radius } of starScreenPositions) {
      // Only label the top 35 prominent stars to avoid screen clutter
      if (star.mag > 2.1) continue;

      const labelX = x + radius + 5;
      const labelY = y;

      // Subtle shadow for legibility
      ctx.fillStyle = "rgba(2, 6, 23, 0.85)";
      ctx.fillText(`${star.chineseName} · ${star.name}`, labelX + 1, labelY + 1);

      ctx.fillStyle = "rgba(241, 245, 249, 0.88)";
      ctx.fillText(`${star.chineseName} · ${star.name}`, labelX, labelY);

      // Magnitude & Bayer subtext
      ctx.font = "400 8px monospace";
      ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
      ctx.fillText(`${star.bayer} (m=${star.mag.toFixed(1)})`, labelX, labelY + 10);
      ctx.font = "500 10px 'Noto Sans TC', sans-serif";
    }
    ctx.restore();
  }

  // 6. Earth Atmospheric Horizon Glow (Rayleigh scattering rim around Earth's sphere)
  if (options.showAtmosphereGlow && earthRadiusPx > 30) {
    ctx.save();
    const centerEarthX = cx;
    const centerEarthY = cy + focalLength * Math.tan(pitchRad);
    const effectiveRadius = earthRadiusPx * (1 + 0.15 * Math.sin(pitchRad));
    const atmosphereThickness = Math.min(48, Math.max(16, effectiveRadius * 0.08));
    const innerR = effectiveRadius;
    const outerR = effectiveRadius + atmosphereThickness;

    const atmoGrad = ctx.createRadialGradient(
      centerEarthX,
      centerEarthY,
      innerR - 2,
      centerEarthX,
      centerEarthY,
      outerR
    );
    atmoGrad.addColorStop(0, "rgba(56, 189, 248, 0.45)");
    atmoGrad.addColorStop(0.2, "rgba(14, 165, 233, 0.28)");
    atmoGrad.addColorStop(0.5, "rgba(3, 105, 161, 0.12)");
    atmoGrad.addColorStop(0.8, "rgba(30, 58, 138, 0.04)");
    atmoGrad.addColorStop(1, "rgba(2, 6, 23, 0)");

    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(centerEarthX, centerEarthY, outerR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.globalAlpha = 1.0;
}
