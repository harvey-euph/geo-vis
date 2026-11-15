import React, { useCallback, useMemo, useState } from "react";
import type maplibregl from "maplibre-gl";
import type { AdmLevel, AdminFeature } from "@/lib/fgb-loader";
import { parseBbox } from "@/lib/fgb-loader";
import {
  GROUP_PALETTE,
  type PresetUnionTemplate,
  type RegionUnionGroup,
  type UnionCycleState,
  computeDissolvedGeometry,
} from "@/lib/union-engine";
import {
  type FlatProjectionId,
  type MapMode,
  projectBbox,
} from "@/lib/projections";
import type { SelectionAnalysisResult } from "@/types/geovis";

interface UseUnionManagerOptions {
  selectedTargetIds: Set<string>;
  setSelectedTargetIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  rawFeaturesById: Map<string, AdminFeature>;
  effectiveAdmLevel: AdmLevel;
  setAdmMode: (mode: "auto" | AdmLevel) => void;
  setFocusedCountries: (countries: string[]) => void;
  mapRef: React.RefObject<maplibregl.Map | null>;
  mapMode: MapMode;
  flatProjection: FlatProjectionId;
}

export function useUnionManager({
  selectedTargetIds,
  setSelectedTargetIds,
  rawFeaturesById,
  effectiveAdmLevel,
  setAdmMode,
  setFocusedCountries,
  mapRef,
  mapMode,
  flatProjection,
}: UseUnionManagerOptions) {
  const [unionGroups, setUnionGroups] = useState<RegionUnionGroup[]>([]);
  const [colorIndex, setColorIndex] = useState<number>(0);

  // Resolve what is currently selected: either a single existing group, or multiple items
  const selectionAnalysis = useMemo((): SelectionAnalysisResult => {
    const selectedIds = Array.from(selectedTargetIds);
    if (selectedIds.length === 0) {
      return {
        state: "none",
        cycleState: "separated",
        activeGroup: null,
        resolvedMemberIds: [],
        resolvedFeatures: [],
      };
    }

    // Check if a single existing union group is selected
    if (selectedIds.length === 1) {
      const existingGroup = unionGroups.find((g) => g.id === selectedIds[0]);
      if (existingGroup) {
        const feats = existingGroup.memberIds
          .map((id) => rawFeaturesById.get(id))
          .filter((x): x is AdminFeature => Boolean(x));
        return {
          state: "single-group",
          cycleState: existingGroup.mode,
          activeGroup: existingGroup,
          resolvedMemberIds: existingGroup.memberIds,
          resolvedFeatures: feats,
        };
      }
    }

    // Collect all underlying member shapeIDs across selected items (whether separated or groups)
    const memberIdSet = new Set<string>();
    for (const id of selectedIds) {
      const grp = unionGroups.find((g) => g.id === id);
      if (grp) {
        for (const mId of grp.memberIds) memberIdSet.add(mId);
      } else {
        memberIdSet.add(id);
      }
    }

    const resolvedMemberIds = Array.from(memberIdSet);
    const resolvedFeatures = resolvedMemberIds
      .map((id) => rawFeaturesById.get(id))
      .filter((x): x is AdminFeature => Boolean(x));

    return {
      state: resolvedMemberIds.length >= 2 ? "multi-separated" : "single-separated",
      cycleState: "separated",
      activeGroup: null,
      resolvedMemberIds,
      resolvedFeatures,
    };
  }, [selectedTargetIds, unionGroups, rawFeaturesById]);

  const canCycleUnion =
    selectionAnalysis.activeGroup !== null ||
    selectionAnalysis.resolvedMemberIds.length >= 2;

  /**
   * Core interactive cycle handler:
   * selected items: [Separated -> Grouped (Logical Union) -> Dissolved (Geometric Union) -> Separated]
   */
  const handleCycleUnionState = useCallback(
    (forcedTargetState?: UnionCycleState) => {
      const { cycleState, activeGroup, resolvedMemberIds, resolvedFeatures } =
        selectionAnalysis;

      const nextState: UnionCycleState =
        forcedTargetState ||
        (cycleState === "separated"
          ? "grouped"
          : cycleState === "grouped"
            ? "dissolved"
            : "separated");

      if (nextState === cycleState) return;

      // Transition TO "grouped" (from separated or dissolved)
      if (nextState === "grouped") {
        if (activeGroup) {
          setUnionGroups((prev) =>
            prev.map((g) =>
              g.id === activeGroup.id ? { ...g, mode: "grouped" } : g
            )
          );
          return;
        }
        if (resolvedMemberIds.length < 2) return;

        const newGroupId = `union_${Date.now()}`;
        const memberNames = resolvedFeatures.map(
          (f) => f.properties.shapeName
        );
        const shapeGroups = Array.from(
          new Set(resolvedFeatures.map((f) => f.properties.shapeGroup))
        );
        const color = GROUP_PALETTE[colorIndex % GROUP_PALETTE.length];
        setColorIndex((c) => c + 1);

        const shortLabel =
          memberNames.length <= 3
            ? memberNames.join(" + ")
            : `${memberNames.slice(0, 2).join(" + ")} 等 ${memberNames.length} 區`;

        const newGroup: RegionUnionGroup = {
          id: newGroupId,
          name: shortLabel,
          admLevel: effectiveAdmLevel,
          memberIds: resolvedMemberIds,
          memberNames,
          shapeGroups,
          mode: "grouped",
          color,
        };

        // Remove any old overlapping groups and add the new group
        setUnionGroups((prev) => [
          ...prev.filter(
            (g) => !g.memberIds.some((m) => resolvedMemberIds.includes(m))
          ),
          newGroup,
        ]);
        setSelectedTargetIds(new Set([newGroupId]));
        return;
      }

      // Transition TO "dissolved" (Geometric Union eliminating internal borders)
      if (nextState === "dissolved") {
        if (activeGroup) {
          const dissolvedGeometry = computeDissolvedGeometry(resolvedFeatures);
          setUnionGroups((prev) =>
            prev.map((g) =>
              g.id === activeGroup.id
                ? { ...g, mode: "dissolved", dissolvedGeometry }
                : g
            )
          );
          return;
        }
        if (resolvedMemberIds.length < 2) return;

        const newGroupId = `union_${Date.now()}`;
        const memberNames = resolvedFeatures.map(
          (f) => f.properties.shapeName
        );
        const shapeGroups = Array.from(
          new Set(resolvedFeatures.map((f) => f.properties.shapeGroup))
        );
        const color = GROUP_PALETTE[colorIndex % GROUP_PALETTE.length];
        setColorIndex((c) => c + 1);

        const shortLabel =
          memberNames.length <= 3
            ? memberNames.join(" + ")
            : `${memberNames.slice(0, 2).join(" + ")} 等 ${memberNames.length} 區`;

        const dissolvedGeometry = computeDissolvedGeometry(resolvedFeatures);

        const newGroup: RegionUnionGroup = {
          id: newGroupId,
          name: shortLabel,
          admLevel: effectiveAdmLevel,
          memberIds: resolvedMemberIds,
          memberNames,
          shapeGroups,
          mode: "dissolved",
          color,
          dissolvedGeometry,
        };

        setUnionGroups((prev) => [
          ...prev.filter(
            (g) => !g.memberIds.some((m) => resolvedMemberIds.includes(m))
          ),
          newGroup,
        ]);
        setSelectedTargetIds(new Set([newGroupId]));
        return;
      }

      // Transition TO "separated" (Un-group back into individual selected regions)
      if (nextState === "separated") {
        if (activeGroup) {
          const restoredIds = new Set(activeGroup.memberIds);
          setUnionGroups((prev) =>
            prev.filter((g) => g.id !== activeGroup.id)
          );
          setSelectedTargetIds(restoredIds);
        }
      }
    },
    [selectionAnalysis, colorIndex, effectiveAdmLevel, setSelectedTargetIds]
  );

  // Apply a preset union template
  const handleApplyPresetUnion = useCallback(
    (preset: PresetUnionTemplate) => {
      setAdmMode("ADM0");
      setFocusedCountries([]);

      const feats = preset.shapeIDs
        .map((id) => rawFeaturesById.get(id))
        .filter((x): x is AdminFeature => Boolean(x));
      if (feats.length < 2) return;

      const existing = unionGroups.find((g) => g.id === preset.id);
      const nextMode: "grouped" | "dissolved" =
        existing?.mode === "grouped" ? "dissolved" : "grouped";

      const color =
        existing?.color || GROUP_PALETTE[colorIndex % GROUP_PALETTE.length];
      if (!existing) setColorIndex((c) => c + 1);

      const dissolvedGeometry =
        nextMode === "dissolved" ? computeDissolvedGeometry(feats) : undefined;

      const newGroup: RegionUnionGroup = {
        id: preset.id,
        name: preset.label,
        admLevel: "ADM0",
        memberIds: preset.shapeIDs,
        memberNames: feats.map((f) => f.properties.shapeName),
        shapeGroups: feats.map((f) => f.properties.shapeGroup),
        mode: nextMode,
        color,
        dissolvedGeometry,
      };

      setUnionGroups((prev) => [
        ...prev.filter(
          (g) =>
            g.id !== preset.id &&
            !g.memberIds.some((m) => preset.shapeIDs.includes(m))
        ),
        newGroup,
      ]);
      setSelectedTargetIds(new Set([preset.id]));

      // Fit camera to the preset union
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const f of feats) {
        const b = parseBbox(f.properties.bboxStr);
        minX = Math.min(minX, b[0]);
        minY = Math.min(minY, b[1]);
        maxX = Math.max(maxX, b[2]);
        maxY = Math.max(maxY, b[3]);
      }
      if (mapRef.current && Number.isFinite(minX)) {
        const projBounds = projectBbox(
          [minX, minY, maxX, maxY],
          mapMode,
          flatProjection
        );
        mapRef.current.fitBounds(projBounds, {
          padding: 100,
          maxZoom: 3.5,
          duration: 850,
        });
      }
    },
    [rawFeaturesById, unionGroups, colorIndex, mapMode, flatProjection, setAdmMode, setFocusedCountries, setSelectedTargetIds, mapRef]
  );

  return {
    unionGroups,
    setUnionGroups,
    selectionAnalysis,
    handleCycleUnionState,
    handleApplyPresetUnion,
    canCycleUnion,
  };
}
