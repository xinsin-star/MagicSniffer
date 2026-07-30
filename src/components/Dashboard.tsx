//! Dashboard — 清新自然首页概览

import React from "react";
import type { CategorySummary, ScanCacheMeta, SystemOverview } from "../types";
import { CATEGORY_INFO, formatDate, formatSize } from "../types";

interface DashboardProps {
  overview: SystemOverview | null;
  cacheMeta: ScanCacheMeta | null;
  onStartScan: () => void;
  onQuickScan: () => void;
  onOpenCache: () => void;
  onClearCache: () => void;
  onResumeScan: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  overview,
  cacheMeta,
  onStartScan,
  onQuickScan,
  onOpenCache,
  onClearCache,
  onResumeScan,
}) => {
  if (!overview) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-8 py-10">
        <h1 className="font-display text-3xl font-semibold text-moss-800">MagicSniffer</h1>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-muted">
          <div className="text-4xl opacity-60">🌿</div>
          <p className="text-sm">正在加载系统存储信息…</p>
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
          用清爽的矩形树图看清磁盘空间去向，边扫边预览，顺手找回被遗忘的大文件。
        </p>
      </div>

      <div className="mb-8 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="总容量" value={formatSize(overview.total_space)} sub={`${formatSize(overview.free_space)} 可用`} />
        <StatCard label="已用空间" value={formatSize(overview.used_space)} sub={`${usedPct}% 已使用`} />
        <StatCard
          label="可用空间"
          value={formatSize(overview.free_space)}
          sub={`${freePct}% 可用`}
          accent
        />
      </div>

      {cacheMeta && (
        <div className="mb-8 max-w-4xl rounded-2xl border border-moss-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                本地扫描缓存
              </div>
              <div className="mt-1 font-mono text-sm text-ink">{cacheMeta.root_path}</div>
              <div className="mt-1 text-xs text-ink-soft">
                {formatDate(cacheMeta.cached_at)} · {formatSize(cacheMeta.total_size)} ·{" "}
                {cacheMeta.total_files.toLocaleString()} 文件
                {cacheMeta.incomplete ? " · 未扫完" : ""}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {cacheMeta.incomplete ? (
                <button
                  type="button"
                  onClick={onResumeScan}
                  className="rounded-xl bg-moss-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-moss-500"
                >
                  继续扫描
                </button>
              ) : null}
              <button
                type="button"
                onClick={onOpenCache}
                className="rounded-xl border border-moss-300 bg-white px-4 py-2 text-sm font-medium text-moss-800 transition hover:bg-moss-50"
              >
                打开缓存结果
              </button>
              <button
                type="button"
                onClick={onClearCache}
                className="rounded-xl border border-moss-200 bg-white px-4 py-2 text-sm text-ink-soft transition hover:border-moss-300 hover:bg-moss-50"
              >
                清除
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onStartScan}
          className="rounded-xl bg-moss-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-moss-500"
        >
          开始完整扫描
        </button>
        <button
          type="button"
          onClick={onQuickScan}
          className="rounded-xl border border-moss-300 bg-white/70 px-5 py-2.5 text-sm font-medium text-moss-800 transition hover:border-moss-400 hover:bg-moss-50"
        >
          扫描用户主目录
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
  const sorted = [...summary].sort((a, b) => b.total_size - a.total_size);
  const max = sorted[0]?.total_size || 1;

  return (
    <div>
      <h2 className="mb-4 font-display text-lg font-semibold text-moss-800">分类占用</h2>
      <div className="flex flex-col gap-3">
        {sorted.map((s) => {
          const info = CATEGORY_INFO[s.category];
          const pct = Math.max(2, (s.total_size / max) * 100);
          return (
            <div key={s.category}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-ink">{info?.label ?? s.category}</span>
                <span className="font-mono text-ink-muted">
                  {formatSize(s.total_size)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-moss-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: info?.color ?? "#94a3b8",
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
