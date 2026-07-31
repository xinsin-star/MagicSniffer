import React from "react";
import type { PhysicalDiskHealth } from "../types";
import { formatSize } from "../types";
import { useTranslation } from "../i18n/useTranslation";

interface DiskHealthPanelProps {
  disks: PhysicalDiskHealth[];
}

function smartColor(status?: string): string {
  if (!status) return "#b7c2b6";
  return status === "Verified" ? "#7cb798" : "#d17171";
}

function smartLabel(
  status: string | undefined,
  t: (k: string) => string,
): string {
  if (!status) return t("disk.smartUnavailable");
  return status === "Verified" ? t("disk.healthy") : t("disk.warning");
}

/** 格式化大字节数为人类可读字符串（支持 TB 级别） */
function formatLargeSize(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

const DiskHealthPanel: React.FC<DiskHealthPanelProps> = ({ disks }) => {
  const { t } = useTranslation();

  if (disks.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 font-display text-lg font-semibold text-moss-800">
        {t("disk.healthTitle")}
      </h2>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {disks.map((disk) => {
          const statusColor = smartColor(disk.smart_status);
          const internalBadge = disk.is_internal
            ? t("disk.internal")
            : t("disk.external");
          const volCount = disk.volumes.length;

          return (
            <div
              key={disk.device_id}
              className="rounded-2xl border border-moss-200/80 bg-white/70 p-5 shadow-sm backdrop-blur-sm"
            >
              {/* Header row */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-ink">
                    {disk.model || disk.device_id}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-muted">
                    <span className="font-mono">{disk.device_id}</span>
                    {disk.serial && (
                      <>
                        <span aria-hidden>·</span>
                        <span>S/N: {disk.serial}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <span className="rounded-md bg-moss-100 px-1.5 py-0.5 text-[10px] font-medium text-moss-700">
                    {disk.medium_type}
                  </span>
                  <span className="rounded-md bg-moss-100 px-1.5 py-0.5 text-[10px] font-medium text-moss-700">
                    {internalBadge}
                  </span>
                </div>
              </div>

              {/* SMART + protocol row */}
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: `${statusColor}22`,
                    color: statusColor,
                  }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: statusColor }}
                  />
                  {smartLabel(disk.smart_status, t)}
                </span>
                {disk.protocol && (
                  <span className="text-ink-muted">
                    {disk.protocol}
                  </span>
                )}
                {disk.firmware && (
                  <span className="font-mono text-ink-muted">
                    {disk.firmware}
                  </span>
                )}
                {disk.trim_support && (
                  <span className="rounded-md bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                    TRIM
                  </span>
                )}
              </div>

              {/* Capacity & volumes */}
              <div className="mb-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-ink-muted">{t("disk.totalCapacity")}</div>
                  <div className="font-mono font-semibold text-ink">
                    {formatSize(disk.capacity)}
                  </div>
                </div>
                <div>
                  <div className="text-ink-muted">{t("disk.volumes", { count: volCount.toString() })}</div>
                  <div className="font-mono text-ink-soft">
                    {volCount > 0
                      ? disk.volumes
                          .slice(0, 4)
                          .map((v) =>
                            v.mount_point === "/"
                              ? "Macintosh HD"
                              : v.mount_point.split("/").pop() || v.mount_point,
                          )
                          .join(", ")
                      : "—"}
                    {volCount > 4 ? ` +${volCount - 4}` : ""}
                  </div>
                </div>
              </div>

              {/* NVMe SMART 详细数据 */}
              {disk.nvme_smart && (
                <div className="mb-3 rounded-xl border border-moss-200/60 bg-moss-50/50 p-3">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                    NVMe SMART
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{t("disk.temperature")}</span>
                      <span className="font-mono font-medium text-ink-soft">
                        {disk.nvme_smart.temperature_celsius}°C
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{t("disk.availableSpare")}</span>
                      <span className={`font-mono font-medium ${disk.nvme_smart.available_spare > disk.nvme_smart.available_spare_threshold ? "text-green-600" : "text-red-500"}`}>
                        {disk.nvme_smart.available_spare}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{t("disk.percentageUsed")}</span>
                      <span className="font-mono font-medium text-ink-soft">
                        {disk.nvme_smart.percentage_used}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{t("disk.powerOnHours")}</span>
                      <span className="font-mono font-medium text-ink-soft">
                        {disk.nvme_smart.power_on_hours.toLocaleString()} h
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{t("disk.powerCycles")}</span>
                      <span className="font-mono font-medium text-ink-soft">
                        {disk.nvme_smart.power_cycles.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{t("disk.unsafeShutdowns")}</span>
                      <span className={`font-mono font-medium ${disk.nvme_smart.unsafe_shutdowns === 0 ? "text-green-600" : "text-orange-500"}`}>
                        {disk.nvme_smart.unsafe_shutdowns}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{t("disk.dataRead")}</span>
                      <span className="font-mono font-medium text-ink-soft">
                        {formatLargeSize(disk.nvme_smart.data_units_read_bytes)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{t("disk.dataWritten")}</span>
                      <span className="font-mono font-medium text-ink-soft">
                        {formatLargeSize(disk.nvme_smart.data_units_written_bytes)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{t("disk.mediaErrors")}</span>
                      <span className={`font-mono font-medium ${disk.nvme_smart.media_errors === 0 ? "text-green-600" : "text-red-500"}`}>
                        {disk.nvme_smart.media_errors}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{t("disk.criticalWarning")}</span>
                      <span className={`font-mono font-medium ${disk.nvme_smart.critical_warning === 0 ? "text-green-600" : "text-red-500"}`}>
                        {disk.nvme_smart.critical_warning === 0 ? t("disk.none") : `0x${disk.nvme_smart.critical_warning.toString(16)}`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* I/O stats (fallback when no NVMe SMART) */}
              {disk.io_stats && !disk.nvme_smart && (
                <div className="rounded-xl border border-moss-200/60 bg-moss-50/50 p-3">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                    {t("disk.ioStats")}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <div className="text-ink-muted">
                        {t("disk.lifetimeReads")}
                      </div>
                      <div className="font-mono font-medium text-ink-soft">
                        {formatLargeSize(disk.io_stats.bytes_read)}
                      </div>
                    </div>
                    <div>
                      <div className="text-ink-muted">
                        {t("disk.lifetimeWrites")}
                      </div>
                      <div className="font-mono font-medium text-ink-soft">
                        {formatLargeSize(disk.io_stats.bytes_written)}
                      </div>
                    </div>
                    <div>
                      <div className="text-ink-muted">
                        {t("disk.errors")}
                      </div>
                      <div className="font-mono font-medium text-ink-soft">
                        {disk.io_stats.errors_read === 0 &&
                        disk.io_stats.errors_write === 0 ? (
                          <span className="text-green-600">
                            {t("disk.noErrors")}
                          </span>
                        ) : (
                          <span className="text-red-500">
                            R:{disk.io_stats.errors_read} W:
                            {disk.io_stats.errors_write}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiskHealthPanel;
