import type maplibregl from "maplibre-gl";
import { EMPTY_FC } from "@/types/geovis";

export function createMapSources(
  initialEnvelope?: GeoJSON.FeatureCollection,
  initialGraticule?: GeoJSON.FeatureCollection
): Record<string, maplibregl.GeoJSONSourceSpecification> {
  return {
    "ocean-envelope": {
      type: "geojson",
      data: initialEnvelope || EMPTY_FC,
    },
    graticule: {
      type: "geojson",
      data: initialGraticule || EMPTY_FC,
    },
    "context-adm0": {
      type: "geojson",
      data: EMPTY_FC,
    },
    "polygon-vertices": {
      type: "geojson",
      data: EMPTY_FC,
    },
    "hovered-vertex": {
      type: "geojson",
      data: EMPTY_FC,
    },
    "region-labels": {
      type: "geojson",
      data: EMPTY_FC,
    },
    "active-regions": {
      type: "geojson",
      data: EMPTY_FC,
      promoteId: "targetId",
    },
  };
}

export function createMapLayers(): maplibregl.LayerSpecification[] {
  return [
    {
      id: "space-background",
      type: "background",
      paint: {
        "background-color": "#050914",
        "background-opacity": 0,
      },
    },
    {
      id: "ocean-fill",
      type: "fill",
      source: "ocean-envelope",
      paint: {
        "fill-color": "#0b192c",
        "fill-opacity": 1.0,
      },
    },
    {
      id: "ocean-outline",
      type: "line",
      source: "ocean-envelope",
      paint: {
        "line-color": "#1e3a5f",
        "line-width": 1.5,
      },
    },
    {
      id: "graticule-lines",
      type: "line",
      source: "graticule",
      paint: {
        "line-color": [
          "match",
          ["get", "kind"],
          "equator",
          "#38bdf8",
          "prime-meridian",
          "#38bdf8",
          "#1e293b",
        ],
        "line-width": [
          "match",
          ["get", "kind"],
          "equator",
          1.1,
          "prime-meridian",
          1.1,
          0.6,
        ],
        "line-opacity": [
          "match",
          ["get", "kind"],
          "equator",
          0.45,
          "prime-meridian",
          0.45,
          0.55,
        ],
        "line-dasharray": [2, 2],
      },
    },
    // Context ADM0 layer when zoomed into ADM1/ADM2
    {
      id: "context-adm0-fill",
      type: "fill",
      source: "context-adm0",
      paint: {
        "fill-color": "#0f172a",
        "fill-opacity": 0.65,
      },
    },
    {
      id: "context-adm0-line",
      type: "line",
      source: "context-adm0",
      paint: {
        "line-color": "#334155",
        "line-width": 0.8,
        "line-opacity": 0.6,
      },
    },
    // Active Interactive Regions Fill (uses GPU feature-state for zero-latency hover & selection!)
    {
      id: "regions-fill",
      type: "fill",
      source: "active-regions",
      paint: {
        "fill-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          [
            "case",
            ["boolean", ["get", "isCapital"], false],
            "#f59e0b",
            ["==", ["get", "drilldownRole"], "hovered"],
            "#a855f7",
            ["==", ["get", "drilldownRole"], "clicked"],
            "#10b981",
            ["==", ["get", "drilldownRole"], "wide-context"],
            "#38bdf8",
            "#0284c7",
          ],
          ["boolean", ["feature-state", "selected"], false],
          "#38bdf8",
          ["==", ["get", "unionMode"], "dissolved"],
          ["to-color", ["get", "groupColor"], "#f59e0b"],
          ["==", ["get", "unionMode"], "grouped"],
          ["to-color", ["get", "groupColor"], "#10b981"],
          // Capital distinct color when country is selected
          ["boolean", ["get", "isCapital"], false],
          "#d97706",
          // Clicked / Pinned center: Emerald / Teal
          ["==", ["get", "drilldownRole"], "clicked"],
          [
            "case",
            ["==", ["get", "shapeType"], "ADM2"],
            "#042f2e",
            ["==", ["get", "shapeType"], "ADM1"],
            "#064e3b",
            "#0f766e",
          ],
          // Hovered center: Violet / Purple
          ["==", ["get", "drilldownRole"], "hovered"],
          [
            "case",
            ["==", ["get", "shapeType"], "ADM2"],
            "#3b0764",
            ["==", ["get", "shapeType"], "ADM1"],
            "#312e81",
            "#4338ca",
          ],
          // Wide context ADM2: Dark slate
          ["==", ["get", "drilldownRole"], "wide-context"],
          "#0f172a",
          // Base colors:
          ["==", ["get", "shapeType"], "ADM0"],
          "#1e293b",
          ["==", ["get", "shapeType"], "ADM1"],
          "#172554",
          "#1e1b4b",
        ],
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.85,
          ["boolean", ["feature-state", "selected"], false],
          0.75,
          ["==", ["get", "unionMode"], "dissolved"],
          0.55,
          ["==", ["get", "unionMode"], "grouped"],
          0.42,
          ["boolean", ["get", "isCapital"], false],
          0.88,
          ["==", ["get", "drilldownRole"], "wide-context"],
          0.65,
          0.8,
        ],
      },
    },
    // Base border lines
    {
      id: "regions-line",
      type: "line",
      source: "active-regions",
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "unionMode"], "dissolved"],
          ["to-color", ["get", "groupColor"], "#fbbf24"],
          ["==", ["get", "unionMode"], "grouped"],
          ["to-color", ["get", "groupColor"], "#34d399"],
          ["boolean", ["get", "isCapital"], false],
          "#fbbf24",
          ["==", ["get", "drilldownRole"], "clicked"],
          [
            "case",
            ["==", ["get", "shapeType"], "ADM2"],
            "#14b8a6",
            ["==", ["get", "shapeType"], "ADM1"],
            "#10b981",
            "#059669",
          ],
          ["==", ["get", "drilldownRole"], "hovered"],
          [
            "case",
            ["==", ["get", "shapeType"], "ADM2"],
            "#c084fc",
            ["==", ["get", "shapeType"], "ADM1"],
            "#818cf8",
            "#a855f7",
          ],
          ["==", ["get", "drilldownRole"], "wide-context"],
          "#334155",
          ["==", ["get", "shapeType"], "ADM0"],
          "#475569",
          ["==", ["get", "shapeType"], "ADM1"],
          "#3b82f6",
          "#6366f1",
        ],
        "line-width": [
          "case",
          ["==", ["get", "unionMode"], "dissolved"],
          2.2,
          ["==", ["get", "unionMode"], "grouped"],
          1.4,
          ["boolean", ["get", "isCapital"], false],
          1.8,
          ["==", ["get", "drilldownRole"], "clicked"],
          [
            "case",
            ["==", ["get", "shapeType"], "ADM2"],
            0.75,
            ["==", ["get", "shapeType"], "ADM1"],
            1.2,
            1.4,
          ],
          ["==", ["get", "drilldownRole"], "hovered"],
          [
            "case",
            ["==", ["get", "shapeType"], "ADM2"],
            0.75,
            ["==", ["get", "shapeType"], "ADM1"],
            1.2,
            1.4,
          ],
          ["==", ["get", "drilldownRole"], "wide-context"],
          0.5,
          ["==", ["get", "shapeType"], "ADM0"],
          0.9,
          ["==", ["get", "shapeType"], "ADM1"],
          0.75,
          0.55,
        ],
        "line-opacity": 0.9,
      },
    },
    // GPU feature-state Selected outline (no CPU filter rebuilds!)
    {
      id: "regions-selected-line",
      type: "line",
      source: "active-regions",
      paint: {
        "line-color": "#38bdf8",
        "line-width": 2.4,
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          1,
          0,
        ],
      },
    },
    // GPU feature-state Hover outline (no CPU filter rebuilds!)
    {
      id: "regions-hover-line",
      type: "line",
      source: "active-regions",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["get", "isCapital"], false],
          "#fef08a",
          ["==", ["get", "drilldownRole"], "clicked"],
          "#6ee7b7",
          ["==", ["get", "drilldownRole"], "hovered"],
          "#f0abfc",
          ["==", ["get", "drilldownRole"], "wide-context"],
          "#38bdf8",
          "#f8fafc",
        ],
        "line-width": 2.2,
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          1,
          0,
        ],
      },
    },
    // Region Center Labels (Text / Image / ISO3 Badges for ADM0, ADM1, ADM2)
    {
      id: "region-labels-symbol",
      type: "symbol",
      source: "region-labels",
      layout: {
        "icon-image": ["get", "iconId"],
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1.0,
          0.75,
          3.0,
          1.0,
          6.0,
          1.15,
        ],
        "icon-allow-overlap": false,
        "icon-ignore-placement": false,
        "icon-padding": 3,
        "symbol-sort-key": ["coalesce", ["get", "sortKey"], 500],
        "icon-pitch-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
        "symbol-placement": "point",
      },
      paint: {
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0.8,
          0.85,
          2.0,
          1.0,
        ],
      },
    },
    // Dev Mode: Polygon Vertices (points)
    {
      id: "polygon-vertices-circle",
      type: "circle",
      source: "polygon-vertices",
      layout: {
        visibility: "none",
      },
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1,
          2,
          4,
          3.5,
          7,
          4.8,
          10,
          6,
          14,
          7.5,
        ],
        "circle-color": [
          "case",
          ["boolean", ["get", "isAbnormalJump"], false],
          "#f43f5e",
          "#38bdf8",
        ],
        "circle-stroke-width": 1.2,
        "circle-stroke-color": [
          "case",
          ["boolean", ["get", "isAbnormalJump"], false],
          "#ffe4e6",
          "#ffffff",
        ],
        "circle-opacity": 0.95,
      },
    },
    // Highlighted / Hovered Vertex Glow
    {
      id: "hovered-vertex-glow",
      type: "circle",
      source: "hovered-vertex",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1,
          8,
          6,
          14,
          12,
          20,
        ],
        "circle-color": "#f59e0b",
        "circle-opacity": 0.5,
        "circle-blur": 0.6,
      },
    },
    // Highlighted / Hovered Vertex Dot
    {
      id: "hovered-vertex-circle",
      type: "circle",
      source: "hovered-vertex",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1,
          4,
          6,
          6,
          12,
          8,
        ],
        "circle-color": "#fbbf24",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#ffffff",
      },
    },
  ];
}
