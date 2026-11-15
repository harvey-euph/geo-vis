import React from "react";
import { Info, Sparkles, Trash2 } from "lucide-react";
import type { AdminFeature } from "@/lib/fgb-loader";
import {
  PRESET_UNIONS,
  type PresetUnionTemplate,
  type RegionUnionGroup,
  computeDissolvedGeometry,
} from "@/lib/union-engine";

interface RightDevSidebarProps {
  unionGroups: RegionUnionGroup[];
  selectedTargetIds: Set<string>;
  rawFeaturesById: Map<string, AdminFeature>;
  onSelectGroup: (id: string) => void;
  onRemoveGroup: (id: string) => void;
  onUpdateGroup: (updater: (prev: RegionUnionGroup[]) => RegionUnionGroup[]) => void;
  onApplyPresetUnion: (preset: PresetUnionTemplate) => void;
}

export function RightDevSidebar({
  unionGroups,
  selectedTargetIds,
  rawFeaturesById,
  onSelectGroup,
  onRemoveGroup,
  onUpdateGroup,
  onApplyPresetUnion,
}: RightDevSidebarProps) {
  return (
    <aside className="pointer-events-none absolute top-20 right-3 z-10 flex max-h-[calc(100vh-11rem)] w-80 flex-col gap-3">
      <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-emerald-500/40 bg-slate-900/85 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-800 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-bold tracking-wide text-white">
              多區域 Union 與群組管理
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
              DEV
            </span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {unionGroups.length} 個群組
            </span>
          </div>
        </div>

        <div className="overflow-y-auto p-3 space-y-3">
          {/* Active Union Groups List */}
          {unionGroups.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-slate-400">
                已建立的 Union 目標 (點擊可選取或切換模式)
              </div>
              {unionGroups.map((grp) => {
                const isSel = selectedTargetIds.has(grp.id);
                return (
                  <div
                    key={grp.id}
                    onClick={() => onSelectGroup(grp.id)}
                    className={`cursor-pointer rounded-xl border p-2.5 transition ${
                      isSel
                        ? "border-sky-500/80 bg-sky-500/10"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: grp.color }}
                        />
                        <span className="truncate text-xs font-semibold text-white">
                          {grp.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveGroup(grp.id);
                        }}
                        title="解散此群組"
                        className="rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-1.5 text-[11px] text-slate-400 line-clamp-2">
                      成員 ({grp.memberIds.length}):{" "}
                      {grp.memberNames.join("、")}
                    </div>

                    {/* Per-group cycle buttons */}
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateGroup((prev) =>
                            prev.map((g) =>
                              g.id === grp.id ? { ...g, mode: "grouped" } : g
                            )
                          );
                          onSelectGroup(grp.id);
                        }}
                        className={`flex-1 rounded-md py-1 text-[10px] font-medium transition cursor-pointer ${
                          grp.mode === "grouped"
                            ? "bg-emerald-500 text-slate-950 font-semibold"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        邏輯群組 (Grouped)
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const feats = grp.memberIds
                            .map((id) => rawFeaturesById.get(id))
                            .filter((x): x is AdminFeature => Boolean(x));
                          const dissolvedGeometry =
                            grp.dissolvedGeometry ||
                            computeDissolvedGeometry(feats);
                          onUpdateGroup((prev) =>
                            prev.map((g) =>
                              g.id === grp.id
                                ? {
                                    ...g,
                                    mode: "dissolved",
                                    dissolvedGeometry,
                                  }
                                : g
                            )
                          );
                          onSelectGroup(grp.id);
                        }}
                        className={`flex-1 rounded-md py-1 text-[10px] font-medium transition cursor-pointer ${
                          grp.mode === "dissolved"
                            ? "bg-amber-500 text-slate-950 font-semibold"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        幾何合併 (Dissolved)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
              <div className="flex items-center gap-1.5 font-medium text-slate-300 mb-1">
                <Info className="h-3.5 w-3.5 text-sky-400" />
                如何建立多區域 Union？
              </div>
              <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                <li>
                  開啟下方「多選模式」或按住{" "}
                  <kbd className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">
                    Shift
                  </kbd>{" "}
                  點擊多個國家/行政區。
                </li>
                <li>
                  點擊下方「循環切換狀態 (快捷鍵 U)」，即可在{" "}
                  <span className="text-emerald-300">
                    Grouped (邏輯群組連動)
                  </span>{" "}
                  →{" "}
                  <span className="text-amber-300">
                    Dissolved (幾何合併消界)
                  </span>{" "}
                  →{" "}
                  <span className="text-slate-200">Separated (獨立)</span>{" "}
                  間切換！
                </li>
              </ol>
            </div>
          )}

          {/* Preset Union Templates */}
          <div className="pt-1">
            <div className="mb-1.5 text-[11px] font-semibold text-slate-400">
              快速範例 Union (點擊建立 / 再次點擊切換幾何消界)
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {PRESET_UNIONS.map((preset) => {
                const existing = unionGroups.find((g) => g.id === preset.id);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onApplyPresetUnion(preset)}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-left text-xs transition hover:border-slate-700 hover:bg-slate-800/60 cursor-pointer"
                  >
                    <div>
                      <div className="font-medium text-slate-200">
                        {preset.label}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {preset.description}
                      </div>
                    </div>
                    <span
                      className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        existing?.mode === "dissolved"
                          ? "bg-amber-500/20 text-amber-300"
                          : existing?.mode === "grouped"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {existing?.mode === "dissolved"
                        ? "已幾何合併"
                        : existing?.mode === "grouped"
                          ? "邏輯群組中"
                          : "套用"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
