import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { DiskMountInfo } from "../types";
import { formatSize } from "../types";
import { useTranslation } from "../i18n/useTranslation";

interface DiskMountChartProps {
  mounts: DiskMountInfo[];
}

const CHART_SIZE = 140;

function donutOption(used: number, free: number): EChartsOption {
  return {
    series: [
      {
        type: "pie",
        radius: ["58%", "82%"],
        center: ["50%", "50%"],
        silent: true,
        emphasis: { disabled: true },
        label: { show: false },
        itemStyle: { borderColor: "#fff", borderWidth: 2 },
        data: [
          { value: Math.max(used, 1), name: "used", itemStyle: { color: "#d4a574" } },
          { value: Math.max(free, 1), name: "free", itemStyle: { color: "#7cb798" } },
        ],
      },
    ],
  };
}

const DiskMountChart: React.FC<DiskMountChartProps> = ({ mounts }) => {
  const { t } = useTranslation();

  const charts = useMemo(
    () =>
      mounts.map((m) => {
        const usedSpace = m.total_space - m.available_space;
        const pct =
          m.total_space > 0
            ? ((usedSpace / m.total_space) * 100).toFixed(1)
            : "0";
        const opt = donutOption(usedSpace, m.available_space);

        return { mount: m, option: opt, pct, usedSpace };
      }),
    [mounts]
  );

  if (mounts.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 font-display text-lg font-semibold text-moss-800">
        {t("disk.mountPoints")}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {charts.map(({ mount, option, pct, usedSpace }) => {
          const kindLabel =
            mount.kind === "SSD"
              ? t("disk.ssd")
              : mount.kind === "HDD"
                ? t("disk.hdd")
                : t("disk.unknown");

          return (
            <div
              key={mount.mount_point}
              className="flex items-center gap-4 rounded-2xl border border-moss-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm"
            >
              {/* Donut */}
              <div className="relative shrink-0" style={{ width: CHART_SIZE, height: CHART_SIZE }}>
                <ReactECharts
                  option={option}
                  style={{ width: CHART_SIZE, height: CHART_SIZE }}
                  opts={{ renderer: "canvas" }}
                  notMerge
                  lazyUpdate
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-lg font-semibold text-ink">
                    {pct}%
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink" title={mount.mount_point}>
                    {mount.mount_point === "/" ? "Macintosh HD" : mount.mount_point.split("/").filter(Boolean).pop() || mount.mount_point}
                  </span>
                  {mount.is_removable && (
                    <span className="shrink-0 rounded-md bg-sand-200 px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                      {t("disk.removable")}
                    </span>
                  )}
                </div>

                <div className="mt-0.5 font-mono text-xs text-ink-soft">
                  {formatSize(usedSpace)} / {formatSize(mount.total_space)}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-moss-100 px-1.5 py-0.5 text-[10px] font-medium text-moss-700">
                    {kindLabel}
                  </span>
                  <span className="rounded-md bg-moss-100 px-1.5 py-0.5 text-[10px] font-mono text-moss-700 uppercase">
                    {mount.file_system}
                  </span>
                </div>

                <div className="mt-0.5 truncate text-[10px] text-ink-muted" title={mount.name}>
                  {mount.name}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiskMountChart;
