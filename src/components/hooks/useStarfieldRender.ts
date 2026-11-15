import React, { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import type { MapMode } from "@/lib/projections";
import { renderCelestialSphere } from "@/lib/starfield";

interface UseStarfieldRenderOptions {
  mapRef: React.RefObject<maplibregl.Map | null>;
  mapMode: MapMode;
  showStarfield: boolean;
  showStarLabels: boolean;
  showMilkyWay: boolean;
  showAtmosphereGlow: boolean;
}

export function useStarfieldRender({
  mapRef,
  mapMode,
  showStarfield,
  showStarLabels,
  showMilkyWay,
  showAtmosphereGlow,
}: UseStarfieldRenderOptions) {
  const starfieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const starfieldRafRef = useRef<number>(0);

  useEffect(() => {
    if (!showStarfield || mapMode !== "globe") {
      if (starfieldRafRef.current) {
        cancelAnimationFrame(starfieldRafRef.current);
        starfieldRafRef.current = 0;
      }
      return;
    }

    let active = true;

    const renderLoop = (timeMs: number) => {
      if (!active) return;
      const map = mapRef.current;
      const canvas = starfieldCanvasRef.current;
      if (map && canvas) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.round(width * dpr);
        const targetH = Math.round(height * dpr);

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          const center = map.getCenter();
          const bearing = map.getBearing();
          const pitch = map.getPitch();
          const zoom = map.getZoom();

          renderCelestialSphere(
            ctx,
            width,
            height,
            center.lng,
            center.lat,
            bearing,
            pitch,
            zoom,
            {
              showLabels: showStarLabels,
              showMilkyWay,
              showAtmosphereGlow,
              timeMs,
            }
          );

          ctx.restore();
        }
      }
      starfieldRafRef.current = requestAnimationFrame(renderLoop);
    };

    starfieldRafRef.current = requestAnimationFrame(renderLoop);

    return () => {
      active = false;
      if (starfieldRafRef.current) {
        cancelAnimationFrame(starfieldRafRef.current);
        starfieldRafRef.current = 0;
      }
    };
  }, [
    mapRef,
    showStarfield,
    showStarLabels,
    showMilkyWay,
    showAtmosphereGlow,
    mapMode,
  ]);

  return { starfieldCanvasRef };
}
