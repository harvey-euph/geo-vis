import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { geojson as fgbGeojson } from "flatgeobuf";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const OUT_DIR = path.join(ROOT, "public", "data");
const BY_COUNTRY_DIR = path.join(OUT_DIR, "by-country");
const TMP_DIR = path.join(OUT_DIR, ".tmp");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(BY_COUNTRY_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

function computeGeometryBbox(geometry) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  if (!geometry || !geometry.coordinates) {
    return [-180, -90, 180, 90];
  }

  const polys =
    geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : geometry.type === "Polygon"
        ? [geometry.coordinates]
        : [];

  for (const poly of polys) {
    for (const ring of poly) {
      for (const pt of ring) {
        const x = pt[0];
        const y = pt[1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!Number.isFinite(minX)) return [-180, -90, 180, 90];
  return [
    Number(minX.toFixed(4)),
    Number(minY.toFixed(4)),
    Number(maxX.toFixed(4)),
    Number(maxY.toFixed(4)),
  ];
}

/**
 * Perpendicular distance from point `pt` to segment `a -> b` in planar [lng, lat] degrees.
 */
function perpDist(pt, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
  const t = Math.max(
    0,
    Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq)
  );
  return Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy));
}

function chainArcLength(pts, start, end) {
  let len = 0;
  for (let i = start; i < end; i++) {
    len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return len;
}

const COS_MAX_BEND = Math.cos((8.5 * Math.PI) / 180);

/**
 * Angle-independent + Double-Cone Corner-Safe straight-line span detector:
 * Checks whether the sub-chain `pts[start..end]` forms a true straight line
 * (horizontal, vertical, or diagonal, including minor survey stair-steps),
 * while strictly rejecting:
 * 1. Meandering rivers and coastlines via the arc/chord ratio.
 * 2. Cross-track deviations exceeding `adaptiveTol`.
 * 3. End-hooks or sharp corners at the start/end of long straight lines via the
 *    scale-invariant double-cone bend angle (`cosTheta >= COS_MAX_BEND`).
 */
function isStraightSpan(pts, start, end, baseEps, maxCapEps) {
  if (end - start <= 1) return true;
  const a = pts[start];
  const b = pts[end];
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (chord < 1e-6) return true;

  const arc = chainArcLength(pts, start, end);
  if (arc / chord > 1.095) return false;

  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  const isAxis =
    (dx > 0.02 && dy / dx < 0.06) || (dy > 0.02 && dx / dy < 0.06);

  const adaptiveTol = Math.min(
    maxCapEps,
    Math.max(baseEps * (isAxis ? 2.2 : 1.5), chord * 0.012)
  );

  const minLegForAngle = baseEps * 0.4;
  const microTol = baseEps * 0.35;

  for (let i = start + 1; i < end; i++) {
    const p = pts[i];
    const d = perpDist(p, a, b);
    if (d > adaptiveTol) return false;

    const ux = p[0] - a[0];
    const uy = p[1] - a[1];
    const vx = b[0] - p[0];
    const vy = b[1] - p[1];
    const l1 = Math.hypot(ux, uy);
    const l2 = Math.hypot(vx, vy);
    const minL = Math.min(l1, l2);

    if (minL >= minLegForAngle) {
      const cosTheta = (ux * vx + uy * vy) / (l1 * l2);
      if (cosTheta < COS_MAX_BEND) return false;
    } else if (d > microTol) {
      return false;
    }
  }
  return true;
}

/**
 * Simplifies an open chain of vertices between two pinned topological junction endpoints.
 * Canonicalizes the traversal direction so two adjacent polygons sharing the exact same
 * boundary chain in opposite winding orders always produce bit-for-bit identical vertices.
 */
function simplifyOpenChain(chain, baseEps, maxCapEps) {
  if (chain.length <= 2) return chain;
  const first = chain[0];
  const last = chain[chain.length - 1];
  const reversed =
    first[0] > last[0] || (first[0] === last[0] && first[1] > last[1]);
  const pts = reversed ? chain.slice().reverse() : chain;

  function rdp(s, e) {
    if (e - s <= 1 || isStraightSpan(pts, s, e, baseEps, maxCapEps)) {
      return [s, e];
    }
    let maxD = -1;
    let idx = s + 1;
    const a = pts[s];
    const b = pts[e];
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], a, b);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    const left = rdp(s, idx);
    const right = rdp(idx, e);
    return left.slice(0, -1).concat(right);
  }

  let keptIndices = rdp(0, pts.length - 1);

  // Fast linear greedy multi-span collapse verified against original chain `pts`
  for (let pass = 0; pass < 2 && keptIndices.length > 2; pass++) {
    const nextKept = [keptIndices[0]];
    let i = 0;
    const m = keptIndices.length;
    while (i < m - 1) {
      const maxSpan = Math.min(m - 1 - i, 48);
      let bestSpan = 1;
      for (let span = maxSpan; span >= 2; span--) {
        if (
          isStraightSpan(
            pts,
            keptIndices[i],
            keptIndices[i + span],
            baseEps,
            maxCapEps
          )
        ) {
          bestSpan = span;
          break;
        }
      }
      i += bestSpan;
      nextKept.push(keptIndices[i]);
    }
    if (nextKept.length === keptIndices.length) break;
    keptIndices = nextKept;
  }

  const out = keptIndices.map((idx) => [
    Number(pts[idx][0].toFixed(4)),
    Number(pts[idx][1].toFixed(4)),
  ]);
  return reversed ? out.reverse() : out;
}

const vKey = (pt) => `${pt[0].toFixed(4)},${pt[1].toFixed(4)}`;

/**
 * Builds a topological vertex-to-features incidence map across all features in a layer
 * so shared boundary endpoints and tri-points are strictly pinned and shared chains
 * are simplified identically on both sides of every border.
 */
function buildTopologyContext(features) {
  const vertFeatures = new Map();
  features.forEach((f, fIdx) => {
    if (!f.geometry || !f.geometry.coordinates) return;
    const polys =
      f.geometry.type === "MultiPolygon"
        ? f.geometry.coordinates
        : f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : [];
    for (const poly of polys) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
          const k = vKey(ring[i]);
          let set = vertFeatures.get(k);
          if (!set) {
            set = new Set();
            vertFeatures.set(k, set);
          }
          set.add(fIdx);
        }
      }
    }
  });

  function edgeSignature(ptA, ptB) {
    const setA = vertFeatures.get(vKey(ptA));
    const setB = vertFeatures.get(vKey(ptB));
    if (!setA || !setB) return "";
    const shared = [];
    for (const idx of setA) {
      if (setB.has(idx)) shared.push(idx);
    }
    shared.sort((a, b) => a - b);
    return shared.join("|");
  }

  function optimizeRingTopologically(ring, baseEps, maxCapEps) {
    if (!ring || ring.length <= 4) return ring;
    const open = ring.slice(0, -1);
    const n = open.length;
    if (n <= 3) return ring;

    const edgeSigs = new Array(n);
    for (let i = 0; i < n; i++) {
      edgeSigs[i] = edgeSignature(open[i], open[(i + 1) % n]);
    }

    const junctionIndices = [];
    for (let i = 0; i < n; i++) {
      const deg = vertFeatures.get(vKey(open[i]))?.size || 1;
      if (deg >= 3 || edgeSigs[(i - 1 + n) % n] !== edgeSigs[i]) {
        junctionIndices.push(i);
      }
    }

    if (junctionIndices.length === 0) {
      let minIdx = 0;
      let maxIdx = 0;
      let minSum = Infinity;
      let maxSum = -Infinity;
      for (let i = 0; i < n; i++) {
        const s = open[i][0] + open[i][1];
        if (s < minSum) {
          minSum = s;
          minIdx = i;
        }
        if (s > maxSum) {
          maxSum = s;
          maxIdx = i;
        }
      }
      if (minIdx === maxIdx) return ring;
      junctionIndices.push(Math.min(minIdx, maxIdx), Math.max(minIdx, maxIdx));
    } else if (junctionIndices.length === 1) {
      const j0 = junctionIndices[0];
      let farIdx = (j0 + Math.floor(n / 2)) % n;
      let maxD = -1;
      for (let i = 0; i < n; i++) {
        if (i === j0) continue;
        const d = Math.hypot(
          open[i][0] - open[j0][0],
          open[i][1] - open[j0][1]
        );
        if (d > maxD) {
          maxD = d;
          farIdx = i;
        }
      }
      junctionIndices.push(farIdx);
      junctionIndices.sort((a, b) => a - b);
    }

    const out = [];
    const kCount = junctionIndices.length;
    for (let k = 0; k < kCount; k++) {
      const startIdx = junctionIndices[k];
      const endIdx = junctionIndices[(k + 1) % kCount];
      const chain = [];
      let idx = startIdx;
      while (idx !== endIdx) {
        chain.push(open[idx]);
        idx = (idx + 1) % n;
      }
      chain.push(open[endIdx]);
      const simpChain = simplifyOpenChain(chain, baseEps, maxCapEps);
      for (let m = 0; m < simpChain.length - 1; m++) {
        out.push(simpChain[m]);
      }
    }

    if (out.length < 3) return ring;
    return [...out, out[0]];
  }

  function optimizeGeometry(geometry, baseEps, maxCapEps) {
    if (!geometry || !geometry.coordinates) return geometry;
    if (geometry.type === "Polygon") {
      return {
        type: "Polygon",
        coordinates: geometry.coordinates.map((ring) =>
          optimizeRingTopologically(ring, baseEps, maxCapEps)
        ),
      };
    }
    if (geometry.type === "MultiPolygon") {
      return {
        type: "MultiPolygon",
        coordinates: geometry.coordinates.map((poly) =>
          poly.map((ring) =>
            optimizeRingTopologically(ring, baseEps, maxCapEps)
          )
        ),
      };
    }
    return geometry;
  }

  return { optimizeGeometry };
}

/**
 * Use mapshaper in planar Douglas-Peucker (`planar dp`) mode so lines of constant
 * latitude, constant longitude, and linear diagonals are simplified in [lng, lat] space.
 */
function simplifyWithMapshaper(inputPath, outputPath, intervalDegrees) {
  const mapshaperBin = path.join(
    ROOT,
    "node_modules",
    "mapshaper",
    "bin",
    "mapshaper"
  );
  console.log(
    `[mapshaper] Simplifying ${path.basename(inputPath)} (planar dp interval=${intervalDegrees}°)...`
  );
  const t0 = Date.now();
  execFileSync(
    process.execPath,
    [
      "--max-old-space-size=8192",
      mapshaperBin,
      "-i",
      inputPath,
      "-simplify",
      "planar",
      "dp",
      `interval=${intervalDegrees}`,
      "keep-shapes",
      "-clean",
      "sliver-control=0",
      "rewind",
      "-o",
      "precision=0.0001",
      "format=geojson",
      "force",
      outputPath,
    ],
    { stdio: "inherit" }
  );
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const sizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
  console.log(`[mapshaper] Done in ${dt}s -> ${sizeMB} MB`);
}

function validGeometry(geom) {
  if (!geom || !geom.coordinates) return false;
  if (geom.type === "Polygon") {
    return geom.coordinates.length > 0 && geom.coordinates[0].length >= 4;
  }
  if (geom.type === "MultiPolygon") {
    return (
      geom.coordinates.length > 0 &&
      geom.coordinates.some((poly) => poly.length > 0 && poly[0].length >= 4)
    );
  }
  return false;
}

function countGeometryVertices(geom) {
  const polys =
    geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  let count = 0;
  for (const poly of polys) {
    for (const ring of poly) {
      count += Math.max(0, ring.length - 1);
    }
  }
  return count;
}

async function main() {
  const tmpAdm0 = path.join(TMP_DIR, "adm0.geojson");
  const tmpAdm1 = path.join(TMP_DIR, "adm1.geojson");
  const tmpAdm2 = path.join(TMP_DIR, "adm2.geojson");

  // Step 1: Simplify raw GeoJSONs with planar Douglas-Peucker
  simplifyWithMapshaper(
    path.join(DATA_DIR, "geoBoundariesCGAZ_ADM0.geojson"),
    tmpAdm0,
    0.012
  );
  simplifyWithMapshaper(
    path.join(DATA_DIR, "geoBoundariesCGAZ_ADM1.geojson"),
    tmpAdm1,
    0.005
  );
  simplifyWithMapshaper(
    path.join(DATA_DIR, "geoBoundariesCGAZ_ADM2.geojson"),
    tmpAdm2,
    0.004
  );

  // Step 2: Process ADM0 + Topological Straight-Line Optimization
  console.log(
    "[preprocess] Optimizing straight lines topologically & encoding ADM0 -> FlatGeobuf..."
  );
  const adm0Raw = JSON.parse(fs.readFileSync(tmpAdm0, "utf-8"));
  const adm0Topo = buildTopologyContext(adm0Raw.features);
  const countryMeta = {};
  const adm0Features = [];
  let adm0VertsBefore = 0;
  let adm0VertsAfter = 0;

  for (const feat of adm0Raw.features) {
    if (!validGeometry(feat.geometry)) continue;
    adm0VertsBefore += countGeometryVertices(feat.geometry);
    const optGeom = adm0Topo.optimizeGeometry(feat.geometry, 0.012, 0.05);
    if (!validGeometry(optGeom)) continue;
    adm0VertsAfter += countGeometryVertices(optGeom);

    const shapeGroup = String(feat.properties?.shapeGroup || "UNK");
    const shapeName = String(feat.properties?.shapeName || shapeGroup);
    const shapeID = `ADM0_${shapeGroup}`;
    const bbox = computeGeometryBbox(optGeom);

    countryMeta[shapeGroup] = {
      shapeGroup,
      shapeName,
      shapeID,
      bbox,
      adm1Count: 0,
      adm2Count: 0,
    };

    adm0Features.push({
      type: "Feature",
      properties: {
        shapeID,
        shapeGroup,
        shapeName,
        shapeType: "ADM0",
        adm0Name: shapeName,
        bboxStr: JSON.stringify(bbox),
      },
      geometry: optGeom,
    });
  }

  const adm0Fgb = fgbGeojson.serialize({
    type: "FeatureCollection",
    features: adm0Features,
  });
  const adm0OutPath = path.join(OUT_DIR, "adm0.fgb");
  fs.writeFileSync(adm0OutPath, Buffer.from(adm0Fgb));
  console.log(
    `[preprocess] Wrote adm0.fgb (${(adm0Fgb.byteLength / (1024 * 1024)).toFixed(2)} MB, ${adm0Features.length} features, vertices: ${adm0VertsBefore} -> ${adm0VertsAfter})`
  );

  // Step 3: Process ADM1 + Topological Straight-Line Optimization
  console.log(
    "[preprocess] Optimizing straight lines topologically & encoding ADM1 -> FlatGeobuf..."
  );
  const adm1Raw = JSON.parse(fs.readFileSync(tmpAdm1, "utf-8"));
  const adm1Topo = buildTopologyContext(adm1Raw.features);
  const adm1Features = [];
  const adm1ByCountry = new Map();
  let adm1VertsBefore = 0;
  let adm1VertsAfter = 0;

  for (const feat of adm1Raw.features) {
    if (!validGeometry(feat.geometry)) continue;
    adm1VertsBefore += countGeometryVertices(feat.geometry);
    const optGeom = adm1Topo.optimizeGeometry(feat.geometry, 0.008, 0.05);
    if (!validGeometry(optGeom)) continue;
    adm1VertsAfter += countGeometryVertices(optGeom);

    const shapeGroup = String(feat.properties?.shapeGroup || "UNK");
    const shapeName = String(feat.properties?.shapeName || "Unknown ADM1");
    const shapeID = String(
      feat.properties?.shapeID || `ADM1_${shapeGroup}_${adm1Features.length}`
    );
    const adm0Name = countryMeta[shapeGroup]?.shapeName || shapeGroup;
    const bbox = computeGeometryBbox(optGeom);

    if (countryMeta[shapeGroup]) {
      countryMeta[shapeGroup].adm1Count += 1;
    }

    const normalized = {
      type: "Feature",
      properties: {
        shapeID,
        shapeGroup,
        shapeName,
        shapeType: "ADM1",
        adm0Name,
        bboxStr: JSON.stringify(bbox),
      },
      geometry: optGeom,
    };

    adm1Features.push(normalized);
    if (!adm1ByCountry.has(shapeGroup)) {
      adm1ByCountry.set(shapeGroup, []);
    }
    adm1ByCountry.get(shapeGroup).push(normalized);
  }

  const adm1Fgb = fgbGeojson.serialize({
    type: "FeatureCollection",
    features: adm1Features,
  });
  const adm1OutPath = path.join(OUT_DIR, "adm1.fgb");
  fs.writeFileSync(adm1OutPath, Buffer.from(adm1Fgb));
  console.log(
    `[preprocess] Wrote adm1.fgb (${(adm1Fgb.byteLength / (1024 * 1024)).toFixed(2)} MB, ${adm1Features.length} features, vertices: ${adm1VertsBefore} -> ${adm1VertsAfter})`
  );

  for (const [shapeGroup, feats] of adm1ByCountry.entries()) {
    const cDir = path.join(BY_COUNTRY_DIR, shapeGroup);
    fs.mkdirSync(cDir, { recursive: true });
    const bytes = fgbGeojson.serialize({
      type: "FeatureCollection",
      features: feats,
    });
    fs.writeFileSync(path.join(cDir, "adm1.fgb"), Buffer.from(bytes));
  }

  adm1Raw.features = [];
  adm1Features.length = 0;
  adm1ByCountry.clear();

  // Step 4: Process ADM2 + Topological Straight-Line Optimization
  console.log(
    "[preprocess] Optimizing straight lines topologically & encoding ADM2 -> FlatGeobuf..."
  );
  const adm2Raw = JSON.parse(fs.readFileSync(tmpAdm2, "utf-8"));
  const adm2Topo = buildTopologyContext(adm2Raw.features);
  const adm2Features = [];
  const adm2ByCountry = new Map();
  let adm2VertsBefore = 0;
  let adm2VertsAfter = 0;

  for (const feat of adm2Raw.features) {
    if (!validGeometry(feat.geometry)) continue;
    adm2VertsBefore += countGeometryVertices(feat.geometry);
    const optGeom = adm2Topo.optimizeGeometry(feat.geometry, 0.005, 0.025);
    if (!validGeometry(optGeom)) continue;
    adm2VertsAfter += countGeometryVertices(optGeom);

    const shapeGroup = String(feat.properties?.shapeGroup || "UNK");
    const shapeName = String(feat.properties?.shapeName || "Unknown ADM2");
    const shapeID = String(
      feat.properties?.shapeID || `ADM2_${shapeGroup}_${adm2Features.length}`
    );
    const adm0Name = countryMeta[shapeGroup]?.shapeName || shapeGroup;
    const bbox = computeGeometryBbox(optGeom);

    if (countryMeta[shapeGroup]) {
      countryMeta[shapeGroup].adm2Count += 1;
    }

    const normalized = {
      type: "Feature",
      properties: {
        shapeID,
        shapeGroup,
        shapeName,
        shapeType: "ADM2",
        adm0Name,
        bboxStr: JSON.stringify(bbox),
      },
      geometry: optGeom,
    };

    adm2Features.push(normalized);
    if (!adm2ByCountry.has(shapeGroup)) {
      adm2ByCountry.set(shapeGroup, []);
    }
    adm2ByCountry.get(shapeGroup).push(normalized);
  }

  const adm2Fgb = fgbGeojson.serialize({
    type: "FeatureCollection",
    features: adm2Features,
  });
  const adm2OutPath = path.join(OUT_DIR, "adm2.fgb");
  fs.writeFileSync(adm2OutPath, Buffer.from(adm2Fgb));
  console.log(
    `[preprocess] Wrote adm2.fgb (${(adm2Fgb.byteLength / (1024 * 1024)).toFixed(2)} MB, ${adm2Features.length} features, vertices: ${adm2VertsBefore} -> ${adm2VertsAfter})`
  );

  for (const [shapeGroup, feats] of adm2ByCountry.entries()) {
    const cDir = path.join(BY_COUNTRY_DIR, shapeGroup);
    fs.mkdirSync(cDir, { recursive: true });
    const bytes = fgbGeojson.serialize({
      type: "FeatureCollection",
      features: feats,
    });
    fs.writeFileSync(path.join(cDir, "adm2.fgb"), Buffer.from(bytes));
  }

  // Step 5: Write metadata.json
  const metadataPath = path.join(OUT_DIR, "metadata.json");
  const sortedCountries = Object.values(countryMeta).sort((a, b) =>
    a.shapeName.localeCompare(b.shapeName)
  );
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        counts: {
          ADM0: adm0Features.length,
          ADM1: sortedCountries.reduce((acc, c) => acc + c.adm1Count, 0),
          ADM2: sortedCountries.reduce((acc, c) => acc + c.adm2Count, 0),
        },
        countries: sortedCountries,
      },
      null,
      2
    )
  );

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log("[preprocess] All done!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
