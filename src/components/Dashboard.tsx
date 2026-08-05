//! Dashboard — 清新自然首页概览

import React, { useRef, useState } from "react";
import type { CategorySummary, DiskMountInfo, PhysicalDiskHealth, ScanCacheMeta, SystemOverview } from "../types";
import { CATEGORY_COLORS, formatDate, formatSize } from "../types";
import { getDiskMounts, getPhysicalDiskHealth } from "../hooks/useTauriCommand";
import { useTranslation } from "../i18n/useTranslation";
import DiskMountChart from "./DiskMountChart";
import DiskHealthPanel from "./DiskHealthPanel";

/** 懒加载卡片：默认收缩不加载，点击展开时才请求数据 */
function LazyDiskCard<T>({
  title,
  icon,
  loader,
  render,
}: {
  title: string;
  icon: string;
  loader: () => Promise<T>;
  render: (data: T) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  /** 首次展开后保持挂载，保证收起动画可播放 */
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setMounted(true);
    setOpen(true);
    if (data === null && !loading) {
      setLoading(true);
      setError(null);
      loader()
        .then((d) => setData(d))
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    }
    // 高度过渡结束后把内容区滚入视野，避免内容在视口下方而"看起来没打开"
    window.setTimeout(() => {
      bodyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 320);
  };

  return (
    <div className="mb-8 shrink-0 overflow-hidden rounded-2xl border border-moss-200/70 bg-white/80 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="group flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-moss-50/50"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-moss-100 to-moss-200/70 text-xl shadow-inner">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-semibold text-moss-800">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {loading && (
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-moss-300 border-t-moss-600" />
          )}
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-moss-200 bg-white text-moss-700 transition group-hover:border-moss-300 group-hover:bg-moss-50">
            <svg
              className={`h-3 w-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2 4.5l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
      </button>

      {/* grid-rows 0fr→1fr 平滑展开/收起动画 */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            ref={bodyRef}
            className={`border-t border-moss-100/60 bg-sand-50/40 px-5 py-5 transition-all duration-300 ease-out ${
              open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            }`}
          >
            {mounted &&
              (loading ? (
                <div className="flex items-center justify-center gap-2.5 py-6 text-sm text-ink-muted">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-moss-300 border-t-moss-600" />
                  {t("dashboard.loading")}
                </div>
              ) : error ? (
                <div className="flex items-center justify-center gap-2 py-5 text-sm text-rose-600">
                  <span aria-hidden="true">⚠️</span> {error}
                </div>
              ) : data ? (
                render(data)
              ) : null)}
          </div>
        </div>
      </div>
    </div>
  );
}

interface DashboardProps {
  overview: SystemOverview | null;
  cacheList: ScanCacheMeta[];
  onStartScan: () => void;
  onQuickScan: () => void;
  onOpenCacheEntry: (rootPath: string) => void;
  onClearCacheEntry: (rootPath: string) => void;
  onClearAllCache: () => void;
  onResumeScan: () => void;
  onOpenDiff: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  overview,
  cacheList,
  onStartScan,
  onQuickScan,
  onOpenCacheEntry,
  onClearCacheEntry,
  onClearAllCache,
  onResumeScan,
  onOpenDiff,
}) => {
  const { t, locale } = useTranslation();

  if (!overview) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-8 py-10 [scrollbar-gutter:stable]">
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
    <div className="flex flex-1 flex-col overflow-y-auto px-8 py-10 [scrollbar-gutter:stable]">
      <div className="mb-8 grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t("dashboard.totalCapacity")} value={formatSize(overview.total_space)} sub={t("dashboard.available", { size: formatSize(overview.free_space) })} />
        <StatCard label={t("dashboard.usedSpace")} value={formatSize(overview.used_space)} sub={t("dashboard.usedPercent", { pct: usedPct })} />
        <StatCard
          label={t("dashboard.freeSpace")}
          value={formatSize(overview.free_space)}
          sub={t("dashboard.freePercent", { pct: freePct })}
          accent
        />
      </div>

      <LazyDiskCard
        title={t("disk.healthTitle")}
        icon="🩺"
        loader={() => getPhysicalDiskHealth(locale)}
        render={(health: PhysicalDiskHealth[]) =>
          health.length > 0 ? (
            <DiskHealthPanel disks={health} />
          ) : (
            <p className="py-4 text-sm text-ink-muted">{t("dashboard.noData")}</p>
          )
        }
      />

      <LazyDiskCard
        title={t("disk.mountPoints")}
        icon="💽"
        loader={() => getDiskMounts(locale)}
        render={(mounts: DiskMountInfo[]) =>
          mounts.length > 0 ? (
            <DiskMountChart mounts={mounts} />
          ) : (
            <p className="py-4 text-sm text-ink-muted">{t("dashboard.noData")}</p>
          )
        }
      />

      {cacheList.length > 0 && (
        <div className="mb-8 shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-moss-800">
              {t("dashboard.historyCache")}
              <span className="ml-2 text-sm font-normal text-ink-muted">
                ({cacheList.length}/5)
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenDiff}
                className="rounded-lg border border-moss-200 bg-white px-3 py-1.5 text-xs font-medium text-moss-800 transition hover:border-moss-300 hover:bg-moss-50"
              >
                {t("diff.open")}
              </button>
              <button
                type="button"
                onClick={onClearAllCache}
                className="rounded-lg border border-moss-200 bg-white px-3 py-1.5 text-xs text-ink-soft transition hover:border-rose-300 hover:text-rose-600"
              >
                {t("dashboard.clearAll")}
              </button>
            </div>
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

      <div className="mb-8 flex shrink-0 flex-wrap gap-3">
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
        <div className="shrink-0 rounded-2xl border border-moss-200/80 bg-white/70 p-5 shadow-sm backdrop-blur-sm">
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
