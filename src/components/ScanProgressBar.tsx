//! 底部扫描进度条（仅扫描中显示）

import React from "react";
import { useTranslation } from "../i18n/useTranslation";
import { useScanStore } from "../stores/scan.store";

const ScanProgressBar: React.FC = () => {
  const { t } = useTranslation();
  const scanning = useScanStore((s) => s.scanning);
  const scanProgress = useScanStore((s) => s.scanProgress);
  const livePreview = useScanStore((s) => s.livePreview);

  if (!scanning) return null;

  const previewCoverage =
    livePreview && livePreview.total_top_dirs > 0
      ? Math.min(
          100,
          Math.round((livePreview.completed_top_dirs / livePreview.total_top_dirs) * 100),
        )
      : 0;

  return (
    <div className="shrink-0 border-t border-moss-200/80 bg-white/70 px-4 py-2 backdrop-blur-md">
      <div className="h-1.5 overflow-hidden rounded-full bg-moss-100">
        <div
          className="animate-shimmer h-full rounded-full bg-gradient-to-r from-moss-400 via-moss-300 to-moss-500"
          style={{ width: `${previewCoverage > 0 ? previewCoverage : 15}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between gap-4 text-[11px] text-ink-muted">
        <span className="min-w-0 truncate">
          {scanProgress?.phase
            ? t(scanProgress.phase as Parameters<typeof t>[0])
            : t("app.scanningPhrase")}
          {scanProgress?.current_path ? `: ${scanProgress.current_path}` : ""}
        </span>
        <span className="shrink-0 font-mono">
          {livePreview
            ? `${t("app.progressTopLevel")} ${livePreview.completed_top_dirs}/${livePreview.total_top_dirs} · `
            : ""}
          {t("app.progressFound", {
            count: scanProgress?.files_found ?? livePreview?.files_found ?? 0,
          })}{" "}
          ·{" "}
          {t("app.progressScannedDirs", {
            count: scanProgress?.dirs_scanned ?? livePreview?.dirs_scanned ?? 0,
          })}
        </span>
      </div>
    </div>
  );
};

export default ScanProgressBar;
