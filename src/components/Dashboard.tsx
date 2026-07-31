//! Dashboard — 清新自然首页概览

import React from "react";
import type { CategorySummary, DiskMountInfo, PhysicalDiskHealth, ScanCacheMeta, SystemOverview } from "../types";
import { CATEGORY_COLORS, formatDate, formatSize } from "../types";
import { useTranslation } from "../i18n/useTranslation";
import DiskMountChart from "./DiskMountChart";
import DiskHealthPanel from "./DiskHealthPanel";

interface DashboardProps {
  overview: SystemOverview | null;
  cacheList: ScanCacheMeta[];
  diskMounts: DiskMountInfo[];
  diskHealth: PhysicalDiskHealth[];
  onStartScan: () => void;
  onQuickScan: () => void;
  onOpenCacheEntry: (rootPath: string) => void;
  onClearCacheEntry: (rootPath: string) => void;
  onClearAllCache: () => void;
  onResumeScan: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  overview,
  cacheList,
  diskMounts,
  diskHealth,
  onStartScan,
  onQuickScan,
  onOpenCacheEntry,
  onClearCacheEntry,
  onClearAllCache,
  onResumeScan,
}) => {
  const { t, locale } = useTranslation();

  if (!overview) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-8 py-10">
        <h1 className="font-display text-3xl font-semibold text-moss-800">MagicSniffer</h1>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-muted">
          <div className="text-4xl opacity-60">🌿</div>
          <p className="text-sm">{t("dashboard.loading")}</p>
        </div>
      </div>
    );
  }

  const usedPct = ((overview.used_space / overview.total_space) * 100).toFixed(1);
  const freePct = ((overview.free_space / overview.total_space) * 100).toFixed(1);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-8 py-10">
      <div className="mb-8 max-w-2xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-moss-800">
          MagicSniffer
        </h1>
        <p className="mt-2 text-base text-ink-soft">
          {t("dashboard.subtitle")}
        </p>
      </div>

      <div className="mb-8 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t("dashboard.totalCapacity")} value={formatSize(overview.total_space)} sub={t("dashboard.available", { size: formatSize(overview.free_space) })} />
        <StatCard label={t("dashboard.usedSpace")} value={formatSize(overview.used_space)} sub={t("dashboard.usedPercent", { pct: usedPct })} />
        <StatCard
          label={t("dashboard.freeSpace")}
          value={formatSize(overview.free_space)}
          sub={t("dashboard.freePercent", { pct: freePct })}
          accent
        />
      </div>

      {diskHealth.length > 0 && (
        <div className="mb-8 max-w-4xl">
          <DiskHealthPanel disks={diskHealth} />
        </div>
      )}

      {diskMounts.length > 0 && (
        <div className="mb-8 max-w-4xl">
          <DiskMountChart mounts={diskMounts} />
        </div>
      )}

      {cacheList.length > 0 && (
        <div className="mb-8 max-w-4xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-moss-800">
              {t("dashboard.historyCache")}
              <span className="ml-2 text-sm font-normal text-ink-muted">
                ({cacheList.length}/5)
              </span>
            </h2>
            <button
              type="button"
              onClick={onClearAllCache}
              className="rounded-lg border border-moss-200 bg-white px-3 py-1.5 text-xs text-ink-soft transition hover:border-rose-300 hover:text-rose-600"
            >
              {t("dashboard.clearAll")}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {cacheList.map((meta) => (
              <div
                key={meta.root_path}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-moss-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition hover:border-moss-300"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-ink truncate">{meta.root_path}</span>
                    {meta.incomplete && (
                      <span className="shrink-0 rounded-md bg-sand-200 px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                        {t("dashboard.incomplete")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-soft">
                    <span>{formatDate(meta.cached_at, locale)}</span>
                    <span>{formatSize(meta.total_size)}</span>
                    <span>{t("dashboard.files", { count: meta.total_files.toLocaleString() })}</span>
                    <span>{t("dashboard.dirs", { count: meta.total_dirs.toLocaleString() })}</span>
                    <span>{t("dashboard.elapsed", { sec: (meta.elapsed_ms / 1000).toFixed(1) })}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {meta.incomplete ? (
                    <button
                      type="button"
                      onClick={onResumeScan}
                      className="rounded-lg bg-moss-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-moss-500"
                    >
                      {t("app.continueScan")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onOpenCacheEntry(meta.root_path)}
                    className="rounded-lg border border-moss-300 bg-white px-3 py-1.5 text-xs font-medium text-moss-800 transition hover:bg-moss-50"
                  >
                    {t("treemap.enterDir")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onClearCacheEntry(meta.root_path)}
                    className="rounded-lg border border-moss-200 bg-white px-3 py-1.5 text-xs text-ink-soft transition hover:border-rose-300 hover:text-rose-600"
                  >
                    {t("app.clearCache")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onStartScan}
          className="rounded-xl bg-moss-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-moss-500"
        >
          {t("dashboard.startFullScan")}
        </button>
        <button
          type="button"
          onClick={onQuickScan}
          className="rounded-xl border border-moss-300 bg-white/70 px-5 py-2.5 text-sm font-medium text-moss-800 transition hover:border-moss-400 hover:bg-moss-50"
        >
          {t("dashboard.scanHomeDir")}
        </button>
      </div>

      {overview.category_summary.length > 1 && (
        <div className="max-w-4xl rounded-2xl border border-moss-200/80 bg-white/70 p-5 shadow-sm backdrop-blur-sm">
          <CategoryBarChart summary={overview.category_summary} />
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}> = ({ label, value, sub, accent }) => (
  <div className="rounded-2xl border border-moss-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
    <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
    <div
      className={`mt-1 font-mono text-2xl font-semibold ${
        accent ? "text-moss-600" : "text-ink"
      }`}
    >
      {value}
    </div>
    <div className="mt-1 text-xs text-ink-soft">{sub}</div>
  </div>
);

const CategoryBarChart: React.FC<{ summary: CategorySummary[] }> = ({ summary }) => {
  const { t } = useTranslation();
  const sorted = [...summary].sort((a, b) => b.total_size - a.total_size);
  const max = sorted[0]?.total_size || 1;

  return (
    <div>
      <h2 className="mb-4 font-display text-lg font-semibold text-moss-800">{t("dashboard.categoryUsage")}</h2>
      <div className="flex flex-col gap-3">
        {sorted.map((s) => {
          const pct = Math.max(2, (s.total_size / max) * 100);
          return (
            <div key={s.category}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-ink">{t(`categoryLabels.${s.category}` as Parameters<typeof t>[0])}</span>
                <span className="font-mono text-ink-muted">
                  {formatSize(s.total_size)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-moss-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: CATEGORY_COLORS[s.category] ?? "#94a3b8",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Dashboard;
