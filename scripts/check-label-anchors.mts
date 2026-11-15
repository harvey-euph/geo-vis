/**
 * Norway's label must sit in Innlandet, not on the camera-fit center in Sweden.
 * Run: npm run check:anchors
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLabelAnchorBakedCenter,
  getLabelAnchorCoord,
  getLabelAnchorSpec,
} from "../src/lib/label-anchors.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const nor = getLabelAnchorSpec("NOR");
assert(nor?.kind === "adm1" && nor.name === "Innlandet", "NOR must name Innlandet");

const baked = getLabelAnchorBakedCenter("NOR");
assert(baked !== null, "NOR baked center missing");
const [lng, lat] = baked!;
assert(Math.hypot(lng - 10.42717, lat - 61.44409) < 0.05, "NOR left Innlandet");

const fitLng = (4.5 + 31.06) / 2;
const fitLat = (57.98 + 71.18) / 2;
assert(
  Math.hypot(lng - fitLng, lat - fitLat) > 1,
  "NOR anchor is the camera fit center in Sweden"
);

const hkg = getLabelAnchorCoord("HKG");
assert(
  hkg !== null && Math.hypot(hkg[0] - 114.1694, hkg[1] - 22.3193) < 0.001,
  "HKG coordinate missing"
);

const centroidSrc = readFileSync(join(root, "src/lib/label-manager.ts"), "utf8");
assert(
  !centroidSrc.includes("COUNTRY_PRIMARY_FIT_BBOX[shapeGroup]"),
  "label centroid still uses the camera fit box"
);

console.log("label anchors ok");
